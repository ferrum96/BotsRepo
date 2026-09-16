import os
import sys
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv, set_key

ENV_PATH = Path(".env")
GITIGNORE_PATH = Path(".gitignore")
GITIGNORE_ENTRIES = [".env", "*.session", "output/"]

FIRST_RUN_BANNER = """
============================================================
  ПЕРВЫЙ ЗАПУСК — настройка Telegram API
============================================================

Шаг 1. Получите API-ключи:
  → Перейдите на https://my.telegram.org
  → Войдите под своим номером телефона
  → Раздел "API development tools" → создайте приложение
  → Скопируйте api_id и api_hash

Шаг 2. Введите данные (сохранятся в .env):
"""


def ensure_gitignore() -> None:
    existing_text = ""
    existing: set = set()
    if GITIGNORE_PATH.exists():
        existing_text = GITIGNORE_PATH.read_text()
        existing = set(existing_text.splitlines())
    new_entries = [e for e in GITIGNORE_ENTRIES if e not in existing]
    if not new_entries:
        return
    # Separate from existing content only if it lacks a trailing newline, so we
    # never produce a leading blank line on a fresh file nor glue onto a last line.
    prefix = "\n" if existing_text and not existing_text.endswith("\n") else ""
    with GITIGNORE_PATH.open("a") as f:
        f.write(prefix + "\n".join(new_entries) + "\n")


def _prompt_api_id() -> str:
    # api_id from my.telegram.org is an integer; re-prompt until it parses so we
    # never persist a value that crashes int() on the next run.
    while True:
        raw = input("TG_API_ID: ").strip()
        try:
            int(raw)
            return raw
        except ValueError:
            print("  ⚠ TG_API_ID должен быть числом (см. my.telegram.org). Повторите ввод.")


def _prompt_first_run() -> dict:
    print(FIRST_RUN_BANNER)
    return {
        "TG_API_ID": _prompt_api_id(),
        "TG_API_HASH": input("TG_API_HASH: ").strip(),
        "TG_PHONE": input("TG_PHONE (формат +79001234567): ").strip(),
        "PRODUCT_DESCRIPTION": input("\nОписание продукта (что продаём):\n  ").strip(),
        "TARGET_AUDIENCE": input("\nЦелевая аудитория (кому продаём, боли, признаки):\n  ").strip(),
    }


def load_config(product: Optional[str] = None, audience: Optional[str] = None) -> dict:
    ensure_gitignore()
    load_dotenv(ENV_PATH)

    required = ["TG_API_ID", "TG_API_HASH", "TG_PHONE"]
    missing = [k for k in required if not os.getenv(k)]

    if missing:
        print(f"\nНе найдены переменные: {', '.join(missing)}")
        values = _prompt_first_run()
        ENV_PATH.touch()
        for k, v in values.items():
            set_key(str(ENV_PATH), k, v)
        load_dotenv(ENV_PATH, override=True)

    try:
        api_id = int(os.environ["TG_API_ID"])
    except ValueError:
        print(
            f"❌ TG_API_ID в .env должен быть числом, а сейчас: "
            f"{os.environ['TG_API_ID']!r}.\n"
            f"   Исправьте значение (api_id с https://my.telegram.org)."
        )
        sys.exit(1)

    return {
        "api_id": api_id,
        "api_hash": os.environ["TG_API_HASH"],
        "phone": os.environ["TG_PHONE"],
        # Cloud password (2FA). Read from .env only — never passed as a CLI arg,
        # so it stays out of shell history.
        "password": os.getenv("TG_PASSWORD", ""),
        "product": product or os.getenv("PRODUCT_DESCRIPTION", ""),
        "audience": audience or os.getenv("TARGET_AUDIENCE", ""),
    }
