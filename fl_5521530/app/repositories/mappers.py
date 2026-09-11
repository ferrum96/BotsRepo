from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import inspect as sa_inspect

from app.domain.entities import (
    GeneratedContent,
    ImportJob,
    Product,
    Publication,
    ShopSettings,
    User,
    UserSession,
)
from app.domain.enums import ContentStatus, ImportJobStatus, PublicationStatus, UserRole
from app.infrastructure.database.models import (
    GeneratedContentModel,
    ImportJobModel,
    ProductModel,
    PublicationModel,
    ShopSettingsModel,
    UserModel,
    UserSessionModel,
)


def _loaded(row: object, name: str) -> Any:
    state = sa_inspect(row)
    if name in state.unloaded:
        return None
    return getattr(row, name)


def user_to_domain(row: UserModel) -> User:
    return User(
        id=row.id,
        max_user_id=row.max_user_id,
        username=row.username,
        role=UserRole(row.role),
        is_active=row.is_active,
        created_at=_loaded(row, "created_at"),
        updated_at=_loaded(row, "updated_at"),
    )


def product_to_domain(row: ProductModel) -> Product:
    return Product(
        id=row.id,
        sku=row.sku,
        name=row.name,
        category=row.category,
        description=row.description,
        price=Decimal(str(row.price)),
        currency=row.currency,
        stock=row.stock,
        image_url=row.image_url,
        max_upload_token=row.max_upload_token,
        source_data=dict(row.source_data or {}),
        is_active=row.is_active,
        created_at=_loaded(row, "created_at"),
        updated_at=_loaded(row, "updated_at"),
    )


def content_to_domain(row: GeneratedContentModel) -> GeneratedContent:
    return GeneratedContent(
        id=row.id,
        product_id=row.product_id,
        title=row.title,
        description=row.description,
        benefits_json=list(row.benefits_json or []),
        call_to_action=row.call_to_action,
        hashtags_json=list(row.hashtags_json or []),
        model=row.model,
        prompt_version=row.prompt_version,
        status=ContentStatus(row.status),
        created_at=_loaded(row, "created_at"),
    )


def publication_to_domain(row: PublicationModel) -> Publication:
    return Publication(
        id=row.id,
        product_id=row.product_id,
        content_id=row.content_id,
        max_chat_id=row.max_chat_id,
        max_message_id=row.max_message_id,
        status=PublicationStatus(row.status),
        scheduled_at=_loaded(row, "scheduled_at"),
        published_at=_loaded(row, "published_at"),
        error_message=row.error_message,
        created_at=_loaded(row, "created_at"),
    )


def import_job_to_domain(row: ImportJobModel) -> ImportJob:
    return ImportJob(
        id=row.id,
        filename=row.filename,
        status=ImportJobStatus(row.status),
        total_rows=row.total_rows,
        created_rows=row.created_rows,
        updated_rows=row.updated_rows,
        failed_rows=row.failed_rows,
        error_report=list(row.error_report or []),
        created_at=_loaded(row, "created_at"),
        completed_at=_loaded(row, "completed_at"),
    )


def settings_to_domain(row: ShopSettingsModel) -> ShopSettings:
    return ShopSettings(
        channel_id=row.channel_id,
        show_stock=row.show_stock,
        updated_at=_loaded(row, "updated_at"),
    )


def session_to_domain(row: UserSessionModel) -> UserSession:
    payload: dict[str, Any] = dict(row.payload or {})
    return UserSession(
        user_id=row.user_id,
        state=row.state,
        payload=payload,
        updated_at=_loaded(row, "updated_at"),
    )
