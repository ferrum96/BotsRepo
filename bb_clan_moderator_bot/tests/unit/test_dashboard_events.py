import pytest

from bot.config import Config
from bot.events import publish_dashboard_event


@pytest.mark.asyncio
async def test_publish_dashboard_event_noop_without_url():
    cfg = Config(bot_token="t", group_id=1, dashboard_events_url="")
    # Must not raise.
    await publish_dashboard_event(cfg, {"type": "dashboard.refresh"})


@pytest.mark.asyncio
async def test_publish_dashboard_event_posts(monkeypatch):
    calls = []

    class FakeResponse:
        status_code = 200
        text = "ok"

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, json=None, headers=None):
            calls.append({"url": url, "json": json, "headers": headers})
            return FakeResponse()

    monkeypatch.setattr("bot.events.httpx.AsyncClient", FakeClient)
    cfg = Config(
        bot_token="t",
        group_id=1,
        dashboard_events_url="http://127.0.0.1:8081",
        dashboard_api_key="secret",
    )
    await publish_dashboard_event(cfg, {"type": "members.changed", "user_id": 7})
    assert len(calls) == 1
    assert calls[0]["url"] == "http://127.0.0.1:8081/internal/events"
    assert calls[0]["json"]["type"] == "members.changed"
    assert calls[0]["headers"]["X-API-Key"] == "secret"
