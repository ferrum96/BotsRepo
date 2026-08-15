"""Activity checks against OP.GG and inactive member tracking."""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone
from html import unescape
from typing import TYPE_CHECKING, Any, Optional
from urllib.parse import quote

import httpx

from bot.database import Database, LAST_MATCH_FORMAT, Member

if TYPE_CHECKING:
    from bot.config import Config
    from telegram import Bot

logger = logging.getLogger(__name__)

OP_GG_PROFILE_URL = "https://op.gg/ru/pubg/user/{game_nick}"
OP_GG_RENEW_URL = "https://op.gg/pubg/api/users/{opgg_user_id}/renew"
OP_GG_RENEW_STATUS_URL = "https://op.gg/pubg/api/users/{opgg_user_id}/renew-status"
OP_GG_MATCHES_RECENT_URL = "https://op.gg/pubg/api/users/{opgg_user_id}/matches/recent"
OP_GG_RENEW_BODY = {"_method": "PATCH", "type": "matches"}
INACTIVE_AFTER_HOURS = 7 * 24
# Do not judge inactivity until the member has been in the group this long.
JOIN_ACTIVITY_GRACE_HOURS = INACTIVE_AFTER_HOURS
ACTIVITY_REFRESH_INTERVAL_HOURS = 12
_RENEW_POLL_ATTEMPTS = 20
_RENEW_POLL_INTERVAL_SEC = 0.5
_OP_GG_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
}
_LAST_MATCH_PATTERN = re.compile(
    r'<div[^>]*(?:class="[^"]*matches-item__reload-time[^"]*"[^>]*data-ago-date="([^"]+)"|'
    r'data-ago-date="([^"]+)"[^>]*class="[^"]*matches-item__reload-time[^"]*")[^>]*>',
    re.IGNORECASE,
)
_OPGG_USER_ID_PATTERN = re.compile(
    r'\bdata-user_id="([A-Za-z0-9_-]+)"',
    re.IGNORECASE,
)
_TZ_OFFSET_PATTERN = re.compile(r"([+-])(\d{2})(\d{2})$")


def _parse_iso_datetime(raw: str) -> Optional[datetime]:
    value = unescape(raw).strip()
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    offset_match = _TZ_OFFSET_PATTERN.search(normalized)
    if offset_match and ":" not in normalized[-6:]:
        normalized = (
            normalized[: offset_match.start()]
            + f"{offset_match.group(1)}{offset_match.group(2)}:{offset_match.group(3)}"
        )
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _parse_last_match_from_html(html: str) -> Optional[datetime]:
    match = _LAST_MATCH_PATTERN.search(html)
    if not match:
        return None
    return _parse_iso_datetime(match.group(1) or match.group(2) or "")


def _parse_opgg_user_id(html: str) -> Optional[str]:
    match = _OPGG_USER_ID_PATTERN.search(html)
    if not match:
        return None
    user_id = match.group(1).strip()
    return user_id or None


def _first_match_started_at(payload: Any) -> Optional[datetime]:
    """Read started_at from OP.GG matches/recent JSON."""
    if payload is None:
        return None
    if isinstance(payload, list):
        return _first_match_started_at(payload[0]) if payload else None
    if not isinstance(payload, dict):
        return None

    for key in ("started_at", "startedAt", "played_at", "playedAt"):
        raw = payload.get(key)
        if isinstance(raw, str):
            parsed = _parse_iso_datetime(raw)
            if parsed is not None:
                return parsed

    for key in ("data", "matches", "items"):
        nested = payload.get(key)
        if nested is not None:
            parsed = _first_match_started_at(nested)
            if parsed is not None:
                return parsed
    return None


def _response_json(response: Any) -> Any:
    json_fn = getattr(response, "json", None)
    if not callable(json_fn):
        return None
    try:
        return json_fn()
    except Exception:
        return None


def _http_status(response: Any) -> int:
    code = getattr(response, "status_code", 200)
    try:
        return int(code)
    except (TypeError, ValueError):
        return 200


def _opgg_api_headers(profile_url: str) -> dict[str, str]:
    return {
        **_OP_GG_HEADERS,
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": "https://op.gg",
        "Referer": profile_url,
    }


async def _renew_opgg_profile(
    opgg_user_id: str,
    client: httpx.AsyncClient,
    profile_url: str,
) -> bool:
    """POST OP.GG renew, then poll until finished. False if renew never started."""
    renew_url = OP_GG_RENEW_URL.format(opgg_user_id=opgg_user_id)
    headers = _opgg_api_headers(profile_url)
    try:
        response = await client.post(
            renew_url,
            json=OP_GG_RENEW_BODY,
            headers=headers,
            timeout=25,
        )
    except Exception:
        logger.warning("OP.GG renew request failed for user_id=%s", opgg_user_id)
        return False

    status = _http_status(response)
    if status >= 400:
        logger.warning(
            "OP.GG renew HTTP %s for user_id=%s",
            status,
            opgg_user_id,
        )
        return False

    payload = _response_json(response)
    data = payload.get("data", payload) if isinstance(payload, dict) else {}
    if isinstance(data, dict) and data.get("is_ended"):
        return True

    status_url = OP_GG_RENEW_STATUS_URL.format(opgg_user_id=opgg_user_id)
    for _ in range(_RENEW_POLL_ATTEMPTS):
        await asyncio.sleep(_RENEW_POLL_INTERVAL_SEC)
        try:
            status_response = await client.get(
                status_url,
                headers=headers,
                timeout=25,
            )
        except Exception:
            break
        payload = _response_json(status_response)
        data = payload.get("data", payload) if isinstance(payload, dict) else {}
        if isinstance(data, dict) and data.get("is_ended"):
            return True
    return True


def _as_db_string(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime(LAST_MATCH_FORMAT)


def _parse_db_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.strptime(value, LAST_MATCH_FORMAT).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _parse_join_datetime(value: Optional[str]) -> Optional[datetime]:
    """Parse group_members.joined_at (ISO) or LAST_MATCH_FORMAT fallback."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return _parse_db_datetime(value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _is_inactive(last_match_at: datetime, now_utc: datetime) -> bool:
    return last_match_at <= (now_utc - timedelta(hours=INACTIVE_AFTER_HOURS))


def _is_within_join_grace(
    joined_at: Optional[datetime],
    now_utc: datetime,
    grace_hours: int = JOIN_ACTIVITY_GRACE_HOURS,
) -> bool:
    """True if the member joined the group recently and should skip inactivity checks."""
    if joined_at is None:
        return False
    return joined_at > (now_utc - timedelta(hours=grace_hours))


async def fetch_last_match_at(game_nick: str, client: httpx.AsyncClient) -> Optional[datetime]:
    profile_url = OP_GG_PROFILE_URL.format(game_nick=quote(game_nick, safe=""))
    response = await client.get(
        profile_url,
        timeout=25,
        headers=_OP_GG_HEADERS,
    )
    response.raise_for_status()
    html = response.text
    last_match = _parse_last_match_from_html(html)
    opgg_user_id = _parse_opgg_user_id(html)
    if not opgg_user_id:
        logger.warning("OP.GG data-user_id missing for nick=%s", game_nick)
        return last_match

    await _renew_opgg_profile(opgg_user_id, client, profile_url)
    last_from_api = await _fetch_last_match_from_matches_api(
        opgg_user_id,
        client,
        profile_url,
    )
    if last_from_api is not None:
        return last_from_api

    try:
        refreshed = await client.get(
            profile_url,
            timeout=25,
            headers=_OP_GG_HEADERS,
        )
        refreshed.raise_for_status()
        last_match = _parse_last_match_from_html(refreshed.text) or last_match
    except Exception:
        logger.warning("OP.GG profile re-fetch failed for nick=%s", game_nick)
    return last_match


async def _fetch_last_match_from_matches_api(
    opgg_user_id: str,
    client: httpx.AsyncClient,
    profile_url: str,
) -> Optional[datetime]:
    matches_url = OP_GG_MATCHES_RECENT_URL.format(opgg_user_id=opgg_user_id)
    try:
        response = await client.get(
            matches_url,
            headers=_opgg_api_headers(profile_url),
            timeout=25,
        )
        response.raise_for_status()
    except Exception:
        logger.warning(
            "OP.GG matches/recent failed for user_id=%s",
            opgg_user_id,
        )
        return None
    return _first_match_started_at(_response_json(response))


def _was_checked_within_interval(
    last_match_checked_at: Optional[str],
    now_utc: datetime,
    interval_hours: int = ACTIVITY_REFRESH_INTERVAL_HOURS,
) -> bool:
    checked_at = _parse_db_datetime(last_match_checked_at)
    if checked_at is None:
        return False
    return checked_at > (now_utc - timedelta(hours=interval_hours))


async def refresh_member_activity(
    db: Database,
    member: Member,
    client: httpx.AsyncClient,
    now_utc: Optional[datetime] = None,
    joined_at: Optional[str] = None,
    *,
    ignore_join_grace: bool = False,
    force_refresh: bool = False,
) -> dict[str, bool]:
    now_utc = now_utc or datetime.now(timezone.utc)
    if not member.game_nick:
        await db.set_member_inactive(member.user_id, False)
        return {
            "checked": False,
            "inactive_changed_to_true": False,
            "skipped_join_grace": False,
        }

    if not ignore_join_grace:
        join_raw = joined_at
        if join_raw is None:
            join_raw = await db.get_group_member_join_date(member.user_id)
        join_dt = _parse_join_datetime(join_raw)
        if _is_within_join_grace(join_dt, now_utc):
            # Periodic jobs skip fresh joiners; first-join path uses ignore_join_grace.
            # Do not touch is_inactive — join-time check may have already set it.
            logger.debug(
                "Skip activity check for user_id=%s: within %sh join grace",
                member.user_id,
                JOIN_ACTIVITY_GRACE_HOURS,
            )
            return {
                "checked": False,
                "inactive_changed_to_true": False,
                "skipped_join_grace": True,
            }

    if not force_refresh and _was_checked_within_interval(
        member.last_match_checked_at,
        now_utc,
    ):
        logger.debug(
            "Skip activity check for user_id=%s: checked within %sh",
            member.user_id,
            ACTIVITY_REFRESH_INTERVAL_HOURS,
        )
        return {
            "checked": False,
            "inactive_changed_to_true": False,
            "skipped_join_grace": False,
        }

    parsed_last_match = await fetch_last_match_at(member.game_nick, client)
    if parsed_last_match is None:
        return {
            "checked": False,
            "inactive_changed_to_true": False,
            "skipped_join_grace": False,
        }

    last_match_at_db = _as_db_string(parsed_last_match)
    is_inactive_now = _is_inactive(parsed_last_match, now_utc)
    await db.set_member_last_match(member.user_id, last_match_at_db)
    await db.set_member_inactive(member.user_id, is_inactive_now)
    return {
        "checked": True,
        "inactive_changed_to_true": (not member.is_inactive) and is_inactive_now,
        "skipped_join_grace": False,
    }


async def check_activity_on_join(
    bot: "Bot",
    db: Database,
    config: "Config",
    member: Member,
) -> dict[str, bool]:
    """Run OP.GG activity check immediately when a member first joins the group."""
    try:
        async with httpx.AsyncClient(
            headers=_OP_GG_HEADERS,
            follow_redirects=True,
        ) as client:
            result = await refresh_member_activity(
                db=db,
                member=member,
                client=client,
                ignore_join_grace=True,
                force_refresh=True,
            )
    except Exception:
        logger.exception(
            "Failed join activity check for user_id=%s nick=%s",
            member.user_id,
            member.game_nick,
        )
        return {
            "checked": False,
            "inactive_changed_to_true": False,
            "skipped_join_grace": False,
        }

    updated = await db.get_member(member.user_id)
    if (
        updated
        and updated.is_inactive
        and result.get("inactive_changed_to_true")
    ):
        await notify_admins_about_inactive(
            bot=bot,
            config=config,
            member=updated,
            last_match_at=updated.last_match_at,
        )

    logger.info(
        "Join activity check user_id=%s nick=%s checked=%s inactive=%s",
        member.user_id,
        member.game_nick,
        result.get("checked"),
        bool(updated and updated.is_inactive),
    )
    return result



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
    *,
    force_refresh: bool = False,
) -> dict[str, int]:
    """Refresh OP.GG activity for current Telegram group members."""
    group_member_ids = await db.get_group_member_ids()
    members = await db.get_active_members()
    members_by_id = {m.user_id: m for m in members}

    checked = 0
    inactive = 0
    added_to_inactive = 0
    skipped_join_grace = 0
    errors = 0
    now_utc = datetime.now(timezone.utc)

    async with httpx.AsyncClient(
        headers=_OP_GG_HEADERS,
        follow_redirects=True,
    ) as client:
        for user_id in group_member_ids:
            member = members_by_id.get(user_id)
            if not member:
                continue
            try:
                join_raw = await db.get_group_member_join_date(user_id)
                result = await refresh_member_activity(
                    db=db,
                    member=member,
                    client=client,
                    now_utc=now_utc,
                    joined_at=join_raw,
                    force_refresh=force_refresh,
                )
                if result["checked"]:
                    checked += 1
                if result.get("skipped_join_grace"):
                    skipped_join_grace += 1

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
        "skipped_join_grace": skipped_join_grace,
        "errors": errors,
    }
