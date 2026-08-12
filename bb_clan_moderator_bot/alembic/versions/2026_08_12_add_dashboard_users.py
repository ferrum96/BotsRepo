"""add dashboard_users table

Revision ID: 8f9e2d1a4b7c
Revises: 4bb602c32420
Create Date: 2026-08-12 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = '8f9e2d1a4b7c'
down_revision = '4bb602c32420'
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    conn = op.get_bind()
    return inspect(conn).has_table(table_name)


def upgrade() -> None:
    if not _table_exists("dashboard_users"):
        op.create_table(
            "dashboard_users",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("username", sa.String(), nullable=False),
            sa.Column("password_hash", sa.String(), nullable=False),
            sa.Column("display_name", sa.String(), nullable=False),
            sa.Column("created_at", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("username"),
        )


def downgrade() -> None:
    if _table_exists("dashboard_users"):
        op.drop_table("dashboard_users")
