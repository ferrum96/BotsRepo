"""Configuration loaded from environment variables."""

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()


def _parse_admin_ids(raw: str) -> list[int]:
    if not raw.strip():
        return []
    return [int(x.strip()) for x in raw.split(",") if x.strip()]


def _env_first(*names: str, default: str = "") -> str:
    """Return the first non-empty env value across the provided names."""
    for name in names:
        value = os.getenv(name, "")
        if value:
            return value
    return default


@dataclass(frozen=True)
class Config:
    bot_token: str
    group_id: int
    admin_ids: list[int] = field(default_factory=list)
    telegram_group_link: str = ""
    discord_link: str = ""
    google_sheets_credentials_file: str = ""
    google_sheet_id: str = ""
    database_path: str = "data/bot.db"
    max_survey_attempts: int = 2

    @classmethod
    def from_env(cls) -> "Config":
        token = os.getenv("BOT_TOKEN", "")
        if not token:
            raise ValueError("BOT_TOKEN is required")

        # GROUP_ID is the canonical name; CHANNEL_ID kept for backward compat.
        group_id = _env_first("GROUP_ID", "CHANNEL_ID")
        if not group_id:
            raise ValueError("GROUP_ID is required")

        return cls(
            bot_token=token,
            group_id=int(group_id),
            admin_ids=_parse_admin_ids(os.getenv("ADMIN_IDS", "")),
            telegram_group_link=_env_first(
                "TELEGRAM_GROUP_LINK", "TELEGRAM_CHANNEL_LINK"
            ),
            discord_link=os.getenv("DISCORD_LINK", ""),
            google_sheets_credentials_file=os.getenv(
                "GOOGLE_SHEETS_CREDENTIALS_FILE", ""
            ),
            google_sheet_id=os.getenv("GOOGLE_SHEET_ID", ""),
            database_path=os.getenv("DATABASE_PATH", "data/bot.db"),
        )

    def is_admin(self, user_id: int) -> bool:
        return user_id in self.admin_ids
