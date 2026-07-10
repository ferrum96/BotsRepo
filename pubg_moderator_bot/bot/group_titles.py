"""Telegram group custom titles (admin badges in the group header)."""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

import httpx
from telegram import Bot
from telegram.error import BadRequest, Forbidden, TelegramError

logger = logging.getLogger(__name__)

# Telegram limits custom_title to 16 UTF-16 code units.
CUSTOM_TITLE_MAX_LEN = 16

# Every administrator flag explicitly disabled.
_NO_ADMIN_RIGHTS = {
    "is_anonymous": False,
    "can_manage_chat": False,
    "can_change_info": False,
    "can_post_messages": False,
    "can_edit_messages": False,
    "can_delete_messages": False,
    "can_invite_users": False,
    "can_restrict_members": False,
    "can_pin_messages": False,
    "can_promote_members": False,
    "can_manage_video_chats": False,
    "can_manage_topics": False,
    "can_post_stories": False,
    "can_edit_stories": False,
    "can_delete_stories": False,
}

# Telegram requires at least one privilege to keep someone as administrator.
# Use the narrowest flag that still allows custom_title (no invite/manage rights).
_TITLE_BADGE_PERMISSIONS = {
    **_NO_ADMIN_RIGHTS,
    "can_pin_messages": True,
}

_REMOVE_ADMIN_PERMISSIONS = _NO_ADMIN_RIGHTS


def sanitize_custom_title(value: str) -> str:
    """Trim and clip the title to fit Telegram's custom_title limit."""
    cleaned = (value or "").strip()
    if not cleaned:
        return ""
    encoded = cleaned.encode("utf-16-le")
    if len(encoded) // 2 <= CUSTOM_TITLE_MAX_LEN:
        return cleaned
    return encoded[: CUSTOM_TITLE_MAX_LEN * 2].decode("utf-16-le", errors="ignore")


def _clip_utf16_units(value: str, max_units: int) -> str:
    """Clip string to max UTF-16 code units."""
    if max_units <= 0:
        return ""
    encoded = (value or "").encode("utf-16-le")
    return encoded[: max_units * 2].decode("utf-16-le", errors="ignore")


def _normalize_game_nick(value: str) -> str:
    """Return game nick without wrapper braces."""
    nick = (value or "").strip()
    # Unwrap one or more outer brace layers like "{nick}" or "{{nick}}".
    while len(nick) >= 2 and nick.startswith("{") and nick.endswith("}"):
        nick = nick[1:-1].strip()
    return nick


def build_game_nick_title(game_nick: str) -> str:
    """Build game nick title while preserving Telegram length limits."""
    nickname = _normalize_game_nick(game_nick)
    if not nickname:
        return ""
    trimmed_nick = _clip_utf16_units(nickname, CUSTOM_TITLE_MAX_LEN)
    return sanitize_custom_title(trimmed_nick)


async def assign_game_nick_title(
    bot: Bot,
    chat_id: int,
    user_id: int,
    game_nick: str,
) -> bool:
    """Promote for a badge only and set custom_title to the game nick.

    Without custom_title Telegram shows the generic "admin" label.
    All administrator rights are explicitly revoked except the minimum
    required to remain in the administrators list.
    """
    primary_title = build_game_nick_title(game_nick)
    fallback_title = sanitize_custom_title(game_nick)
    title_candidates = [t for t in (primary_title, fallback_title) if t]
    if not title_candidates:
        logger.warning("Empty game nick for user %s — skipping title", user_id)
        return False

    try:
        await bot.promote_chat_member(
            chat_id=chat_id,
            user_id=user_id,
            **_TITLE_BADGE_PERMISSIONS,
        )
    except (BadRequest, Forbidden, TelegramError):
        logger.exception(
            "Failed to promote user %s for title badge in chat %s",
            user_id,
            chat_id,
        )
        return False

    applied_title = ""
    for title in title_candidates:
        for attempt in range(1, 4):
            try:
                await bot.set_chat_administrator_custom_title(
                    chat_id=chat_id,
                    user_id=user_id,
                    custom_title=title,
                )
                applied_title = title
                break
            except BadRequest as exc:
                message = str(exc)
                # Telegram can briefly lag right after promoteChatMember.
                if "USER_ADMIN_INVALID" in message and attempt < 3:
                    await asyncio.sleep(0.8)
                    continue
                logger.warning(
                    "Failed to set custom title '%s' for user %s in chat %s: %s",
                    title,
                    user_id,
                    chat_id,
                    message,
                )
                break
            except (Forbidden, TelegramError):
                logger.exception(
                    "Failed to set custom title '%s' for user %s in chat %s",
                    title,
                    user_id,
                    chat_id,
                )
                break
        if applied_title:
            break

    if not applied_title:
        try:
            # Avoid leaving the user with a generic "admin" badge.
            await bot.promote_chat_member(
                chat_id=chat_id,
                user_id=user_id,
                **_REMOVE_ADMIN_PERMISSIONS,
            )
        except (BadRequest, Forbidden, TelegramError):
            logger.exception(
                "Failed to rollback admin badge for user %s in chat %s",
                user_id,
                chat_id,
            )
        return False

    try:
        # Enforce minimum rights one more time in case Telegram inherited
        # extra privileges from prior admin state.
        await bot.promote_chat_member(
            chat_id=chat_id,
            user_id=user_id,
            **_TITLE_BADGE_PERMISSIONS,
        )
    except (BadRequest, Forbidden, TelegramError):
        logger.exception(
            "Failed to enforce minimal rights for user %s in chat %s",
            user_id,
            chat_id,
        )
        try:
            await bot.promote_chat_member(
                chat_id=chat_id,
                user_id=user_id,
                **_REMOVE_ADMIN_PERMISSIONS,
            )
        except (BadRequest, Forbidden, TelegramError):
            logger.exception(
                "Failed to rollback admin badge for user %s in chat %s",
                user_id,
                chat_id,
            )
        return False

    try:
        # Telegram may clear custom title after permissions update, so set it again.
        await bot.set_chat_administrator_custom_title(
            chat_id=chat_id,
            user_id=user_id,
            custom_title=applied_title,
        )
    except (BadRequest, Forbidden, TelegramError):
        logger.exception(
            "Failed to restore custom title '%s' for user %s in chat %s",
            applied_title,
            user_id,
            chat_id,
        )
        try:
            await bot.promote_chat_member(
                chat_id=chat_id,
                user_id=user_id,
                **_REMOVE_ADMIN_PERMISSIONS,
            )
        except (BadRequest, Forbidden, TelegramError):
            logger.exception(
                "Failed to rollback admin badge for user %s in chat %s",
                user_id,
                chat_id,
            )
        return False

    logger.info(
        "Custom title '%s' set for user %s in chat %s",
        applied_title,
        user_id,
        chat_id,
    )
    return True


async def _clear_custom_title(
    *,
    bot_token: str,
    chat_id: int,
    user_id: int,
    bot: Optional[Bot] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> bool:
    """Clear the game-nick badge before demoting."""
    if bot is not None:
        try:
            await bot.set_chat_administrator_custom_title(
                chat_id=chat_id,
                user_id=user_id,
                custom_title="",
            )
            return True
        except (BadRequest, Forbidden, TelegramError) as exc:
            logger.debug(
                "Could not clear custom title for user %s in chat %s: %s",
                user_id,
                chat_id,
                exc,
            )
            return False

    url = f"https://api.telegram.org/bot{bot_token}/setChatAdministratorCustomTitle"
    payload = {"chat_id": chat_id, "user_id": user_id, "custom_title": ""}
    try:
        if client is None:
            async with httpx.AsyncClient() as owned:
                resp = await owned.post(url, json=payload, timeout=15)
        else:
            resp = await client.post(url, json=payload, timeout=15)
        data = resp.json()
        if resp.status_code == 200 and data.get("ok"):
            return True
        logger.debug(
            "Could not clear custom title for user %s in chat %s: %s",
            user_id,
            chat_id,
            data.get("description", resp.text),
        )
        return False
    except httpx.HTTPError:
        logger.exception(
            "Failed to clear custom title for user %s in chat %s",
            user_id,
            chat_id,
        )
        return False


async def remove_from_group_header(
    *,
    bot_token: str,
    chat_id: int,
    user_id: int,
    bot: Optional[Bot] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> bool:
    """Remove a user from the group admin list (Telegram UI: Remove).

    Clan members are promoted to limited admins only to show a game-nick badge.
    Kicking them from the chat does not always clear that admin entry, so we
    mirror the native Remove action: clear title, then demote.
    """
    await _clear_custom_title(
        bot_token=bot_token,
        chat_id=chat_id,
        user_id=user_id,
        bot=bot,
        client=client,
    )

    if bot is not None:
        try:
            await bot.promote_chat_member(
                chat_id=chat_id,
                user_id=user_id,
                **_REMOVE_ADMIN_PERMISSIONS,
            )
            logger.info(
                "Removed user %s from group header in chat %s",
                user_id,
                chat_id,
            )
            return True
        except (BadRequest, Forbidden, TelegramError) as exc:
            logger.warning(
                "Failed to remove user %s from group header in chat %s: %s",
                user_id,
                chat_id,
                exc,
            )
            return False

    url = f"https://api.telegram.org/bot{bot_token}/promoteChatMember"
    payload = {
        "chat_id": chat_id,
        "user_id": user_id,
        **_REMOVE_ADMIN_PERMISSIONS,
    }
    try:
        if client is None:
            async with httpx.AsyncClient() as owned:
                resp = await owned.post(url, json=payload, timeout=15)
        else:
            resp = await client.post(url, json=payload, timeout=15)
        data = resp.json()
        if resp.status_code == 200 and data.get("ok"):
            logger.info(
                "Removed user %s from group header in chat %s",
                user_id,
                chat_id,
            )
            return True
        logger.warning(
            "Failed to remove user %s from group header in chat %s: %s",
            user_id,
            chat_id,
            data.get("description", resp.text),
        )
        return False
    except httpx.HTTPError:
        logger.exception(
            "Failed to remove user %s from group header in chat %s",
            user_id,
            chat_id,
        )
        return False


# Backward-compatible alias used by older imports.
demote_member_from_group_header = remove_from_group_header
