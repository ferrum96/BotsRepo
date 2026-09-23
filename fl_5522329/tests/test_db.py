from datetime import date, datetime, time, timedelta, timezone

import pytest

from app.billing.subscription import activate_pro, user_is_pro
from app.services import increment_daily_limit, save_profile, upsert_user


def _utc(value):
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


async def test_subscription_extends_and_is_idempotent(session):
    now = datetime(2026, 9, 1, tzinfo=timezone.utc)
    await upsert_user(session, 10, "ada")
    first = await activate_pro(session, 10, "charge-1", 30, now)
    await session.commit()
    again = await activate_pro(session, 10, "charge-1", 30, now)
    assert _utc(again.start_date) == _utc(first.start_date)
    assert await user_is_pro(session, 10, now + timedelta(days=1))
    third = await activate_pro(session, 10, "charge-2", 30, now)
    assert _utc(third.end_date) == _utc(first.end_date) + timedelta(days=30)
    assert not await user_is_pro(session, 10, _utc(third.end_date) + timedelta(seconds=1))


async def test_daily_limit_rows(session):
    await upsert_user(session, 3, None)
    day = date(2026, 9, 22)
    await increment_daily_limit(session, 3, "tarot", day)
    await increment_daily_limit(session, 3, "ai", day)
    await increment_daily_limit(session, 3, "tarot", day)
    from app.db.models import DailyLimit

    row = await session.get(DailyLimit, (3, day))
    assert row.tarot_count == 2
    assert row.ai_questions == 1


async def test_profile_saves_capricorn_sun(session):
    pytest.importorskip("swisseph")
    await upsert_user(session, 8, "leo")
    row = await save_profile(
        session,
        8,
        birth_date=date(2000, 1, 1),
        birth_time=time(12, 0),
        birth_time_known=True,
        birth_place="London",
        latitude=51.5,
        longitude=-0.12,
    )
    assert row.sun_sign == "Козерог"
    assert row.chart_json["birth_utc"]
    assert len(row.houses) == 12
    assert row.planets["sun"]["sign"] == "Козерог"
    assert row.latitude is not None
