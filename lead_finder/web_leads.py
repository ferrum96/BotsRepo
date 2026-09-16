#!/usr/bin/env python3
"""Сбор лидов с фриланс-бирж и международных площадок (приоритетный канал).

Порядок источников: FL.ru → Freelancehunt → Remote OK → Remotive →
We Work Remotely → Reddit → Hacker News.

Русские фразы (--query) идут на русскоязычные биржи, английские (--query-en) —
на зарубежные доски и Reddit/HN. Без флагов подставляются готовые запросы
под разработку/доработку ботов в мессенджерах.
"""
import argparse
import json
from pathlib import Path

from modules.config import load_config
from modules.filter import build_scorer
from modules.web_sources import (
    fetch_fl_ru,
    fetch_freelancehunt,
    fetch_hacker_news,
    fetch_reddit,
    fetch_remoteok,
    fetch_remotive,
    fetch_weworkremotely,
)

OUTPUT_PATH = Path("output/web_candidates.json")

# Сабреддиты, где заказчики сами публикуют задачи (зарубежный спрос).
# Держим короткий список: Reddit легко отвечает 429 при большом числе запросов.
DEFAULT_SUBREDDITS = [
    "forhire",
    "slavelabour",
    "hireaprogrammer",
]

# Готовые фразы под нишу: разработка/доработка ботов в мессенджерах.
DEFAULT_QUERIES_RU = [
    "бот",
    "телеграм",
    "telegram",
    "чат-бот",
    "whatsapp",
    "мессенджер",
    "доработать бота",
    "разработка бота",
]

# Короче список — иначе Reddit/HN упираются в лимиты частоты.
DEFAULT_QUERIES_EN = [
    "telegram bot",
    "whatsapp bot",
    "discord bot",
    "chatbot",
    "bot developer",
]


def parse_args():
    parser = argparse.ArgumentParser(
        description="Поиск лидов на фриланс-биржах и международных площадках"
    )
    parser.add_argument("--query", action="append", default=None,
                        help="Русская фраза для FL.ru / Freelancehunt")
    parser.add_argument("--query-en", action="append", default=None,
                        dest="query_en",
                        help="Английская фраза для зарубежных досок, Reddit, HN")
    parser.add_argument("--subreddit", action="append", default=None,
                        help="Ограничить поиск Reddit этими сабреддитами "
                             f"(по умолчанию: {', '.join(DEFAULT_SUBREDDITS)})")
    parser.add_argument("--days", type=int, default=7,
                        help="Насколько назад смотреть")
    parser.add_argument("--all-reddit", action="store_true", dest="all_reddit",
                        help="Искать по всему Reddit, а не только в сабреддитах")
    parser.add_argument("--skip-reddit", action="store_true", dest="skip_reddit",
                        help="Не ходить в Reddit (быстрее, без зарубежного спроса)")
    parser.add_argument("--min-length", type=int, default=40, dest="min_length",
                        help="Минимальная длина текста заявки")
    return parser.parse_args()


def merge_with_saved(leads: list) -> list:
    """Прогоны копятся в одном файле: ссылка — ключ, поэтому повторы
    не дублируются, а оценки в scores.json остаются привязанными."""
    by_link = {}
    if OUTPUT_PATH.exists():
        for old in json.loads(OUTPUT_PATH.read_text(encoding="utf-8")):
            by_link[old["link"]] = old
    for lead in leads:
        by_link[lead["link"]] = lead
    return sorted(by_link.values(), key=lambda x: x["date"], reverse=True)


def main():
    args = parse_args()
    config = load_config()
    scorer = build_scorer(config["product"], config["audience"])

    queries_ru = args.query or DEFAULT_QUERIES_RU
    queries_en = args.query_en or DEFAULT_QUERIES_EN

    leads = []

    print(f"\nБиржи (RU/СНГ) — {len(queries_ru)} фраз, {args.days} дн.…")
    leads += fetch_fl_ru(queries_ru, days=args.days)
    leads += fetch_freelancehunt(queries_ru + queries_en, days=args.days)

    print(f"\nЗарубежные доски — {len(queries_en)} фраз…")
    leads += fetch_remoteok(queries_en, days=args.days)
    leads += fetch_remotive(queries_en, days=args.days)
    leads += fetch_weworkremotely(queries_en, days=args.days)

    if not args.skip_reddit:
        print(f"\nReddit + Hacker News — {len(queries_en)} фраз…")
        subreddits = None if args.all_reddit else (args.subreddit or DEFAULT_SUBREDDITS)
        leads += fetch_reddit(queries_en, days=args.days, subreddits=subreddits)
        leads += fetch_hacker_news(queries_en, days=args.days)

    leads = [x for x in leads if len(x["text"]) >= args.min_length]
    for lead in leads:
        lead["score"] = scorer(f"{lead['name']} {lead['text']}")

    leads = merge_with_saved(leads)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(leads, ensure_ascii=False, indent=2),
                           encoding="utf-8")

    print(f"\nВсего заявок в файле: {len(leads)} → {OUTPUT_PATH}")
    if not leads:
        print("⚠ Ничего не нашлось. Попробуйте другие фразы или увеличьте --days.")
        return

    print(f"\n{'#':<4} {'Источник':<18} {'Пред':<5} Заявка")
    print("-" * 110)
    for idx, lead in enumerate(leads[:40], 1):
        title = (lead["name"] or lead["text"])[:70].replace("\n", " ")
        print(f"{idx:<4} {lead['source'][:16]:<18} {lead.get('score', 0):<5} {title}")


if __name__ == "__main__":  # pragma: no cover
    main()
