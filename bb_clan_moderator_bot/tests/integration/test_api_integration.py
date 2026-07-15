from tests.conftest import PROD_GROUP_SIZE_CAP, seed_blacklist_sync, seed_member_sync


def test_health_endpoint(api_client):
    response = api_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_members_lists_only_group_members(api_client, db_path):
    seed_member_sync(db_path, 1001, game_nick="InGroup", track_in_group=True)
    seed_member_sync(db_path, 1002, game_nick="OutGroup", track_in_group=False)

    response = api_client.get("/api/members")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["user_id"] == 1001
    assert payload[0]["game_nick"] == "InGroup"
    assert payload[0]["is_removed"] is False


def test_members_list_handles_prod_group_size(api_client, db_path):
    """Dashboard must return full clan roster up to prod size (~100)."""
    for i in range(1, PROD_GROUP_SIZE_CAP + 1):
        seed_member_sync(
            db_path,
            user_id=20_000 + i,
            game_nick=f"Player{i:03d}",
            real_name=f"Name{i}",
            tg_username=f"tg{i}",
            track_in_group=True,
        )
    # Noise: completed survey but not currently in Telegram group.
    for i in range(1, 11):
        seed_member_sync(
            db_path,
            user_id=30_000 + i,
            game_nick=f"Left{i}",
            track_in_group=False,
        )

    response = api_client.get("/api/members")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == PROD_GROUP_SIZE_CAP
    assert len(payload) <= PROD_GROUP_SIZE_CAP
    nicks = {row["game_nick"] for row in payload}
    assert "Player001" in nicks
    assert f"Player{PROD_GROUP_SIZE_CAP:03d}" in nicks
    assert "Left1" not in nicks


def test_stats_endpoint(api_client, db_path):
    seed_member_sync(db_path, 1, perspective="FPP", track_in_group=True)
    seed_member_sync(db_path, 2, perspective="TPP", track_in_group=True)
    seed_blacklist_sync(db_path, 3, "survey_failed")

    response = api_client.get("/api/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["total_members"] == 2
    assert data["total_blacklist"] == 1
    assert data["perspective_stats"]["FPP"] == 1
    assert data["perspective_stats"]["TPP"] == 1


def test_blacklist_endpoint(api_client, db_path):
    seed_member_sync(db_path, 55, game_nick="Banned", track_in_group=False)
    seed_blacklist_sync(db_path, 55, "kicked_from_dashboard")

    response = api_client.get("/api/blacklist")
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["user_id"] == 55
    assert rows[0]["reason"] == "kicked_from_dashboard"
    assert rows[0]["game_nick"] == "Banned"


def test_inactive_members_endpoint(api_client, db_path):
    seed_member_sync(
        db_path,
        70,
        track_in_group=True,
        is_inactive=True,
        last_match_at="2026-01-01 00:00:00",
    )
    seed_member_sync(
        db_path,
        71,
        track_in_group=False,
        is_inactive=True,
        last_match_at="2026-01-01 00:00:00",
    )

    response = api_client.get("/api/inactive-members")
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["user_id"] == 70


def test_kick_member_happy_path(api_client, auth_headers, db_path, telegram_transport):
    seed_member_sync(db_path, 1001, track_in_group=True)

    response = api_client.post("/api/members/1001/kick", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == {"ok": True}

    blacklist = api_client.get("/api/blacklist").json()
    assert any(row["user_id"] == 1001 for row in blacklist)
    members = api_client.get("/api/members").json()
    assert all(row["user_id"] != 1001 for row in members)

    # Hard ban must stick: ban without follow-up unban (blocks invite rejoins).
    paths = [path for _method, path in telegram_transport.calls]
    assert any(path.endswith("/banChatMember") for path in paths)
    assert not any(path.endswith("/unbanChatMember") for path in paths)


def test_kick_already_left_member_hard_bans(
    api_client, auth_headers, db_path, telegram_transport
):
    seed_member_sync(db_path, 1002, track_in_group=True)
    telegram_transport.member_status = "left"

    response = api_client.post("/api/members/1002/kick", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == {"ok": True}

    paths = [path for _method, path in telegram_transport.calls]
    assert any(path.endswith("/banChatMember") for path in paths)
    assert not any(path.endswith("/unbanChatMember") for path in paths)
    assert any(
        row["user_id"] == 1002 for row in api_client.get("/api/blacklist").json()
    )


def test_kick_unknown_member_returns_404(api_client, auth_headers):
    response = api_client.post("/api/members/9999/kick", headers=auth_headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "Member not found"


def test_unblock_requires_survey_for_survey_failures(api_client, auth_headers, db_path):
    seed_blacklist_sync(db_path, 88, "survey_failed")

    response = api_client.post("/api/blacklist/88/unblock", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == {"ok": True, "requires_survey": True}
    assert api_client.get("/api/blacklist").json() == []


def test_unblock_missing_entry_returns_404(api_client, auth_headers):
    response = api_client.post("/api/blacklist/4040/unblock", headers=auth_headers)
    assert response.status_code == 404


def test_update_member_profile(api_client, auth_headers, db_path, monkeypatch):
    seed_member_sync(db_path, 1001, game_nick="OldNick", real_name="Ivan", track_in_group=True)
    from unittest.mock import AsyncMock

    assign = AsyncMock(return_value=True)
    monkeypatch.setattr("dashboard.backend.main.assign_game_nick_tag", assign)

    response = api_client.patch(
        "/api/members/1001",
        headers=auth_headers,
        json={
            "game_nick": "NewNick",
            "real_name": "Petr",
            "discord_nick": "petr#1",
            "perspective": "TPP",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["game_nick"] == "NewNick"
    assert body["real_name"] == "Petr"
    assert body["discord_nick"] == "petr#1"
    assert body["perspective"] == "TPP"
    assign.assert_awaited_once()
    assert assign.await_args.args[3] == "NewNick"

    listed = api_client.get("/api/members").json()
    assert listed[0]["game_nick"] == "NewNick"


def test_update_member_without_nick_change_skips_tag(
    api_client, auth_headers, db_path, monkeypatch
):
    seed_member_sync(db_path, 1001, game_nick="SameNick", track_in_group=True)
    from unittest.mock import AsyncMock

    assign = AsyncMock(return_value=True)
    monkeypatch.setattr("dashboard.backend.main.assign_game_nick_tag", assign)

    response = api_client.patch(
        "/api/members/1001",
        headers=auth_headers,
        json={
            "game_nick": "SameNick",
            "real_name": "Ivan",
            "discord_nick": None,
            "perspective": "Mixed",
        },
    )
    assert response.status_code == 200
    assert response.json()["perspective"] == "Mixed"
    assign.assert_not_awaited()


def test_update_member_rejects_invalid_perspective(api_client, auth_headers, db_path):
    seed_member_sync(db_path, 1001, track_in_group=True)
    response = api_client.patch(
        "/api/members/1001",
        headers=auth_headers,
        json={
            "game_nick": "Nick",
            "real_name": "Name",
            "discord_nick": None,
            "perspective": "Quad",
        },
    )
    assert response.status_code == 422


def test_update_member_requires_group_presence(api_client, auth_headers, db_path):
    seed_member_sync(db_path, 1001, track_in_group=False)
    response = api_client.patch(
        "/api/members/1001",
        headers=auth_headers,
        json={
            "game_nick": "Nick",
            "real_name": "Name",
            "discord_nick": None,
            "perspective": "FPP",
        },
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Member not in group"
