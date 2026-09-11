from __future__ import annotations

from datetime import datetime

from app.domain.entities import Publication
from app.domain.enums import PublicationStatus
from app.domain.exceptions import ChannelNotConfiguredError
from app.application.publication_service import PublicationService
from app.repositories.publication_repository import PublicationRepository


class SchedulingService:
    def __init__(
        self,
        publications: PublicationRepository,
        publication_service: PublicationService,
    ) -> None:
        self._publications = publications
        self._publication_service = publication_service

    async def list_scheduled(self) -> list[Publication]:
        return await self._publications.list_scheduled()

    async def list_history(self, *, limit: int = 10) -> list[Publication]:
        return await self._publications.list_recent(limit=limit)

    async def publish_due(
        self, now: datetime, *, channel_id: int | None, show_stock: bool
    ) -> list[Publication]:
        if channel_id is None:
            raise ChannelNotConfiguredError(
                "Channel chat_id is not set. Cannot publish scheduled posts."
            )
        due_rows = await self._publications.list_due(now)
        published: list[Publication] = []
        for row in due_rows:
            if row.status != PublicationStatus.SCHEDULED.value:
                continue
            item = await self._publication_service.confirm_and_publish(
                row.id, channel_id=channel_id, show_stock=show_stock
            )
            published.append(item)
        return published
