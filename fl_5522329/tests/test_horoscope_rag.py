import json
from datetime import date
from types import SimpleNamespace

import httpx
import pytest

from app.config import Settings
from app.horoscope.knowledge import get_all_records
from app.horoscope.preprocessor import build_rag_query, extract_compact_data, format_rag_context
from app.horoscope.render import build_user_prompt, render_horoscope
from app.horoscope.service import HoroscopeError, build_daily_horoscope
from app.horoscope.sources import parse_aspects, parse_daily, parse_moon
from app.texts import DISCLAIMER_LINE


def _daily() -> dict:
    return {
        "date": "2026-09-28",
        "attribution": {"localizedHref": "https://sigastra.com/horoscope/virgo"},
        "items": [
            {
                "text": "FULL_ENGLISH_HOROSCOPE",
                "data": {
                    "love": 3,
                    "work": 2,
                    "energy": 4,
                    "loveLine": "ENGLISH_LOVE_LINE",
                    "workLine": "ENGLISH_WORK_LINE",
                    "energyLine": "ENGLISH_ENERGY_LINE",
                },
            }
        ],
    }


def _cosmic() -> dict:
    return {
        "items": [
            {"text": "Moon Square Mars · 1.8°", "data": {"a": "moon", "b": "mars", "aspect": "square", "orb": 1.8}},
            {"text": "Mercury Square Mars · 2.9°", "data": {"a": "mercury", "b": "mars", "aspect": "square", "orb": 2.9}},
        ]
    }


def _moon() -> dict:
    return {
        "items": [{"data": {"phase": "Waning Gibbous", "moonSign": "Taurus", "illumination": 94.7, "waxing": False}}]
    }


def test_knowledge_base_size():
    rows = get_all_records()
    assert 80 <= len(rows) <= 90
    assert any(item["metadata"]["type"] == "aspect_sphere" for item in rows)


def test_compact_data_is_russian_and_skips_english_copy():
    daily = parse_daily(_daily(), "virgo")
    aspects = parse_aspects(_cosmic())
    moon = parse_moon(_moon())
    data = extract_compact_data(daily, aspects, moon)
    assert data["sign_ru"] == "Дева"
    assert data["ratings"]["отношения"] == "умеренный (3/5)"
    assert data["ratings"]["работа"] == "сдержанный (2/5)"
    assert "Луна квадрат Марс" in data["aspects"][0]
    assert moon["phase"] == "убывающая горбатая"
    assert moon["moon_sign"] == "Тельце"
    blob = json.dumps(data, ensure_ascii=False)
    assert "ENGLISH_LOVE_LINE" not in blob
    assert "FULL_ENGLISH_HOROSCOPE" not in blob
    query = build_rag_query("virgo", aspects, moon)
    assert "Дева" in query
    assert "Луна-Марс квадрат" in query


def test_prompt_and_telegram_text():
    daily = parse_daily(_daily(), "virgo")
    data = extract_compact_data(daily, parse_aspects(_cosmic()), parse_moon(_moon()))
    data["date_label"] = "28 сентября"
    context = format_rag_context(
        [{"text": "Луна в квадрате к Марсу. Спешка. " * 6, "metadata": {"type": "aspect_sphere"}}]
    )
    prompt = build_user_prompt(data, context)
    assert "ENGLISH_LOVE_LINE" not in prompt
    assert "управитель Меркурий" in prompt
    assert "[Аспект]" in prompt
    text = render_horoscope(
        data,
        "Общий фон дня. День напряжённый. Работа требует концентрации. Финансы без крупных трат. Отношения просят паузу. Здоровье ровное. Совет: не спорьте вечером. Подробнее: https://sigastra.com/horoscope/virgo",
    )
    assert "для Девы" in text
    assert "28 сентября" in text
    assert "http" not in text
    assert "sigastra.com" not in text
    assert DISCLAIMER_LINE in text


def _settings() -> Settings:
    return Settings(
        _env_file=None,
        bot_token="token",
        openrouter_api_key="model-key",
        openrouter_base_url="https://gemini.test/v1",
        openrouter_model="gemini-test",
        sigastra_base_url="https://sigastra.test",
    )


async def test_horoscope_uses_only_sigastra():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        if request.url.path.endswith("/daily"):
            return httpx.Response(200, json=_daily())
        if request.url.path.endswith("/cosmic"):
            return httpx.Response(200, json=_cosmic())
        if request.url.path.endswith("/moon"):
            return httpx.Response(200, json=_moon())
        return httpx.Response(404)

    class Store:
        def retrieve(self, query, top_k=5):
            assert "Дева" in query
            assert top_k == 5
            return [{"text": "Луна в квадрате к Марсу даёт спешку.", "metadata": {"type": "aspect_sphere"}}]

    async def complete(_client, **kwargs):
        assert "freeastro" not in kwargs["user_message"].lower()
        assert "ENGLISH_LOVE_LINE" not in kwargs["user_message"]
        return (
            "Общий фон дня спокойный, но собранный. "
            "Работа просит закрыть текущее, а не открывать новое. "
            "Финансы лучше не трогать крупной тратой. "
            "Отношения вечером просят паузу, а не спор. "
            "Здоровье держится, если не гнать темп. "
            "Совет: сделайте главное утром и оставьте вечер для рутины."
        )

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        text = await build_daily_horoscope(
            client,
            _settings(),
            SimpleNamespace(sun_sign="Дева"),
            today=date(2026, 9, 28),
            retriever=Store(),
            complete=complete,
        )
    assert all("freeastro" not in url for url in seen)
    assert any(url.endswith("/daily?lang=en&sign=virgo&full=1") or "sign=virgo" in url for url in seen)
    assert "для Девы" in text
    assert "http" not in text


async def test_unknown_sign():
    transport = httpx.MockTransport(lambda request: httpx.Response(500))
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(HoroscopeError, match="/profile"):
            await build_daily_horoscope(
                client,
                _settings(),
                SimpleNamespace(sun_sign="Незнак"),
                today=date(2026, 9, 28),
            )
