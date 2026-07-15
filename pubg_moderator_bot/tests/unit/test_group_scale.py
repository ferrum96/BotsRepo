"""Scale tests for prod-sized clan groups (≤100 members)."""

from bot.database import Database
from tests.conftest import PROD_GROUP_SIZE_CAP, seed_member


async def test_group_member_ids_scale_to_prod_cap(db: Database):
    for i in range(1, PROD_GROUP_SIZE_CAP + 1):
        await seed_member(
            db,
            user_id=10_000 + i,
            game_nick=f"Nick{i}",
            real_name=f"Name{i}",
            tg_username=f"user{i}",
            track_in_group=True,
        )
    # Plus members outside the group must not inflate the in-group set.
    await seed_member(
        db,
        user_id=99_999,
        game_nick="Outsider",
        track_in_group=False,
    )

    group_ids = await db.get_group_member_ids()
    active = await db.get_active_members()
    in_group = [m for m in active if m.user_id in group_ids]

    assert len(group_ids) == PROD_GROUP_SIZE_CAP
    assert len(in_group) == PROD_GROUP_SIZE_CAP
    assert 99_999 not in group_ids
    assert len(in_group) <= PROD_GROUP_SIZE_CAP
