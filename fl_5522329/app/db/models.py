from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Integer,
    Numeric,
    PrimaryKeyConstraint,
    Text,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.db.base import Base
from app.db.types import AwareDateTime

JSON_TYPE = JSON().with_variant(JSONB(), "postgresql")


class User(Base):
    __tablename__ = "users"

    telegram_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    username: Mapped[str | None] = mapped_column(Text, nullable=True)
    language: Mapped[str] = mapped_column(Text, nullable=False, server_default="ru")
    created_at: Mapped[datetime] = mapped_column(
        AwareDateTime(), nullable=False, server_default=func.now()
    )
    disclaimer_accepted_at: Mapped[datetime | None] = mapped_column(
        AwareDateTime(), nullable=True
    )
    referred_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id"), nullable=True
    )


class NatalChart(Base):
    __tablename__ = "natal_charts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id", ondelete="CASCADE"), nullable=False
    )
    birth_date: Mapped[date] = mapped_column(Date, nullable=False)
    birth_time: Mapped[time] = mapped_column(Time, nullable=False)
    birth_time_known: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    birth_place: Mapped[str] = mapped_column(Text, nullable=False)
    latitude: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    longitude: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    timezone_name: Mapped[str] = mapped_column(Text, nullable=False)
    sun_sign: Mapped[str] = mapped_column(Text, nullable=False)
    moon_sign: Mapped[str] = mapped_column(Text, nullable=False)
    ascendant_sign: Mapped[str] = mapped_column(Text, nullable=False)
    aspects: Mapped[list] = mapped_column(JSON_TYPE, nullable=False)
    houses: Mapped[list] = mapped_column(JSON_TYPE, nullable=False)
    planets: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False)
    chart_json: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False)
    calculated_at: Mapped[datetime] = mapped_column(
        AwareDateTime(), nullable=False, server_default=func.now()
    )


class Subscription(Base):
    __tablename__ = "subscriptions"
    __table_args__ = (
        PrimaryKeyConstraint("user_id", "start_date"),
        UniqueConstraint("charge_id"),
        CheckConstraint("status IN ('active', 'expired', 'cancelled')", name="ck_subscription_status"),
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id", ondelete="CASCADE"), nullable=False
    )
    start_date: Mapped[datetime] = mapped_column(AwareDateTime(), nullable=False)
    end_date: Mapped[datetime] = mapped_column(AwareDateTime(), nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    charge_id: Mapped[str | None] = mapped_column(Text, nullable=True)


class DailyLimit(Base):
    __tablename__ = "daily_limits"
    __table_args__ = (PrimaryKeyConstraint("user_id", "date"),)

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    tarot_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    ai_questions: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")


class ChatHistory(Base):
    __tablename__ = "chat_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id", ondelete="CASCADE"), nullable=False
    )
    message_text: Mapped[str] = mapped_column(Text, nullable=False)
    is_user: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        AwareDateTime(), nullable=False, server_default=func.now()
    )
