"""FastAPI dashboard backend for the clan SPA."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Set

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import APIKeyHeader
from starlette.status import HTTP_401_UNAUTHORIZED

from bot.config import Config
from bot.database import Database, Member, get_member_join_date
from bot.group_titles import remove_from_group_header
from dashboard.backend import schemas

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
FRONTEND_DIST = BASE_DIR / "dashboard" / "frontend" / "dist"

config = Config.from_env()

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def _verify_api_key(request: Request, api_key: Optional[str] = Security(api_key_header)) -> None:
    """Require API key for mutating endpoints and for serving the SPA in production."""
    if not config.dashboard_api_key:
        return
    if request.method == "GET":
        return
    if api_key == config.dashboard_api_key:
        return
    raise HTTPException(
        status_code=HTTP_401_UNAUTHORIZED, detail="Invalid or missing API key"
    )


@asynccontextmanager
async def _lifespan(app: FastAPI):
    db = Database(config.database_path)
    await db.connect()
    await db.init()
    app.state.db = db
    yield
    if db._db is not None:
        await db._db.close()


app = FastAPI(title="PUBG Clan Dashboard API", lifespan=_lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def get_db() -> Database:
    """Return the shared aiosqlite-backed database used by the bot."""
    return app.state.db


async def _format_member(db: Database, member: Member, group_ids: Set[int]) -> schemas.MemberOut:
    join_date = await get_member_join_date(db, member)
    return schemas.MemberOut(
        user_id=member.user_id,
        tg_username=member.tg_username,
        tg_first_name=member.tg_first_name,
        game_nick=member.game_nick,
        real_name=member.real_name,
        discord_nick=member.discord_nick,
        perspective=member.perspective,
        join_date=join_date,
        is_removed=member.user_id not in group_ids,
    )


async def _try_restore_member_to_group(client: httpx.AsyncClient, user_id: int) -> None:
    """Try to return restored member to group as automatically as Telegram allows."""
    approve_resp = await client.post(
        f"https://api.telegram.org/bot{config.bot_token}/approveChatJoinRequest",
        json={"chat_id": config.group_id, "user_id": user_id},
        timeout=15,
    )
    approve_data = approve_resp.json()
    if approve_resp.status_code == 200 and approve_data.get("ok"):
        logger.info("Approved join request for user %s during restore", user_id)
        return

    invite_link = config.telegram_group_link
    if not invite_link:
        expire_at = int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp())
        invite_resp = await client.post(
            f"https://api.telegram.org/bot{config.bot_token}/createChatInviteLink",
            json={
                "chat_id": config.group_id,
                "name": f"restore-{user_id}",
                "member_limit": 1,
                "expire_date": expire_at,
            },
            timeout=15,
        )
        invite_data = invite_resp.json()
        if invite_resp.status_code == 200 and invite_data.get("ok"):
            invite_link = invite_data.get("result", {}).get("invite_link", "")

    if not invite_link:
        logger.warning("No invite link available for restored user %s", user_id)
        return

    send_resp = await client.post(
        f"https://api.telegram.org/bot{config.bot_token}/sendMessage",
        json={
            "chat_id": user_id,
            "text": (
                "Восстановление выполнено. "
                "Чтобы вернуться в группу, перейдите по ссылке:\n"
                f"{invite_link}"
            ),
        },
        timeout=15,
    )
    send_data = send_resp.json()
    if send_resp.status_code != 200 or not send_data.get("ok"):
        detail = send_data.get("description", send_resp.text)
        logger.warning(
            "Failed to send restore invite to user %s: %s",
            user_id,
            detail,
        )


@app.get("/health", response_model=schemas.HealthOut)
async def health():
    return {"status": "ok"}


@app.get("/api/members", response_model=list[schemas.MemberOut])
async def list_members(
    request: Request,
    db: Database = Depends(get_db),
    _: None = Security(_verify_api_key),
):
    members = await db.get_active_members()
    group_ids = await db.get_group_member_ids()
    # Members page should list only users who are currently in the Telegram group.
    members_in_group = [member for member in members if member.user_id in group_ids]
    return [await _format_member(db, m, group_ids) for m in members_in_group]


@app.get("/api/blacklist", response_model=list[schemas.BlacklistOut])
async def list_blacklist(
    request: Request,
    db: Database = Depends(get_db),
    _: None = Security(_verify_api_key),
):
    rows = await db.get_blacklist()
    result: list[schemas.BlacklistOut] = []
    for uid, _reason, created_at in rows:
        member = await db.get_member(uid)
        result.append(
            schemas.BlacklistOut(
                user_id=uid,
                game_nick=member.game_nick if member else None,
                real_name=member.real_name if member else None,
                discord_nick=member.discord_nick if member else None,
                created_at=created_at,
            )
        )
    return result


@app.get("/api/inactive-members", response_model=list[schemas.InactiveMemberOut])
async def list_inactive_members(
    request: Request,
    db: Database = Depends(get_db),
    _: None = Security(_verify_api_key),
):
    members = await db.get_inactive_members()
    group_ids = await db.get_group_member_ids()
    return [
        schemas.InactiveMemberOut(
            user_id=member.user_id,
            game_nick=member.game_nick,
            real_name=member.real_name,
            discord_nick=member.discord_nick,
            last_match_at=member.last_match_at,
            last_match_checked_at=member.last_match_checked_at,
        )
        for member in members
        if member.user_id in group_ids
    ]


@app.get("/api/stats", response_model=schemas.StatsOut)
async def get_stats(
    request: Request,
    db: Database = Depends(get_db),
    _: None = Security(_verify_api_key),
):
    all_members = await db.get_all_members()
    blacklist = await db.get_blacklist()
    perspective_stats = await db.get_perspective_stats()
    return schemas.StatsOut(
        total_members=len(all_members),
        total_blacklist=len(blacklist),
        perspective_stats=perspective_stats,
    )


@app.post("/api/members/{user_id}/kick")
async def kick_member(
    request: Request,
    user_id: int,
    db: Database = Depends(get_db),
    _: None = Security(_verify_api_key),
):
    member = await db.get_member(user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    async with httpx.AsyncClient() as client:
        status_resp = await client.get(
            f"https://api.telegram.org/bot{config.bot_token}/getChatMember",
            params={"chat_id": config.group_id, "user_id": user_id},
            timeout=15,
        )
        status_data = status_resp.json()
        if status_resp.status_code != 200 or not status_data.get("ok"):
            detail = status_data.get("description", status_resp.text)
            raise HTTPException(
                status_code=502, detail=f"Telegram API error: {detail}"
            )

        tg_status = status_data.get("result", {}).get("status")
        if tg_status == "administrator":
            removed = await remove_from_group_header(
                bot_token=config.bot_token,
                chat_id=config.group_id,
                user_id=user_id,
                client=client,
            )
            if not removed:
                raise HTTPException(
                    status_code=502,
                    detail=(
                        "Не удалось снять пользователя с админки (Remove). "
                        "Проверьте, что бот может назначать администраторов."
                    ),
                )
        elif tg_status in {"left", "kicked", "banned"}:
            await db.untrack_group_member(user_id)
            await db.add_to_blacklist(user_id, "kicked_from_dashboard")
            return {"ok": True}

        ban_resp = await client.post(
            f"https://api.telegram.org/bot{config.bot_token}/banChatMember",
            json={"chat_id": config.group_id, "user_id": user_id},
            timeout=15,
        )
        if ban_resp.status_code != 200 or not ban_resp.json().get("ok"):
            detail = ban_resp.json().get("description", ban_resp.text)
            logger.error("Failed to kick user %s: %s", user_id, detail)
            raise HTTPException(
                status_code=502, detail=f"Telegram API error: {detail}"
            )

        await client.post(
            f"https://api.telegram.org/bot{config.bot_token}/unbanChatMember",
            json={
                "chat_id": config.group_id,
                "user_id": user_id,
                "only_if_banned": True,
            },
            timeout=15,
        )

    await db.untrack_group_member(user_id)
    await db.add_to_blacklist(user_id, "kicked_from_dashboard")

    return {"ok": True}


@app.post("/api/blacklist/{user_id}/unblock")
async def unblock_blacklist_member(
    request: Request,
    user_id: int,
    db: Database = Depends(get_db),
    _: None = Security(_verify_api_key),
):
    async with httpx.AsyncClient() as client:
        unban_resp = await client.post(
            f"https://api.telegram.org/bot{config.bot_token}/unbanChatMember",
            json={
                "chat_id": config.group_id,
                "user_id": user_id,
                "only_if_banned": True,
            },
            timeout=15,
        )
        unban_data = unban_resp.json()
        if unban_resp.status_code != 200 or not unban_data.get("ok"):
            detail = unban_data.get("description", unban_resp.text)
            raise HTTPException(
                status_code=502, detail=f"Telegram API error: {detail}"
            )

    removed = await db.remove_from_blacklist(user_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Blacklist entry not found")

    # Keep tracking aligned with actual Telegram membership state.
    await db.untrack_group_member(user_id)

    async with httpx.AsyncClient() as client:
        await _try_restore_member_to_group(client, user_id)

        status_resp = await client.get(
            f"https://api.telegram.org/bot{config.bot_token}/getChatMember",
            params={"chat_id": config.group_id, "user_id": user_id},
            timeout=15,
        )
        status_data = status_resp.json()
        if status_resp.status_code == 200 and status_data.get("ok"):
            tg_status = status_data.get("result", {}).get("status")
            if tg_status in {"member", "administrator", "creator", "restricted"}:
                await db.track_group_member(user_id)

    return {"ok": True}


# Serve the built SPA in production when `frontend/dist` exists.
if FRONTEND_DIST.exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    async def serve_spa(
        path: str,
        request: Request,
        _: None = Security(_verify_api_key),
    ):
        index = FRONTEND_DIST / "index.html"
        if index.exists():
            return FileResponse(index)
        return JSONResponse({"detail": "Dashboard frontend is not built"}, status_code=404)
