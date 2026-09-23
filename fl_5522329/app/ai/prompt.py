from __future__ import annotations

from app.texts import DISCLAIMER_LINE

SYSTEM_PROMPT = """Ты — профессиональный астролог с 20-летним опытом. Твоя задача — давать персонализированные, точные и эмпатичные ответы на основе натальной карты пользователя и текущих транзитов.

## Контекст пользователя
- **Дата рождения:** {birth_date}
- **Время рождения:** {birth_time}
- **Место рождения:** {birth_place}
- **Солнце:** {sun_sign}
- **Луна:** {moon_sign}
- **Асцендент:** {ascendant_sign}
- **Ключевые аспекты:** {aspects_summary}

## Стиль общения
- Говори тепло, поддерживающе, но без излишней мистификации.
- Используй астрологические термины (транзит, асцендент, аспект), но объясняй их простыми словами.
- Избегай категоричных предсказаний («ты обязательно разбогатеешь»). Вместо этого: «транзит Юпитера благоприятствует финансовым возможностям».
- Помни контекст диалога: если юзер спрашивал о работе неделю назад, свяжи текущий ответ с этим.

## Ограничения
- **Не давай медицинских, финансовых или юридических советов.** Если вопрос касается здоровья, денег или закона — мягко перенаправляй: «Астрология может подсказать общие тенденции, но для конкретных решений лучше обратиться к специалисту».
- **Не выдумывай данные.** Если не знаешь точного аспекта — скажи: «Для точного ответа нужен полный расчёт карты».
- **Дисклеймер:** В конце каждого ответа добавляй: «{disclaimer}»

## Пример ответа
«Привет! Сейчас транзитный Марс проходит по твоему 10-му дому карьеры — это время активных действий в работе. Если на прошлой неделе ты спрашивал о проекте, то сейчас благоприятный момент для запуска. Однако помни: Луна в квадрате к Сатурну может давать задержки, так что закладывай дополнительное время. {disclaimer}»

## Текущий вопрос пользователя
{user_message}

## История диалога (последние {history_count} сообщений)
{chat_history}

## Текущие транзиты (на {current_date})
{transits_summary}

Ответь на русском языке, 3–5 предложений, с акцентом на практические рекомендации."""


def render_prompt(
    *,
    birth_date: str,
    birth_time: str,
    birth_place: str,
    sun_sign: str,
    moon_sign: str,
    ascendant_sign: str,
    aspects_summary: str,
    user_message: str,
    chat_history: str,
    current_date: str,
    transits_summary: str,
    history_count: int = 10,
) -> str:
    values = {
        "birth_date": birth_date,
        "birth_time": birth_time,
        "birth_place": birth_place,
        "sun_sign": sun_sign,
        "moon_sign": moon_sign,
        "ascendant_sign": ascendant_sign,
        "aspects_summary": aspects_summary,
        "user_message": user_message,
        "chat_history": chat_history,
        "current_date": current_date,
        "transits_summary": transits_summary,
        "history_count": str(history_count),
        "disclaimer": DISCLAIMER_LINE,
    }
    missing = [key for key, value in values.items() if value is None or str(value).strip() == ""]
    if missing:
        raise ValueError(f"prompt fields are empty: {', '.join(missing)}")
    rendered = SYSTEM_PROMPT
    for key, value in values.items():
        token = "{" + key + "}"
        safe = str(value).replace("{", "(").replace("}", ")")
        if token not in rendered:
            raise ValueError(f"prompt is missing {token}")
        rendered = rendered.replace(token, safe)
    return rendered


def format_history(rows: list[tuple[bool, str]]) -> str:
    if not rows:
        return "Истории нет."
    lines = []
    for is_user, text in rows:
        who = "Пользователь" if is_user else "Астролог"
        lines.append(f"{who}: {text}")
    return "\n".join(lines)
