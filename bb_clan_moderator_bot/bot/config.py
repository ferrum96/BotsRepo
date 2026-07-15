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
class AdminContact:
    username: str
    label: str = ""

    @property
    def url(self) -> str:
        return f"https://t.me/{self.username}"

    def button_text(self, *, alone: bool = False) -> str:
        if self.label:
            return f"👤 {self.label}"
        if alone:
            return "👤 Написать админу"
        return f"👤 @{self.username}"


@dataclass(frozen=True)
class Config:
    bot_token: str
    group_id: int
    admin_ids: list[int] = field(default_factory=list)
    telegram_group_link: str = ""
    discord_link: str = ""
    admin_contacts: list[AdminContact] = field(default_factory=list)
    database_path: str = "data/bot.db"
    max_survey_attempts: int = 2
    dashboard_port: int = 8080
    dashboard_api_key: str = ""
    dashboard_events_url: str = ""
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
            admin_contacts=_parse_admin_contacts(
                os.getenv("ADMIN_CONTACT_USERNAME", "")
            ),
            database_path=os.getenv("DATABASE_PATH", "data/bot.db"),
            max_survey_attempts=int(os.getenv("MAX_SURVEY_ATTEMPTS", "2")),
            dashboard_port=int(os.getenv("DASHBOARD_PORT", "8080")),
            dashboard_api_key=os.getenv("DASHBOARD_API_KEY", ""),
            dashboard_events_url=os.getenv("DASHBOARD_EVENTS_URL", "").rstrip("/"),
            group_sync_interval_minutes=int(
                os.getenv("GROUP_SYNC_INTERVAL_MINUTES", "10")
            ),
        )

    def is_admin(self, user_id: int) -> bool:
        return user_id in self.admin_ids


def _normalize_tg_username(raw: str) -> str:
    value = (raw or "").strip()
    if not value:
        return ""
    if value.startswith("https://t.me/"):
        value = value.removeprefix("https://t.me/")
    elif value.startswith("http://t.me/"):
        value = value.removeprefix("http://t.me/")
    elif value.startswith("t.me/"):
        value = value.removeprefix("t.me/")
    return value.lstrip("@").split("?")[0].split("/")[0].strip()


def _parse_admin_contacts(raw: str) -> list[AdminContact]:
    """Parse comma-separated contacts.

    Formats per entry:
      @nick / nick / https://t.me/nick
      Label|@nick
    """
    contacts: list[AdminContact] = []
    seen: set[str] = set()
    for part in (raw or "").split(","):
        entry = part.strip()
        if not entry:
            continue
        label = ""
        username_raw = entry
        if "|" in entry:
            label_part, username_raw = entry.split("|", 1)
            label = label_part.strip()
            username_raw = username_raw.strip()
        username = _normalize_tg_username(username_raw)
        if not username or username in seen:
            continue
        seen.add(username)
        contacts.append(AdminContact(username=username, label=label))
    return contacts
