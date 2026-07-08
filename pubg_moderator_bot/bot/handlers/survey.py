"""Survey conversation handlers."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from telegram import Update
from telegram.ext import (
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)

from bot import messages as msg
from bot.database import Database, Member, SurveyProgress
from bot.keyboards import (
    activity_keyboard,
    age_keyboard,
    join_clan_keyboard,
    perspective_keyboard,
)

if TYPE_CHECKING:
    from bot.config import Config

logger = logging.getLogger(__name__)

# Conversation states
(
    AGE,
    ACTIVITY,
    GAME_NICK,
    REAL_NAME,
    DISCORD,
    PERSPECTIVE,
) = range(6)


def _get_db(context: ContextTypes.DEFAULT_TYPE) -> Database:
    return context.application.bot_data["db"]


def _get_config(context: ContextTypes.DEFAULT_TYPE) -> "Config":
    return context.application.bot_data["config"]


async def _next_progress(
    context: ContextTypes.DEFAULT_TYPE,
    user_id: int,
    step: str,
    **fields: str | int | None,
) -> SurveyProgress:
    db = _get_db(context)
    current = await db.get_progress(user_id)
    progress = SurveyProgress(
        user_id=user_id,
        step=step,
        game_nick=fields.get("game_nick", current.game_nick if current else None),
        real_name=fields.get("real_name", current.real_name if current else None),
        discord_nick=fields.get(
            "discord_nick", current.discord_nick if current else None
        ),
        perspective=fields.get("perspective", current.perspective if current else None),
        attempts=current.attempts if current else 0,
    )
    await db.set_progress(progress)
    return progress


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user = update.effective_user
    if not user or not update.message:
        return ConversationHandler.END

    db = _get_db(context)
    config = _get_config(context)

    if await db.is_blacklisted(user.id):
        await update.message.reply_text(msg.BLACKLISTED)
        return ConversationHandler.END

    if await db.is_member(user.id):
        await update.message.reply_text(
            msg.ALREADY_PASSED,
            reply_markup=join_clan_keyboard(config),
        )
        return ConversationHandler.END

    progress = await db.get_progress(user.id)
    if progress and progress.step == "completed":
        await update.message.reply_text(
            msg.ALREADY_PASSED,
            reply_markup=join_clan_keyboard(config),
        )
        return ConversationHandler.END

    attempts = await db.get_attempts(user.id)
    if attempts >= config.max_survey_attempts:
        await db.add_to_blacklist(user.id, "survey_attempts_exhausted")
        await update.message.reply_text(msg.ATTEMPTS_EXHAUSTED)
        return ConversationHandler.END

    await update.message.reply_text(msg.WELCOME)
    await update.message.reply_text(msg.ASK_AGE, reply_markup=age_keyboard())

    await db.set_progress(
        SurveyProgress(user_id=user.id, step="age", attempts=attempts)
    )
    return AGE


async def _handle_rejection(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    reject_message: str,
) -> int:
    query = update.callback_query
    if not query or not query.from_user:
        return ConversationHandler.END

    await query.answer()
    user_id = query.from_user.id
    result = await _record_failed_attempt(context, user_id)

    if result["blacklisted"]:
        await query.edit_message_text(
            f"{reject_message}\n\n{msg.ATTEMPTS_EXHAUSTED}"
        )
        return ConversationHandler.END

    await query.edit_message_text(
        f"{reject_message}\n\n{msg.ATTEMPT_FAILED.format(remaining=result['remaining'])}"
    )
    return ConversationHandler.END


async def _handle_rejection_message(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    reject_message: str,
) -> int:
    message = update.message
    user = update.effective_user
    if not message or not user:
        return ConversationHandler.END

    result = await _record_failed_attempt(context, user.id)

    if result["blacklisted"]:
        await message.reply_text(f"{reject_message}\n\n{msg.ATTEMPTS_EXHAUSTED}")
        return ConversationHandler.END

    await message.reply_text(
        f"{reject_message}\n\n{msg.ATTEMPT_FAILED.format(remaining=result['remaining'])}"
    )
    return ConversationHandler.END


async def _record_failed_attempt(
    context: ContextTypes.DEFAULT_TYPE, user_id: int
) -> dict:
    db = _get_db(context)
    config = _get_config(context)

    attempts = await db.increment_attempts(user_id)
    remaining = config.max_survey_attempts - attempts

    if remaining <= 0:
        await db.add_to_blacklist(user_id, "survey_failed")
        return {"blacklisted": True, "remaining": 0}

    return {"blacklisted": False, "remaining": remaining}


async def age_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    if not query or not query.data or not query.from_user:
        return ConversationHandler.END

    if query.data == "age:under":
        return await _handle_rejection(update, context, msg.REJECT_AGE)

    await query.answer()
    await query.edit_message_text(msg.ASK_ACTIVITY, reply_markup=activity_keyboard())

    await _next_progress(context, query.from_user.id, "activity")
    return ACTIVITY


async def activity_callback(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> int:
    query = update.callback_query
    if not query or not query.data or not query.from_user:
        return ConversationHandler.END

    if query.data == "activity:low":
        return await _handle_rejection(update, context, msg.REJECT_ACTIVITY)

    await query.answer()
    await query.edit_message_text(msg.ASK_GAME_NICK)

    user_id = query.from_user.id
    await _next_progress(context, user_id, "game_nick")
    return GAME_NICK


async def game_nick_input(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> int:
    if not update.message or not update.message.text or not update.effective_user:
        return GAME_NICK

    text = update.message.text.strip()
    if len(text) < 2:
        await update.message.reply_text("Ник слишком короткий. Попробуй ещё раз.")
        return GAME_NICK

    user_id = update.effective_user.id
    await _next_progress(context, user_id, "real_name", game_nick=text)
    await update.message.reply_text(msg.ASK_REAL_NAME)
    return REAL_NAME


async def real_name_input(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> int:
    if not update.message or not update.message.text or not update.effective_user:
        return REAL_NAME

    text = update.message.text.strip()
    if len(text) < 2:
        await update.message.reply_text("Имя слишком короткое. Попробуй ещё раз.")
        return REAL_NAME

    user_id = update.effective_user.id
    prev = await _get_db(context).get_progress(user_id)
    await _next_progress(
        context,
        user_id,
        "discord",
        game_nick=prev.game_nick if prev else None,
        real_name=text,
    )
    await update.message.reply_text(msg.ASK_DISCORD)
    return DISCORD


async def discord_input(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> int:
    if not update.message or not update.message.text or not update.effective_user:
        return DISCORD

    text = update.message.text.strip()
    discord_nick = None if text in ("—", "-", "нет", "Нет") else text

    user_id = update.effective_user.id
    prev = await _get_db(context).get_progress(user_id)
    await _next_progress(
        context,
        user_id,
        "perspective",
        game_nick=prev.game_nick if prev else None,
        real_name=prev.real_name if prev else None,
        discord_nick=discord_nick,
    )

    await update.message.reply_text(
        msg.ASK_PERSPECTIVE, reply_markup=perspective_keyboard()
    )
    return PERSPECTIVE


async def perspective_callback(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> int:
    query = update.callback_query
    if not query or not query.data or not query.from_user:
        return ConversationHandler.END

    await query.answer()

    perspective_map = {
        "perspective:fpp": "FPP",
        "perspective:tpp": "TPP",
        "perspective:mixed": "Mixed",
    }
    perspective = perspective_map.get(query.data)
    if not perspective:
        return ConversationHandler.END

    db = _get_db(context)
    config = _get_config(context)
    user = query.from_user

    progress = await db.get_progress(user.id)
    if not progress or not progress.game_nick or not progress.real_name:
        await query.edit_message_text(
            "Что-то пошло не так. Нажми /start, чтобы начать заново."
        )
        return ConversationHandler.END

    await _next_progress(
        context,
        user.id,
        "completed",
        game_nick=progress.game_nick,
        real_name=progress.real_name,
        discord_nick=progress.discord_nick,
        perspective=perspective,
    )

    await query.edit_message_text(
        msg.SURVEY_COMPLETE,
        reply_markup=join_clan_keyboard(config),
    )
    return ConversationHandler.END


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    if update.message:
        await update.message.reply_text("Опрос отменён. Нажми /start, чтобы начать.")
    return ConversationHandler.END


def build_survey_handler() -> ConversationHandler:
    return ConversationHandler(
        entry_points=[CommandHandler("start", start)],
        states={
            AGE: [CallbackQueryHandler(age_callback, pattern=r"^age:")],
            ACTIVITY: [
                CallbackQueryHandler(activity_callback, pattern=r"^activity:")
            ],
            GAME_NICK: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, game_nick_input)
            ],
            REAL_NAME: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, real_name_input)
            ],
            DISCORD: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, discord_input)
            ],
            PERSPECTIVE: [
                CallbackQueryHandler(
                    perspective_callback, pattern=r"^perspective:"
                )
            ],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
        allow_reentry=True,
    )
