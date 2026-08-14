from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from bot.config import Config
from bot.member_import import import_all_chat_participants, maybe_full_member_import


class _FakeClient:
    def __init__(self, users):
        self._users = users
        self.disconnected = False

    async def iter_participants(self, _chat_id):
        for user in self._users:
            yield user

    async def disconnect(self):
        self.disconnected = True


@pytest.mark.asyncio
async def test_import_all_skips_without_api_credentials(db, config: Config):
    cfg = Config(
        bot_token=config.bot_token,
        group_id=config.group_id,
        database_path=config.database_path,
        telegram_api_id=0,
        telegram_api_hash="",
    )
    result = await import_all_chat_participants(db, cfg)
    assert result["skipped"] is True
    assert "TELEGRAM_API" in result["reason"]


@pytest.mark.asyncio
async def test_import_all_creates_members_and_skips_bots(db, config: Config):
    cfg = Config(
        bot_token=config.bot_token,
        group_id=config.group_id,
        database_path=config.database_path,
        telegram_api_id=12345,
        telegram_api_hash="hash",
    )
    users = [
        SimpleNamespace(
            id=101,
            bot=False,
            username="alice",
            first_name="Alice",
            last_name="",
            participant=None,
        ),
        SimpleNamespace(
            id=102,
            bot=True,
            username="botty",
            first_name="Bot",
            last_name="",
            participant=None,
        ),
        SimpleNamespace(
            id=103,
            bot=False,
            username=None,
            first_name="Bob",
            last_name="Builder",
            participant=None,
        ),
    ]
    client = _FakeClient(users)
    result = await import_all_chat_participants(db, cfg, client=client)

    assert result["skipped"] is False
    assert result["seen"] == 3
    assert result["imported"] == 2
    assert result["tracked"] == 0
    assert await db.is_member(101)
    assert not await db.is_member(102)
    assert await db.is_member(103)
    member = await db.get_member(101)
    assert member is not None
    assert member.game_nick == "alice"
    assert member.perspective == ""
    # Real name stays empty until an admin fills it in the dashboard.
    assert member.real_name == ""
    assert member.tg_username == "alice"


@pytest.mark.asyncio
async def test_import_uses_telegram_join_date(db, config: Config):
    cfg = Config(
        bot_token=config.bot_token,
        group_id=config.group_id,
        database_path=config.database_path,
        telegram_api_id=1,
        telegram_api_hash="h",
    )
    joined = datetime(2024, 3, 15, 12, 0, tzinfo=timezone.utc)
    participant = type("ChannelParticipant", (), {"date": joined})()
    users = [
        SimpleNamespace(
            id=401,
            bot=False,
            username="joiner",
            first_name="Join",
            last_name="",
            participant=participant,
        ),
    ]
    result = await import_all_chat_participants(db, cfg, client=_FakeClient(users))
    assert result["imported"] == 1
    assert await db.get_group_member_join_date(401) == joined.isoformat()
    member = await db.get_member(401)
    assert member is not None
    assert member.perspective == ""


@pytest.mark.asyncio
async def test_import_skips_admins_and_owners(db, config: Config):
    cfg = Config(
        bot_token=config.bot_token,
        group_id=config.group_id,
        database_path=config.database_path,
        admin_ids=[999],
        telegram_api_id=1,
        telegram_api_hash="h",
    )
    users = [
        SimpleNamespace(
            id=301,
            bot=False,
            username="owner",
            first_name="Own",
            last_name="",
            participant=type("ChannelParticipantCreator", (), {})(),
        ),
        SimpleNamespace(
            id=302,
            bot=False,
            username="admin",
            first_name="Ad",
            last_name="",
            participant=type("ChannelParticipantAdmin", (), {})(),
        ),
        SimpleNamespace(
            id=999,
            bot=False,
            username="botadmin",
            first_name="BA",
            last_name="",
            participant=None,
        ),
        SimpleNamespace(
            id=303,
            bot=False,
            username="member",
            first_name="Mem",
            last_name="",
            participant=type("ChannelParticipant", (), {})(),
        ),
    ]

    result = await import_all_chat_participants(db, cfg, client=_FakeClient(users))
    assert result["imported"] == 1
    assert result["skipped_admins"] == 3
    assert await db.is_member(303)
    assert not await db.is_member(301)
    assert not await db.is_member(302)
    assert not await db.is_member(999)


@pytest.mark.asyncio
async def test_import_tracks_existing_without_overwrite(db, config: Config):
    await db.save_member(
        user_id=201,
        tg_username="old",
        tg_first_name="Old",
        game_nick="KeepNick",
        real_name="Keep Name",
        discord_nick=None,
        perspective="FPP",
    )
    cfg = Config(
        bot_token=config.bot_token,
        group_id=config.group_id,
        database_path=config.database_path,
        telegram_api_id=1,
        telegram_api_hash="h",
    )
    users = [
        SimpleNamespace(
            id=201,
            bot=False,
            username="newname",
            first_name="New",
            last_name="",
            participant=None,
        ),
    ]
    result = await import_all_chat_participants(db, cfg, client=_FakeClient(users))
    assert result["imported"] == 0
    assert result["tracked"] == 1
    member = await db.get_member(201)
    assert member is not None
    assert member.game_nick == "KeepNick"
    assert 201 in await db.get_group_member_ids()


@pytest.mark.asyncio
async def test_maybe_full_import_runs_when_empty(db, config: Config, monkeypatch):
    cfg = Config(
        bot_token=config.bot_token,
        group_id=config.group_id,
        database_path=config.database_path,
        telegram_api_id=1,
        telegram_api_hash="h",
        full_member_sync_on_empty=True,
    )
    called = AsyncMock(return_value={"imported": 1})
    monkeypatch.setattr(
        "bot.member_import.import_all_chat_participants",
        called,
    )
    result = await maybe_full_member_import(db, cfg)
    assert result == {"imported": 1}
    called.assert_awaited_once()


@pytest.mark.asyncio
async def test_maybe_full_import_skips_when_members_exist(db, config: Config, monkeypatch):
    await db.save_member(
        user_id=1,
        tg_username=None,
        tg_first_name="A",
        game_nick="a",
        real_name="A",
        discord_nick=None,
        perspective="Mixed",
    )
    cfg = Config(
        bot_token=config.bot_token,
        group_id=config.group_id,
        database_path=config.database_path,
        full_member_sync_on_empty=True,
        full_member_sync_force=False,
    )
    called = AsyncMock()
    monkeypatch.setattr(
        "bot.member_import.import_all_chat_participants",
        called,
    )
    assert await maybe_full_member_import(db, cfg) is None
    called.assert_not_called()


def test_config_reads_telethon_and_full_sync_flags(monkeypatch):
    monkeypatch.setenv("BOT_TOKEN", "tok")
    monkeypatch.setenv("GROUP_ID", "-1001")
    monkeypatch.setenv("TELEGRAM_API_ID", "42")
    monkeypatch.setenv("TELEGRAM_API_HASH", "abc")
    monkeypatch.setenv("FULL_MEMBER_SYNC", "1")
    monkeypatch.setenv("FULL_MEMBER_SYNC_ON_EMPTY", "0")
    cfg = Config.from_env()
    assert cfg.telegram_api_id == 42
    assert cfg.telegram_api_hash == "abc"
    assert cfg.full_member_sync_force is True
    assert cfg.full_member_sync_on_empty is False
