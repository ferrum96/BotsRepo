from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timezone
from urllib.parse import parse_qsl


class InitDataError(ValueError):
    pass


def _data_check_string(pairs: list[tuple[str, str]]) -> str:
    return "\n".join(f"{key}={value}" for key, value in sorted(pairs))


def parse_init_data(
    raw: str,
    bot_token: str,
    *,
    max_age_seconds: int = 86400,
    now: datetime | None = None,
) -> dict:
    if not raw or not bot_token:
        raise InitDataError("init data or bot token is empty")
    pairs = parse_qsl(raw, keep_blank_values=True, strict_parsing=True)
    received = ""
    unsigned: list[tuple[str, str]] = []
    for key, value in pairs:
        if key == "hash":
            received = value
        else:
            unsigned.append((key, value))
    if not received:
        raise InitDataError("hash is missing")
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calculated = hmac.new(secret, _data_check_string(unsigned).encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calculated, received):
        raise InitDataError("hash mismatch")
    mapping = dict(unsigned)
    try:
        auth_date = int(mapping["auth_date"])
        user = json.loads(mapping["user"])
        user_id = int(user["id"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise InitDataError("init data user is invalid") from exc
    moment = now or datetime.now(timezone.utc)
    age = int(moment.timestamp()) - auth_date
    if age < -60 or age > max_age_seconds:
        raise InitDataError("init data expired")
    username = user.get("username")
    return {"id": user_id, "username": username if isinstance(username, str) else None}
