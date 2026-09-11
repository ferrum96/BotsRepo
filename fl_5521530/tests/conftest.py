from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.application.access_service import AccessService, ShopConfigService
from app.application.catalog_service import CatalogService
from app.application.content_generation_service import ContentGenerationService
from app.application.product_selection_service import ProductSelectionService
from app.application.publication_service import PublicationService, UtcClock
from app.application.scheduling_service import SchedulingService
from app.config import Settings
from app.domain.enums import ContentStatus, PublicationStatus, UserRole
from app.infrastructure.ai.schemas import ProductContentSchema
from app.infrastructure.database.models import Base
from app.infrastructure.max_api.models import SentMessage, UploadSlot
from app.max_bot.handlers import BotServices
from app.max_bot.message_renderer import render_max_post
from app.repositories.content_repository import ContentRepository
from app.repositories.import_job_repository import ImportJobRepository
from app.repositories.product_repository import ProductRepository
from app.repositories.publication_repository import PublicationRepository
from app.repositories.session_repository import SessionRepository
from app.repositories.shop_settings_repository import ShopSettingsRepository
from app.repositories.user_repository import UserRepository

VALID_CSV = (
    "sku,name,category,description,price,currency,stock,image_url,color\n"
    "SKU-1,Tea,Drinks,Black tea,10.50,EUR,5,https://cdn.example.com/tea.jpg,black\n"
    "SKU-2,Mug,Kitchen,Ceramic mug,4,EUR,12,,white\n"
)


class FakeAI:
    def __init__(self, payload: dict | None = None) -> None:
        self.calls: list[dict] = []
        self.payload = payload or {
            "title": "Чёрный чай",
            "description": "Ароматный чай для ежедневного ритуала.",
            "benefits": ["Насыщенный вкус", "Удобная упаковка"],
            "call_to_action": "Закажите сегодня",
            "hashtags": ["#чай", "#магазин"],
        }

    async def generate_product_content(self, product_data: dict, *, show_stock: bool):
        self.calls.append({"product_data": product_data, "show_stock": show_stock})
        return ProductContentSchema.model_validate(self.payload)


class FakeMessenger:
    def __init__(self) -> None:
        self.sent: list[dict] = []
        self.fail_with: Exception | None = None
        self.upload_fail: Exception | None = None

    async def send_message(self, **kwargs):
        if self.fail_with:
            raise self.fail_with
        self.sent.append(kwargs)
        return SentMessage(message_id="mid.1", chat_id=kwargs.get("chat_id"), raw={})

    async def answer_callback(self, callback_id: str, **kwargs) -> None:
        return None

    async def prepare_image_upload(self) -> UploadSlot:
        return UploadSlot(url="https://iu.oneme.ru/upload", token=None)

    async def upload_file(self, upload_url: str, data: bytes, filename: str) -> str:
        if self.upload_fail:
            raise self.upload_fail
        return "upload-token"


class FakeFiles:
    def __init__(self, content: bytes) -> None:
        self.content = content
        self.urls: list[str] = []

    async def fetch(self, url: str, *, max_bytes: int) -> bytes:
        self.urls.append(url)
        if len(self.content) > max_bytes:
            raise AssertionError("file too large")
        return self.content


class FrozenClock(UtcClock):
    def __init__(self, now: datetime) -> None:
        self._now = now

    def now(self) -> datetime:
        return self._now


@pytest.fixture
def settings() -> Settings:
    return Settings(
        max_bot_token="test-token",
        max_webhook_secret="webhook_secret_value",
        max_webhook_url="https://example.com/api/max/webhook",
        max_channel_id=777,
        allowed_max_user_ids="1001,1002",
        database_url="sqlite+aiosqlite://",
        ai_api_key="sk-test",
        shop_name="Test Shop",
        timezone="Europe/Vilnius",
        show_stock=True,
        max_csv_size_mb=1,
        max_image_size_mb=1,
    )


@pytest.fixture
async def session() -> AsyncSession:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    async with factory() as db:
        yield db
        await db.rollback()
    await engine.dispose()


@pytest.fixture
def messenger() -> FakeMessenger:
    return FakeMessenger()


@pytest.fixture
def ai() -> FakeAI:
    return FakeAI()


@pytest.fixture
def clock() -> FrozenClock:
    return FrozenClock(datetime(2026, 9, 11, 12, 0, tzinfo=UTC))


@pytest.fixture
async def services(session: AsyncSession, settings: Settings, messenger: FakeMessenger, ai: FakeAI, clock: FrozenClock):
    http_client = httpx.AsyncClient()
    products = ProductRepository(session)
    contents = ContentRepository(session)
    publications = PublicationRepository(session)
    publication_service = PublicationService(
        products,
        contents,
        publications,
        messenger,
        http_client,
        session,
        render_max_post,
        max_image_size_bytes=settings.max_image_size_bytes,
        clock=clock,
    )
    bundle = BotServices(
        access=AccessService(UserRepository(session), settings.allowed_user_ids),
        shop=ShopConfigService(
            ShopSettingsRepository(session),
            env_channel_id=settings.max_channel_id,
            env_show_stock=settings.show_stock,
        ),
        catalog=CatalogService(
            products,
            ImportJobRepository(session),
            max_csv_size_bytes=settings.max_csv_size_bytes,
        ),
        selection=ProductSelectionService(products),
        content=ContentGenerationService(
            products, contents, publications, ai, model_name="test-model"
        ),
        publication=publication_service,
        scheduling=SchedulingService(publications, publication_service),
        sessions=SessionRepository(session),
        files=FakeFiles(VALID_CSV.encode()),
        timezone=settings.timezone,
        shop_name=settings.shop_name,
        max_csv_size_bytes=settings.max_csv_size_bytes,
    )
    try:
        yield bundle
    finally:
        await http_client.aclose()


async def add_user(session: AsyncSession, max_user_id: int = 1001):
    repo = UserRepository(session)
    return await repo.upsert(
        max_user_id=max_user_id, username="alice", role=UserRole.ADMIN
    )


async def add_product(session: AsyncSession, sku: str = "SKU-1", **kwargs):
    repo = ProductRepository(session)
    product, _ = await repo.upsert_by_sku(
        sku=sku,
        name=kwargs.get("name", "Tea"),
        category=kwargs.get("category", "Drinks"),
        description=kwargs.get("description", "Black tea"),
        price=kwargs.get("price", Decimal("10.50")),
        currency=kwargs.get("currency", "EUR"),
        stock=kwargs.get("stock", 5),
        image_url=kwargs.get("image_url"),
        source_data=kwargs.get("source_data", {}),
        is_active=kwargs.get("is_active", True),
    )
    return product


async def add_content_and_publication(services: BotServices, product_id: int):
    return await services.content.generate(product_id, show_stock=True)
