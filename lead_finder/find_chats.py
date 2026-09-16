#!/usr/bin/env python3
"""Подбор чатов для сбора лидов: ищет в глобальном поиске Telegram публичные
группы по ключевым словам и показывает живые (по числу участников).
Вступать в найденные группы нужно вручную — см. docs/find-your-chats.md.
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

from modules.chat_search import search_public_groups
from modules.config import load_config
from modules.telegram_fetcher import session_exists

OUTPUT_PATH = Path("output/chat_candidates.json")

# Стартовый набор: упор на разработку/доработку ботов в мессенджерах.
# Свои слова передавайте через --query (можно несколько раз).
DEFAULT_QUERIES = [
    "телеграм боты",
    "telegram бот",
    "разработка ботов",
    "доработка бота",
    "чат бот",
    "бот для бизнеса",
    "бот max",
    "мессенджер бот",
    "whatsapp бот",
    "ищу разработчика бота",
    "фриланс боты",
    "автоматизация telegram",
    "боты заказы",
    "предприниматели",
    "малый бизнес",
]


def merge_with_saved(groups: list) -> list:
    """Находки нескольких прогонов с разными словами копятся в одном файле,
    иначе каждый новый поиск затирал бы предыдущий."""
    if not OUTPUT_PATH.exists():
        return groups
    saved = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    by_id = {g["id"]: g for g in saved}
    for g in groups:
        old = by_id.get(g["id"])
        if old:
            g["queries"] = list(dict.fromkeys(old.get("queries", []) + g["queries"]))
        by_id[g["id"]] = g
    return sorted(by_id.values(), key=lambda g: g["participants"], reverse=True)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Поиск публичных Telegram-групп для сбора лидов"
    )
    parser.add_argument("--query", action="append", default=None,
                        help="Ключевое слово для поиска (можно несколько раз)")
    parser.add_argument("--min-participants", type=int, default=300,
                        dest="min_participants",
                        help="Минимум участников (живой чат — от ~300)")
    parser.add_argument("--max-details", type=int, default=60, dest="max_details",
                        help="Сколько групп проверять подробно (число участников)")
    return parser.parse_args()


async def main():
    args = parse_args()
    config = load_config()

    if not session_exists():
        print("❌ Нет сессии. Сначала выполните вход: python scraper.py --login")
        sys.exit(1)

    queries = args.query or DEFAULT_QUERIES
    print(f"\nИщу группы по {len(queries)} словам. Это займёт пару минут.\n")

    groups = await search_public_groups(
        api_id=config["api_id"], api_hash=config["api_hash"], queries=queries,
        min_participants=args.min_participants, max_details=args.max_details,
    )

    groups = merge_with_saved(groups)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(groups, ensure_ascii=False, indent=2),
                           encoding="utf-8")

    if not groups:
        print("\n⚠ Ничего не нашлось. Попробуйте другие слова (--query) "
              "или снизьте --min-participants.")
        return

    print(f"\nПодходящих групп: {len(groups)}\n")
    print(f"{'#':<4} {'Участников':<11} {'Название':<34} Ссылка")
    print("-" * 100)
    for idx, g in enumerate(groups, 1):
        mark = " ✓ вы в ней" if g["joined"] else ""
        print(f"{idx:<4} {g['participants']:<11} {g['title'][:32]:<34} "
              f"https://t.me/{g['username']}{mark}")
    print(f"\nСписок сохранён: {OUTPUT_PATH}")
    print("Откройте ссылки, посмотрите на свежесть сообщений и вступите в подходящие.")


if __name__ == "__main__":  # pragma: no cover
    asyncio.run(main())
