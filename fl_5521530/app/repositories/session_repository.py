from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.entities import UserSession
from app.domain.enums import DialogState
from app.infrastructure.database.models import UserSessionModel
from app.repositories.mappers import session_to_domain


class SessionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, user_id: int) -> UserSession | None:
        result = await self._session.execute(
            select(UserSessionModel).where(UserSessionModel.user_id == user_id)
        )
        row = result.scalar_one_or_none()
        return session_to_domain(row) if row else None

    async def set_state(
        self,
        user_id: int,
        state: DialogState,
        payload: dict[str, Any] | None = None,
    ) -> UserSession:
        result = await self._session.execute(
            select(UserSessionModel).where(UserSessionModel.user_id == user_id)
        )
        row = result.scalar_one_or_none()
        if row is None:
            row = UserSessionModel(
                user_id=user_id,
                state=state.value,
                payload=payload or {},
            )
            self._session.add(row)
        else:
            row.state = state.value
            row.payload = payload or {}
        await self._session.flush()
        return session_to_domain(row)
