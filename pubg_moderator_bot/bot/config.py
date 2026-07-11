"""Configuration loaded from environment variables."""

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()


def _parse_admin_ids(raw: str) -> list[int]:
    if not raw.strip():
        return []
    return [int(x.strip()) for x in raw.split(",") if x.strip()]


@dataclass(frozen=True)
class Config:
    bot_token: str
    group_id: int
    admin_ids: list[int] = field(default_factory=list)
    telegram_group_link: str = ""
    discord_link: str = ""
    database_path: str = "data/bot.db"
    max_survey_attempts: int = 2
    dashboard_port: int = 8080
    dashboard_api_key: str = ""
    group_sync_interval_minutes: int = 10

    @classmethod
    def from_env(cls) -> "Config":
        token = os.getenv("BOT_TOKEN", "")
        if not token:
            raise ValueError("BOT_TOKEN is required")

        group_id = os.getenv("GROUP_ID", "")
        if not group_id:
            raise ValueError("GROUP_ID is required")

        return cls(
            bot_token=token,
            group_id=int(group_id),
            admin_ids=_parse_admin_ids(os.getenv("ADMIN_IDS", "")),
            telegram_group_link=os.getenv("TELEGRAM_GROUP_LINK", ""),
            discord_link=os.getenv("DISCORD_LINK", ""),
            database_path=os.getenv("DATABASE_PATH", "data/bot.db"),
            max_survey_attempts=int(os.getenv("MAX_SURVEY_ATTEMPTS", "2")),
            dashboard_port=int(os.getenv("DASHBOARD_PORT", "8080")),
            dashboard_api_key=os.getenv("DASHBOARD_API_KEY", ""),
            group_sync_interval_minutes=int(
                os.getenv("GROUP_SYNC_INTERVAL_MINUTES", "10")
            ),
        )

    def is_admin(self, user_id: int) -> bool:
        return user_id in self.admin_ids
