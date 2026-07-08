"""Pydantic schemas for the dashboard API."""

from typing import Optional

from pydantic import BaseModel


class MemberOut(BaseModel):
    user_id: int
    tg_username: Optional[str]
    tg_first_name: Optional[str]
    game_nick: str
    real_name: str
    discord_nick: Optional[str]
    perspective: str
    join_date: str
    is_removed: bool

    class Config:
        from_attributes = True


class BlacklistOut(BaseModel):
    user_id: int
    game_nick: Optional[str] = None
    real_name: Optional[str] = None
    created_at: str

    class Config:
        from_attributes = True


class MemberToggleLegacy(BaseModel):
    is_legacy: bool


class StatsOut(BaseModel):
    total_members: int
    total_blacklist: int
    perspective_stats: dict[str, int]


class HealthOut(BaseModel):
    status: str
