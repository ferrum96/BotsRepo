from bot.config import Config, _parse_admin_ids


def test_parse_admin_ids_empty():
    assert _parse_admin_ids("") == []
    assert _parse_admin_ids("   ") == []


def test_parse_admin_ids_comma_separated():
    assert _parse_admin_ids("1, 2,3") == [1, 2, 3]


def test_config_from_env_reads_required_and_optional(monkeypatch):
    monkeypatch.setenv("BOT_TOKEN", "tok")
    monkeypatch.setenv("GROUP_ID", "-1001")
    monkeypatch.setenv("ADMIN_IDS", "10,20")
    monkeypatch.setenv("TELEGRAM_GROUP_LINK", "https://t.me/+x")
    monkeypatch.setenv("DISCORD_LINK", "https://discord.gg/x")
    monkeypatch.setenv("DATABASE_PATH", "/tmp/test.db")
    monkeypatch.setenv("MAX_SURVEY_ATTEMPTS", "3")
    monkeypatch.setenv("DASHBOARD_PORT", "9090")
    monkeypatch.setenv("DASHBOARD_API_KEY", "secret")
    monkeypatch.setenv("GROUP_SYNC_INTERVAL_MINUTES", "15")

    cfg = Config.from_env()
    assert cfg.bot_token == "tok"
    assert cfg.group_id == -1001
    assert cfg.admin_ids == [10, 20]
    assert cfg.telegram_group_link == "https://t.me/+x"
    assert cfg.discord_link == "https://discord.gg/x"
    assert cfg.database_path == "/tmp/test.db"
    assert cfg.max_survey_attempts == 3
    assert cfg.dashboard_port == 9090
    assert cfg.dashboard_api_key == "secret"
    assert cfg.group_sync_interval_minutes == 15


def test_config_from_env_requires_bot_token(monkeypatch):
    monkeypatch.delenv("BOT_TOKEN", raising=False)
    monkeypatch.setenv("GROUP_ID", "-1001")
    try:
        Config.from_env()
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "BOT_TOKEN" in str(exc)


def test_config_from_env_requires_group_id(monkeypatch):
    monkeypatch.setenv("BOT_TOKEN", "tok")
    monkeypatch.delenv("GROUP_ID", raising=False)
    try:
        Config.from_env()
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "GROUP_ID" in str(exc)


def test_config_defaults_when_optional_env_missing(monkeypatch):
    monkeypatch.setenv("BOT_TOKEN", "tok")
    monkeypatch.setenv("GROUP_ID", "-1001")
    monkeypatch.delenv("ADMIN_IDS", raising=False)
    monkeypatch.delenv("MAX_SURVEY_ATTEMPTS", raising=False)
    monkeypatch.delenv("DASHBOARD_API_KEY", raising=False)
    monkeypatch.delenv("DATABASE_PATH", raising=False)

    cfg = Config.from_env()
    assert cfg.admin_ids == []
    assert cfg.max_survey_attempts == 2
    assert cfg.dashboard_api_key == ""
    assert cfg.database_path == "data/bot.db"


def test_is_admin():
    cfg = Config(bot_token="t", group_id=1, admin_ids=[42])
    assert cfg.is_admin(42) is True
    assert cfg.is_admin(7) is False
