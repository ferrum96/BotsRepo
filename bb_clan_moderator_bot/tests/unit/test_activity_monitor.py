"""Unit tests for activity monitor join-grace and inactivity helpers."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from bot.activity_monitor import (
    INACTIVE_AFTER_HOURS,
    JOIN_ACTIVITY_GRACE_HOURS,
    _is_inactive,
    _is_within_join_grace,
    _parse_join_datetime,
    _parse_last_match_from_html,
    check_activity_on_join,
    fetch_last_match_at,
    refresh_member_activity,
)
from bot.database import Database, Member
from tests.conftest import seed_member


def _member(**overrides) -> Member:
    base = dict(
        user_id=1001,
        tg_username="ivan",
        tg_first_name="Ivan",
        game_nick="Fireman",
        real_name="Ivan",
        discord_nick=None,
        perspective="FPP",
        is_inactive=False,
        is_legacy=False,
        last_match_at=None,
        last_match_checked_at=None,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    base.update(overrides)
    return Member(**base)


def test_parse_last_match_from_html_class_first():
    html = (
        '<div class="matches-item__reload-time" '
        'data-ago-date="2026-07-01T12:00:00Z">1h</div>'
    )
    parsed = _parse_last_match_from_html(html)
    assert parsed is not None
    assert parsed == datetime(2026, 7, 1, 12, 0, tzinfo=timezone.utc)


def test_parse_last_match_from_html_attr_first():
    html = (
        '<div data-ago-date="2026-07-01T15:30:00+00:00" '
        'class="matches-item__reload-time">ago</div>'
    )
    parsed = _parse_last_match_from_html(html)
    assert parsed == datetime(2026, 7, 1, 15, 30, tzinfo=timezone.utc)


def test_parse_last_match_returns_none_when_missing():
    assert _parse_last_match_from_html("<html>no match</html>") is None


def test_is_inactive_threshold():
    now = datetime(2026, 7, 12, tzinfo=timezone.utc)
    assert _is_inactive(now - timedelta(hours=INACTIVE_AFTER_HOURS), now) is True
    assert _is_inactive(now - timedelta(hours=INACTIVE_AFTER_HOURS - 1), now) is False


def test_parse_join_datetime_iso():
    raw = "2026-07-11T22:00:00.123456+00:00"
    parsed = _parse_join_datetime(raw)
    assert parsed is not None
    assert parsed.tzinfo is not None
    assert parsed.year == 2026


def test_within_join_grace_for_recent_joiners():
    now = datetime(2026, 7, 12, 12, 0, tzinfo=timezone.utc)
    recent = now - timedelta(hours=JOIN_ACTIVITY_GRACE_HOURS - 1)
    old = now - timedelta(hours=JOIN_ACTIVITY_GRACE_HOURS + 1)

    assert _is_within_join_grace(recent, now) is True
    assert _is_within_join_grace(old, now) is False
    assert _is_within_join_grace(None, now) is False


@pytest.mark.asyncio
async def test_fetch_last_match_at_uses_opgg():
    html = (
        '<div class="matches-item__reload-time" '
        'data-ago-date="2026-07-05T10:00:00Z"></div>'
    )

    class FakeResponse:
        text = html

        def raise_for_status(self):
            return None

    client = AsyncMock()
    client.get = AsyncMock(return_value=FakeResponse())

    result = await fetch_last_match_at("TestNick", client)
    assert result == datetime(2026, 7, 5, 10, 0, tzinfo=timezone.utc)
    client.get.assert_awaited_once()
    url = client.get.await_args.args[0]
    assert "op.gg" in url
    assert "TestNick" in url


@pytest.mark.asyncio
async def test_refresh_skips_opgg_within_join_grace():
    db = AsyncMock()
    db.set_member_inactive = AsyncMock(return_value=True)
    db.get_group_member_join_date = AsyncMock()
    client = MagicMock()
    client.get = AsyncMock()

    now = datetime(2026, 7, 12, 12, 0, tzinfo=timezone.utc)
    joined = (now - timedelta(hours=24)).isoformat()

    result = await refresh_member_activity(
        db=db,
        member=_member(is_inactive=True),
        client=client,
        now_utc=now,
        joined_at=joined,
    )

    assert result["skipped_join_grace"] is True
    assert result["checked"] is False
    assert result["inactive_changed_to_true"] is False
    db.set_member_inactive.assert_not_called()
    client.get.assert_not_called()


@pytest.mark.asyncio
async def test_refresh_checks_opgg_after_grace(monkeypatch):
    db = AsyncMock()
    db.set_member_inactive = AsyncMock(return_value=True)
    db.set_member_last_match = AsyncMock(return_value=True)
    client = MagicMock()

    now = datetime(2026, 7, 12, 12, 0, tzinfo=timezone.utc)
    joined = (now - timedelta(hours=JOIN_ACTIVITY_GRACE_HOURS + 1)).isoformat()
    old_match = now - timedelta(hours=200)

    async def _fake_fetch(game_nick, client):
        return old_match

    monkeypatch.setattr(
        "bot.activity_monitor.fetch_last_match_at",
        _fake_fetch,
    )

    result = await refresh_member_activity(
        db=db,
        member=_member(),
        client=client,
        now_utc=now,
        joined_at=joined,
    )

    assert result["skipped_join_grace"] is False
    assert result["checked"] is True
    assert result["inactive_changed_to_true"] is True
    db.set_member_inactive.assert_awaited_once_with(1001, True)


@pytest.mark.asyncio
async def test_refresh_forced_on_join_ignores_grace(monkeypatch):
    db = AsyncMock()
    db.set_member_inactive = AsyncMock(return_value=True)
    db.set_member_last_match = AsyncMock(return_value=True)
    client = MagicMock()

    now = datetime(2026, 7, 12, 12, 0, tzinfo=timezone.utc)
    joined = (now - timedelta(hours=1)).isoformat()
    recent_match = now - timedelta(hours=10)

    async def _fake_fetch(game_nick, client):
        return recent_match

    monkeypatch.setattr(
        "bot.activity_monitor.fetch_last_match_at",
        _fake_fetch,
    )

    result = await refresh_member_activity(
        db=db,
        member=_member(),
        client=client,
        now_utc=now,
        joined_at=joined,
        ignore_join_grace=True,
    )

    assert result["skipped_join_grace"] is False
    assert result["checked"] is True
    assert result["inactive_changed_to_true"] is False
    db.set_member_inactive.assert_awaited_once_with(1001, False)


@pytest.mark.asyncio
async def test_check_activity_on_join_notifies_when_inactive(monkeypatch):
    db = AsyncMock()
    member = _member()
    inactive_member = _member(is_inactive=True, last_match_at="2026-06-01 00:00:00")
    db.get_member = AsyncMock(return_value=inactive_member)

    monkeypatch.setattr(
        "bot.activity_monitor.refresh_member_activity",
        AsyncMock(
            return_value={
                "checked": True,
                "inactive_changed_to_true": True,
                "skipped_join_grace": False,
            }
        ),
    )
    notify = AsyncMock()
    monkeypatch.setattr("bot.activity_monitor.notify_admins_about_inactive", notify)

    bot = MagicMock()
    config = MagicMock()

    result = await check_activity_on_join(bot, db, config, member)

    assert result["checked"] is True
    notify.assert_awaited_once()


@pytest.mark.asyncio
async def test_refresh_member_activity_marks_inactive(db: Database):
    await seed_member(db, 11, game_nick="OldPlayer", track_in_group=False)
    member = await db.get_member(11)
    assert member is not None

    old = datetime.now(timezone.utc) - timedelta(hours=INACTIVE_AFTER_HOURS + 5)
    html = (
        f'<div class="matches-item__reload-time" '
        f'data-ago-date="{old.isoformat().replace("+00:00", "Z")}"></div>'
    )

    class FakeResponse:
        text = html

        def raise_for_status(self):
            return None

    client = AsyncMock()
    client.get = AsyncMock(return_value=FakeResponse())

    result = await refresh_member_activity(db, member, client)
    assert result["checked"] is True
    assert result["inactive_changed_to_true"] is True
    assert result["skipped_join_grace"] is False

    updated = await db.get_member(11)
    assert updated is not None
    assert updated.is_inactive is True
    assert updated.last_match_at is not None


@pytest.mark.asyncio
async def test_refresh_member_activity_skips_empty_nick(db: Database):
    await seed_member(db, 12, game_nick="x", track_in_group=False)
    member = await db.get_member(12)
    assert member is not None
    member.game_nick = ""

    client = AsyncMock()
    result = await refresh_member_activity(db, member, client)
    assert result == {
        "checked": False,
        "inactive_changed_to_true": False,
        "skipped_join_grace": False,
    }
    client.get.assert_not_called()
