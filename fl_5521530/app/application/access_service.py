from __future__ import annotations

from app.domain.entities import User
from app.domain.enums import UserRole
from app.domain.exceptions import AccessDeniedError
from app.repositories.shop_settings_repository import ShopSettingsRepository
from app.repositories.user_repository import UserRepository


class AccessService:
    def __init__(
        self,
        users: UserRepository,
        allowed_user_ids: frozenset[int],
    ) -> None:
        self._users = users
        self._allowed = allowed_user_ids

    def is_allowed(self, max_user_id: int) -> bool:
        return max_user_id in self._allowed

    async def require_user(self, max_user_id: int, username: str | None) -> User:
        if max_user_id not in self._allowed:
            raise AccessDeniedError("Access denied")
        return await self._users.upsert(
            max_user_id=max_user_id,
            username=username,
            role=UserRole.ADMIN,
            is_active=True,
        )


class ShopConfigService:
    def __init__(
        self,
        settings_repo: ShopSettingsRepository,
        *,
        env_channel_id: int | None,
        env_show_stock: bool,
    ) -> None:
        self._settings_repo = settings_repo
        self._env_channel_id = env_channel_id
        self._env_show_stock = env_show_stock

    async def channel_id(self) -> int | None:
        stored = await self._settings_repo.get()
        return stored.channel_id or self._env_channel_id

    async def show_stock(self) -> bool:
        stored = await self._settings_repo.get()
        return stored.show_stock if stored else self._env_show_stock

    async def bind_channel(self, channel_id: int) -> None:
        await self._settings_repo.set_channel_id(channel_id)

    async def toggle_show_stock(self) -> bool:
        current = await self.show_stock()
        updated = await self._settings_repo.set_show_stock(not current)
        return updated.show_stock
