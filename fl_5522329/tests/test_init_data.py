import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import pytest

from app.telegram_webapp import InitDataError, parse_init_data


def _sign(fields: dict, token: str) -> str:
    pairs = [(key, value) for key, value in fields.items()]
    check = "\n".join(f"{key}={value}" for key, value in sorted(pairs))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    digest = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode([*pairs, ("hash", digest)])


def test_init_data_roundtrip():
    now = datetime(2026, 9, 22, 12, tzinfo=timezone.utc)
    raw = _sign(
        {
            "auth_date": str(int(now.timestamp())),
            "query_id": "abc",
            "user": json.dumps({"id": 77, "username": "ada"}, separators=(",", ":")),
        },
        "token",
    )
    parsed = parse_init_data(raw, "token", now=now)
    assert parsed == {"id": 77, "username": "ada"}
    with pytest.raises(InitDataError):
        parse_init_data(raw + "x", "token", now=now)
    with pytest.raises(InitDataError):
        parse_init_data(raw, "token", now=now + timedelta(days=3))
