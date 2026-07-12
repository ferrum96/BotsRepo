"""End-to-end dashboard flows: member lifecycle through the HTTP API."""

import sqlite3

from tests.conftest import seed_blacklist_sync, seed_member_sync


def test_e2e_member_kick_to_blacklist_to_unblock(api_client, auth_headers, db_path):
    seed_member_sync(
        db_path,
        1001,
        game_nick="ClanFox",
        real_name="Alex",
        perspective="FPP",
        track_in_group=True,
    )

    members_before = api_client.get("/api/members")
    assert members_before.status_code == 200
    assert any(m["user_id"] == 1001 for m in members_before.json())

    stats_before = api_client.get("/api/stats").json()
    assert stats_before["total_members"] == 1
    assert stats_before["total_blacklist"] == 0

    kick = api_client.post("/api/members/1001/kick", headers=auth_headers)
    assert kick.status_code == 200
    assert kick.json() == {"ok": True}

    members_after_kick = api_client.get("/api/members").json()
    assert all(m["user_id"] != 1001 for m in members_after_kick)

    blacklist = api_client.get("/api/blacklist").json()
    assert len(blacklist) == 1
    assert blacklist[0]["user_id"] == 1001
    assert blacklist[0]["reason"] == "kicked_from_dashboard"
    assert blacklist[0]["game_nick"] == "ClanFox"

    stats_mid = api_client.get("/api/stats").json()
    assert stats_mid["total_blacklist"] == 1

    unblock = api_client.post("/api/blacklist/1001/unblock", headers=auth_headers)
    assert unblock.status_code == 200
    assert unblock.json() == {"ok": True}

    assert api_client.get("/api/blacklist").json() == []
    stats_after = api_client.get("/api/stats").json()
    assert stats_after["total_blacklist"] == 0


def test_e2e_survey_failure_unblock_requires_survey(api_client, auth_headers, db_path):
    seed_blacklist_sync(db_path, 777, "survey_attempts_exhausted")

    unblock = api_client.post("/api/blacklist/777/unblock", headers=auth_headers)
    assert unblock.status_code == 200
    assert unblock.json() == {"ok": True, "requires_survey": True}

    # User is cleared from blacklist but not auto-restored to members/group.
    assert api_client.get("/api/blacklist").json() == []
    assert api_client.get("/api/members").json() == []


def test_e2e_inactive_member_appears_in_inactive_list(api_client, db_path):
    seed_member_sync(
        db_path,
        50,
        game_nick="Sleepy",
        track_in_group=True,
        is_inactive=True,
        last_match_at="2026-01-01 12:00:00",
    )
    seed_member_sync(db_path, 51, game_nick="Active", track_in_group=True)

    inactive = api_client.get("/api/inactive-members").json()
    assert len(inactive) == 1
    assert inactive[0]["user_id"] == 50
    assert inactive[0]["game_nick"] == "Sleepy"
    assert inactive[0]["last_match_at"] == "2026-01-01 12:00:00"

    members = api_client.get("/api/members").json()
    assert {m["user_id"] for m in members} == {50, 51}


def test_e2e_kick_persists_in_sqlite(api_client, auth_headers, db_path):
    seed_member_sync(db_path, 1001, track_in_group=True)
    assert api_client.post("/api/members/1001/kick", headers=auth_headers).status_code == 200

    with sqlite3.connect(db_path) as conn:
        bl = conn.execute(
            "SELECT reason FROM blacklist WHERE user_id = 1001"
        ).fetchone()
        gm = conn.execute(
            "SELECT 1 FROM group_members WHERE user_id = 1001"
        ).fetchone()

    assert bl is not None
    assert bl[0] == "kicked_from_dashboard"
    assert gm is None
