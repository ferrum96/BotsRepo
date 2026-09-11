from __future__ import annotations

from dataclasses import dataclass

import httpx
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.application.access_service import AccessService, ShopConfigService
from app.application.catalog_service import CatalogService
from app.application.content_generation_service import ContentGenerationService
from app.application.product_selection_service import ProductSelectionService
from app.application.publication_service import PublicationService
from app.application.scheduling_service import SchedulingService
from app.config import Settings
from app.infrastructure.ai.client import AIProvider, OpenAIResponsesClient
from app.infrastructure.http_files import HttpFileFetcher
from app.infrastructure.max_api.client import MaxApiClient
from app.max_bot.handlers import BotServices
from app.max_bot.message_renderer import render_max_post
from app.repositories.content_repository import ContentRepository
from app.repositories.import_job_repository import ImportJobRepository
from app.repositories.product_repository import ProductRepository
from app.repositories.publication_repository import PublicationRepository
from app.repositories.session_repository import SessionRepository
from app.repositories.shop_settings_repository import ShopSettingsRepository
from app.repositories.user_repository import UserRepository


@dataclass
class AppContainer:
    settings: Settings
    engine: AsyncEngine
    session_factory: async_sessionmaker[AsyncSession]
    http_client: httpx.AsyncClient
    max_client: MaxApiClient
    ai_client: AIProvider


def build_bot_services(
    session: AsyncSession,
    container: AppContainer,
    *,
    clock=None,
) -> BotServices:
    settings = container.settings
    users = UserRepository(session)
    products = ProductRepository(session)
    contents = ContentRepository(session)
    publications = PublicationRepository(session)
    import_jobs = ImportJobRepository(session)
    shop_settings = ShopSettingsRepository(session)
    sessions = SessionRepository(session)
    publication_service = PublicationService(
        products,
        contents,
        publications,
        container.max_client,
        container.http_client,
        session,
        render_max_post,
        max_image_size_bytes=settings.max_image_size_bytes,
        clock=clock,
    )
    return BotServices(
        access=AccessService(users, settings.allowed_user_ids),
        shop=ShopConfigService(
            shop_settings,
            env_channel_id=settings.max_channel_id,
            env_show_stock=settings.show_stock,
        ),
        catalog=CatalogService(
            products, import_jobs, max_csv_size_bytes=settings.max_csv_size_bytes
        ),
        selection=ProductSelectionService(products),
        content=ContentGenerationService(
            products,
            contents,
            publications,
            container.ai_client,
            model_name=settings.ai_model,
        ),
        publication=publication_service,
        scheduling=SchedulingService(publications, publication_service),
        sessions=sessions,
        files=HttpFileFetcher(container.http_client, max_token=settings.max_bot_token),
        timezone=settings.timezone,
        shop_name=settings.shop_name,
        max_csv_size_bytes=settings.max_csv_size_bytes,
    )


def build_ai_client(settings: Settings, http_client: httpx.AsyncClient) -> OpenAIResponsesClient:
    return OpenAIResponsesClient(
        api_key=settings.ai_api_key,
        base_url=settings.ai_api_base_url,
        model=settings.ai_model,
        timeout_seconds=settings.http_timeout_seconds,
        http_client=http_client,
    )
