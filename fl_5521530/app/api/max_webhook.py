from __future__ import annotations

import hmac
import logging

from fastapi import APIRouter, Header, HTTPException, Request, status

from app.container import build_bot_services
from app.infrastructure.database.session import session_scope
from app.max_bot.dto import BotResponse
from app.max_bot.handlers import dispatch
from app.max_bot.update_mapper import map_update

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/api/max/webhook")
async def max_webhook(
    request: Request,
    x_max_bot_api_secret: str | None = Header(default=None, alias="X-Max-Bot-Api-Secret"),
) -> dict[str, bool]:
    container = request.app.state.container
    expected = container.settings.max_webhook_secret
    if not x_max_bot_api_secret or not hmac.compare_digest(x_max_bot_api_secret, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid webhook secret")
    payload = await request.json()
    event = map_update(payload)
    logger.info("max update type=%s", event.update_type)
    async with session_scope(container.session_factory) as session:
        services = build_bot_services(session, container)
        response = await dispatch(event, services)
    await _deliver(container.max_client, event, response)
    return {"ok": True}


async def _deliver(max_client, event, response: BotResponse) -> None:
    if response.silent:
        if event.callback_id:
            await max_client.answer_callback(event.callback_id)
        return
    message_body = {
        "text": response.text or "",
        "attachments": response.attachments or None,
        "format": response.format,
    }
    if event.callback_id and response.replace_original:
        await max_client.answer_callback(event.callback_id, message=message_body)
        return
    if event.callback_id:
        await max_client.answer_callback(event.callback_id)
    if response.text and event.max_user_id is not None:
        await max_client.send_message(
            user_id=event.max_user_id,
            text=response.text,
            attachments=response.attachments or None,
            format=response.format,
        )
