from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any

from app.domain.enums import ContentStatus, ImportJobStatus, PublicationStatus, UserRole


@dataclass(slots=True)
class User:
    id: int | None
    max_user_id: int
    username: str | None
    role: UserRole
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass(slots=True)
class Product:
    id: int | None
    sku: str
    name: str
    category: str | None
    description: str | None
    price: Decimal
    currency: str
    stock: int
    image_url: str | None
    max_upload_token: str | None
    source_data: dict[str, Any]
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass(slots=True)
class GeneratedContent:
    id: int | None
    product_id: int
    title: str
    description: str
    benefits_json: list[str]
    call_to_action: str
    hashtags_json: list[str]
    model: str
    prompt_version: str
    status: ContentStatus
    created_at: datetime | None = None


@dataclass(slots=True)
class Publication:
    id: int | None
    product_id: int
    content_id: int
    max_chat_id: int | None
    max_message_id: str | None
    status: PublicationStatus
    scheduled_at: datetime | None
    published_at: datetime | None
    error_message: str | None
    created_at: datetime | None = None


@dataclass(slots=True)
class ImportJob:
    id: int | None
    filename: str
    status: ImportJobStatus
    total_rows: int
    created_rows: int
    updated_rows: int
    failed_rows: int
    error_report: list[dict[str, Any]]
    created_at: datetime | None = None
    completed_at: datetime | None = None


@dataclass(slots=True)
class ShopSettings:
    channel_id: int | None
    show_stock: bool
    updated_at: datetime | None = None


@dataclass(slots=True)
class UserSession:
    user_id: int
    state: str
    payload: dict[str, Any] = field(default_factory=dict)
    updated_at: datetime | None = None
