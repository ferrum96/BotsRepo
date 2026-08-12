"""Dashboard authentication helpers (JWT + API key fallback)."""

from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import HTTPException, Request, WebSocket
from fastapi.security import APIKeyHeader, HTTPBearer
from starlette.status import HTTP_401_UNAUTHORIZED

from bot.config import Config

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer(auto_error=False)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


@dataclass
class DashboardUserOut:
    id: int
    username: str
    display_name: str


DEFAULT_JWT_SECRET = "bb-clan-dashboard-dev-secret-change-me"


def get_jwt_secret() -> str:
    secret = Config.from_env().dashboard_jwt_secret
    if secret:
        return secret
    logger.warning(
        "DASHBOARD_JWT_SECRET is not set; using insecure default dev secret"
    )
    return DEFAULT_JWT_SECRET


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode(
        "utf-8"
    )


def _verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(
            password.encode("utf-8"), password_hash.encode("utf-8")
        )
    except ValueError:
        return False


def create_token(user: DashboardUserOut) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "display_name": user.display_name,
        "iat": now,
        "exp": now + timedelta(days=7),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm="HS256")


def _parse_user_id(value: object) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def decode_token(token: str) -> Optional[DashboardUserOut]:
    try:
        payload = jwt.decode(
            token, get_jwt_secret(), algorithms=["HS256"], options={"require": ["exp"]}
        )
    except jwt.PyJWTError as exc:
        logger.debug("JWT decode failed: %s", exc)
        return None

    user_id = _parse_user_id(payload.get("sub"))
    username = payload.get("username")
    display_name = payload.get("display_name")
    if user_id is None or not isinstance(username, str) or not isinstance(display_name, str):
        return None
    return DashboardUserOut(id=user_id, username=username, display_name=display_name)


def _extract_bearer_token(request: Request) -> Optional[str]:
    header = request.headers.get("Authorization")
    if not isinstance(header, str) or not header.startswith("Bearer "):
        return None
    return header[7:].strip()


async def require_auth_user(request: Request) -> DashboardUserOut:
    """Require a valid JWT Bearer token for dashboard users."""
    token = _extract_bearer_token(request)
    if token:
        user = decode_token(token)
        if user is not None:
            return user
    raise HTTPException(
        status_code=HTTP_401_UNAUTHORIZED, detail="Invalid or missing token"
    )


async def verify_dashboard_token_or_api_key(websocket: WebSocket) -> bool:
    """Verify WebSocket connection via JWT token or configured API key."""
    token = websocket.query_params.get("token", "")
    if not isinstance(token, str) or not token:
        return False
    expected = Config.from_env().dashboard_api_key
    if expected and len(token) == len(expected) and secrets.compare_digest(token, expected):
        return True
    return decode_token(token) is not None


__all__ = [
    "DashboardUserOut",
    "api_key_header",
    "bearer_scheme",
    "create_token",
    "decode_token",
    "require_auth_user",
    "verify_dashboard_token_or_api_key",
    "_hash_password",
    "_verify_password",
]
