from __future__ import annotations

from fastapi import APIRouter, Request
from sqlalchemy import text

router = APIRouter()


@router.get("/health")
async def health(request: Request) -> dict[str, str]:
    container = request.app.state.container
    async with container.session_factory() as session:
        await session.execute(text("SELECT 1"))
    return {"status": "ok", "db": "ok"}
