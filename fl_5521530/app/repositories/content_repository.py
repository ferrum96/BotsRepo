from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.entities import GeneratedContent
from app.domain.enums import ContentStatus
from app.infrastructure.database.models import GeneratedContentModel
from app.repositories.mappers import content_to_domain


class ContentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, content_id: int) -> GeneratedContent | None:
        row = await self._session.get(GeneratedContentModel, content_id)
        return content_to_domain(row) if row else None

    async def add(
        self,
        *,
        product_id: int,
        title: str,
        description: str,
        benefits: list[str],
        call_to_action: str,
        hashtags: list[str],
        model: str,
        prompt_version: str,
        status: ContentStatus,
    ) -> GeneratedContent:
        row = GeneratedContentModel(
            product_id=product_id,
            title=title,
            description=description,
            benefits_json=benefits,
            call_to_action=call_to_action,
            hashtags_json=hashtags,
            model=model,
            prompt_version=prompt_version,
            status=status.value,
        )
        self._session.add(row)
        await self._session.flush()
        return content_to_domain(row)

    async def update_fields(
        self,
        content_id: int,
        **fields: str | list[str],
    ) -> GeneratedContent | None:
        row = await self._session.get(GeneratedContentModel, content_id)
        if row is None:
            return None
        mapping = {
            "title": "title",
            "description": "description",
            "call_to_action": "call_to_action",
            "benefits": "benefits_json",
            "hashtags": "hashtags_json",
        }
        for key, value in fields.items():
            column = mapping.get(key, key)
            setattr(row, column, value)
        await self._session.flush()
        return content_to_domain(row)

    async def list_for_product(self, product_id: int, *, limit: int = 5) -> list[GeneratedContent]:
        result = await self._session.execute(
            select(GeneratedContentModel)
            .where(GeneratedContentModel.product_id == product_id)
            .order_by(GeneratedContentModel.id.desc())
            .limit(limit)
        )
        return [content_to_domain(row) for row in result.scalars().all()]
