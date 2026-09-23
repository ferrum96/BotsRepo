from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Subscription


def next_period(now: datetime, current_end: datetime | None, days: int) -> tuple[datetime, datetime]:
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    base = now if current_end is None or current_end <= now else current_end
    return now, base + timedelta(days=days)


async def expire_lapsed(session: AsyncSession, user_id: int, now: datetime) -> None:
    await session.execute(
        update(Subscription)
        .where(
            Subscription.user_id == user_id,
            Subscription.status == "active",
            Subscription.end_date <= now,
        )
        .values(status="expired")
    )


async def user_is_pro(session: AsyncSession, user_id: int, now: datetime | None = None) -> bool:
    moment = now or datetime.now(timezone.utc)
    await expire_lapsed(session, user_id, moment)
    row = await session.scalar(
        select(Subscription.user_id).where(
            Subscription.user_id == user_id,
            Subscription.status == "active",
            Subscription.end_date > moment,
        )
    )
    return row is not None


async def active_end(session: AsyncSession, user_id: int, now: datetime) -> datetime | None:
    return await session.scalar(
        select(Subscription.end_date)
        .where(
            Subscription.user_id == user_id,
            Subscription.status == "active",
            Subscription.end_date > now,
        )
        .order_by(Subscription.end_date.desc())
        .limit(1)
    )


async def activate_pro(
    session: AsyncSession,
    user_id: int,
    charge_id: str,
    days: int,
    now: datetime | None = None,
) -> Subscription:
    moment = now or datetime.now(timezone.utc)
    existing = await session.scalar(select(Subscription).where(Subscription.charge_id == charge_id))
    if existing is not None:
        return existing
    await expire_lapsed(session, user_id, moment)
    current = await active_end(session, user_id, moment)
    start, end = next_period(moment, current, days)
    while await session.get(Subscription, (user_id, start)) is not None:
        start += timedelta(microseconds=1)
    row = Subscription(
        user_id=user_id,
        start_date=start,
        end_date=end,
        status="active",
        charge_id=charge_id,
    )
    try:
        async with session.begin_nested():
            session.add(row)
            await session.flush()
    except IntegrityError:
        found = await session.scalar(select(Subscription).where(Subscription.charge_id == charge_id))
        if found is None:
            raise
        return found
    return row
