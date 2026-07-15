import json

import pytest
from starlette.testclient import TestClient

from dashboard.backend.events import EventHub
from tests.conftest import API_KEY, seed_member_sync


@pytest.mark.asyncio
async def test_event_hub_broadcast_reaches_clients():
    hub = EventHub()

    class FakeWS:
        def __init__(self):
            self.messages = []

        async def send_text(self, data: str):
            self.messages.append(data)

    ws = FakeWS()
    hub._clients.add(ws)  # noqa: SLF001 — unit test
    sent = await hub.broadcast({"type": "members.changed", "user_id": 1})
    assert sent == 1
    assert json.loads(ws.messages[0])["type"] == "members.changed"


def test_ws_requires_token_when_api_key_configured(api_client: TestClient):
    with pytest.raises(Exception):
        with api_client.websocket_connect("/ws") as ws:
            ws.receive_json()


def test_ws_connect_and_internal_event_broadcast(api_client: TestClient, auth_headers):
    with api_client.websocket_connect(f"/ws?token={API_KEY}") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "connected"

        response = api_client.post(
            "/internal/events",
            headers=auth_headers,
            json={"type": "dashboard.refresh", "reason": "test"},
        )
        assert response.status_code == 200
        assert response.json()["ok"] is True
        assert response.json()["sent"] >= 1

        event = ws.receive_json()
        assert event["type"] == "dashboard.refresh"
        assert event["reason"] == "test"


def test_kick_broadcasts_refresh(
    api_client: TestClient, auth_headers, db_path, telegram_transport
):
    seed_member_sync(db_path, 1001, track_in_group=True)
    with api_client.websocket_connect(f"/ws?token={API_KEY}") as ws:
        assert ws.receive_json()["type"] == "connected"
        response = api_client.post("/api/members/1001/kick", headers=auth_headers)
        assert response.status_code == 200
        event = ws.receive_json()
        assert event["type"] == "dashboard.refresh"
        assert event["reason"] == "kick"
