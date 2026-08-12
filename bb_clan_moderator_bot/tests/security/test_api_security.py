"""Security tests for dashboard API auth and input handling."""

from tests.conftest import API_KEY, seed_blacklist_sync, seed_member_sync


def test_mutating_endpoint_requires_token(api_client, db_path):
    seed_member_sync(db_path, 1001, track_in_group=True)

    response = api_client.post("/api/members/1001/kick")
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or missing token"

    patch_denied = api_client.patch(
        "/api/members/1001",
        json={
            "game_nick": "X",
            "real_name": "Y",
            "discord_nick": None,
            "perspective": "FPP",
        },
    )
    assert patch_denied.status_code == 401


def test_mutating_endpoint_rejects_malformed_token(api_client, db_path):
    seed_member_sync(db_path, 1001, track_in_group=True)

    response = api_client.post(
        "/api/members/1001/kick",
        headers={"Authorization": "Bearer not-a-valid-jwt"},
    )
    assert response.status_code == 401


def test_mutating_endpoint_accepts_valid_token(api_client, auth_headers, db_path):
    seed_member_sync(db_path, 1001, track_in_group=True)

    response = api_client.post("/api/members/1001/kick", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_get_endpoints_require_token(api_client, db_path):
    seed_member_sync(db_path, 1001, track_in_group=True)

    for path in ("/api/members", "/api/blacklist", "/api/stats", "/api/inactive-members"):
        response = api_client.get(path)
        assert response.status_code == 401, path


def test_get_endpoints_accept_valid_token(api_client, auth_headers, db_path):
    seed_member_sync(db_path, 1001, track_in_group=True)

    for path in ("/api/members", "/api/blacklist", "/api/stats", "/api/inactive-members"):
        response = api_client.get(path, headers=auth_headers)
        assert response.status_code == 200, path


def test_health_remains_public(api_client):
    response = api_client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_unblock_requires_token(api_client, auth_headers, db_path):
    seed_blacklist_sync(db_path, 55, "kicked_from_dashboard")

    denied = api_client.post("/api/blacklist/55/unblock")
    assert denied.status_code == 401

    allowed = api_client.post(
        "/api/blacklist/55/unblock",
        headers=auth_headers,
    )
    assert allowed.status_code == 200


def test_internal_events_requires_api_key(api_client, db_path):
    response = api_client.post("/internal/events", json={"type": "dashboard.refresh"})
    assert response.status_code == 401

    allowed = api_client.post(
        "/internal/events",
        headers={"X-API-Key": API_KEY},
        json={"type": "dashboard.refresh"},
    )
    assert allowed.status_code == 200


def test_kick_rejects_non_integer_user_id(api_client, auth_headers):
    response = api_client.post("/api/members/not-an-id/kick", headers=auth_headers)
    assert response.status_code == 422


def test_search_like_injection_does_not_break_db(api_client, auth_headers, db_path):
    """Ensure LIKE wildcards / quotes in data do not crash listing."""
    seed_member_sync(
        db_path,
        200,
        game_nick="Robert'); DROP TABLE members;--",
        real_name="Bobby Tables",
        track_in_group=True,
    )
    response = api_client.get("/api/members", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 1
    # Table still works after a follow-up write path
    stats = api_client.get("/api/stats", headers=auth_headers)
    assert stats.status_code == 200
    assert stats.json()["total_members"] == 1


def test_login_rejects_missing_credentials(api_client):
    response = api_client.post("/api/auth/login", json={})
    assert response.status_code == 422


def test_login_rejects_invalid_credentials(api_client, db_path):
    from tests.conftest import seed_dashboard_user_sync

    seed_dashboard_user_sync(db_path, username="admin", password="secret")

    response = api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "wrong"},
    )
    assert response.status_code == 401


def test_login_accepts_valid_credentials(api_client, db_path):
    from tests.conftest import seed_dashboard_user_sync

    user_id = seed_dashboard_user_sync(db_path, username="admin", password="secret")

    response = api_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "secret"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "token" in data
    assert data["user"]["username"] == "admin"
    assert data["user"]["id"] == user_id


def test_auth_me_requires_valid_token(api_client, auth_headers):
    response = api_client.get("/api/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["username"] == "admin"


def test_auth_me_rejects_missing_token(api_client):
    response = api_client.get("/api/auth/me")
    assert response.status_code == 401
