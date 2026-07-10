"""Activity checks against OP.GG and inactive member tracking."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from html import unescape
from typing import TYPE_CHECKING, Optional
from urllib.parse import quote

import httpx

from bot.database import Database, LAST_MATCH_FORMAT, Member

if TYPE_CHECKING:
    from bot.config import Config
    from telegram import Bot

logger = logging.getLogger(__name__)

OP_GG_PROFILE_URL = "https://op.gg/ru/pubg/user/{game_nick}"
INACTIVE_AFTER_HOURS = 7 * 24
_LAST_MATCH_PATTERN = re.compile(
    r'<div[^>]*(?:class="[^"]*matches-item__reload-time[^"]*"[^>]*data-ago-date="([^"]+)"|'
    r'data-ago-date="([^"]+)"[^>]*class="[^"]*matches-item__reload-time[^"]*")[^>]*>',
    re.IGNORECASE,
)


def _parse_last_match_from_html(html: str) -> Optional[datetime]:
    match = _LAST_MATCH_PATTERN.search(html)
    if not match:
        return None
    raw = unescape(match.group(1) or match.group(2) or "").strip()
    if not raw:
        return None
    normalized = raw.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _as_db_string(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime(LAST_MATCH_FORMAT)


def _parse_db_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.strptime(value, LAST_MATCH_FORMAT).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _is_inactive(last_match_at: datetime, now_utc: datetime) -> bool:
    return last_match_at <= (now_utc - timedelta(hours=INACTIVE_AFTER_HOURS))


async def fetch_last_match_at(game_nick: str, client: httpx.AsyncClient) -> Optional[datetime]:
    profile_url = OP_GG_PROFILE_URL.format(game_nick=quote(game_nick, safe=""))
    response = await client.get(
        profile_url,
        timeout=25,
        headers={"User-Agent": "Mozilla/5.0 PUBG-Moderator-Bot/1.0"},
    )
    response.raise_for_status()
    return _parse_last_match_from_html(response.text)


async def refresh_member_activity(
    db: Database,
    member: Member,
    client: httpx.AsyncClient,
    now_utc: Optional[datetime] = None,
) -> dict[str, bool]:
    now_utc = now_utc or datetime.now(timezone.utc)
    if not member.game_nick:
        await db.set_member_inactive(member.user_id, False)
        return {"checked": False, "inactive_changed_to_true": False}

    parsed_last_match = await fetch_last_match_at(member.game_nick, client)
    if parsed_last_match is None:
        return {"checked": False, "inactive_changed_to_true": False}

    last_match_at_db = _as_db_string(parsed_last_match)
    is_inactive_now = _is_inactive(parsed_last_match, now_utc)
    await db.set_member_last_match(member.user_id, last_match_at_db)
    await db.set_member_inactive(member.user_id, is_inactive_now)
    return {
        "checked": True,
        "inactive_changed_to_true": (not member.is_inactive) and is_inactive_now,
    }


async def notify_admins_about_inactive(
    bot: "Bot",
    config: "Config",
    member: Member,
    last_match_at: Optional[str],
) -> None:
    if not config.admin_ids:
        return
    message = (
        "Игрок стал неактивным:\n"
        f"Имя: {member.real_name}\n"
        f"Ник в игре: {member.game_nick}\n"
        f"Ник в Discord: {member.discord_nick or '—'}\n"
        f"Последний матч: {last_match_at or 'нет данных'}"
    )
    for admin_id in config.admin_ids:
        try:
            await bot.send_message(chat_id=admin_id, text=message)
        except Exception:
            logger.exception("Failed to send inactive notice to admin %s", admin_id)


async def refresh_group_activity(
    bot: "Bot",
    db: Database,
    config: "Config",
) -> dict[str, int]:
    """Refresh OP.GG activity for current Telegram group members."""
    group_member_ids = await db.get_group_member_ids()
    members = await db.get_active_members()
    members_by_id = {m.user_id: m for m in members}

    checked = 0
    inactive = 0
    added_to_inactive = 0
    errors = 0
    now_utc = datetime.now(timezone.utc)

    async with httpx.AsyncClient() as client:
        for user_id in group_member_ids:
            member = members_by_id.get(user_id)
            if not member:
                continue
            try:
                result = await refresh_member_activity(
                    db=db,
                    member=member,
                    client=client,
                    now_utc=now_utc,
                )
                if result["checked"]:
                    checked += 1

                updated_member = await db.get_member(member.user_id)
                if updated_member and updated_member.is_inactive:
                    inactive += 1
                    if result["inactive_changed_to_true"]:
                        added_to_inactive += 1
                        await notify_admins_about_inactive(
                            bot=bot,
                            config=config,
                            member=updated_member,
                            last_match_at=updated_member.last_match_at,
                        )
            except Exception:
                errors += 1
                logger.exception(
                    "Failed to refresh activity for user_id=%s nick=%s",
                    member.user_id,
                    member.game_nick,
                )

    return {
        "group_total": len(group_member_ids),
        "checked": checked,
        "inactive": inactive,
        "added_to_inactive": added_to_inactive,
        "errors": errors,
    }
