from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class IncomingFile:
    url: str
    filename: str
    size: int | None
    mime_type: str | None
    token: str | None = None


@dataclass(slots=True)
class IncomingEvent:
    update_type: str
    max_user_id: int | None
    username: str | None
    chat_id: int | None
    text: str | None
    callback_payload: str | None
    callback_id: str | None
    file: IncomingFile | None = None
    is_channel: bool = False
    raw: dict[str, Any] = field(default_factory=dict)


def map_update(payload: dict[str, Any]) -> IncomingEvent:
    update_type = str(payload.get("update_type") or payload.get("updateType") or "")
    if update_type == "bot_started":
        user = payload.get("user") or {}
        return IncomingEvent(
            update_type=update_type,
            max_user_id=_int(user.get("user_id")),
            username=user.get("username"),
            chat_id=_int(payload.get("chat_id")),
            text="/start",
            callback_payload=None,
            callback_id=None,
            raw=payload,
        )
    if update_type == "bot_added":
        user = payload.get("user") or {}
        return IncomingEvent(
            update_type=update_type,
            max_user_id=_int(user.get("user_id")),
            username=user.get("username"),
            chat_id=_int(payload.get("chat_id")),
            text=None,
            callback_payload=None,
            callback_id=None,
            is_channel=bool(payload.get("is_channel")),
            raw=payload,
        )
    if update_type == "message_callback":
        callback = payload.get("callback") or {}
        user = callback.get("user") or {}
        message = payload.get("message") or {}
        recipient = message.get("recipient") or {}
        return IncomingEvent(
            update_type=update_type,
            max_user_id=_int(user.get("user_id")),
            username=user.get("username"),
            chat_id=_int(recipient.get("chat_id") or payload.get("chat_id")),
            text=None,
            callback_payload=callback.get("payload"),
            callback_id=callback.get("callback_id"),
            raw=payload,
        )
    if update_type in {"message_created", "message_edited"}:
        message = payload.get("message") or payload
        sender = message.get("sender") or {}
        recipient = message.get("recipient") or {}
        body = message.get("body") or {}
        text = body.get("text") if isinstance(body, dict) else message.get("text")
        attachments = body.get("attachments") if isinstance(body, dict) else message.get("attachments")
        return IncomingEvent(
            update_type=update_type,
            max_user_id=_int(sender.get("user_id")),
            username=sender.get("username"),
            chat_id=_int(recipient.get("chat_id") or payload.get("chat_id")),
            text=text,
            callback_payload=None,
            callback_id=None,
            file=_extract_file(attachments),
            raw=payload,
        )
    if update_type == "message_removed":
        return IncomingEvent(
            update_type=update_type,
            max_user_id=_int(payload.get("user_id")),
            username=None,
            chat_id=_int(payload.get("chat_id")),
            text=None,
            callback_payload=None,
            callback_id=None,
            raw=payload,
        )
    return IncomingEvent(
        update_type=update_type or "unknown",
        max_user_id=None,
        username=None,
        chat_id=None,
        text=None,
        callback_payload=None,
        callback_id=None,
        raw=payload,
    )


def _extract_file(attachments: Any) -> IncomingFile | None:
    if not isinstance(attachments, list):
        return None
    for item in attachments:
        if not isinstance(item, dict):
            continue
        if item.get("type") not in {"file", "document"}:
            continue
        payload = item.get("payload") or {}
        url = payload.get("url")
        if not url:
            continue
        filename = payload.get("filename") or payload.get("name") or "catalog.csv"
        size = payload.get("size")
        return IncomingFile(
            url=str(url),
            filename=str(filename),
            size=int(size) if size is not None else None,
            mime_type=payload.get("mime_type") or payload.get("content_type"),
            token=payload.get("token"),
        )
    return None


def _int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
