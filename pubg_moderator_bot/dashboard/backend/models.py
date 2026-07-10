"""SQLAlchemy models used by the dashboard API and Alembic."""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean,
    Column,
    Integer,
    String,
    create_engine,
)
from sqlalchemy.orm import declarative_base, sessionmaker

from bot.config import Config

Base = declarative_base()


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


class MemberORM(Base):
    __tablename__ = "members"

    user_id = Column(Integer, primary_key=True)
    tg_username = Column(String)
    tg_first_name = Column(String)
    game_nick = Column(String, nullable=False)
    real_name = Column(String, nullable=False)
    discord_nick = Column(String)
    perspective = Column(String, nullable=False)
    is_inactive = Column(Boolean, nullable=False, default=False)
    is_legacy = Column(Boolean, nullable=False, default=False)
    last_match_at = Column(String, nullable=True)
    last_match_checked_at = Column(String, nullable=True)
    created_at = Column(String, nullable=False, default=lambda: _now_utc().isoformat())


class BlacklistORM(Base):
    __tablename__ = "blacklist"

    user_id = Column(Integer, primary_key=True)
    reason = Column(String, nullable=False)
    created_at = Column(String, nullable=False, default=lambda: _now_utc().isoformat())


class SurveyProgressORM(Base):
    __tablename__ = "survey_progress"

    user_id = Column(Integer, primary_key=True)
    step = Column(String, nullable=False)
    game_nick = Column(String)
    real_name = Column(String)
    discord_nick = Column(String)
    perspective = Column(String)
    attempts = Column(Integer, nullable=False, default=0)


class GroupMemberORM(Base):
    __tablename__ = "group_members"

    user_id = Column(Integer, primary_key=True)
    joined_at = Column(String, nullable=False, default=lambda: _now_utc().isoformat())


def make_engine(database_path: str):
    # Alembic and SQLAlchemy work with a sync sqlite connection.
    return create_engine(
        f"sqlite:///{database_path}",
        connect_args={"check_same_thread": False},
    )


def make_session(engine):
    return sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db_url(config: Optional[Config] = None) -> str:
    if config is None:
        config = Config.from_env()
    return f"sqlite:///{config.database_path}"
