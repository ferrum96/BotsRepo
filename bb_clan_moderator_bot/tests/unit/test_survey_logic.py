from dataclasses import replace
from unittest.mock import AsyncMock, MagicMock

from telegram.ext import ConversationHandler

from bot import messages as msg
from bot.config import AdminContact, Config
from bot.database import Database, SurveyProgress
from bot.handlers.survey import (
    AGE,
    _record_failed_attempt,
    cmd_contacts,
    start,
)
from tests.conftest import seed_member


PROD_GROUP_SIZE_CAP = 100


def _make_update(user_id: int = 500):
    user = MagicMock()
    user.id = user_id
    message = AsyncMock()
    update = MagicMock()
    update.effective_user = user
    update.message = message
    return update, message


def _reply_texts(message) -> list[str]:
    return [call.args[0] for call in message.reply_text.await_args_list]


def _reply_urls(message, call_index: int = 0) -> list[str]:
    kwargs = message.reply_text.await_args_list[call_index].kwargs
    markup = kwargs.get("reply_markup")
    if not markup:
        return []
    return [btn.url for row in markup.inline_keyboard for btn in row if btn.url]


def _with_contacts(mock_context, config: Config) -> Config:
    updated = replace(
        config,
        admin_contacts=[
            AdminContact(username="salov_ks", label="Костя"),
            AdminContact(username="AbobaBobq", label="Вася"),
        ],
    )
    mock_context.application.bot_data["config"] = updated
    return updated


async def test_record_failed_attempt_blacklists_when_exhausted(
    mock_context, db: Database, config: Config, monkeypatch
):
    await db.set_progress(SurveyProgress(user_id=500, step="age", attempts=1))
    ban = AsyncMock(return_value=True)
    monkeypatch.setattr("bot.handlers.survey.ban_user_in_group", ban)
    result = await _record_failed_attempt(mock_context, 500)
    assert result == {"blacklisted": True, "remaining": 0}
    assert await db.is_blacklisted(500) is True
    ban.assert_awaited_once_with(mock_context.bot, config, 500, permanent=True)


async def test_record_failed_attempt_keeps_remaining(
    mock_context, db: Database, config: Config, monkeypatch
):
    await db.set_progress(SurveyProgress(user_id=501, step="age", attempts=0))
    ban = AsyncMock(return_value=True)
    monkeypatch.setattr("bot.handlers.survey.ban_user_in_group", ban)
    result = await _record_failed_attempt(mock_context, 501)
    assert result == {"blacklisted": False, "remaining": 1}
    assert await db.is_blacklisted(501) is False
    assert await db.get_attempts(501) == 1
    ban.assert_not_called()


async def test_start_rejects_blacklisted_with_contacts(mock_context, db: Database, config: Config):
    _with_contacts(mock_context, config)
    await db.add_to_blacklist(502, "survey_failed")
    update, message = _make_update(502)

    state = await start(update, mock_context)
    assert state == ConversationHandler.END
    assert message.reply_text.await_count == 1
    assert msg.BLACKLISTED in _reply_texts(message)[0]
    assert _reply_urls(message) == [
        "https://t.me/salov_ks",
        "https://t.me/AbobaBobq",
    ]


async def test_start_rejects_existing_member_join_keyboard_only(
    mock_context, db: Database, config: Config
):
    _with_contacts(mock_context, config)
    await seed_member(db, 503, track_in_group=False)
    update, message = _make_update(503)

    state = await start(update, mock_context)
    assert state == ConversationHandler.END
    urls = _reply_urls(message)
    assert config.telegram_group_link in urls
    assert config.discord_link in urls
    assert "https://t.me/salov_ks" not in urls


async def test_start_rejects_completed_survey(mock_context, db: Database):
    await db.set_progress(
        SurveyProgress(
            user_id=504,
            step="completed",
            game_nick="N",
            real_name="R",
            perspective="FPP",
        )
    )
    update, message = _make_update(504)
    state = await start(update, mock_context)
    assert state == ConversationHandler.END


async def test_start_blacklists_when_attempts_exhausted(
    mock_context, db: Database, config: Config, monkeypatch
):
    updated = _with_contacts(mock_context, config)
    await db.set_progress(SurveyProgress(user_id=505, step="failed", attempts=2))
    update, message = _make_update(505)
    ban = AsyncMock(return_value=True)
    monkeypatch.setattr("bot.handlers.survey.ban_user_in_group", ban)

    state = await start(update, mock_context)
    assert state == ConversationHandler.END
    assert await db.is_blacklisted(505) is True
    ban.assert_awaited_once_with(mock_context.bot, updated, 505, permanent=True)
    assert _reply_urls(message) == [
        "https://t.me/salov_ks",
        "https://t.me/AbobaBobq",
    ]


async def test_start_begins_survey_with_contacts(
    mock_context, db: Database, config: Config
):
    _with_contacts(mock_context, config)
    update, message = _make_update(506)
    state = await start(update, mock_context)
    assert state == AGE
    progress = await db.get_progress(506)
    assert progress is not None
    assert progress.step == "age"

    texts = _reply_texts(message)
    assert message.reply_text.await_count == 3
    assert texts[0] == f"{msg.WELCOME}\n\n{msg.SURVEY_CONTACTS_HINT}"
    assert texts[1] == msg.SURVEY_INTRO
    assert texts[2] == msg.ASK_AGE
    assert _reply_urls(message, 0) == [
        "https://t.me/salov_ks",
        "https://t.me/AbobaBobq",
    ]
    assert message.reply_text.await_args_list[1].kwargs.get("reply_markup") is None


async def test_start_begins_survey_without_contacts(mock_context, db: Database):
    update, message = _make_update(507)
    state = await start(update, mock_context)
    assert state == AGE
    texts = _reply_texts(message)
    assert message.reply_text.await_count == 3
    assert texts[0] == msg.WELCOME
    assert msg.SURVEY_CONTACTS_HINT not in texts[0]
    assert texts[1] == msg.SURVEY_INTRO
    assert texts[2] == msg.ASK_AGE
    assert message.reply_text.await_args_list[0].kwargs.get("reply_markup") is None


async def test_cmd_contacts_with_admins(mock_context, config: Config):
    _with_contacts(mock_context, config)
    update, message = _make_update(508)
    await cmd_contacts(update, mock_context)
    assert _reply_texts(message) == [msg.CONTACTS]
    assert _reply_urls(message) == [
        "https://t.me/salov_ks",
        "https://t.me/AbobaBobq",
    ]


async def test_cmd_contacts_unavailable(mock_context):
    update, message = _make_update(509)
    await cmd_contacts(update, mock_context)
    assert _reply_texts(message) == [msg.CONTACTS_UNAVAILABLE]
    assert message.reply_text.await_args.kwargs.get("reply_markup") is None
