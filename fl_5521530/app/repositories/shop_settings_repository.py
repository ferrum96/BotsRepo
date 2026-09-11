from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.entities import ShopSettings
from app.infrastructure.database.models import ShopSettingsModel
from app.repositories.mappers import settings_to_domain


class ShopSettingsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self) -> ShopSettings:
        row = await self._session.get(ShopSettingsModel, 1)
        if row is None:
            row = ShopSettingsModel(id=1, show_stock=True)
            self._session.add(row)
            await self._session.flush()
        return settings_to_domain(row)

    async def set_channel_id(self, channel_id: int) -> ShopSettings:
        row = await self._require_row()
        row.channel_id = channel_id
        await self._session.flush()
        return settings_to_domain(row)

    async def set_show_stock(self, show_stock: bool) -> ShopSettings:
        row = await self._require_row()
        row.show_stock = show_stock
        await self._session.flush()
        return settings_to_domain(row)

    async def _require_row(self) -> ShopSettingsModel:
        row = await self._session.get(ShopSettingsModel, 1)
        if row is None:
            row = ShopSettingsModel(id=1, show_stock=True)
            self._session.add(row)
            await self._session.flush()
        return row
