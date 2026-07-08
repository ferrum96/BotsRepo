"""Admin and moderation command handlers."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from telegram import Bot, Update
from telegram.constants import ChatMemberStatus, ParseMode
from telegram.error import BadRequest, Forbidden, TelegramError
from telegram.ext import ContextTypes

from bot import messages as msg
from bot.database import Database
from bot.group_titles import assign_game_nick_title, remove_from_group_header

if TYPE_CHECKING:
    from bot.config import Config

logger = logging.getLogger(__name__)


def _get_db(context: ContextTypes.DEFAULT_TYPE) -> Database:
    return context.application.bot_data["db"]


def _get_config(context: ContextTypes.DEFAULT_TYPE) -> "Config":
    return context.application.bot_data["config"]


async def sync_group_members_state(
    bot: Bot,
    db: Database,
    config: "Config",
) -> dict[str, int]:
    """Sync actual Telegram group presence for known clan members."""
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

        if chat_member.status in (ChatMemberStatus.LEFT, ChatMemberStatus.BANNED):
            await db.untrack_group_member(member.user_id)
            missing += 1
            if member.user_id not in admin_ids:
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

    removed = await _get_db(context).remove_from_blacklist(user_id)
    if update.message:
        if removed:
            await update.message.reply_text(
                f"Пользователь {user_id} удалён из чёрного списка."
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
            await remove_from_group_header(
                bot_token=config.bot_token,
                chat_id=config.group_id,
                user_id=user_id,
                bot=bot,
            )
            await bot.ban_chat_member(config.group_id, user_id)
            await bot.unban_chat_member(config.group_id, user_id)
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
        f"Ошибок: {result['errors']}"
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
        await db.track_group_member(user.id)

        if not await db.is_member(user.id):
            progress = await db.get_progress(user.id)
            if progress and progress.step == "completed":
                await db.save_member(
                    user_id=user.id,
                    tg_username=user.username,
                    tg_first_name=user.first_name,
                    game_nick=progress.game_nick or "",
                    real_name=progress.real_name or "",
                    discord_nick=progress.discord_nick,
                    perspective=progress.perspective or "Mixed",
                )
                await db.clear_progress(user.id)

        member = await db.get_member(user.id)
        if member and member.game_nick:
            await assign_game_nick_title(
                context.bot,
                config.group_id,
                user.id,
                member.game_nick,
            )
        return

    if was_member and new_status in removed_statuses:
        await db.untrack_group_member(user.id)
        if config.is_admin(user.id):
            return
        if await db.is_member(user.id):
            await db.add_to_blacklist(user.id, "removed_from_group")
            logger.info("User %s blacklisted after group removal", user.id)
