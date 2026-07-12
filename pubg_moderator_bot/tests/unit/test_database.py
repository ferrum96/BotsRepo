from bot.database import (
    LEGACY_JOIN_DATE,
    Database,
    SurveyProgress,
    get_member_join_date,
)
from tests.conftest import seed_member


async def test_blacklist_roundtrip_and_clears_progress(db: Database):
    await db.set_progress(SurveyProgress(user_id=5, step="age", attempts=1))
    assert await db.is_blacklisted(5) is False

    await db.add_to_blacklist(5, "survey_failed")
    assert await db.is_blacklisted(5) is True
    assert await db.get_progress(5) is None

    rows = await db.get_blacklist()
    assert len(rows) == 1
    assert rows[0][0] == 5
    assert rows[0][1] == "survey_failed"

    assert await db.remove_from_blacklist(5) is True
    assert await db.is_blacklisted(5) is False
    assert await db.remove_from_blacklist(5) is False


async def test_save_member_clears_survey_progress(db: Database):
    await db.set_progress(
        SurveyProgress(
            user_id=10,
            step="completed",
            game_nick="Nick",
            real_name="Name",
            perspective="FPP",
            attempts=0,
        )
    )
    await db.save_member(
        user_id=10,
        tg_username="u",
        tg_first_name="U",
        game_nick="Nick",
        real_name="Name",
        discord_nick=None,
        perspective="FPP",
    )
    assert await db.get_progress(10) is None
    assert await db.is_member(10) is True
    member = await db.get_member(10)
    assert member is not None
    assert member.game_nick == "Nick"
    assert member.perspective == "FPP"


async def test_active_members_exclude_blacklisted(db: Database):
    await seed_member(db, 1, game_nick="A", track_in_group=False)
    await seed_member(db, 2, game_nick="B", track_in_group=False)
    await db.add_to_blacklist(2, "kicked_from_dashboard")

    active = await db.get_active_members()
    assert [m.user_id for m in active] == [1]


async def test_inactive_and_last_match(db: Database):
    await seed_member(db, 3, track_in_group=False)
    assert await db.set_member_last_match(3, "2026-01-01 00:00:00") is True
    assert await db.set_member_inactive(3, True) is True

    inactive = await db.get_inactive_members()
    assert len(inactive) == 1
    assert inactive[0].user_id == 3
    assert inactive[0].last_match_at == "2026-01-01 00:00:00"
    assert inactive[0].last_match_checked_at is not None


async def test_search_members_case_insensitive(db: Database):
    await seed_member(db, 4, game_nick="ShadowFox", real_name="Alex", track_in_group=False)
    found = await db.search_members("shadow")
    assert len(found) == 1
    assert found[0].user_id == 4
    assert await db.search_members("missing") == []


async def test_perspective_stats(db: Database):
    await seed_member(db, 1, perspective="FPP", track_in_group=False)
    await seed_member(db, 2, perspective="FPP", track_in_group=False)
    await seed_member(db, 3, perspective="TPP", track_in_group=False)
    stats = await db.get_perspective_stats()
    assert stats == {"FPP": 2, "TPP": 1}


async def test_survey_attempts_and_progress(db: Database):
    assert await db.get_attempts(7) == 0
    attempts = await db.increment_attempts(7)
    assert attempts == 1
    progress = await db.get_progress(7)
    assert progress is not None
    assert progress.step == "failed"
    assert progress.attempts == 1

    await db.set_progress(
        SurveyProgress(user_id=8, step="completed", game_nick="G", real_name="R")
    )
    completed = await db.get_progress_by_step("completed")
    assert [p.user_id for p in completed] == [8]

    await db.clear_progress(8)
    assert await db.get_progress(8) is None


async def test_group_member_tracking(db: Database):
    await db.track_group_member(50)
    await db.track_group_member(50)  # idempotent
    assert await db.get_group_member_ids() == {50}
    joined = await db.get_group_member_join_date(50)
    assert joined is not None
    await db.untrack_group_member(50)
    assert await db.get_group_member_ids() == set()


async def test_get_member_join_date_legacy_and_fallback(db: Database):
    await seed_member(db, 60, track_in_group=True)
    member = await db.get_member(60)
    assert member is not None
    join_date = await get_member_join_date(db, member)
    assert join_date == await db.get_group_member_join_date(60)

    member.is_legacy = True
    assert await get_member_join_date(db, member) == LEGACY_JOIN_DATE

    await db.untrack_group_member(60)
    member.is_legacy = False
    assert await get_member_join_date(db, member) == member.created_at


async def test_blacklist_upsert_updates_reason(db: Database):
    await db.add_to_blacklist(9, "survey_failed")
    await db.add_to_blacklist(9, "kicked_from_dashboard")
    rows = await db.get_blacklist()
    assert len(rows) == 1
    assert rows[0][1] == "kicked_from_dashboard"
