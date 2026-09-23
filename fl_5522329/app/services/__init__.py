from __future__ import annotations

from datetime import date, datetime, time, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.astrology.chart import ChartError, calculate_natal_chart
from app.db.models import ChatHistory, DailyLimit, NatalChart, User
from app.geo.coords import validate_coords


async def upsert_user(
    session: AsyncSession,
    telegram_id: int,
    username: str | None,
    referred_by: int | None = None,
) -> User:
    user = await session.get(User, telegram_id)
    if user is None:
        referrer_id = None
        if referred_by is not None and referred_by != telegram_id:
            referrer = await session.get(User, referred_by)
            if referrer is not None:
                referrer_id = referred_by
        user = User(telegram_id=telegram_id, username=username, referred_by=referrer_id)
        session.add(user)
        await session.flush()
        return user
    if username and user.username != username:
        user.username = username
        await session.flush()
    return user


async def accept_disclaimer(session: AsyncSession, user: User, now: datetime | None = None) -> None:
    if user.disclaimer_accepted_at is None:
        user.disclaimer_accepted_at = now or datetime.now(timezone.utc)
        await session.flush()


async def latest_chart(session: AsyncSession, user_id: int) -> NatalChart | None:
    return await session.scalar(
        select(NatalChart)
        .where(NatalChart.user_id == user_id)
        .order_by(NatalChart.calculated_at.desc(), NatalChart.id.desc())
        .limit(1)
    )


async def save_profile(
    session: AsyncSession,
    user_id: int,
    *,
    birth_date: date,
    birth_time: time,
    birth_time_known: bool,
    birth_place: str,
    latitude: float,
    longitude: float,
) -> NatalChart:
    validate_coords(latitude, longitude)
    try:
        chart = calculate_natal_chart(birth_date, birth_time, latitude, longitude)
    except ChartError:
        raise
    row = NatalChart(
        user_id=user_id,
        birth_date=birth_date,
        birth_time=birth_time,
        birth_time_known=birth_time_known,
        birth_place=birth_place,
        latitude=latitude,
        longitude=longitude,
        timezone_name=chart.timezone_name,
        sun_sign=chart.sun_sign,
        moon_sign=chart.moon_sign,
        ascendant_sign=chart.ascendant_sign,
        aspects=chart.aspects,
        houses=chart.houses,
        planets=chart.planets,
        chart_json=chart.as_dict(),
        calculated_at=datetime.now(timezone.utc),
    )
    session.add(row)
    await session.flush()
    return row


def chart_payload(row: NatalChart) -> dict:
    payload = dict(row.chart_json)
    payload["planets"] = row.planets
    payload["houses"] = row.houses
    payload["aspects"] = row.aspects
    payload["sun_sign"] = row.sun_sign
    payload["moon_sign"] = row.moon_sign
    payload["ascendant_sign"] = row.ascendant_sign
    return payload


async def increment_daily_limit(session: AsyncSession, user_id: int, kind: str, day: date) -> None:
    if kind not in {"tarot", "ai"}:
        raise ValueError("unknown limit kind")
    try:
        async with session.begin_nested():
            row = await session.get(DailyLimit, (user_id, day))
            if row is None:
                row = DailyLimit(
                    user_id=user_id,
                    date=day,
                    tarot_count=1 if kind == "tarot" else 0,
                    ai_questions=1 if kind == "ai" else 0,
                )
                session.add(row)
                await session.flush()
                return
            if kind == "tarot":
                row.tarot_count += 1
            else:
                row.ai_questions += 1
            await session.flush()
    except IntegrityError:
        row = await session.get(DailyLimit, (user_id, day))
        if row is None:
            raise
        if kind == "tarot":
            row.tarot_count += 1
        else:
            row.ai_questions += 1
        await session.flush()


async def recent_messages(session: AsyncSession, user_id: int, limit: int) -> list[ChatHistory]:
    rows = (
        await session.scalars(
            select(ChatHistory)
            .where(ChatHistory.user_id == user_id)
            .order_by(ChatHistory.created_at.desc(), ChatHistory.id.desc())
            .limit(limit)
        )
    ).all()
    return list(reversed(rows))


async def add_message(session: AsyncSession, user_id: int, text: str, is_user: bool) -> None:
    session.add(
        ChatHistory(
            user_id=user_id,
            message_text=text[:4000],
            is_user=is_user,
            created_at=datetime.now(timezone.utc),
        )
    )
    await session.flush()


async def referral_count(session: AsyncSession, user_id: int) -> int:
    value = await session.scalar(
        select(func.count()).select_from(User).where(User.referred_by == user_id)
    )
    return int(value or 0)


async def find_by_username(session: AsyncSession, username: str) -> User | None:
    normalized = username.lstrip("@").strip().lower()
    if not normalized:
        return None
    return await session.scalar(select(User).where(func.lower(User.username) == normalized))
