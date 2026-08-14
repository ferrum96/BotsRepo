"""Pydantic schemas for the dashboard API."""

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class MemberOut(BaseModel):
    user_id: int
    tg_username: Optional[str]
    tg_first_name: Optional[str]
    game_nick: str
    real_name: str
    discord_nick: Optional[str]
    perspective: str = ""
    join_date: str
    is_removed: bool

    class Config:
        from_attributes = True


class MemberUpdate(BaseModel):
    game_nick: str = Field(..., min_length=1, max_length=64)
    # Empty string = not filled in yet (imported without survey).
    real_name: str = Field("", max_length=64)
    discord_nick: Optional[str] = Field(None, max_length=64)
    # Empty string = unknown (imported without survey).
    perspective: Literal["FPP", "TPP", "Mixed", ""] = ""

    @field_validator("game_nick")
    @classmethod
    def strip_required(cls, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            raise ValueError("must not be empty")
        return cleaned

    @field_validator("real_name")
    @classmethod
    def strip_real_name(cls, value: str) -> str:
        return (value or "").strip()

    @field_validator("discord_nick")
    @classmethod
    def strip_optional(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("perspective")
    @classmethod
    def normalize_perspective(cls, value: str) -> str:
        return (value or "").strip()


class BlacklistOut(BaseModel):
    user_id: int
    tg_username: Optional[str] = None
    game_nick: Optional[str] = None
    real_name: Optional[str] = None
    discord_nick: Optional[str] = None
    reason: str
    created_at: str

    class Config:
        from_attributes = True


class InactiveMemberOut(BaseModel):
    user_id: int
    tg_username: Optional[str] = None
    game_nick: str
    real_name: str
    discord_nick: Optional[str]
    last_match_at: Optional[str]
    last_match_checked_at: Optional[str]

    class Config:
        from_attributes = True


class StatsOut(BaseModel):
    total_members: int
    total_blacklist: int
    perspective_stats: dict[str, int]


class HealthOut(BaseModel):
    status: str


class LoginIn(BaseModel):
    username: str
    password: str


class DashboardUserOut(BaseModel):
    id: int
    username: str
    display_name: str


class LoginOut(BaseModel):
    token: str
    user: DashboardUserOut


class MeOut(BaseModel):
    user: DashboardUserOut
