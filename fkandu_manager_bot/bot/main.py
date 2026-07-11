"""Entry point for the FKandu bot."""

import logging
import asyncio
import socket

_original_getaddrinfo = socket.getaddrinfo


def _ipv4_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    return _original_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)


socket.getaddrinfo = _ipv4_getaddrinfo

from typing import Any

from aiohttp import web
from aiogram import Bot, Dispatcher
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.fsm.storage.memory import MemoryStorage

from bot.config import Config
from bot.database import Database
from bot.handlers import lead_form_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


class IPv4AiohttpSession(AiohttpSession):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        if self._proxy is None:
            self._connector_init["family"] = socket.AF_INET
            self._connector_init["happy_eyeballs_delay"] = None
        self._connector_init["force_close"] = True


async def handle_file(request: web.Request) -> web.Response:
    db: Database = request.app["db"]
    file_id = int(request.match_info["file_id"])
    row = db.get_file(file_id)
    if not row:
        return web.Response(status=404, text="Not found")
    filename, mime_type, data = row
    return web.Response(
        body=data,
        content_type=mime_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


async def main():
    config = Config.from_env()
    db = Database(config.db_path)
    logger.info(f"База данных: {config.db_path}")

    session_kwargs: dict[str, Any] = {}
    if config.proxy_url:
        session_kwargs["proxy"] = config.proxy_url
        logger.info("Используется прокси для Telegram API")
    session = IPv4AiohttpSession(**session_kwargs)
    bot = Bot(token=config.bot_token, session=session)
    dp = Dispatcher(storage=MemoryStorage())

    dp.include_router(lead_form_router)

    dp["config"] = config
    dp["db"] = db
    dp["bot"] = bot

    app = web.Application()
    app["db"] = db
    app.router.add_get("/files/{file_id}", handle_file)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, config.file_server_host, config.file_server_port)
    await site.start()
    logger.info(
        f"✅ Файловый сервер запущен на {config.file_server_host}:{config.file_server_port}"
    )

    logger.info("Запуск бота...")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
