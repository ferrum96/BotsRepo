from __future__ import annotations

import re
from functools import lru_cache

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_WEBHOOK_SECRET_RE = re.compile(r"^[A-Za-z0-9_-]{5,256}$")


class Settings(BaseSettings):
    """Runtime configuration. All secrets come from the environment."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    max_api_base_url: str = "https://platform-api2.max.ru"
    max_bot_token: str
    max_webhook_url: str | None = None
    max_webhook_secret: str
    max_channel_id: int | None = None
    allowed_max_user_ids: str = ""
    max_use_long_polling: bool = False

    database_url: str

    ai_api_key: str
    ai_api_base_url: str = "https://api.openai.com/v1"
    ai_model: str = "gpt-4.1-mini"

    shop_name: str = "MAX Shop"
    timezone: str = "Europe/Vilnius"
    show_stock: bool = True
    max_csv_size_mb: int = Field(default=10, ge=1, le=50)
    max_image_size_mb: int = Field(default=10, ge=1, le=50)

    app_host: str = "0.0.0.0"
    app_port: int = 8000
    log_level: str = "INFO"
    http_timeout_seconds: float = Field(default=30.0, ge=1.0)

    @field_validator("max_bot_token", "max_webhook_secret", "database_url", "ai_api_key")
    @classmethod
    def required_secret_not_blank(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("required secret is missing")
        return value.strip()

    @field_validator("max_webhook_secret")
    @classmethod
    def webhook_secret_charset(cls, value: str) -> str:
        if not _WEBHOOK_SECRET_RE.fullmatch(value):
            raise ValueError(
                "MAX_WEBHOOK_SECRET must be 5-256 chars of A-Z a-z 0-9 _ -"
            )
        return value

    @field_validator("max_api_base_url", "ai_api_base_url")
    @classmethod
    def strip_trailing_slash(cls, value: str) -> str:
        return value.rstrip("/")

    @model_validator(mode="after")
    def production_webhook_https(self) -> Settings:
        if self.max_use_long_polling:
            return self
        if not self.max_webhook_url:
            raise ValueError(
                "MAX_WEBHOOK_URL is required unless MAX_USE_LONG_POLLING=true"
            )
        if not self.max_webhook_url.startswith("https://"):
            raise ValueError("MAX_WEBHOOK_URL must use HTTPS")
        return self

    @property
    def allowed_user_ids(self) -> frozenset[int]:
        if not self.allowed_max_user_ids.strip():
            return frozenset()
        values: set[int] = set()
        for part in self.allowed_max_user_ids.split(","):
            item = part.strip()
            if not item:
                continue
            values.add(int(item))
        return frozenset(values)

    @property
    def max_csv_size_bytes(self) -> int:
        return self.max_csv_size_mb * 1024 * 1024

    @property
    def max_image_size_bytes(self) -> int:
        return self.max_image_size_mb * 1024 * 1024


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
