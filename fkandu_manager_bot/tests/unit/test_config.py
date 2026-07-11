import bot.config as config_module
from bot.config import Config


def test_config_from_env_reads_bind_hosts(monkeypatch):
    monkeypatch.setenv("BOT_TOKEN", "token")
    monkeypatch.setenv("ADMIN_ID", "42")
    monkeypatch.setenv("HOSTNAME", "example.com")
    monkeypatch.setenv("FILE_SERVER_HOST", "0.0.0.0")

    cfg = Config.from_env()
    assert cfg.bot_token == "token"
    assert cfg.admin_id == 42
    assert cfg.hostname == "example.com"
    assert cfg.file_server_host == "0.0.0.0"


def test_config_auto_bind_host_uses_docker_flag(monkeypatch):
    monkeypatch.setenv("BOT_TOKEN", "token")
    monkeypatch.setenv("ADMIN_ID", "42")
    monkeypatch.setenv("RUNNING_IN_DOCKER", "1")
    monkeypatch.delenv("FILE_SERVER_HOST", raising=False)

    cfg = Config.from_env()
    assert cfg.file_server_host == "0.0.0.0"


def test_default_bind_host_is_local_without_docker(monkeypatch):
    monkeypatch.delenv("RUNNING_IN_DOCKER", raising=False)
    monkeypatch.setattr(config_module.os.path, "exists", lambda path: False)
    assert config_module._default_bind_host() == "127.0.0.1"
