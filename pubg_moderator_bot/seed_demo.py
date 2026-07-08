"""Seed the local SQLite database with demo dashboard data."""

import asyncio
from datetime import datetime, timezone

from bot.database import Database


def now():
    return datetime.now(timezone.utc).isoformat()


async def main():
    db = Database("data/bot.db")
    await db.connect()
    await db.init()

    await db.save_member(
        user_id=1001,
        tg_username="old_guard_1",
        tg_first_name="Old Guard 1",
        game_nick="Vanguard_Zero",
        real_name="Alex Mercer",
        discord_nick="vanguard#1234",
        perspective="FPP",
        level=99,
    )
    await db.save_member(
        user_id=1002,
        tg_username="shadow_striker",
        tg_first_name="Sarah",
        game_nick="Shadow_Striker",
        real_name="Sarah Connor",
        discord_nick=None,
        perspective="TPP",
        level=45,
    )
    await db.save_member(
        user_id=1003,
        tg_username=None,
        tg_first_name="Toxic",
        game_nick="Toxic_Avenger",
        real_name="Unknown",
        discord_nick=None,
        perspective="Mixed",
        level=12,
    )
    await db.save_member(
        user_id=1004,
        tg_username="neon_ninja",
        tg_first_name="Hiroshi",
        game_nick="Neon_Ninja",
        real_name="Hiroshi Tanaka",
        discord_nick="neon#9999",
        perspective="TPP",
        level=78,
    )
    await db.save_member(
        user_id=1005,
        tg_username="inactive_one",
        tg_first_name="Inactive",
        game_nick="Inactive_One",
        real_name="John Doe",
        discord_nick=None,
        perspective="FPP",
        level=120,
    )

    # Mark first member as legacy (join date will be 2001-01-01).
    await db.set_member_legacy(1001, True)

    # Mark member 1005 as inactive.
    await db.set_member_inactive(1005, True)

    # Track group membership: 1002, 1004 are in group; 1001, 1003, 1005 are not.
    await db.track_group_member(1002)
    await db.track_group_member(1004)

    # Add one user to blacklist.
    await db.add_to_blacklist(9999, "survey_attempts_exhausted")

    print("Demo data seeded.")


if __name__ == "__main__":
    asyncio.run(main())
