"""Entry point for the clan moderator bot."""

import logging
import socket

_original_getaddrinfo = socket.getaddrinfo


def _ipv4_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    return _original_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)


socket.getaddrinfo = _ipv4_getaddrinfo

from telegram.ext import (
    Application,
    ChatMemberHandler,
    ChatJoinRequestHandler,
    CommandHandler,
    MessageHandler,
    filters,
)

from bot.activity_monitor import refresh_group_activity
from bot.config import Config
from bot.database import Database
from bot.handlers.admin import (
    cmd_assign_titles,
    cmd_blacklist,
    cmd_help_admin,
    cmd_kick_non_members,
    cmd_members,
    cmd_search,
    cmd_sync_group,
    cmd_stats,
    cmd_unblacklist,
    enforce_blacklist_telegram_bans,
    on_chat_join_request,
    on_group_membership_message_event,
    on_chat_member_update,
    sync_group_members_state,
)
from bot.handlers.survey import build_survey_handler

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


async def post_init(application: Application) -> None:
    db: Database = application.bot_data["db"]
    await db.init()
    logger.info("Database initialized")
    config: Config = application.bot_data["config"]

    # Initial one-shot sync to reflect real current group state in dashboard.
    result = await sync_group_members_state(application.bot, db, config)
    logger.info(
        "Initial group sync: total=%s present=%s missing=%s blacklisted=%s imported_admins=%s import_admin_errors=%s imported=%s import_errors=%s errors=%s",
        result["total"],
        result["present"],
        result["missing"],
        result["blacklisted"],
        result["imported_admins"],
        result["import_admin_errors"],
        result["imported"],
        result["import_errors"],
        result["errors"],
    )

    # Blacklisted users must stay Telegram-banned so invite links cannot rejoin.
    ban_result = await enforce_blacklist_telegram_bans(application.bot, db, config)
    logger.info(
        "Blacklist Telegram bans enforced: total=%s newly_banned=%s skipped=%s errors=%s",
        ban_result["total"],
        ban_result["banned"],
        ban_result["skipped"],
        ban_result["errors"],
    )

    activity_result = await refresh_group_activity(application.bot, db, config)
    logger.info(
        "Initial activity refresh: group_total=%s checked=%s inactive=%s added=%s "
        "skipped_join_grace=%s errors=%s",
        activity_result["group_total"],
        activity_result["checked"],
        activity_result["inactive"],
        activity_result["added_to_inactive"],
        activity_result["skipped_join_grace"],
        activity_result["errors"],
    )

    if application.job_queue:
        interval_sec = max(60, config.group_sync_interval_minutes * 60)
        application.job_queue.run_repeating(
            _sync_group_job,
            interval=interval_sec,
            first=interval_sec,
            name="sync_group_members_state",
        )
        logger.info(
            "Scheduled group sync every %s minutes",
            config.group_sync_interval_minutes,
        )
        day_interval_sec = 24 * 60 * 60
        application.job_queue.run_repeating(
            _refresh_activity_job,
            interval=day_interval_sec,
            first=day_interval_sec,
            name="refresh_group_activity",
        )
        logger.info("Scheduled inactivity refresh every 24 hours")


async def _sync_group_job(context) -> None:
    db: Database = context.application.bot_data["db"]
    config: Config = context.application.bot_data["config"]
    result = await sync_group_members_state(context.bot, db, config)
    logger.info(
        "Periodic group sync: total=%s present=%s missing=%s blacklisted=%s imported_admins=%s import_admin_errors=%s imported=%s import_errors=%s errors=%s",
        result["total"],
        result["present"],
        result["missing"],
        result["blacklisted"],
        result["imported_admins"],
        result["import_admin_errors"],
        result["imported"],
        result["import_errors"],
        result["errors"],
    )


async def _refresh_activity_job(context) -> None:
    db: Database = context.application.bot_data["db"]
    config: Config = context.application.bot_data["config"]
    result = await refresh_group_activity(context.bot, db, config)
    logger.info(
        "Periodic activity refresh: group_total=%s checked=%s inactive=%s added=%s "
        "skipped_join_grace=%s errors=%s",
        result["group_total"],
        result["checked"],
        result["inactive"],
        result["added_to_inactive"],
        result["skipped_join_grace"],
        result["errors"],
    )


def main() -> None:
    config = Config.from_env()
    db = Database(config.database_path)

    application = (
        Application.builder()
        .token(config.bot_token)
        .post_init(post_init)
        .build()
    )

    application.bot_data["config"] = config
    application.bot_data["db"] = db

    application.add_handler(build_survey_handler())

    application.add_handler(CommandHandler("members", cmd_members))
    application.add_handler(CommandHandler("stats", cmd_stats))
    application.add_handler(CommandHandler("search", cmd_search))
    application.add_handler(CommandHandler("blacklist", cmd_blacklist))
    application.add_handler(CommandHandler("unblacklist", cmd_unblacklist))
    application.add_handler(CommandHandler("kick_non_members", cmd_kick_non_members))
    application.add_handler(CommandHandler("sync_group", cmd_sync_group))
    application.add_handler(CommandHandler("assign_titles", cmd_assign_titles))
    application.add_handler(CommandHandler("admin_help", cmd_help_admin))

    application.add_handler(
        ChatMemberHandler(on_chat_member_update, ChatMemberHandler.CHAT_MEMBER)
    )
    application.add_handler(ChatJoinRequestHandler(on_chat_join_request))
    application.add_handler(
        MessageHandler(
            filters.StatusUpdate.NEW_CHAT_MEMBERS
            | filters.StatusUpdate.LEFT_CHAT_MEMBER,
            on_group_membership_message_event,
        )
    )

    logger.info("Bot starting…")
    application.run_polling(
        allowed_updates=[
            "message",
            "callback_query",
            "chat_member",
            "chat_join_request",
        ]
    )


if __name__ == "__main__":
    main()
