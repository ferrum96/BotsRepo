from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.entities import User
from app.domain.enums import UserRole
from app.infrastructure.database.models import UserModel
from app.repositories.mappers import user_to_domain


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_max_user_id(self, max_user_id: int) -> User | None:
        result = await self._session.execute(
            select(UserModel).where(UserModel.max_user_id == max_user_id)
        )
        row = result.scalar_one_or_none()
        return user_to_domain(row) if row else None

    async def get_by_id(self, user_id: int) -> User | None:
        row = await self._session.get(UserModel, user_id)
        return user_to_domain(row) if row else None

    async def upsert(
        self,
        *,
        max_user_id: int,
        username: str | None,
        role: UserRole,
        is_active: bool = True,
    ) -> User:
        existing = await self._session.execute(
            select(UserModel).where(UserModel.max_user_id == max_user_id)
        )
        row = existing.scalar_one_or_none()
        if row is None:
            row = UserModel(
                max_user_id=max_user_id,
                username=username,
                role=role.value,
                is_active=is_active,
            )
            self._session.add(row)
            await self._session.flush()
        else:
            row.username = username
            row.role = role.value
            row.is_active = is_active
            await self._session.flush()
        return user_to_domain(row)
