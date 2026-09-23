import httpx
import pytest

from app.ai.client import AiError, complete_chat
from app.ai.prompt import format_history, render_prompt
from app.texts import DISCLAIMER_LINE


def _prompt() -> str:
    return render_prompt(
        birth_date="01.01.1990",
        birth_time="12:00",
        birth_place="Москва",
        sun_sign="Козерог",
        moon_sign="Рак",
        ascendant_sign="Весы",
        aspects_summary="Солнце трин Луна (орб 1°)",
        user_message="Как пройдёт день? {не ломай шаблон}",
        chat_history=format_history([(True, "Про работу")]),
        current_date="22.09.2026",
        transits_summary="Марс в 10 доме, секстиль к Солнцу (орб 1.2°)",
    )


def test_prompt_fills_context():
    text = _prompt()
    assert "{birth_date}" not in text
    assert "Козерог" in text
    assert "Как пройдёт день?" in text
    assert "Про работу" in text
    assert DISCLAIMER_LINE in text
    assert "(не ломай шаблон)" in text
    with pytest.raises(ValueError):
        render_prompt(
            birth_date=" ",
            birth_time="12:00",
            birth_place="Москва",
            sun_sign="Овен",
            moon_sign="Овен",
            ascendant_sign="Овен",
            aspects_summary="нет",
            user_message="вопрос",
            chat_history="Истории нет.",
            current_date="01.01.2026",
            transits_summary="нет",
        )


def test_empty_history():
    assert format_history([]) == "Истории нет."


async def test_openrouter_client():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer secret"
        body = request.read()
        assert b"qwen/qwen-2.5-72b-instruct" in body
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "Короткий ответ без дисклеймера."}}]},
        )

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        text = await complete_chat(
            client,
            base_url="https://openrouter.ai/api/v1",
            api_key="secret",
            model="qwen/qwen-2.5-72b-instruct",
            prompt="system",
            user_message="вопрос",
        )
    assert "развлекательный характер" in text
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(AiError):
            await complete_chat(
                client,
                base_url="https://openrouter.ai/api/v1",
                api_key="",
                model="qwen/qwen-2.5-72b-instruct",
                prompt="system",
                user_message="вопрос",
            )
