from __future__ import annotations

from app.max_bot.handlers import dispatch
from app.max_bot.update_mapper import map_update
from tests.conftest import VALID_CSV


def _message_created(user_id: int, text: str, *, file: dict | None = None) -> dict:
    attachments = [file] if file else []
    return {
        "update_type": "message_created",
        "timestamp": 1,
        "message": {
            "sender": {"user_id": user_id, "username": "alice"},
            "recipient": {"chat_id": 10, "user_id": user_id, "chat_type": "dialog"},
            "body": {"mid": "mid.1", "text": text, "attachments": attachments},
        },
    }


async def test_message_created_start_shows_menu(services):
    event = map_update(_message_created(1001, "/start"))
    response = await dispatch(event, services)
    assert response.text is not None
    assert "Test Shop" in response.text
    payloads = [
        btn["payload"] for row in response.attachments[0]["payload"]["buttons"] for btn in row
    ]
    assert "menu:catalog" in payloads


async def test_message_created_denied(services):
    event = map_update(_message_created(42, "/start"))
    response = await dispatch(event, services)
    assert response.text is not None
    assert "Нет доступа" in response.text


async def test_message_created_csv_import(services, session):
    event = map_update(
        _message_created(
            1001,
            "",
            file={
                "type": "file",
                "payload": {
                    "url": "https://fu.oneme.ru/file.csv",
                    "filename": "catalog.csv",
                    "size": len(VALID_CSV),
                    "mime_type": "text/csv",
                },
            },
        )
    )
    # user must be in waiting_csv
    from app.domain.enums import DialogState

    user = await services.access.require_user(1001, "alice")
    await services.sessions.set_state(user.id, DialogState.WAITING_CSV)
    response = await dispatch(event, services)
    assert response.text is not None
    assert "создано 2" in response.text
