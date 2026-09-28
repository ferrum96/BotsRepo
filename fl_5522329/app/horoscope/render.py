from __future__ import annotations

import html
import re

from app.horoscope.lexicon import SIGN_GENITIVE
from app.texts import ensure_disclaimer

_URL = re.compile(r"\[([^\]]+)\]\(https?://[^)]+\)|https?://\S+|www\.\S+", re.IGNORECASE)
_SECTIONS = ("Общий фон", "Работа", "Финансы", "Отношения", "Здоровье", "Совет")

SYSTEM_PROMPT = """Ты — астролог. Составь гороскоп на день для указанного знака зодиака.

Структура гороскопа:
1. Общий фон дня (2-3 предложения: энергетика, ключевые аспекты)
2. Работа / карьера (1-2 предложения)
3. Финансы (1-2 предложения)
4. Отношения / любовь (1-2 предложения)
5. Здоровье / самочувствие (1-2 предложения)
6. Рекомендации / советы (2 предложения: что делать, чего избегать)

Правила:
- Всего 12-15 предложений, не более
- Стиль: тёплый, конкретный, без воды
- Используй ТОЛЬКО предоставленные данные и контекст
- Не придумывай аспекты или положения планет, которых нет в данных
- Пиши на русском языке
- Не используй эмодзи, ссылки и адреса сайтов
- Допиши все 6 блоков до точки. Не обрывай предложение
- Не давай медицинских, финансовых и юридических советов. Про самочувствие — темп и отдых. Про деньги — не спешить с крупной тратой, без сумм и обещаний дохода."""

STYLE_EXAMPLE = """ПРИМЕР СТИЛЯ:
День напряжённый, но продуктивный. Луна делает квадрат к Марсу — возможна спешка и раздражительность. Работа: хорошо идут задачи, требующие концентрации. Избегайте импульсивных решений в переговорах. Финансы: стабильный день, не делайте крупных покупок. Отношения: вечером вероятны мелкие конфликты на бытовой почве. Полезно дать себе паузу. Здоровье: размеренный темп и достаточный отдых. Совет: планируйте дела на первую половину дня, вечером — отдых и рутина."""


def build_user_prompt(data: dict, rag_context: list[str]) -> str:
    ratings = "; ".join(f"{key}: {value}" for key, value in data["ratings"].items()) or "нет данных"
    aspects = "; ".join(data["aspects"]) or "нет аспектов"
    rag = "\n".join(rag_context) if rag_context else "нет дополнительного контекста"
    day = data.get("date_label") or data["date"]
    return f"""ДАННЫЕ ДНЯ:
• Дата: {day}
• Знак: {data['sign_ru']} ({data['element']}, управитель {data['ruler']})
• Аспекты: {aspects}
• Луна: {data['moon_phase']} {data['moon_illumination']}%, в знаке {data['moon_sign']}
• Рейтинги: {ratings}

ИНТЕРПРЕТАЦИИ (из базы знаний):
{rag}

{STYLE_EXAMPLE}

Теперь составь гороскоп для {data['sign_ru']} на {day}."""


def horoscope_is_complete(body: str) -> bool:
    text = _without_links(body)
    if not text or text[-1] not in ".!?…":
        return False
    return sum(name in text for name in _SECTIONS) >= 4


def render_horoscope(data: dict, body: str) -> str:
    text = _without_links(body)
    if not text:
        raise ValueError("horoscope text is empty")
    sign_for = SIGN_GENITIVE.get(data["sign_ru"], data["sign_ru"])
    day = data.get("date_label") or data["date"]
    lines = [
        "Привет!",
        "",
        f"<b>Лови гороскоп на {html.escape(day)} для {html.escape(sign_for)}:</b>",
        "",
        html.escape(text),
    ]
    return ensure_disclaimer("\n".join(lines))


def _without_links(body: str) -> str:
    text = _URL.sub(lambda match: match.group(1) or "", body)
    lines = [" ".join(line.split()) for line in text.splitlines()]
    return "\n".join(line for line in lines if line).strip()
