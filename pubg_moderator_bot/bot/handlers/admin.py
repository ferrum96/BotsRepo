"""Admin and moderation command handlers."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from telegram import Bot, Update
from telegram.constants import ChatMemberStatus, ParseMode
from telegram.error import BadRequest, Forbidden, TelegramError
from telegram.ext import ContextTypes

from bot.activity_monitor import check_activity_on_join
from bot import messages as msg
from bot.database import Database
from bot.group_titles import assign_game_nick_title, remove_from_group_header

if TYPE_CHECKING:
    from bot.config import Config

logger = logging.getLogger(__name__)

_PRESENT_STATUSES = {
    ChatMemberStatus.MEMBER,
    ChatMemberStatus.RESTRICTED,
    ChatMemberStatus.ADMINISTRATOR,
    ChatMemberStatus.OWNER,
}
_REMOVED_STATUSES = {
    ChatMemberStatus.LEFT,
    ChatMemberStatus.BANNED,
}
# Soft kick = ban+unban. Ignore the transient BANNED update so we don't
# accidentally blacklist people who only failed the survey gate.
_soft_kick_user_ids: set[int] = set()


def _normalize_game_nick(value: str) -> str:
    nick = (value or "").strip()
    while len(nick) >= 2 and nick.startswith("{") and nick.endswith("}"):
        nick = nick[1:-1].strip()
    return nick


def _get_db(context: ContextTypes.DEFAULT_TYPE) -> Database:
    return context.application.bot_data["db"]


def _get_config(context: ContextTypes.DEFAULT_TYPE) -> "Config":
    return context.application.bot_data["config"]


async def sync_group_members_state(
    bot: Bot,
    db: Database,
    config: "Config",
) -> dict[str, int]:
    """Sync Telegram group state and backfill members from completed surveys."""
    imported = 0
    imported_errors = 0
    imported_admins = 0
    imported_admin_errors = 0
    known_member_ids = await db.get_member_user_ids()

    # Telegram Bot API cannot enumerate all regular members, but administrators
    # are available and can be imported on restart.
    try:
        administrators = await bot.get_chat_administrators(config.group_id)
        for admin in administrators:
            if admin.user.is_bot or admin.status == ChatMemberStatus.OWNER:
                continue

            if admin.user.id in known_member_ids:
                await db.track_group_member(admin.user.id)
                continue

            guessed_nick = (
                getattr(admin, "custom_title", None)
                or admin.user.username
                or admin.user.first_name
                or f"user_{admin.user.id}"
            )
            guessed_nick = _normalize_game_nick(guessed_nick)
            await db.save_member(
                user_id=admin.user.id,
                tg_username=admin.user.username,
                tg_first_name=admin.user.first_name,
                game_nick=guessed_nick,
                real_name=admin.user.full_name or guessed_nick,
                discord_nick=None,
                perspective="Mixed",
            )
            await db.track_group_member(admin.user.id)
            known_member_ids.add(admin.user.id)
            imported_admins += 1
    except (BadRequest, Forbidden, TelegramError):
        logger.exception(
            "Failed to import current administrators for chat %s",
            config.group_id,
        )
        imported_admin_errors += 1

    completed_progress = await db.get_progress_by_step("completed")
    for progress in completed_progress:
        if progress.user_id in known_member_ids:
            continue
        if not progress.game_nick or not progress.real_name:
            continue
        try:
            chat_member = await bot.get_chat_member(config.group_id, progress.user_id)
        except (BadRequest, Forbidden, TelegramError):
            logger.exception(
                "Failed to fetch chat member %s for completed survey import",
                progress.user_id,
            )
            imported_errors += 1
            continue

        if chat_member.status in _REMOVED_STATUSES:
            continue

        user = chat_member.user
        await db.save_member(
            user_id=user.id,
            tg_username=user.username,
            tg_first_name=user.first_name,
            game_nick=progress.game_nick,
            real_name=progress.real_name,
            discord_nick=progress.discord_nick,
            perspective=progress.perspective or "Mixed",
        )
        await db.track_group_member(user.id)
        await db.clear_progress(user.id)
        known_member_ids.add(user.id)
        imported += 1
        member = await db.get_member(user.id)
        if member and member.game_nick and not config.is_admin(user.id):
            await assign_game_nick_title(
                bot,
                config.group_id,
                user.id,
                member.game_nick,
            )
            await check_activity_on_join(bot, db, config, member)

    members = await db.get_all_members()
    admin_ids = set(config.admin_ids)
    present = 0
    missing = 0
    blacklisted = 0
    errors = 0

    for member in members:
        try:
            chat_member = await bot.get_chat_member(config.group_id, member.user_id)
        except (BadRequest, Forbidden, TelegramError):
            logger.exception("Failed to fetch chat member %s", member.user_id)
            errors += 1
            continue

        if chat_member.status in _REMOVED_STATUSES:
            await db.untrack_group_member(member.user_id)
            missing += 1
            # Voluntary leave should not trigger blacklist entry.
            if (
                chat_member.status == ChatMemberStatus.BANNED
                and member.user_id not in admin_ids
                and member.user_id not in _soft_kick_user_ids
                and not await db.is_blacklisted(member.user_id)
            ):
                await db.add_to_blacklist(member.user_id, "removed_from_group")
                blacklisted += 1
            continue

        await db.track_group_member(member.user_id)
        present += 1

    return {
        "total": len(members),
        "present": present,
        "missing": missing,
        "blacklisted": blacklisted,
        "errors": errors,
        "imported": imported,
        "import_errors": imported_errors,
        "imported_admins": imported_admins,
        "import_admin_errors": imported_admin_errors,
    }


def _is_admin(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    user = update.effective_user
    if not user:
        return False
    return _get_config(context).is_admin(user.id)


async def _reply_admin_only(update: Update) -> None:
    if update.message:
        await update.message.reply_text(msg.ADMIN_ONLY)


def _format_member_line(member) -> str:
    tg = member.tg_username or member.tg_first_name or str(member.user_id)
    discord = member.discord_nick or "—"
    return (
        f"• <b>{member.game_nick}</b> — {member.real_name}\n"
        f"  TG: @{tg} | Discord: {discord} | {member.perspective}"
    )


async def _has_completed_survey(db: Database, user_id: int) -> bool:
    progress = await db.get_progress(user_id)
    return progress is not None and progress.step == "completed"


async def _may_enter_group(db: Database, config: "Config", user_id: int) -> bool:
    """Allow entry only for vetted users (completed survey or existing member)."""
    if await db.is_blacklisted(user_id):
        return False
    if config.is_admin(user_id):
        return True
    if await db.is_member(user_id):
        return True
    return await _has_completed_survey(db, user_id)


async def _refresh_member_tg_profile(db: Database, user) -> None:
    """Update Telegram profile fields for an existing clan member."""
    existing = await db.get_member(user.id)
    if not existing:
        return
    normalized_nick = _normalize_game_nick(existing.game_nick)
    await db.save_member(
        user_id=user.id,
        tg_username=user.username,
        tg_first_name=user.first_name,
        game_nick=normalized_nick or existing.game_nick,
        real_name=existing.real_name,
        discord_nick=existing.discord_nick,
        perspective=existing.perspective,
    )


async def _promote_from_completed_survey(db: Database, user) -> bool:
    """Create a clan member record from a completed survey."""
    progress = await db.get_progress(user.id)
    if not progress or progress.step != "completed":
        return False
    if not progress.game_nick or not progress.real_name:
        return False
    await db.save_member(
        user_id=user.id,
        tg_username=user.username,
        tg_first_name=user.first_name,
        game_nick=progress.game_nick,
        real_name=progress.real_name,
        discord_nick=progress.discord_nick,
        perspective=progress.perspective or "Mixed",
    )
    await db.clear_progress(user.id)
    return True


async def enforce_blacklist_telegram_bans(
    bot: Bot,
    db: Database,
    config: "Config",
) -> dict[str, int]:
    """Ensure every blacklisted user is banned in Telegram (blocks invite rejoins)."""
    banned = 0
    skipped = 0
    errors = 0
    entries = await db.get_blacklist()
    for user_id, _reason, _created_at in entries:
        if config.is_admin(user_id):
            skipped += 1
            continue
        try:
            chat_member = await bot.get_chat_member(config.group_id, user_id)
            if chat_member.status == ChatMemberStatus.BANNED:
                skipped += 1
                continue
        except (BadRequest, Forbidden, TelegramError):
            # User may be unknown to the chat; still attempt a ban.
            logger.debug(
                "getChatMember failed for blacklist user %s; attempting ban",
                user_id,
                exc_info=True,
            )

        if await ban_user_in_group(bot, config, user_id, permanent=True):
            banned += 1
            await db.untrack_group_member(user_id)
        else:
            errors += 1

    return {"total": len(entries), "banned": banned, "skipped": skipped, "errors": errors}


async def ban_user_in_group(
    bot: Bot,
    config: "Config",
    user_id: int,
    *,
    permanent: bool = True,
) -> bool:
    """Ban user in the clan group. permanent=True blocks rejoin via invite links."""
    if not permanent:
        _soft_kick_user_ids.add(user_id)
    try:
        await remove_from_group_header(
            bot_token=config.bot_token,
            chat_id=config.group_id,
            user_id=user_id,
            bot=bot,
        )
        await bot.ban_chat_member(config.group_id, user_id)
    except (BadRequest, Forbidden, TelegramError):
        if not permanent:
            _soft_kick_user_ids.discard(user_id)
        logger.exception(
            "Failed to ban user %s in group (permanent=%s)",
            user_id,
            permanent,
        )
        return False

    if not permanent:
        try:
            await bot.unban_chat_member(config.group_id, user_id)
        except (BadRequest, Forbidden, TelegramError):
            # Keep soft-kick marker: user may still look BANNED; leave handler
            # must not treat that as an admin ban and blacklist them.
            logger.exception(
                "Soft kick ban ok but unban failed for user %s; "
                "keeping soft-kick marker",
                user_id,
            )
            return False
    return True


async def _reject_unauthorized_join(
    bot: Bot,
    config: "Config",
    db: Database,
    user_id: int,
) -> None:
    """Remove unauthorized joiner. Blacklisted users get a hard ban (no rejoin)."""
    if await db.is_blacklisted(user_id):
        await ban_user_in_group(bot, config, user_id, permanent=True)
        logger.info("Hard-banned blacklisted user %s (rejoin blocked)", user_id)
        await db.untrack_group_member(user_id)
        return

    # Another handler/sync may have just saved this clan member — never soft-kick them
    # (soft kick demotes and clears the game_nick custom title).
    if await db.is_member(user_id):
        logger.info(
            "Skip unauthorized-join reject for clan member %s",
            user_id,
        )
        return

    await ban_user_in_group(bot, config, user_id, permanent=False)
    logger.info("Soft-kicked unvetted user %s (can rejoin after survey)", user_id)
    await db.untrack_group_member(user_id)


async def _handle_vetted_group_join(
    bot: Bot,
    config: "Config",
    db: Database,
    user,
) -> None:
    """Track join and sync member data for users allowed in the group."""
    await db.track_group_member(user.id)

    if await db.is_member(user.id):
        await _refresh_member_tg_profile(db, user)
    else:
        promoted = await _promote_from_completed_survey(db, user)
        if not promoted and not await db.is_member(user.id):
            # Re-check membership: concurrent sync may have imported this user
            # and cleared survey progress while we were handling the join.
            await _reject_unauthorized_join(bot, config, db, user.id)
            return

    member = await db.get_member(user.id)
    if member and member.game_nick and not config.is_admin(user.id):
        await assign_game_nick_title(
            bot,
            config.group_id,
            user.id,
            member.game_nick,
        )
        await check_activity_on_join(bot, db, config, member)


async def cmd_members(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_admin(update, context):
        await _reply_admin_only(update)
        return

    members = await _get_db(context).get_all_members()
    if not members:
        if update.message:
            await update.message.reply_text(msg.NO_MEMBERS)
        return

    lines = [_format_member_line(m) for m in members]
    header = f"<b>Участники клана ({len(members)}):</b>\n\n"
    text = header + "\n".join(lines)

    if update.message:
        if len(text) > 4000:
            chunks = [text[i : i + 4000] for i in range(0, len(text), 4000)]
            for chunk in chunks:
                await update.message.reply_text(chunk, parse_mode=ParseMode.HTML)
        else:
            await update.message.reply_text(text, parse_mode=ParseMode.HTML)


async def cmd_stats(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_admin(update, context):
        await _reply_admin_only(update)
        return

    db = _get_db(context)
    stats = await db.get_perspective_stats()
    members = await db.get_all_members()
    blacklist = await db.get_blacklist()

    fpp = stats.get("FPP", 0)
    tpp = stats.get("TPP", 0)
    mixed = stats.get("Mixed", 0)
    total = len(members)

    text = (
        "<b>📊 Статистика клана</b>\n\n"
        f"Всего участников: <b>{total}</b>\n"
        f"FPP: <b>{fpp}</b> ({_pct(fpp, total)})\n"
        f"TPP: <b>{tpp}</b> ({_pct(tpp, total)})\n"
        f"Mixed: <b>{mixed}</b> ({_pct(mixed, total)})\n\n"
        f"В чёрном списке: <b>{len(blacklist)}</b>"
    )

    if update.message:
        await update.message.reply_text(text, parse_mode=ParseMode.HTML)


def _pct(part: int, total: int) -> str:
    if total == 0:
        return "0%"
    return f"{round(part / total * 100)}%"


async def cmd_search(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_admin(update, context):
        await _reply_admin_only(update)
        return

    if not context.args:
        if update.message:
            await update.message.reply_text(msg.SEARCH_USAGE)
        return

    query = " ".join(context.args)
    members = await _get_db(context).search_members(query)

    if not members:
        if update.message:
            await update.message.reply_text(f"По запросу «{query}» ничего не найдено.")
        return

    lines = [_format_member_line(m) for m in members]
    text = f"<b>Результаты поиска «{query}»:</b>\n\n" + "\n".join(lines)

    if update.message:
        await update.message.reply_text(text, parse_mode=ParseMode.HTML)


async def cmd_blacklist(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_admin(update, context):
        await _reply_admin_only(update)
        return

    entries = await _get_db(context).get_blacklist()
    if not entries:
        if update.message:
            await update.message.reply_text("Чёрный список пуст.")
        return

    lines = [f"• ID <code>{uid}</code> — {reason}" for uid, reason, _ in entries]
    text = f"<b>Чёрный список ({len(entries)}):</b>\n\n" + "\n".join(lines)

    if update.message:
        await update.message.reply_text(text, parse_mode=ParseMode.HTML)


async def cmd_unblacklist(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    if not _is_admin(update, context):
        await _reply_admin_only(update)
        return

    if not context.args:
        if update.message:
            await update.message.reply_text("Использование: /unblacklist <user_id>")
        return

    try:
        user_id = int(context.args[0])
    except ValueError:
        if update.message:
            await update.message.reply_text("User ID должен быть числом.")
        return

    db = _get_db(context)
    config = _get_config(context)
    removed = await db.remove_from_blacklist(user_id)
    if update.message:
        if removed:
            try:
                await context.bot.unban_chat_member(
                    config.group_id,
                    user_id,
                    only_if_banned=True,
                )
            except (BadRequest, Forbidden, TelegramError):
                logger.exception(
                    "Failed to unban user %s after /unblacklist",
                    user_id,
                )
            await update.message.reply_text(
                f"Пользователь {user_id} удалён из чёрного списка "
                f"(Telegram-бан снят, если был)."
            )
        else:
            await update.message.reply_text(
                f"Пользователь {user_id} не найден в чёрном списке."
            )


async def cmd_kick_non_members(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """Remove group members who are not in the clan database."""
    if not _is_admin(update, context):
        await _reply_admin_only(update)
        return

    if not update.message:
        return

    config = _get_config(context)
    db = _get_db(context)
    bot = context.bot

    clan_member_ids = await db.get_member_user_ids()
    group_member_ids = await db.get_group_member_ids()
    admin_ids = set(config.admin_ids)

    kicked = 0
    checked = len(group_member_ids)
    errors = 0

    if not group_member_ids:
        await update.message.reply_text(
            "Список участников группы пуст.\n"
            "Бот отслеживает вступления автоматически — "
            "убедитесь, что он администратор группы."
        )
        return

    await update.message.reply_text("Проверяю участников группы…")

    for user_id in group_member_ids:
        if user_id in clan_member_ids or user_id in admin_ids:
            continue

        try:
            # Hard ban: blacklist must block invite-link rejoins.
            banned = await ban_user_in_group(bot, config, user_id, permanent=True)
            if not banned:
                errors += 1
                continue
            await db.add_to_blacklist(user_id, "not_in_clan_kicked")
            await db.untrack_group_member(user_id)
            kicked += 1
        except Exception:
            logger.exception("Failed to kick user %s", user_id)
            errors += 1

    await update.message.reply_text(
        f"Готово.\n"
        f"Проверено: {checked}\n"
        f"Удалено: {kicked}\n"
        f"Ошибок: {errors}"
    )


async def cmd_help_admin(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_admin(update, context):
        await _reply_admin_only(update)
        return

    text = (
        "<b>Команды администратора:</b>\n\n"
        "/members — список участников с никами\n"
        "/stats — статистика FPP/TPP\n"
        "/search &lt;запрос&gt; — поиск по никам\n"
        "/blacklist — чёрный список\n"
        "/unblacklist &lt;user_id&gt; — снять блокировку\n"
        "/kick_non_members — удалить не-участников из группы\n"
        "/sync_group — синхронизировать фактический состав группы\n"
        "/assign_titles — проставить игровые ники как теги "
        "всем участникам группы\n"
        "/admin_help — эта справка"
    )
    if update.message:
        await update.message.reply_text(text, parse_mode=ParseMode.HTML)


async def cmd_assign_titles(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """Bulk-assign game nick as custom_title for everyone in the members DB.

    Iterates over clan members (not group_members) so it works even for users
    who joined the group before the bot started tracking chat_member updates.
    """
    if not _is_admin(update, context):
        await _reply_admin_only(update)
        return

    if not update.message:
        return

    config = _get_config(context)
    db = _get_db(context)
    bot = context.bot

    members = await db.get_all_members()
    admin_ids = set(config.admin_ids)

    if not members:
        await update.message.reply_text(
            "В базе нет ни одного участника клана — никому ставить теги."
        )
        return

    await update.message.reply_text(
        f"Проставляю теги {len(members)} участникам…"
    )

    assigned = 0
    skipped = 0
    not_in_group = 0
    failed = 0

    for member in members:
        if member.user_id in admin_ids:
            skipped += 1
            continue
        if not member.game_nick:
            skipped += 1
            continue

        try:
            chat_member = await bot.get_chat_member(
                config.group_id, member.user_id
            )
        except (BadRequest, Forbidden, TelegramError):
            logger.exception(
                "Failed to fetch chat member %s", member.user_id
            )
            failed += 1
            continue

        if chat_member.status in (
            ChatMemberStatus.LEFT,
            ChatMemberStatus.BANNED,
        ):
            not_in_group += 1
            continue

        ok = await assign_game_nick_title(
            bot, config.group_id, member.user_id, member.game_nick
        )
        if ok:
            await db.track_group_member(member.user_id)
            assigned += 1
        else:
            failed += 1

    await update.message.reply_text(
        "Готово.\n"
        f"Проставлено тегов: {assigned}\n"
        f"Нет в группе: {not_in_group}\n"
        f"Пропущено (админы / без ника): {skipped}\n"
        f"Ошибок: {failed}"
    )


async def cmd_sync_group(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """Force sync of Telegram group state for members in DB."""
    if not _is_admin(update, context):
        await _reply_admin_only(update)
        return
    if not update.message:
        return

    config = _get_config(context)
    db = _get_db(context)
    await update.message.reply_text(
        "Синхронизирую фактический состав Telegram-группы…"
    )
    result = await sync_group_members_state(context.bot, db, config)
    await update.message.reply_text(
        "Синхронизация завершена.\n"
        f"Проверено участников клана: {result['total']}\n"
        f"Сейчас в группе: {result['present']}\n"
        f"Отсутствуют в группе: {result['missing']}\n"
        f"Добавлено в blacklist: {result['blacklisted']}\n"
        f"Импортировано текущих админов группы: {result['imported_admins']}\n"
        f"Ошибок импорта админов: {result['import_admin_errors']}\n"
        f"Импортировано из завершённых анкет: {result['imported']}\n"
        f"Ошибок импорта: {result['import_errors']}\n"
        f"Ошибок синка: {result['errors']}"
    )


async def on_chat_member_update(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """Track group joins/leaves and auto-blacklist removed clan members."""
    if not update.chat_member:
        return

    config = _get_config(context)
    if update.chat_member.chat.id != config.group_id:
        return

    old_status = update.chat_member.old_chat_member.status
    new_status = update.chat_member.new_chat_member.status
    user = update.chat_member.new_chat_member.user

    if user.is_bot:
        return

    removed_statuses = {
        ChatMemberStatus.LEFT,
        ChatMemberStatus.BANNED,
    }

    was_member = old_status in (
        ChatMemberStatus.MEMBER,
        ChatMemberStatus.RESTRICTED,
        ChatMemberStatus.ADMINISTRATOR,
        ChatMemberStatus.OWNER,
    )

    db = _get_db(context)

    joined_statuses = (ChatMemberStatus.MEMBER, ChatMemberStatus.RESTRICTED)
    if new_status in joined_statuses and old_status not in joined_statuses:
        if not await _may_enter_group(db, config, user.id):
            logger.info(
                "Rejecting unauthorized join for user %s "
                "(blacklist/unvetted)",
                user.id,
            )
            await _reject_unauthorized_join(context.bot, config, db, user.id)
            return

        await _handle_vetted_group_join(context.bot, config, db, user)
        sync_result = await sync_group_members_state(context.bot, db, config)
        logger.info(
            "Event sync after join user=%s: total=%s present=%s missing=%s blacklisted=%s errors=%s",
            user.id,
            sync_result["total"],
            sync_result["present"],
            sync_result["missing"],
            sync_result["blacklisted"],
            sync_result["errors"],
        )
        return

    if was_member and new_status in removed_statuses:
        await db.untrack_group_member(user.id)
        if config.is_admin(user.id):
            _soft_kick_user_ids.discard(user.id)
            return

        # Soft kick uses ban+unban; ignore that transient BANNED event.
        soft_kicked = user.id in _soft_kick_user_ids
        if soft_kicked:
            logger.info(
                "User %s removed by soft kick gate; blacklist skipped",
                user.id,
            )
        elif new_status == ChatMemberStatus.BANNED:
            # Keep original blacklist reason if already listed (e.g. survey_failed).
            if not await db.is_blacklisted(user.id):
                await db.add_to_blacklist(user.id, "removed_from_group")
                logger.info("User %s blacklisted after group ban/kick", user.id)
        else:
            logger.info("User %s left group voluntarily, blacklist skipped", user.id)

        # Keep soft-kick marker through sync so a concurrent BANNED status
        # cannot be misclassified as an admin ban.
        sync_result = await sync_group_members_state(context.bot, db, config)
        if soft_kicked:
            _soft_kick_user_ids.discard(user.id)
        logger.info(
            "Event sync after leave user=%s: total=%s present=%s missing=%s blacklisted=%s errors=%s",
            user.id,
            sync_result["total"],
            sync_result["present"],
            sync_result["missing"],
            sync_result["blacklisted"],
            sync_result["errors"],
        )


async def on_group_membership_message_event(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """Fallback sync when Telegram sends service message join/left events."""
    if not update.message or not update.effective_chat:
        return

    config = _get_config(context)
    if update.effective_chat.id != config.group_id:
        return

    db = _get_db(context)
    changed = False

    if update.message.left_chat_member and not update.message.left_chat_member.is_bot:
        left_id = update.message.left_chat_member.id
        await db.untrack_group_member(left_id)
        _soft_kick_user_ids.discard(left_id)
        changed = True

    if update.message.new_chat_members:
        for user in update.message.new_chat_members:
            if user.is_bot:
                continue
            if not await _may_enter_group(db, config, user.id):
                logger.info(
                    "Rejecting unauthorized fallback join for user %s",
                    user.id,
                )
                await _reject_unauthorized_join(context.bot, config, db, user.id)
                changed = True
                continue
            await _handle_vetted_group_join(context.bot, config, db, user)
            changed = True

    if not changed:
        return

    sync_result = await sync_group_members_state(context.bot, db, config)
    logger.info(
        "Fallback message sync: total=%s present=%s missing=%s blacklisted=%s errors=%s",
        sync_result["total"],
        sync_result["present"],
        sync_result["missing"],
        sync_result["blacklisted"],
        sync_result["errors"],
    )


async def on_chat_join_request(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """Auto-approve join requests only for vetted users."""
    req = update.chat_join_request
    if not req:
        return

    config = _get_config(context)
    if req.chat.id != config.group_id:
        return

    user = req.from_user
    if user.is_bot:
        return

    db = _get_db(context)
    if await db.is_blacklisted(user.id):
        logger.info("Join request from blacklisted user %s declined+banned", user.id)
        try:
            await context.bot.decline_chat_join_request(
                chat_id=config.group_id,
                user_id=user.id,
            )
        except (BadRequest, Forbidden, TelegramError):
            logger.exception(
                "Failed to decline join request for blacklisted user %s",
                user.id,
            )
        # Also hard-ban so open invite links cannot be used later.
        await ban_user_in_group(context.bot, config, user.id, permanent=True)
        return

    if not await _may_enter_group(db, config, user.id):
        logger.info(
            "Join request from unvetted user %s declined (survey not completed)",
            user.id,
        )
        try:
            await context.bot.decline_chat_join_request(
                chat_id=config.group_id,
                user_id=user.id,
            )
        except (BadRequest, Forbidden, TelegramError):
            logger.exception(
                "Failed to decline join request for unvetted user %s",
                user.id,
            )
        return

    try:
        await context.bot.approve_chat_join_request(
            chat_id=config.group_id,
            user_id=user.id,
        )
    except (BadRequest, Forbidden, TelegramError):
        logger.exception("Failed to approve join request for user %s", user.id)
        return

    await _handle_vetted_group_join(context.bot, config, db, user)
    sync_result = await sync_group_members_state(context.bot, db, config)
    logger.info(
        "Approved join request user=%s: total=%s present=%s missing=%s blacklisted=%s errors=%s",
        user.id,
        sync_result["total"],
        sync_result["present"],
        sync_result["missing"],
        sync_result["blacklisted"],
        sync_result["errors"],
    )
