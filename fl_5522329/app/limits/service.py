from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from redis.asyncio import Redis

from app.config import Settings
from app.timeutil import msk_today, seconds_until_msk_midnight

TAROT = "tarot"
AI = "ai"


@dataclass(frozen=True)
class LimitDecision:
    allowed: bool
    used: int
    cap: int | None


class LimitService:
    def __init__(self, redis: Redis, settings: Settings) -> None:
        self.redis = redis
        self.settings = settings

    def cap_for(self, kind: str, is_pro: bool) -> int | None:
        if is_pro:
            return None
        if kind == TAROT:
            return self.settings.free_tarot_per_day
        if kind == AI:
            return self.settings.free_ai_per_day
        raise ValueError(f"unknown limit kind: {kind}")

    def key(self, user_id: int, kind: str, now: datetime | None = None) -> str:
        day = msk_today(now or datetime.now(timezone.utc)).isoformat()
        return f"limit:{user_id}:{day}:{kind}"

    async def consume(self, user_id: int, kind: str, is_pro: bool, now: datetime | None = None) -> LimitDecision:
        cap = self.cap_for(kind, is_pro)
        if cap is None:
            return LimitDecision(allowed=True, used=0, cap=None)
        if cap == 0:
            return LimitDecision(allowed=False, used=0, cap=0)
        moment = now or datetime.now(timezone.utc)
        key = self.key(user_id, kind, moment)
        used = int(await self.redis.incr(key))
        if used == 1:
            await self.redis.expire(key, seconds_until_msk_midnight(moment))
        if used > cap:
            return LimitDecision(allowed=False, used=used, cap=cap)
        return LimitDecision(allowed=True, used=used, cap=cap)

    async def refund(self, user_id: int, kind: str, now: datetime | None = None) -> None:
        key = self.key(user_id, kind, now)
        current = await self.redis.get(key)
        if current is None:
            return
        used = int(current)
        if used <= 1:
            await self.redis.delete(key)
            return
        await self.redis.decr(key)
