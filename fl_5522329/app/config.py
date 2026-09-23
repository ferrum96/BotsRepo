from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    bot_token: str = ""
    openrouter_api_key: str = ""
    openrouter_model: str = "qwen/qwen-2.5-72b-instruct"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    database_url: str = "postgresql+asyncpg://astro:astro@127.0.0.1:55432/astro"
    redis_url: str = "redis://127.0.0.1:56379/0"

    pro_price_stars: int = Field(default=150, ge=1, le=100000)
    pro_period_days: int = Field(default=30, ge=1, le=366)

    webapp_url: str = ""
    webhook_url: str = ""
    webhook_secret: str = ""

    app_host: str = "0.0.0.0"
    app_port: int = 8080
    log_level: str = "INFO"
    http_timeout_seconds: float = Field(default=20.0, ge=1.0, le=120.0)

    free_tarot_per_day: int = Field(default=1, ge=0, le=100)
    free_ai_per_day: int = Field(default=1, ge=0, le=100)
    chat_history_limit: int = Field(default=10, ge=1, le=20)

    allow_insecure_init_data: bool = False
    nominatim_user_agent: str = "astro-telegram-bot/0.1"
    init_data_max_age_seconds: int = Field(default=86400, ge=60)

    @field_validator(
        "bot_token",
        "openrouter_api_key",
        "webapp_url",
        "webhook_url",
        "webhook_secret",
        "openrouter_base_url",
    )
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("openrouter_base_url", "webapp_url", "webhook_url")
    @classmethod
    def strip_trailing_slash(cls, value: str) -> str:
        return value.rstrip("/")

    @field_validator("webhook_url")
    @classmethod
    def webhook_must_be_https(cls, value: str) -> str:
        if value and not value.startswith("https://"):
            raise ValueError("WEBHOOK_URL must use HTTPS")
        return value

    @field_validator("webapp_url")
    @classmethod
    def webapp_must_be_https(cls, value: str) -> str:
        if value and not value.startswith("https://"):
            raise ValueError("WEBAPP_URL must use HTTPS")
        return value

    @property
    def use_webhook(self) -> bool:
        return bool(self.webhook_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()
