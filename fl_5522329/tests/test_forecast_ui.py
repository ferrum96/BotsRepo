from app.astrology.angles import SYNASTRY_BODIES
from app.astrology.forecast import render_daily, render_monthly
from app.astrology.synastry import render_synastry, score_aspects
from app.bot.keyboards import buy_keyboard, disclaimer_keyboard, main_menu
from app.texts import DISCLAIMER_LINE


def _body(longitude: float, name: str) -> dict:
    return {"longitude": longitude, "name": name, "sign": "Овен", "house": 1}


def _chart(offset: float) -> dict:
    planets = {
        key: _body(offset if key == "sun" else 10, key)
        for key in SYNASTRY_BODIES
    }
    planets["sun"]["name"] = "Солнце"
    return {
        "sun_sign": "Овен",
        "moon_sign": "Рак",
        "ascendant_sign": "Весы",
        "planets": planets,
        "houses": [{"number": index, "cusp": (index - 1) * 30} for index in range(1, 13)],
        "aspects": [],
    }


def test_daily_template_has_signs_and_disclaimer():
    text = render_daily(_chart(0), [], "22.09.2026")
    assert "Овен" in text and "22.09.2026" in text
    assert DISCLAIMER_LINE in text


def test_synastry_score_changes_with_trine():
    left = _chart(0)
    right = _chart(120)
    report = render_synastry(left, right, "Аня", "Боря")
    assert 0 <= report.score <= 100
    assert "Аня" in report.text
    assert report.score == score_aspects(report.aspects)
    assert any(item["type"] == "trine" for item in report.aspects)


def test_monthly_template():
    class _Progressed:
        planets = {"moon": {"sign": "Дева"}}

    text = render_monthly(_chart(0), _Progressed(), [], "09.2026")
    assert "Дева" in text and DISCLAIMER_LINE in text


def test_keyboards():
    accept = disclaimer_keyboard().inline_keyboard[0][0]
    assert accept.callback_data == "disclaimer:accept"
    menu = main_menu("https://astro.example")
    flat = [button.text for row in menu.inline_keyboard for button in row]
    assert "Купить Pro" in flat and "Открыть Mini App" in flat
    assert "Открыть Mini App" not in [
        button.text for row in main_menu("").inline_keyboard for button in row
    ]
    assert buy_keyboard().inline_keyboard[0][0].callback_data == "buy_pro"
