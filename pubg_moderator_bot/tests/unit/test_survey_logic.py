from unittest.mock import AsyncMock, MagicMock

from telegram.ext import ConversationHandler

from bot.config import Config
from bot.database import Database, SurveyProgress
from bot.handlers.survey import (
    AGE,
    _record_failed_attempt,
    start,
)
from tests.conftest import seed_member


def _make_update(user_id: int = 500):
    user = MagicMock()
    user.id = user_id
    message = AsyncMock()
    update = MagicMock()
    update.effective_user = user
    update.message = message
    return update, message


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


async def test_start_rejects_blacklisted(mock_context, db: Database):
    await db.add_to_blacklist(502, "survey_failed")
    update, message = _make_update(502)

    state = await start(update, mock_context)
    assert state == ConversationHandler.END
    message.reply_text.assert_awaited()
    text = message.reply_text.await_args.args[0].lower()
    assert "списк" in text or "чёрн" in text


async def test_start_rejects_existing_member(mock_context, db: Database):
    await seed_member(db, 503, track_in_group=False)
    update, message = _make_update(503)

    state = await start(update, mock_context)
    assert state == ConversationHandler.END
    assert message.reply_text.await_count >= 1


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
    await db.set_progress(SurveyProgress(user_id=505, step="failed", attempts=2))
    update, message = _make_update(505)
    ban = AsyncMock(return_value=True)
    monkeypatch.setattr("bot.handlers.survey.ban_user_in_group", ban)

    state = await start(update, mock_context)
    assert state == ConversationHandler.END
    assert await db.is_blacklisted(505) is True
    ban.assert_awaited_once_with(mock_context.bot, config, 505, permanent=True)


async def test_start_begins_survey(mock_context, db: Database):
    update, message = _make_update(506)
    state = await start(update, mock_context)
    assert state == AGE
    progress = await db.get_progress(506)
    assert progress is not None
    assert progress.step == "age"
    assert message.reply_text.await_count == 2
