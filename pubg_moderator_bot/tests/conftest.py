"""Shared fixtures for pubg_moderator_bot tests."""

from __future__ import annotations

import importlib
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi.testclient import TestClient

from bot.config import Config
from bot.database import Database


API_KEY = "test-dashboard-secret"
BOT_TOKEN = "123456:TEST_BOT_TOKEN"
GROUP_ID = -1001234567890

# Prod clan Telegram group is expected to stay at or below this size.
PROD_GROUP_SIZE_CAP = 100


def _purge_api_modules() -> None:
    for name in list(sys.modules):
        if name == "bot.config" or name.startswith("dashboard.backend"):
            del sys.modules[name]


@pytest.fixture
def config(tmp_path: Path) -> Config:
    return Config(
        bot_token=BOT_TOKEN,
        group_id=GROUP_ID,
        admin_ids=[42, 99],
        telegram_group_link="https://t.me/+testgroup",
        discord_link="https://discord.gg/test",
        database_path=str(tmp_path / "bot.db"),
        max_survey_attempts=2,
        dashboard_port=8080,
        dashboard_api_key=API_KEY,
        group_sync_interval_minutes=10,
    )


@pytest.fixture
async def db(tmp_path: Path):
    database = Database(str(tmp_path / "bot.db"))
    await database.connect()
    await database.init()
    yield database
    if database._db is not None:
        await database._db.close()


async def seed_member(
    database: Database,
    user_id: int = 1001,
    *,
    game_nick: str = "PlayerOne",
    real_name: str = "Ivan",
    perspective: str = "FPP",
    tg_username: str = "ivan_tg",
    discord_nick: str | None = "ivan#0001",
    track_in_group: bool = True,
) -> None:
    await database.save_member(
        user_id=user_id,
        tg_username=tg_username,
        tg_first_name="Ivan",
        game_nick=game_nick,
        real_name=real_name,
        discord_nick=discord_nick,
        perspective=perspective,
    )
    if track_in_group:
        await database.track_group_member(user_id)


def seed_member_sync(
    db_path: str | Path,
    user_id: int = 1001,
    *,
    game_nick: str = "PlayerOne",
    real_name: str = "Ivan",
    perspective: str = "FPP",
    tg_username: str = "ivan_tg",
    discord_nick: str | None = "ivan#0001",
    track_in_group: bool = True,
    is_inactive: bool = False,
    last_match_at: str | None = None,
) -> None:
    """Seed via sync sqlite3 so TestClient tests avoid event-loop conflicts."""
    now = datetime.now(timezone.utc).isoformat()
    checked = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO members (
                user_id, tg_username, tg_first_name, game_nick, real_name,
                discord_nick, perspective, is_inactive, is_legacy,
                last_match_at, last_match_checked_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                tg_username = excluded.tg_username,
                game_nick = excluded.game_nick,
                real_name = excluded.real_name,
                perspective = excluded.perspective,
                is_inactive = excluded.is_inactive,
                last_match_at = excluded.last_match_at,
                last_match_checked_at = excluded.last_match_checked_at
            """,
            (
                user_id,
                tg_username,
                "Ivan",
                game_nick,
                real_name,
                discord_nick,
                perspective,
                1 if is_inactive else 0,
                last_match_at,
                checked if last_match_at else None,
                now,
            ),
        )
        if track_in_group:
            conn.execute(
                """
                INSERT INTO group_members (user_id, joined_at)
                VALUES (?, ?)
                ON CONFLICT(user_id) DO NOTHING
                """,
                (user_id, now),
            )
        conn.commit()


def seed_blacklist_sync(db_path: str | Path, user_id: int, reason: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO blacklist (user_id, reason, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                reason = excluded.reason,
                created_at = excluded.created_at
            """,
            (user_id, reason, now),
        )
        conn.commit()


class TelegramMockTransport(httpx.AsyncBaseTransport):
    """Respond to Telegram Bot API calls used by the dashboard backend."""

    def __init__(self, member_status: str = "member") -> None:
        self.member_status = member_status
        self.calls: list[tuple[str, str]] = []

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        method = request.method
        self.calls.append((method, path))

        if path.endswith("/getChatMember"):
            return httpx.Response(
                200,
                json={
                    "ok": True,
                    "result": {
                        "status": self.member_status,
                        "user": {"id": 1001, "username": "ivan_tg"},
                    },
                },
            )
        if path.endswith("/banChatMember"):
            return httpx.Response(200, json={"ok": True, "result": True})
        if path.endswith("/unbanChatMember"):
            return httpx.Response(200, json={"ok": True, "result": True})
        if path.endswith("/promoteChatMember"):
            return httpx.Response(200, json={"ok": True, "result": True})
        if path.endswith("/setChatMemberTag"):
            return httpx.Response(200, json={"ok": True, "result": True})
        if path.endswith("/setChatAdministratorCustomTitle"):
            return httpx.Response(200, json={"ok": True, "result": True})
        if path.endswith("/approveChatJoinRequest"):
            return httpx.Response(
                200,
                json={"ok": False, "description": "No pending join request"},
            )
        if path.endswith("/createChatInviteLink"):
            return httpx.Response(
                200,
                json={
                    "ok": True,
                    "result": {"invite_link": "https://t.me/+restore"},
                },
            )
        if path.endswith("/sendMessage"):
            return httpx.Response(200, json={"ok": True, "result": {"message_id": 1}})
        return httpx.Response(
            404, json={"ok": False, "description": f"Unhandled {path}"}
        )


@pytest.fixture
def telegram_transport() -> TelegramMockTransport:
    return TelegramMockTransport()


@pytest.fixture
def api_module(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    telegram_transport: TelegramMockTransport,
):
    db_path = tmp_path / "api.db"
    monkeypatch.setenv("BOT_TOKEN", BOT_TOKEN)
    monkeypatch.setenv("GROUP_ID", str(GROUP_ID))
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    monkeypatch.setenv("DASHBOARD_API_KEY", API_KEY)
    monkeypatch.setenv("ADMIN_IDS", "42")
    monkeypatch.setenv("TELEGRAM_GROUP_LINK", "https://t.me/+testgroup")
    monkeypatch.setenv("DISCORD_LINK", "https://discord.gg/test")
    monkeypatch.setenv("MAX_SURVEY_ATTEMPTS", "2")

    _purge_api_modules()

    real_async_client = httpx.AsyncClient

    def _client_factory(*args: Any, **kwargs: Any) -> httpx.AsyncClient:
        # Do not override an explicit transport (e.g. ASGITransport in load tests).
        if "transport" not in kwargs:
            kwargs["transport"] = telegram_transport
        return real_async_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", _client_factory)

    module = importlib.import_module("dashboard.backend.main")
    module._test_db_path = str(db_path)  # type: ignore[attr-defined]
    return module


@pytest.fixture
def api_client(api_module) -> TestClient:
    with TestClient(api_module.app) as client:
        yield client


@pytest.fixture
def db_path(api_module) -> str:
    return api_module._test_db_path


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"X-API-Key": API_KEY}


@pytest.fixture
def mock_context(config: Config, db: Database):
    """Minimal telegram.ext context stub for handler unit tests."""
    context = AsyncMock()
    context.application.bot_data = {"db": db, "config": config}
    return context
