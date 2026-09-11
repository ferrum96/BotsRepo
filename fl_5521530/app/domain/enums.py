from __future__ import annotations

from enum import StrEnum


class UserRole(StrEnum):
    ADMIN = "admin"


class ImportJobStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ContentStatus(StrEnum):
    DRAFT = "draft"
    READY = "ready"
    REJECTED = "rejected"


class PublicationStatus(StrEnum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    PUBLISHING = "publishing"
    PUBLISHED = "published"
    FAILED = "failed"
    CANCELLED = "cancelled"


class DialogState(StrEnum):
    IDLE = "idle"
    WAITING_CSV = "waiting_csv"
    WAITING_SEARCH = "waiting_search"
    WAITING_SCHEDULE_AT = "waiting_schedule_at"
    WAITING_EDIT_TITLE = "waiting_edit_title"
    WAITING_EDIT_DESCRIPTION = "waiting_edit_description"
    WAITING_EDIT_CTA = "waiting_edit_cta"


class CallbackPrefix(StrEnum):
    MENU = "menu"
    PRODUCT = "product"
    CAT = "cat"
    CONTENT = "content"
    PUBLICATION = "publication"
    SETTINGS = "settings"
