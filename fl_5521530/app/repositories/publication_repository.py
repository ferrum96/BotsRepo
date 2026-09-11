from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.entities import Publication
from app.domain.enums import PublicationStatus
from app.infrastructure.database.models import PublicationModel
from app.repositories.mappers import publication_to_domain

_ACTIVE = (
    PublicationStatus.DRAFT,
    PublicationStatus.SCHEDULED,
    PublicationStatus.PUBLISHING,
    PublicationStatus.PUBLISHED,
)


class PublicationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, publication_id: int) -> Publication | None:
        row = await self._session.get(PublicationModel, publication_id)
        return publication_to_domain(row) if row else None

    async def get_active_for_content(self, content_id: int) -> Publication | None:
        result = await self._session.execute(
            select(PublicationModel).where(
                PublicationModel.content_id == content_id,
                PublicationModel.status.in_([s.value for s in _ACTIVE]),
            )
        )
        row = result.scalar_one_or_none()
        return publication_to_domain(row) if row else None

    async def get_for_update(self, publication_id: int) -> PublicationModel | None:
        result = await self._session.execute(
            select(PublicationModel)
            .where(PublicationModel.id == publication_id)
            .with_for_update()
        )
        return result.scalar_one_or_none()

    async def add(
        self,
        *,
        product_id: int,
        content_id: int,
        status: PublicationStatus,
        max_chat_id: int | None = None,
        scheduled_at: datetime | None = None,
    ) -> Publication:
        row = PublicationModel(
            product_id=product_id,
            content_id=content_id,
            status=status.value,
            max_chat_id=max_chat_id,
            scheduled_at=scheduled_at,
        )
        self._session.add(row)
        await self._session.flush()
        return publication_to_domain(row)

    async def save_row(self, row: PublicationModel) -> Publication:
        await self._session.flush()
        return publication_to_domain(row)

    async def list_recent(self, *, limit: int = 10) -> list[Publication]:
        result = await self._session.execute(
            select(PublicationModel)
            .order_by(PublicationModel.id.desc())
            .limit(limit)
        )
        return [publication_to_domain(row) for row in result.scalars().all()]

    async def list_scheduled(self) -> list[Publication]:
        result = await self._session.execute(
            select(PublicationModel)
            .where(PublicationModel.status == PublicationStatus.SCHEDULED.value)
            .order_by(PublicationModel.scheduled_at.asc())
        )
        return [publication_to_domain(row) for row in result.scalars().all()]

    async def list_due(self, now: datetime) -> list[PublicationModel]:
        result = await self._session.execute(
            select(PublicationModel)
            .where(
                PublicationModel.status == PublicationStatus.SCHEDULED.value,
                PublicationModel.scheduled_at <= now,
            )
            .order_by(PublicationModel.scheduled_at.asc())
            .with_for_update()
        )
        return list(result.scalars().all())
