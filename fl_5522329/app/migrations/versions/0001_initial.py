"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-09-22
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("telegram_id", sa.BigInteger(), primary_key=True),
        sa.Column("username", sa.Text(), nullable=True),
        sa.Column("language", sa.Text(), nullable=False, server_default="ru"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("disclaimer_accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("referred_by", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(["referred_by"], ["users.telegram_id"]),
    )
    op.create_table(
        "natal_charts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("birth_date", sa.Date(), nullable=False),
        sa.Column("birth_time", sa.Time(), nullable=False),
        sa.Column("birth_time_known", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("birth_place", sa.Text(), nullable=False),
        sa.Column("latitude", sa.Numeric(9, 6), nullable=False),
        sa.Column("longitude", sa.Numeric(9, 6), nullable=False),
        sa.Column("timezone_name", sa.Text(), nullable=False),
        sa.Column("sun_sign", sa.Text(), nullable=False),
        sa.Column("moon_sign", sa.Text(), nullable=False),
        sa.Column("ascendant_sign", sa.Text(), nullable=False),
        sa.Column("aspects", postgresql.JSONB(), nullable=False),
        sa.Column("houses", postgresql.JSONB(), nullable=False),
        sa.Column("planets", postgresql.JSONB(), nullable=False),
        sa.Column("chart_json", postgresql.JSONB(), nullable=False),
        sa.Column(
            "calculated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.telegram_id"], ondelete="CASCADE"),
    )
    op.create_index("ix_natal_charts_user_id", "natal_charts", ["user_id"])
    op.create_table(
        "subscriptions",
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("charge_id", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("user_id", "start_date"),
        sa.UniqueConstraint("charge_id"),
        sa.CheckConstraint(
            "status IN ('active', 'expired', 'cancelled')",
            name="ck_subscription_status",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.telegram_id"], ondelete="CASCADE"),
    )
    op.create_table(
        "daily_limits",
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("tarot_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ai_questions", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("user_id", "date"),
        sa.ForeignKeyConstraint(["user_id"], ["users.telegram_id"], ondelete="CASCADE"),
    )
    op.create_table(
        "chat_history",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("message_text", sa.Text(), nullable=False),
        sa.Column("is_user", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.telegram_id"], ondelete="CASCADE"),
    )
    op.create_index("ix_chat_history_user_created", "chat_history", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_table("chat_history")
    op.drop_table("daily_limits")
    op.drop_table("subscriptions")
    op.drop_table("natal_charts")
    op.drop_table("users")
