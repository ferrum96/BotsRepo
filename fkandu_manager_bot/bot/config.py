"""Configuration loaded from environment variables."""

import os
from dataclasses import dataclass

from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))


def _default_bind_host() -> str:
    in_docker = os.path.exists("/.dockerenv") or os.getenv("RUNNING_IN_DOCKER") == "1"
    return "0.0.0.0" if in_docker else "127.0.0.1"  # nosec B104


@dataclass(frozen=True)
class Config:
    bot_token: str
    admin_id: int
    hostname: str
    proxy_url: str | None
    file_server_port: int = 8088
    file_server_host: str = "127.0.0.1"
    db_path: str = ""

    @classmethod
    def from_env(cls) -> "Config":
        token = os.getenv("BOT_TOKEN", "")
        if not token:
            raise ValueError("BOT_TOKEN is required")

        admin_id = os.getenv("ADMIN_ID", "")
        if not admin_id:
            raise ValueError("ADMIN_ID is required")

        hostname = os.getenv("HOSTNAME", "localhost")
        proxy_url = os.getenv("PROXY_URL") or None
        file_server_host = os.getenv("FILE_SERVER_HOST", _default_bind_host())
        db_path = os.getenv("DB_PATH", os.path.join(BASE_DIR, "data", "leads.db"))

        return cls(
            bot_token=token,
            admin_id=int(admin_id),
            hostname=hostname,
            proxy_url=proxy_url,
            file_server_host=file_server_host,
            db_path=db_path,
        )
