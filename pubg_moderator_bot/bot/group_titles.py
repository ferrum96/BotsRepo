"""Telegram member tags (Bot API setChatMemberTag) for regular group members."""

from __future__ import annotations

import logging
from typing import Optional

import httpx
from telegram import Bot
from telegram.error import BadRequest, Forbidden, TelegramError

logger = logging.getLogger(__name__)

# Telegram limits member tags to 16 UTF-16 code units; emoji are not allowed.
MEMBER_TAG_MAX_LEN = 16

# Backward-compatible alias used by older imports / tests.
CUSTOM_TITLE_MAX_LEN = MEMBER_TAG_MAX_LEN

# Demote leftover badge-admins (or any admin) when kicking from dashboard/bot.
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


def _clip_utf16_units(value: str, max_units: int) -> str:
    """Clip string to max UTF-16 code units."""
    if max_units <= 0:
        return ""
    encoded = (value or "").encode("utf-16-le")
    return encoded[: max_units * 2].decode("utf-16-le", errors="ignore")


def normalize_game_nick(value: str) -> str:
    """Return game nick without wrapper braces."""
    nick = (value or "").strip()
    while len(nick) >= 2 and nick.startswith("{") and nick.endswith("}"):
        nick = nick[1:-1].strip()
    return nick


def sanitize_member_tag(value: str) -> str:
    """Trim and clip the tag to fit Telegram's member tag limit."""
    cleaned = (value or "").strip()
    if not cleaned:
        return ""
    # Member tags reject emoji; drop non-BMP code points (emoji / symbols).
    cleaned = "".join(ch for ch in cleaned if ord(ch) <= 0xFFFF and not (0xD800 <= ord(ch) <= 0xDFFF))
    cleaned = cleaned.strip()
    if not cleaned:
        return ""
    encoded = cleaned.encode("utf-16-le")
    if len(encoded) // 2 <= MEMBER_TAG_MAX_LEN:
        return cleaned
    return encoded[: MEMBER_TAG_MAX_LEN * 2].decode("utf-16-le", errors="ignore")


# Backward-compatible name used by tests / older call sites.
sanitize_custom_title = sanitize_member_tag


def build_game_nick_tag(game_nick: str) -> str:
    """Build member tag from game nick while preserving Telegram limits."""
    nickname = normalize_game_nick(game_nick)
    if not nickname:
        return ""
    trimmed = _clip_utf16_units(nickname, MEMBER_TAG_MAX_LEN)
    return sanitize_member_tag(trimmed)


# Backward-compatible alias.
build_game_nick_title = build_game_nick_tag


async def _set_chat_member_tag_http(
    *,
    bot_token: str,
    chat_id: int,
    user_id: int,
    tag: str,
    client: Optional[httpx.AsyncClient] = None,
) -> bool:
    url = f"https://api.telegram.org/bot{bot_token}/setChatMemberTag"
    payload = {"chat_id": chat_id, "user_id": user_id, "tag": tag}
    try:
        if client is None:
            async with httpx.AsyncClient() as owned:
                resp = await owned.post(url, json=payload, timeout=15)
        else:
            resp = await client.post(url, json=payload, timeout=15)
        data = resp.json()
        if resp.status_code == 200 and data.get("ok"):
            return True
        logger.warning(
            "setChatMemberTag failed for user %s in chat %s: %s",
            user_id,
            chat_id,
            data.get("description", resp.text),
        )
        return False
    except httpx.HTTPError:
        logger.exception(
            "HTTP error setChatMemberTag for user %s in chat %s",
            user_id,
            chat_id,
        )
        return False


async def assign_game_nick_tag(
    bot: Optional[Bot],
    chat_id: int,
    user_id: int,
    game_nick: str,
    *,
    bot_token: Optional[str] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> bool:
    """Set Telegram member tag to the game nick (regular member, no admin promote).

    Requires bot admin right can_manage_tags.
    """
    tag = build_game_nick_tag(game_nick)
    if not tag:
        logger.warning("Empty game nick for user %s — skipping member tag", user_id)
        return False

    token = bot_token or (bot.token if bot is not None else None)
    if not token:
        logger.error("No bot token available to set member tag for user %s", user_id)
        return False

    # Prefer native PTB method when available (Bot API 9.5+ / PTB 22.7+).
    if bot is not None and hasattr(bot, "set_chat_member_tag"):
        try:
            await bot.set_chat_member_tag(
                chat_id=chat_id,
                user_id=user_id,
                tag=tag,
            )
            logger.info(
                "Member tag '%s' set for user %s in chat %s",
                tag,
                user_id,
                chat_id,
            )
            return True
        except (BadRequest, Forbidden, TelegramError) as exc:
            logger.warning(
                "set_chat_member_tag failed for user %s in chat %s: %s; falling back to HTTP",
                user_id,
                chat_id,
                exc,
            )

    ok = await _set_chat_member_tag_http(
        bot_token=token,
        chat_id=chat_id,
        user_id=user_id,
        tag=tag,
        client=client,
    )
    if ok:
        logger.info(
            "Member tag '%s' set for user %s in chat %s",
            tag,
            user_id,
            chat_id,
        )
    return ok


async def clear_member_tag(
    *,
    bot_token: str,
    chat_id: int,
    user_id: int,
    bot: Optional[Bot] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> bool:
    """Clear member tag (empty string)."""
    if bot is not None and hasattr(bot, "set_chat_member_tag"):
        try:
            await bot.set_chat_member_tag(
                chat_id=chat_id,
                user_id=user_id,
                tag="",
            )
            return True
        except (BadRequest, Forbidden, TelegramError) as exc:
            logger.debug(
                "Could not clear member tag for user %s in chat %s: %s",
                user_id,
                chat_id,
                exc,
            )

    return await _set_chat_member_tag_http(
        bot_token=bot_token,
        chat_id=chat_id,
        user_id=user_id,
        tag="",
        client=client,
    )


async def remove_from_group_header(
    *,
    bot_token: str,
    chat_id: int,
    user_id: int,
    bot: Optional[Bot] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> bool:
    """Demote an administrator (used when kicking leftover admins).

    Clan tags no longer require admin status; this only helps kick cleanup.
    """
    await clear_member_tag(
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
                **_NO_ADMIN_RIGHTS,
            )
            logger.info(
                "Removed user %s from group admins in chat %s",
                user_id,
                chat_id,
            )
            return True
        except (BadRequest, Forbidden, TelegramError) as exc:
            logger.warning(
                "Failed to demote user %s in chat %s: %s",
                user_id,
                chat_id,
                exc,
            )
            return False

    url = f"https://api.telegram.org/bot{bot_token}/promoteChatMember"
    payload = {
        "chat_id": chat_id,
        "user_id": user_id,
        **_NO_ADMIN_RIGHTS,
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
                "Removed user %s from group admins in chat %s",
                user_id,
                chat_id,
            )
            return True
        logger.warning(
            "Failed to demote user %s in chat %s: %s",
            user_id,
            chat_id,
            data.get("description", resp.text),
        )
        return False
    except httpx.HTTPError:
        logger.exception(
            "Failed to demote user %s in chat %s",
            user_id,
            chat_id,
        )
        return False
