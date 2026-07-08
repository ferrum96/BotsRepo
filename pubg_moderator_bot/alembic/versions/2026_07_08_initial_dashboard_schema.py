"""initial dashboard schema

Revision ID: a1b2c3d4e5f6
Revises: 
Create Date: 2026-07-08 14:20:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = '4bb602c32420'
down_revision = None
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    conn = op.get_bind()
    return inspect(conn).has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    conn = op.get_bind()
    columns = inspect(conn).get_columns(table_name)
    return any(c["name"] == column_name for c in columns)


def upgrade() -> None:
    if not _table_exists("members"):
        op.create_table(
            "members",
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("tg_username", sa.String(), nullable=True),
            sa.Column("tg_first_name", sa.String(), nullable=True),
            sa.Column("game_nick", sa.String(), nullable=False),
            sa.Column("real_name", sa.String(), nullable=False),
            sa.Column("discord_nick", sa.String(), nullable=True),
            sa.Column("perspective", sa.String(), nullable=False),
            sa.Column("level", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_inactive", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("is_legacy", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("last_match_at", sa.String(), nullable=True),
            sa.Column("last_match_checked_at", sa.String(), nullable=True),
            sa.Column("created_at", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("user_id"),
        )
    else:
        if not _column_exists("members", "level"):
            op.add_column(
                "members", sa.Column("level", sa.Integer(), nullable=False, server_default="0")
            )
        if not _column_exists("members", "is_inactive"):
            op.add_column(
                "members", sa.Column("is_inactive", sa.Boolean(), nullable=False, server_default="0")
            )
        if not _column_exists("members", "is_legacy"):
            op.add_column(
                "members", sa.Column("is_legacy", sa.Boolean(), nullable=False, server_default="0")
            )
        if not _column_exists("members", "last_match_at"):
            op.add_column("members", sa.Column("last_match_at", sa.String(), nullable=True))
        if not _column_exists("members", "last_match_checked_at"):
            op.add_column(
                "members", sa.Column("last_match_checked_at", sa.String(), nullable=True)
            )

    if not _table_exists("blacklist"):
        op.create_table(
            "blacklist",
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("reason", sa.String(), nullable=False),
            sa.Column("created_at", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("user_id"),
        )

    if not _table_exists("survey_progress"):
        op.create_table(
            "survey_progress",
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("step", sa.String(), nullable=False),
            sa.Column("game_nick", sa.String(), nullable=True),
            sa.Column("real_name", sa.String(), nullable=True),
            sa.Column("discord_nick", sa.String(), nullable=True),
            sa.Column("level", sa.Integer(), nullable=True),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.PrimaryKeyConstraint("user_id"),
        )
    else:
        if not _column_exists("survey_progress", "level"):
            op.add_column(
                "survey_progress", sa.Column("level", sa.Integer(), nullable=True)
            )

    if not _table_exists("group_members"):
        op.create_table(
            "group_members",
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("joined_at", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("user_id"),
        )


def downgrade() -> None:
    if _column_exists("survey_progress", "level"):
        op.drop_column("survey_progress", "level")
    if _column_exists("members", "is_legacy"):
        op.drop_column("members", "is_legacy")
    if _column_exists("members", "last_match_checked_at"):
        op.drop_column("members", "last_match_checked_at")
    if _column_exists("members", "last_match_at"):
        op.drop_column("members", "last_match_at")
    if _column_exists("members", "is_inactive"):
        op.drop_column("members", "is_inactive")
    if _column_exists("members", "level"):
        op.drop_column("members", "level")
