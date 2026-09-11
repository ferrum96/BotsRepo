from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class MaxMessagePayload:
    text: str
    attachments: list[dict[str, Any]] = field(default_factory=list)
    format: str | None = "markdown"


@dataclass(slots=True)
class SentMessage:
    message_id: str | None
    chat_id: int | None
    raw: dict[str, Any]


@dataclass(slots=True)
class BotInfo:
    user_id: int
    username: str | None
    first_name: str | None
    raw: dict[str, Any]


@dataclass(slots=True)
class UploadSlot:
    url: str
    token: str | None
