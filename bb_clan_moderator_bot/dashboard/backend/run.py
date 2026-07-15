"""Entry point for the standalone FastAPI dashboard server."""

import uvicorn

from bot.config import Config


def main() -> None:
    config = Config.from_env()
    uvicorn.run(
        "dashboard.backend.main:app",
        host="0.0.0.0",
        port=config.dashboard_port,
        reload=False,
    )


if __name__ == "__main__":
    main()
