from __future__ import annotations

from datetime import datetime, timezone

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.client import complete_chat
from app.ai.prompt import format_history, render_prompt
from app.astrology.forecast import aspects_summary, current_chart, transit_aspects, transits_summary
from app.config import Settings
from app.db.models import NatalChart
from app.services import add_message, chart_payload, recent_messages
from app.timeutil import MSK


async def answer_astrology_question(
    session: AsyncSession,
    client: httpx.AsyncClient,
    settings: Settings,
    row: NatalChart,
    user_text: str,
    now: datetime | None = None,
) -> str:
    moment = now or datetime.now(timezone.utc)
    payload = chart_payload(row)
    history = await recent_messages(session, row.user_id, settings.chat_history_limit)
    history_pairs = [(item.is_user, item.message_text) for item in history]
    current = current_chart(float(row.latitude), float(row.longitude), moment)
    transits = transit_aspects(payload, current)
    time_label = row.birth_time.strftime("%H:%M")
    if not row.birth_time_known:
        time_label += " (неизвестно, взято 12:00)"
    prompt = render_prompt(
        birth_date=row.birth_date.strftime("%d.%m.%Y"),
        birth_time=time_label,
        birth_place=row.birth_place,
        sun_sign=row.sun_sign,
        moon_sign=row.moon_sign,
        ascendant_sign=row.ascendant_sign,
        aspects_summary=aspects_summary(payload["aspects"]),
        user_message=user_text.strip(),
        chat_history=format_history(history_pairs),
        current_date=moment.astimezone(MSK).strftime("%d.%m.%Y"),
        transits_summary=transits_summary(transits),
        history_count=settings.chat_history_limit,
    )
    answer = await complete_chat(
        client,
        base_url=settings.openrouter_base_url,
        api_key=settings.openrouter_api_key,
        model=settings.openrouter_model,
        prompt=prompt,
        user_message=user_text.strip(),
    )
    await add_message(session, row.user_id, user_text.strip(), True)
    await add_message(session, row.user_id, answer, False)
    return answer
