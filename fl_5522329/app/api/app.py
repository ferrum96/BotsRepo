from __future__ import annotations

import logging

from aiogram import Bot, Dispatcher
from aiogram.types import BotCommand, Update
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.billing.subscription import user_is_pro
from app.config import Settings
from app.geo.coords import InputError, parse_birth_date, parse_birth_time, validate_coords
from app.geo.nominatim import search_places
from app.limits.service import TAROT, LimitService
from app.referral import referral_link, share_url
from app.services import increment_daily_limit, latest_chart, save_profile, upsert_user
from app.tarot.draw import draw_three, render_spread
from app.telegram_webapp import InitDataError, parse_init_data
from app.timeutil import msk_today

logger = logging.getLogger(__name__)

_DIST = __import__("pathlib").Path(__file__).resolve().parents[2] / "miniapp" / "dist"


class ProfileIn(BaseModel):
    birth_date: str
    birth_time: str
    birth_time_known: bool = True
    birth_place: str = Field(min_length=1, max_length=200)
    latitude: float
    longitude: float


@asynccontextmanager
async def _lifespan(app: FastAPI):
    bot: Bot = app.state.bot
    dispatcher: Dispatcher = app.state.dispatcher
    settings: Settings = app.state.settings
    await setup_bot_commands(bot)
    polling = None
    if settings.use_webhook:
        await bot.set_webhook(
            settings.webhook_url,
            secret_token=settings.webhook_secret or None,
        )
    else:
        polling = asyncio.create_task(dispatcher.start_polling(bot, handle_signals=False))
    try:
        yield
    finally:
        if polling is not None:
            await dispatcher.stop_polling()
            polling.cancel()
            try:
                await polling
            except asyncio.CancelledError:
                pass
        await bot.session.close()
        await app.state.http_client.aclose()
        await app.state.redis.aclose()
        await app.state.engine.dispose()


def create_api(
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    bot: Bot,
    dispatcher: Dispatcher,
    limit_service: LimitService,
    http_client,
) -> FastAPI:
    app = FastAPI(title="astro-bot", docs_url=None, redoc_url=None, lifespan=_lifespan)
    app.state.settings = settings
    app.state.session_factory = session_factory
    app.state.bot = bot
    app.state.dispatcher = dispatcher
    app.state.limit_service = limit_service
    app.state.http_client = http_client

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok"}

    @app.post("/webhook")
    async def webhook(request: Request) -> JSONResponse:
        if settings.webhook_secret:
            token = request.headers.get("x-telegram-bot-api-secret-token")
            if token != settings.webhook_secret:
                raise HTTPException(status_code=403, detail="bad webhook secret")
        update = Update.model_validate(await request.json(), context={"bot": bot})
        await dispatcher.feed_update(bot, update)
        return JSONResponse({"ok": True})

    @app.get("/api/geocode")
    async def geocode(request: Request, q: str) -> dict:
        async with session_factory() as session:
            await _user_from_request(request, settings, session)
            await session.commit()
        try:
            hits = await search_places(http_client, q, user_agent=settings.nominatim_user_agent)
        except InputError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {
            "results": [
                {"label": hit.label, "latitude": hit.latitude, "longitude": hit.longitude}
                for hit in hits
            ]
        }

    @app.post("/api/profile")
    async def profile(request: Request, body: ProfileIn) -> dict:
        async with session_factory() as session:
            user = await _user_from_request(request, settings, session)
            try:
                birth_date = parse_birth_date(body.birth_date)
                if body.birth_time_known:
                    birth_time, known = parse_birth_time(body.birth_time)
                else:
                    birth_time, known = parse_birth_time("не знаю")
                validate_coords(body.latitude, body.longitude)
                row = await save_profile(
                    session,
                    user.telegram_id,
                    birth_date=birth_date,
                    birth_time=birth_time,
                    birth_time_known=known,
                    birth_place=body.birth_place.strip(),
                    latitude=body.latitude,
                    longitude=body.longitude,
                )
            except (InputError, ValueError) as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            await session.commit()
            return {
                "sun_sign": row.sun_sign,
                "moon_sign": row.moon_sign,
                "ascendant_sign": row.ascendant_sign,
                "birth_time_known": row.birth_time_known,
            }

    @app.get("/api/me")
    async def me(request: Request) -> dict:
        async with session_factory() as session:
            user = await _user_from_request(request, settings, session)
            row = await latest_chart(session, user.telegram_id)
            is_pro = await user_is_pro(session, user.telegram_id)
            username = await _bot_username(bot)
            await session.commit()
        link = referral_link(username, user.telegram_id) if username else ""
        payload = {
            "is_pro": is_pro,
            "chart": None,
            "referral_link": link,
            "share_url": share_url(link) if link else "",
        }
        if row is not None:
            payload["chart"] = {
                "sun_sign": row.sun_sign,
                "moon_sign": row.moon_sign,
                "ascendant_sign": row.ascendant_sign,
                "birth_place": row.birth_place,
            }
        return payload

    @app.post("/api/tarot")
    async def tarot(request: Request) -> dict:
        async with session_factory() as session:
            user = await _user_from_request(request, settings, session)
            if await latest_chart(session, user.telegram_id) is None:
                raise HTTPException(status_code=400, detail="Сначала сохрани дату рождения")
            is_pro = await user_is_pro(session, user.telegram_id)
            decision = await limit_service.consume(user.telegram_id, TAROT, is_pro)
            if not decision.allowed:
                raise HTTPException(status_code=402, detail="Лимит таро на сегодня исчерпан")
            if not is_pro:
                await increment_daily_limit(session, user.telegram_id, TAROT, msk_today())
            await session.commit()
        cards = draw_three()
        return {
            "text": render_spread(cards),
            "cards": [
                {"position": item.position, "name": item.card.name, "meaning": item.card.meaning}
                for item in cards
            ],
        }

    @app.post("/api/invoice")
    async def invoice(request: Request) -> dict:
        async with session_factory() as session:
            user = await _user_from_request(request, settings, session)
            await session.commit()
        from aiogram.types import LabeledPrice

        link = await bot.create_invoice_link(
            title="Pro на 30 дней",
            description="Подписка Pro, 299 ₽/мес, оплата в Telegram Stars.",
            payload=f"pro:{user.telegram_id}",
            currency="XTR",
            prices=[LabeledPrice(label="Pro 30 дней", amount=settings.pro_price_stars)],
        )
        return {"url": link}

    if _DIST.is_dir():
        app.mount("/", StaticFiles(directory=_DIST, html=True), name="miniapp")
    return app


async def _user_from_request(request: Request, settings: Settings, session: AsyncSession):
    if settings.allow_insecure_init_data:
        raw_id = request.headers.get("x-dev-user-id", "")
        if raw_id.isdigit():
            return await upsert_user(session, int(raw_id), None)
    raw = request.headers.get("x-telegram-init-data", "")
    try:
        parsed = parse_init_data(
            raw,
            settings.bot_token,
            max_age_seconds=settings.init_data_max_age_seconds,
        )
    except InitDataError as exc:
        raise HTTPException(status_code=401, detail="init data rejected") from exc
    return await upsert_user(session, parsed["id"], parsed["username"])


async def _bot_username(bot: Bot) -> str:
    cached = getattr(bot, "_astro_username", "")
    if cached:
        return cached
    me = await bot.get_me()
    username = me.username or ""
    setattr(bot, "_astro_username", username)
    return username


async def setup_bot_commands(bot: Bot) -> None:
    await bot.set_my_commands(
        [
            BotCommand(command="start", description="Старт"),
            BotCommand(command="profile", description="Дата рождения"),
            BotCommand(command="horoscope", description="Гороскоп дня"),
            BotCommand(command="tarot", description="Три карты"),
            BotCommand(command="synastry", description="Совместимость, Pro"),
            BotCommand(command="monthly", description="Прогноз на месяц, Pro"),
            BotCommand(command="pro", description="Подписка Pro"),
            BotCommand(command="invite", description="Пригласить друга"),
            BotCommand(command="cancel", description="Сбросить форму"),
        ]
    )
