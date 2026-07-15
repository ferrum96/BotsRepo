"""Security tests for dashboard API auth and input handling."""

from tests.conftest import API_KEY, seed_blacklist_sync, seed_member_sync


def test_mutating_endpoint_requires_api_key(api_client, db_path):
    seed_member_sync(db_path, 1001, track_in_group=True)

    response = api_client.post("/api/members/1001/kick")
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or missing API key"

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


def test_mutating_endpoint_rejects_wrong_api_key(api_client, db_path):
    seed_member_sync(db_path, 1001, track_in_group=True)

    response = api_client.post(
        "/api/members/1001/kick",
        headers={"X-API-Key": "wrong-key"},
    )
    assert response.status_code == 401


def test_mutating_endpoint_accepts_valid_api_key(api_client, auth_headers, db_path):
    seed_member_sync(db_path, 1001, track_in_group=True)

    response = api_client.post("/api/members/1001/kick", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_get_endpoints_remain_public_when_api_key_configured(api_client, db_path):
    seed_member_sync(db_path, 1001, track_in_group=True)

    for path in ("/health", "/api/members", "/api/blacklist", "/api/stats", "/api/inactive-members"):
        response = api_client.get(path)
        assert response.status_code == 200, path


def test_unblock_requires_api_key(api_client, db_path):
    seed_blacklist_sync(db_path, 55, "kicked_from_dashboard")

    denied = api_client.post("/api/blacklist/55/unblock")
    assert denied.status_code == 401

    allowed = api_client.post(
        "/api/blacklist/55/unblock",
        headers={"X-API-Key": API_KEY},
    )
    assert allowed.status_code == 200


def test_kick_rejects_non_integer_user_id(api_client, auth_headers):
    response = api_client.post("/api/members/not-an-id/kick", headers=auth_headers)
    assert response.status_code == 422


def test_search_like_injection_does_not_break_db(api_client, db_path):
    """Ensure LIKE wildcards / quotes in data do not crash listing."""
    seed_member_sync(
        db_path,
        200,
        game_nick="Robert'); DROP TABLE members;--",
        real_name="Bobby Tables",
        track_in_group=True,
    )
    response = api_client.get("/api/members")
    assert response.status_code == 200
    assert len(response.json()) == 1
    # Table still works after a follow-up write path
    stats = api_client.get("/api/stats")
    assert stats.status_code == 200
    assert stats.json()["total_members"] == 1


def test_cors_allows_configured_methods(api_client):
    response = api_client.options(
        "/api/members",
        headers={
            "Origin": "http://localhost:5174",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code in {200, 204}
    allow_origin = response.headers.get("access-control-allow-origin")
    assert allow_origin in {"*", "http://localhost:5174"}
