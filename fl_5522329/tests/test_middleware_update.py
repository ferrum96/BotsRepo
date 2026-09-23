from datetime import datetime, timezone

from aiogram.types import Chat, Message, Update, User

from app.bot.middlewares import DisclaimerMiddleware


def _start_update() -> Update:
    message = Message(
        message_id=1,
        date=datetime.now(timezone.utc),
        chat=Chat(id=1, type="private"),
        from_user=User(id=1, is_bot=False, first_name="A"),
        text="/start",
    )
    return Update(update_id=1, message=message)


async def test_start_update_is_not_swallowed():
    seen = {}

    async def handler(event, data):
        seen["event"] = event
        return "ok"

    result = await DisclaimerMiddleware()(handler, _start_update(), {})
    assert result == "ok"
    assert seen["event"].message.text == "/start"
