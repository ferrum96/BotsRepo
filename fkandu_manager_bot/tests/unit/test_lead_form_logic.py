from bot.config import Config
from bot.handlers.lead_form import (
    _format_admin_contact_line,
    calculate_lead_score,
    get_file_url,
)


def test_calculate_lead_score_returns_hot_for_high_budget():
    assert calculate_lead_score("50 000 ₽ и выше", "⚡ На этой неделе") == "ГОРЯЧИЙ 🔥"


def test_calculate_lead_score_returns_warm_for_mid_budget_and_longer_timeline():
    assert calculate_lead_score("10 000 - 30 000 ₽", "📅 В ближайшие 2 недели") == "Теплый 💛"


def test_calculate_lead_score_returns_cold_for_low_signals():
    assert calculate_lead_score("До 10 000 ₽", "👀 Просто изучаю варианты") == "Холодный 🧊"


def test_get_file_url_uses_hostname_and_port():
    config = Config(
        bot_token="token",
        admin_id=1,
        hostname="example.com",
        proxy_url=None,
        file_server_port=9000,
        db_path="/tmp/leads.db",
    )
    assert get_file_url(config, 42) == "http://example.com:9000/files/42"


def test_admin_contact_line_without_username():
    assert _format_admin_contact_line(None) == "💬 username не указан"
