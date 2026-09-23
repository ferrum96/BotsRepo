from datetime import datetime, timezone

import pytest

from app.config import Settings
from app.limits.service import AI, TAROT, LimitService


class _Settings(Settings):
    model_config = Settings.model_config | {"env_file": None}


@pytest.fixture
def limits():
    from fakeredis import FakeAsyncRedis

    settings = _Settings(free_tarot_per_day=1, free_ai_per_day=1)
    return LimitService(FakeAsyncRedis(decode_responses=True), settings)


async def test_free_tarot_then_block(limits):
    now = datetime(2026, 5, 1, 10, tzinfo=timezone.utc)
    first = await limits.consume(5, TAROT, False, now)
    second = await limits.consume(5, TAROT, False, now)
    assert first.allowed and first.used == 1
    assert not second.allowed
    pro = await limits.consume(5, TAROT, True, now)
    assert pro.allowed and pro.cap is None


async def test_refund_and_next_msk_day(limits):
    now = datetime(2026, 5, 1, 20, tzinfo=timezone.utc)
    await limits.consume(5, AI, False, now)
    await limits.refund(5, AI, now)
    again = await limits.consume(5, AI, False, now)
    assert again.allowed and again.used == 1
    nxt = datetime(2026, 5, 1, 21, tzinfo=timezone.utc)
    rolled = await limits.consume(5, AI, False, nxt)
    assert rolled.allowed and rolled.used == 1
    assert limits.key(5, AI, now) != limits.key(5, AI, nxt)
