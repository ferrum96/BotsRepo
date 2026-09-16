from dashboard import band_of, is_red, build_rows, render_html

CANDIDATES = [
    {"user_id": 1, "username": "@cold", "name": "Аня",  "source": "@chatA", "text": "просто смотрю", "score": 2, "date": "2026-06-20T10:00:00"},
    {"user_id": 2, "username": "@hot",  "name": "Боб",  "source": "@chatB", "text": "ищу монтажёра, сколько стоит?", "score": 7, "date": "2026-06-21T10:00:00"},
    {"user_id": 3, "username": "@fraud","name": "Карл", "source": "@chatC", "text": "заработок от 100к", "score": 5, "date": "2026-06-22T10:00:00"},
    {"user_id": 9, "username": "@noscore","name":"Ева", "source": "@chatD", "text": "не оценён", "score": 1, "date": "2026-06-22T11:00:00"},
]
SCORES = {
    "1": {"score": 25, "band": "🌤 Тёплый-низкий", "risk": "🟢 Низкий", "rationale": "любопытство", "scenario": "прогрев"},
    "2": {"score": 85, "band": "🌋 Очень горячий", "risk": "🟢 Низкий", "rationale": "активный поиск + цена", "scenario": "оффер"},
    "3": {"score": 80, "risk": "🔴 Высокий", "rationale": "схема", "scenario": "не контактировать"},
    # user_id 9 — НЕ оценён агентом → не должен попасть в дашборд
}

def test_band_thresholds():
    assert band_of(85) == "🌋 Очень горячий"
    assert band_of(65) == "🔥 Горячий"
    assert band_of(45) == "☀️ Тёплый"
    assert band_of(25) == "🌤 Тёплый-низкий"
    assert band_of(5)  == "❄️ Холодный/нецелевой"

def test_is_red():
    assert is_red("🔴 Высокий") is True
    assert is_red("🟢 Низкий") is False

def test_unscored_candidate_excluded():
    rows = build_rows(CANDIDATES, SCORES)
    assert all(r["name"] != "Ева" for r in rows)
    assert len(rows) == 3

def test_red_pushed_to_bottom_despite_high_score():
    rows = build_rows(CANDIDATES, SCORES)
    # @fraud (балл 80, 🔴) должен быть НИЖЕ @hot (85, 🟢) и НИЖЕ @cold (25, 🟢)
    names = [r["name"] for r in rows]
    assert names.index("Карл") == len(names) - 1
    assert names.index("Боб") < names.index("Аня")  # выше балл — выше в списке

def test_band_derived_when_missing():
    rows = build_rows(CANDIDATES, SCORES)
    fraud = next(r for r in rows if r["name"] == "Карл")
    assert fraud["band"] == "🌋 Очень горячий"  # выведен из score=80, т.к. в scores.json band не задан

def test_footer_present_in_html():
    rows = build_rows(CANDIDATES, SCORES)
    html = render_html(rows, "ФУТЕР-МАРКЕР-КУРС")
    assert "ФУТЕР-МАРКЕР-КУРС" in html
    assert "Боб" in html and "ищу монтажёра" in html
