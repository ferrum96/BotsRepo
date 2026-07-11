import dashboard.backend.api as api_module


def test_api_default_bind_host_uses_docker_flag(monkeypatch):
    monkeypatch.setenv("RUNNING_IN_DOCKER", "1")
    assert api_module.default_bind_host() == "0.0.0.0"


def test_api_default_bind_host_is_local_without_docker(monkeypatch):
    monkeypatch.delenv("RUNNING_IN_DOCKER", raising=False)
    monkeypatch.setattr(api_module.os.path, "exists", lambda path: False)
    assert api_module.default_bind_host() == "127.0.0.1"
