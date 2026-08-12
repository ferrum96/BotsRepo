"""CLI to create or update dashboard users."""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

import bcrypt

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from bot.config import Config
from bot.database import Database


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode(
        "utf-8"
    )


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create or update a dashboard user."
    )
    parser.add_argument("username", help="Unique login username")
    parser.add_argument("password", help="Password")
    parser.add_argument("display_name", help="Display name shown in the UI")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Update password and display name if user already exists",
    )
    args = parser.parse_args()

    config = Config.from_env()
    db = Database(config.database_path)
    await db.connect()
    await db.init()

    try:
        existing = await db.get_dashboard_user_by_username(args.username)
        password_hash = _hash_password(args.password)

        if existing:
            if not args.force:
                print(
                    f'User "{args.username}" already exists. Use --force to update.',
                    file=sys.stderr,
                )
                sys.exit(1)
            await db.update_dashboard_user(
                existing.id,
                password_hash=password_hash,
                display_name=args.display_name,
            )
            print(f'Updated: {args.username} ({args.display_name})')
        else:
            await db.create_dashboard_user(
                args.username, password_hash, args.display_name
            )
            print(f'Created: {args.username} ({args.display_name})')
    finally:
        if db._db is not None:
            await db._db.close()


if __name__ == "__main__":
    asyncio.run(main())
