"""SQLite persistence layer."""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import aiosqlite

LEGACY_JOIN_DATE = "2001-01-01"
LAST_MATCH_FORMAT = "%Y-%m-%d %H:%M:%S"


@dataclass
class Member:
    user_id: int
    tg_username: Optional[str]
    tg_first_name: Optional[str]
    game_nick: str
    real_name: str
    discord_nick: Optional[str]
    perspective: str
    is_inactive: bool
    is_legacy: bool
    last_match_at: Optional[str]
    last_match_checked_at: Optional[str]
    created_at: str


@dataclass
class SurveyProgress:
    user_id: int
    step: str
    game_nick: Optional[str] = None
    real_name: Optional[str] = None
    discord_nick: Optional[str] = None
    perspective: Optional[str] = None
    attempts: int = 0


class Database:
    def __init__(self, path: str) -> None:
        self.path = path
        self._db: Optional[aiosqlite.Connection] = None

    async def connect(self) -> aiosqlite.Connection:
        if self._db is None:
            os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
            self._db = await aiosqlite.connect(self.path)
            self._db.row_factory = aiosqlite.Row
        return self._db

    async def init(self) -> None:
        db = await self.connect()
        await db.executescript(
            """
            CREATE TABLE IF NOT EXISTS members (
                user_id INTEGER PRIMARY KEY,
                tg_username TEXT,
                tg_first_name TEXT,
                game_nick TEXT NOT NULL,
                real_name TEXT NOT NULL,
                discord_nick TEXT,
                perspective TEXT NOT NULL,
                is_inactive INTEGER NOT NULL DEFAULT 0,
                is_legacy INTEGER NOT NULL DEFAULT 0,
                last_match_at TEXT,
                last_match_checked_at TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS blacklist (
                user_id INTEGER PRIMARY KEY,
                reason TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS survey_progress (
                user_id INTEGER PRIMARY KEY,
                step TEXT NOT NULL,
                game_nick TEXT,
                real_name TEXT,
                discord_nick TEXT,
                perspective TEXT,
                attempts INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS group_members (
                user_id INTEGER PRIMARY KEY,
                joined_at TEXT NOT NULL
            );
            """
        )
        await self._migrate_channel_members_table(db)
        await self._migrate_dashboard_columns(db)
        await db.commit()

    async def _migrate_channel_members_table(
        self, db: aiosqlite.Connection
    ) -> None:
        """Copy rows from the legacy channel_members table into group_members."""
        cursor = await db.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name='channel_members'"
        )
        if not await cursor.fetchone():
            return

        await db.execute(
            """
            INSERT INTO group_members (user_id, joined_at)
            SELECT user_id, joined_at FROM channel_members
            WHERE true
            ON CONFLICT(user_id) DO NOTHING
            """
        )
        await db.execute("DROP TABLE channel_members")

    async def _migrate_dashboard_columns(
        self, db: aiosqlite.Connection
    ) -> None:
        """Ensure legacy tables have new dashboard columns."""
        cursor = await db.execute(
            "SELECT name FROM pragma_table_info('members')"
        )
        columns = {row["name"] for row in await cursor.fetchall()}
        if "is_inactive" not in columns:
            await db.execute(
                "ALTER TABLE members ADD COLUMN is_inactive INTEGER NOT NULL DEFAULT 0"
            )
        if "is_legacy" not in columns:
            await db.execute(
                "ALTER TABLE members ADD COLUMN is_legacy INTEGER NOT NULL DEFAULT 0"
            )
        if "last_match_at" not in columns:
            await db.execute("ALTER TABLE members ADD COLUMN last_match_at TEXT")
        if "last_match_checked_at" not in columns:
            await db.execute(
                "ALTER TABLE members ADD COLUMN last_match_checked_at TEXT"
            )

        cursor = await db.execute(
            "SELECT name FROM pragma_table_info('survey_progress')"
        )
        columns = {row["name"] for row in await cursor.fetchall()}
        if "perspective" not in columns:
            await db.execute(
                "ALTER TABLE survey_progress ADD COLUMN perspective TEXT"
            )

    async def is_blacklisted(self, user_id: int) -> bool:
        db = await self.connect()
        cursor = await db.execute(
            "SELECT 1 FROM blacklist WHERE user_id = ?", (user_id,)
        )
        return await cursor.fetchone() is not None

    async def add_to_blacklist(self, user_id: int, reason: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        db = await self.connect()
        await db.execute(
            """
            INSERT INTO blacklist (user_id, reason, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                reason = excluded.reason,
                created_at = excluded.created_at
            """,
            (user_id, reason, now),
        )
        await db.execute(
            "DELETE FROM survey_progress WHERE user_id = ?", (user_id,)
        )
        await db.commit()

    async def remove_from_blacklist(self, user_id: int) -> bool:
        db = await self.connect()
        cursor = await db.execute(
            "DELETE FROM blacklist WHERE user_id = ?", (user_id,)
        )
        await db.commit()
        return cursor.rowcount > 0

    async def get_blacklist(self) -> list[tuple[int, str, str]]:
        db = await self.connect()
        cursor = await db.execute(
            "SELECT user_id, reason, created_at FROM blacklist ORDER BY created_at DESC"
        )
        rows = await cursor.fetchall()
        return [(r["user_id"], r["reason"], r["created_at"]) for r in rows]

    async def is_member(self, user_id: int) -> bool:
        db = await self.connect()
        cursor = await db.execute(
            "SELECT 1 FROM members WHERE user_id = ?", (user_id,)
        )
        return await cursor.fetchone() is not None

    async def get_member(self, user_id: int) -> Optional[Member]:
        db = await self.connect()
        cursor = await db.execute(
            "SELECT * FROM members WHERE user_id = ?", (user_id,)
        )
        row = await cursor.fetchone()
        if not row:
            return None
        return _row_to_member(row)

    async def save_member(
        self,
        user_id: int,
        tg_username: Optional[str],
        tg_first_name: Optional[str],
        game_nick: str,
        real_name: str,
        discord_nick: Optional[str],
        perspective: str,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        db = await self.connect()
        await db.execute(
            """
            INSERT INTO members (
                user_id, tg_username, tg_first_name,
                game_nick, real_name, discord_nick, perspective,
                is_inactive, is_legacy, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                tg_username = excluded.tg_username,
                tg_first_name = excluded.tg_first_name,
                game_nick = excluded.game_nick,
                real_name = excluded.real_name,
                discord_nick = excluded.discord_nick,
                perspective = excluded.perspective,
                created_at = excluded.created_at
            """,
            (
                user_id,
                tg_username,
                tg_first_name,
                game_nick,
                real_name,
                discord_nick,
                perspective,
                0,
                0,
                now,
            ),
        )
        await db.execute(
            "DELETE FROM survey_progress WHERE user_id = ?", (user_id,)
        )
        await db.commit()

    async def get_all_members(self) -> list[Member]:
        db = await self.connect()
        cursor = await db.execute(
            "SELECT * FROM members ORDER BY created_at DESC"
        )
        rows = await cursor.fetchall()
        return [_row_to_member(r) for r in rows]

    async def get_active_members(self) -> list[Member]:
        db = await self.connect()
        cursor = await db.execute(
            """
            SELECT * FROM members
            WHERE user_id NOT IN (SELECT user_id FROM blacklist)
            ORDER BY created_at DESC
            """
        )
        rows = await cursor.fetchall()
        return [_row_to_member(r) for r in rows]

    async def set_member_last_match(
        self, user_id: int, last_match_at: Optional[str]
    ) -> bool:
        """Save last match datetime."""
        checked_at = datetime.now(timezone.utc).strftime(LAST_MATCH_FORMAT)
        db = await self.connect()
        cursor = await db.execute(
            """
            UPDATE members
            SET last_match_at = ?, last_match_checked_at = ?
            WHERE user_id = ?
            """,
            (last_match_at, checked_at, user_id),
        )
        await db.commit()
        return cursor.rowcount > 0

    async def set_member_inactive(self, user_id: int, inactive: bool) -> bool:
        db = await self.connect()
        cursor = await db.execute(
            """
            UPDATE members
            SET is_inactive = ?
            WHERE user_id = ?
            """,
            (1 if inactive else 0, user_id),
        )
        await db.commit()
        return cursor.rowcount > 0

    async def get_inactive_members(self) -> list[Member]:
        """Return members marked as inactive and not blacklisted."""
        db = await self.connect()
        cursor = await db.execute(
            """
            SELECT * FROM members
            WHERE is_inactive = 1
              AND user_id NOT IN (SELECT user_id FROM blacklist)
            ORDER BY last_match_at ASC, created_at DESC
            """
        )
        rows = await cursor.fetchall()
        return [_row_to_member(r) for r in rows]

    async def search_members(self, query: str) -> list[Member]:
        pattern = f"%{query.lower()}%"
        db = await self.connect()
        cursor = await db.execute(
            """
            SELECT * FROM members
            WHERE lower(game_nick) LIKE ?
               OR lower(real_name) LIKE ?
               OR lower(COALESCE(discord_nick, '')) LIKE ?
               OR lower(COALESCE(tg_username, '')) LIKE ?
               OR lower(COALESCE(tg_first_name, '')) LIKE ?
            ORDER BY created_at DESC
            """,
            (pattern, pattern, pattern, pattern, pattern),
        )
        rows = await cursor.fetchall()
        return [_row_to_member(r) for r in rows]

    async def get_perspective_stats(self) -> dict[str, int]:
        db = await self.connect()
        cursor = await db.execute(
            "SELECT perspective, COUNT(*) as cnt FROM members GROUP BY perspective"
        )
        rows = await cursor.fetchall()
        return {r["perspective"]: r["cnt"] for r in rows}

    async def get_member_user_ids(self) -> set[int]:
        db = await self.connect()
        cursor = await db.execute("SELECT user_id FROM members")
        rows = await cursor.fetchall()
        return {r["user_id"] for r in rows}

    async def get_progress(self, user_id: int) -> Optional[SurveyProgress]:
        db = await self.connect()
        cursor = await db.execute(
            "SELECT * FROM survey_progress WHERE user_id = ?", (user_id,)
        )
        row = await cursor.fetchone()
        if not row:
            return None
        return SurveyProgress(
            user_id=row["user_id"],
            step=row["step"],
            game_nick=row["game_nick"],
            real_name=row["real_name"],
            discord_nick=row["discord_nick"],
            perspective=row["perspective"],
            attempts=row["attempts"],
        )

    async def set_progress(self, progress: SurveyProgress) -> None:
        db = await self.connect()
        await db.execute(
            """
            INSERT INTO survey_progress (
                user_id, step, game_nick, real_name, discord_nick, perspective, attempts
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                step = excluded.step,
                game_nick = excluded.game_nick,
                real_name = excluded.real_name,
                discord_nick = excluded.discord_nick,
                perspective = excluded.perspective,
                attempts = excluded.attempts
            """,
            (
                progress.user_id,
                progress.step,
                progress.game_nick,
                progress.real_name,
                progress.discord_nick,
                progress.perspective,
                progress.attempts,
            ),
        )
        await db.commit()

    async def clear_progress(self, user_id: int) -> None:
        db = await self.connect()
        await db.execute(
            "DELETE FROM survey_progress WHERE user_id = ?", (user_id,)
        )
        await db.commit()

    async def get_attempts(self, user_id: int) -> int:
        progress = await self.get_progress(user_id)
        return progress.attempts if progress else 0

    async def increment_attempts(self, user_id: int) -> int:
        progress = await self.get_progress(user_id)
        attempts = (progress.attempts if progress else 0) + 1
        await self.set_progress(
            SurveyProgress(user_id=user_id, step="failed", attempts=attempts)
        )
        return attempts

    async def track_group_member(self, user_id: int) -> None:
        now = datetime.now(timezone.utc).isoformat()
        db = await self.connect()
        await db.execute(
            """
            INSERT INTO group_members (user_id, joined_at)
            VALUES (?, ?)
            ON CONFLICT(user_id) DO NOTHING
            """,
            (user_id, now),
        )
        await db.commit()

    async def untrack_group_member(self, user_id: int) -> None:
        db = await self.connect()
        await db.execute(
            "DELETE FROM group_members WHERE user_id = ?", (user_id,)
        )
        await db.commit()

    async def get_group_member_ids(self) -> set[int]:
        db = await self.connect()
        cursor = await db.execute("SELECT user_id FROM group_members")
        rows = await cursor.fetchall()
        return {r["user_id"] for r in rows}

    async def get_group_member_join_date(self, user_id: int) -> Optional[str]:
        db = await self.connect()
        cursor = await db.execute(
            "SELECT joined_at FROM group_members WHERE user_id = ?", (user_id,)
        )
        row = await cursor.fetchone()
        return row["joined_at"] if row else None


async def get_member_join_date(db: Database, member: Member) -> str:
    """Return the actual join date, registration date, or legacy placeholder."""
    if member.is_legacy:
        return LEGACY_JOIN_DATE
    joined = await db.get_group_member_join_date(member.user_id)
    if joined:
        return joined
    # Fallback to the registration date for members who passed the survey
    # but have not yet had their group join tracked.
    return member.created_at or LEGACY_JOIN_DATE


def _row_to_member(row: aiosqlite.Row) -> Member:
    return Member(
        user_id=row["user_id"],
        tg_username=row["tg_username"],
        tg_first_name=row["tg_first_name"],
        game_nick=row["game_nick"],
        real_name=row["real_name"],
        discord_nick=row["discord_nick"],
        perspective=row["perspective"],
        is_inactive=bool(row["is_inactive"]),
        is_legacy=bool(row["is_legacy"]),
        last_match_at=row["last_match_at"],
        last_match_checked_at=row["last_match_checked_at"],
        created_at=row["created_at"],
    )
