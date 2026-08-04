"""Full Telegram group participant import via Telethon (Bot API cannot list members)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from bot.config import Config
from bot.database import Database
from bot.group_titles import normalize_game_nick

logger = logging.getLogger(__name__)

_ADMIN_PARTICIPANT_TYPES = frozenset(
    {
        "ChannelParticipantAdmin",
        "ChannelParticipantCreator",
        "ChatParticipantAdmin",
        "ChatParticipantCreator",
    }
)


def _is_admin_or_owner(user: Any) -> bool:
    """True for Telegram group/channel admins and owners (Telethon participant)."""
    participant = getattr(user, "participant", None)
    if participant is None:
        return False
    return type(participant).__name__ in _ADMIN_PARTICIPANT_TYPES


def _participant_joined_at(user: Any) -> Optional[str]:
    """ISO join timestamp from Telethon ChannelParticipant.date, if present."""
    participant = getattr(user, "participant", None)
    if participant is None:
        return None
    date = getattr(participant, "date", None)
    if date is None:
        return None
    if isinstance(date, datetime):
        if date.tzinfo is None:
            date = date.replace(tzinfo=timezone.utc)
        return date.isoformat()
    return None


def _guess_nick(user: Any) -> str:
    username = getattr(user, "username", None)
    first_name = getattr(user, "first_name", None) or ""
    last_name = getattr(user, "last_name", None) or ""
    full_name = f"{first_name} {last_name}".strip() or first_name
    user_id = getattr(user, "id", 0)
    raw = username or full_name or f"user_{user_id}"
    return normalize_game_nick(raw)


async def import_all_chat_participants(
    db: Database,
    config: Config,
    *,
    client: Any = None,
) -> dict[str, Any]:
    """Import current group participants into ``members`` + ``group_members``.

    Uses Telethon with the bot token. Requires ``TELEGRAM_API_ID`` /
    ``TELEGRAM_API_HASH`` from https://my.telegram.org. Existing member rows
    are not overwritten — only ``group_members.joined_at`` is refreshed from
    Telegram when available. Imported-without-survey rows get empty perspective.
    """
    result: dict[str, Any] = {
        "skipped": False,
        "reason": "",
        "seen": 0,
        "imported": 0,
        "tracked": 0,
        "skipped_admins": 0,
        "errors": 0,
    }
    bot_admin_ids = set(config.admin_ids)

    if not config.telegram_api_id or not config.telegram_api_hash:
        result["skipped"] = True
        result["reason"] = "missing TELEGRAM_API_ID/TELEGRAM_API_HASH"
        logger.warning(
            "Full member import skipped: set TELEGRAM_API_ID and "
            "TELEGRAM_API_HASH (my.telegram.org) to list group participants"
        )
        return result

    owns_client = client is None
    if owns_client:
        try:
            from telethon import TelegramClient
            from telethon.sessions import StringSession
        except ImportError:
            result["skipped"] = True
            result["reason"] = "telethon not installed"
            logger.warning("Full member import skipped: telethon not installed")
            return result

        client = TelegramClient(
            StringSession(),
            config.telegram_api_id,
            config.telegram_api_hash,
        )
        await client.start(bot_token=config.bot_token)

    try:
        async for user in client.iter_participants(config.group_id):
            result["seen"] += 1
            if getattr(user, "bot", False):
                continue
            user_id = int(user.id)
            if _is_admin_or_owner(user) or user_id in bot_admin_ids:
                result["skipped_admins"] += 1
                continue
            try:
                joined_at = _participant_joined_at(user)
                if await db.is_member(user_id):
                    await db.track_group_member(
                        user_id,
                        joined_at=joined_at,
                        overwrite=bool(joined_at),
                    )
                    result["tracked"] += 1
                    continue

                guessed = _guess_nick(user)
                await db.save_member(
                    user_id=user_id,
                    tg_username=getattr(user, "username", None),
                    tg_first_name=getattr(user, "first_name", None),
                    game_nick=guessed,
                    real_name=(
                        f"{getattr(user, 'first_name', '') or ''} "
                        f"{getattr(user, 'last_name', '') or ''}"
                    ).strip()
                    or guessed,
                    discord_nick=None,
                    perspective="",
                )
                await db.track_group_member(
                    user_id,
                    joined_at=joined_at,
                    overwrite=bool(joined_at),
                )
                result["imported"] += 1
            except Exception:
                logger.exception("Failed to import participant %s", user_id)
                result["errors"] += 1
    except Exception as exc:
        logger.exception("Full member import failed for chat %s", config.group_id)
        result["errors"] += 1
        result["reason"] = str(exc)
    finally:
        if owns_client and client is not None:
            await client.disconnect()

    logger.info(
        "Full member import: seen=%s imported=%s tracked=%s skipped_admins=%s "
        "errors=%s reason=%s",
        result["seen"],
        result["imported"],
        result["tracked"],
        result["skipped_admins"],
        result["errors"],
        result["reason"] or "-",
    )
    return result


async def maybe_full_member_import(
    db: Database,
    config: Config,
) -> Optional[dict[str, Any]]:
    """Run full import when DB empty or FULL_MEMBER_SYNC=1."""
    members = await db.get_all_members()
    empty = len(members) == 0
    if not config.full_member_sync_force and not (
        config.full_member_sync_on_empty and empty
    ):
        return None
    if config.full_member_sync_force:
        logger.info("FULL_MEMBER_SYNC=1 — importing all chat participants")
    elif empty:
        logger.info("Members table empty — importing all chat participants")
    return await import_all_chat_participants(db, config)
