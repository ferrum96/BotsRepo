from __future__ import annotations

from app.max_bot.handlers import dispatch
from app.max_bot.update_mapper import map_update
from tests.conftest import add_product


def _callback(user_id: int, payload: str) -> dict:
    return {
        "update_type": "message_callback",
        "timestamp": 1,
        "callback": {
            "callback_id": "cb-1",
            "payload": payload,
            "user": {"user_id": user_id, "username": "alice"},
        },
        "message": {"recipient": {"chat_id": 10, "user_id": user_id}},
    }


async def test_message_callback_catalog(services):
    event = map_update(_callback(1001, "menu:catalog"))
    response = await dispatch(event, services)
    assert response.replace_original is True
    assert response.text == "Каталог"
    payloads = [
        btn["payload"] for row in response.attachments[0]["payload"]["buttons"] for btn in row
    ]
    assert "menu:import" in payloads


async def test_message_callback_generate_preview(services, session):
    product = await add_product(session)
    assert product.id is not None
    event = map_update(_callback(1001, f"content:generate:{product.id}"))
    response = await dispatch(event, services)
    assert response.text is not None
    assert "Превью" in response.text
    assert "10.5" in response.text
    payloads = [
        btn["payload"] for row in response.attachments[0]["payload"]["buttons"] for btn in row
    ]
    assert any(item.startswith("publication:confirm:") for item in payloads)


async def test_bot_started_maps_to_start(services):
    event = map_update(
        {
            "update_type": "bot_started",
            "timestamp": 1,
            "user": {"user_id": 1001, "username": "alice"},
            "chat_id": 10,
        }
    )
    response = await dispatch(event, services)
    assert response.text is not None
    assert "Test Shop" in response.text
