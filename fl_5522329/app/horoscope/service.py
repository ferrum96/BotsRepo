from __future__ import annotations

import logging
from datetime import date, datetime
import asyncio

import httpx

from app.ai.client import AiError, complete_chat
from app.config import Settings
from app.db.models import NatalChart
from app.horoscope.lexicon import SIGN_RU_TO_SLUG, russian_date
from app.horoscope.preprocessor import build_rag_query, extract_compact_data, format_rag_context
from app.horoscope.render import SYSTEM_PROMPT, build_user_prompt, horoscope_is_complete, render_horoscope
from app.horoscope.sources import SourceError, fetch_sigastra_day
from app.timeutil import msk_today

logger = logging.getLogger(__name__)


class HoroscopeError(Exception):
    pass


async def build_daily_horoscope(
    client: httpx.AsyncClient,
    settings: Settings,
    row: NatalChart,
    *,
    today: date | None = None,
    retriever=None,
    complete=complete_chat,
) -> str:
    sign_ru = (row.sun_sign or "").strip()
    sign = SIGN_RU_TO_SLUG.get(sign_ru)
    if sign is None:
        raise HoroscopeError("Знак Солнца в карте не узнаю. Обнови данные через /profile.")
    if not settings.openrouter_api_key:
        raise HoroscopeError("Гороскоп дня не настроен: нет ключа модели.")
    day = today or msk_today()
    try:
        daily, aspects, moon, _credit = await fetch_sigastra_day(
            client, base_url=settings.sigastra_base_url, sign=sign
        )
    except SourceError as exc:
        raise HoroscopeError(str(exc)) from exc
    if not daily.get("date"):
        daily["date"] = day.isoformat()
    data = extract_compact_data(daily, aspects, moon)
    data["date_label"] = _date_label(data["date"], day)
    query = build_rag_query(sign, aspects, moon)
    store = retriever if retriever is not None else _open_store(settings.horoscope_chroma_path)
    fragments = format_rag_context(store.retrieve(query, 5))
    try:
        raw = await _complete_horoscope(
            complete,
            client,
            settings,
            build_user_prompt(data, fragments),
        )
        text = render_horoscope(data, raw)
    except (AiError, ValueError, TypeError) as exc:
        logger.exception("daily horoscope render failed")
        raise HoroscopeError("Гороскоп дня сейчас не собрался. Попробуй ещё раз.") from exc
    return text


async def _complete_horoscope(complete, client, settings: Settings, user_message: str) -> str:
    attempts = (
        {"max_tokens": 2048, "reasoning_effort": "none"},
        {"max_tokens": 4096, "reasoning_effort": None},
        {"max_tokens": 8192, "reasoning_effort": None},
    )
    last_error: Exception | None = None
    for options in attempts:
        try:
            raw = await complete(
                client,
                base_url=settings.openrouter_base_url,
                api_key=settings.openrouter_api_key,
                model=settings.openrouter_model,
                prompt=SYSTEM_PROMPT,
                user_message=user_message,
                temperature=0.4,
                with_disclaimer=False,
                **options,
            )
        except TypeError:
            raw = await complete(
                client,
                base_url=settings.openrouter_base_url,
                api_key=settings.openrouter_api_key,
                model=settings.openrouter_model,
                prompt=SYSTEM_PROMPT,
                user_message=user_message,
                temperature=0.4,
                with_disclaimer=False,
                max_tokens=options["max_tokens"],
            )
        except AiError as exc:
            last_error = exc
            logger.warning("horoscope model attempt failed: %s", exc)
            if any(code in str(exc) for code in ("503", "429", "truncated")):
                await asyncio.sleep(1.5)
            continue
        if horoscope_is_complete(raw):
            return raw
        last_error = AiError("horoscope text is incomplete")
        logger.warning("horoscope text is incomplete, retrying")
    raise last_error or AiError("horoscope text is incomplete")


def _open_store(path: str):
    from app.horoscope.vector_store import get_vector_store

    try:
        return get_vector_store(path)
    except Exception as exc:
        logger.exception("chroma init failed")
        raise HoroscopeError("База гороскопа не открылась. Попробуй ещё раз.") from exc


def _date_label(raw: str, fallback: date) -> str:
    try:
        parsed = datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError:
        parsed = fallback
    return russian_date(parsed)
