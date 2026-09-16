#!/usr/bin/env python3
import argparse
import asyncio
import re
import sys
from pathlib import Path

from telethon.errors import (ChannelPrivateError, PasswordHashInvalidError,
                             PhoneCodeExpiredError, PhoneCodeInvalidError,
                             SessionPasswordNeededError)

from modules.config import load_config
from modules.filter import filter_and_score
from modules.output import print_summary, save_filtered_json, save_raw_json, save_xlsx
from modules.telegram_fetcher import (fetch_messages, login, list_groups,
                                      search_messages, session_exists,
                                      request_code, submit_code,
                                      submit_password, load_login_state,
                                      clear_login_state)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Telegram Lead Scraper — собирает и скорит лидов из чата"
    )
    parser.add_argument("--group", action="append", default=None,
                        help="@username, t.me/... или числовой ID чата (можно несколько раз)")
    parser.add_argument("--search", action="append", default=None,
                        help="Искать сообщения с этой фразой во всех ваших чатах "
                             "силами Telegram (можно несколько раз). Адреснее, "
                             "чем сплошной сбор по --group")
    parser.add_argument("--product", default=None,
                        help="Описание продукта (переопределяет .env)")
    parser.add_argument("--audience", default=None,
                        help="Описание ЦА (переопределяет .env)")
    parser.add_argument("--days", type=int, default=14,
                        help="Глубина парсинга в днях (рекомендуется не более 14)")
    parser.add_argument("--limit", type=int, default=2000,
                        help="Максимальное количество сообщений")
    parser.add_argument("--min-score", type=int, default=1, dest="min_score",
                        help="Минимальный предфильтр-score (0–10) для попадания в кандидаты "
                             "(низкий по умолчанию — настоящую квалификацию делает Claude 0–100)")
    parser.add_argument("--min-length", type=int, default=15, dest="min_length",
                        help="Минимальная длина сообщения в символах")
    parser.add_argument("--output", default="output/leads_table.xlsx",
                        help="Путь к итоговому XLSX")
    parser.add_argument("--login", action="store_true",
                        help="Войти в Telegram (создать сессию) и выйти")
    parser.add_argument("--list-groups", action="store_true", dest="list_groups",
                        help="Показать ваши группы/каналы (название · id · @username)")
    parser.add_argument("--request-code", action="store_true", dest="request_code",
                        help="Агентский вход, шаг 1: запросить код от Telegram")
    parser.add_argument("--submit-code", default=None, dest="submit_code", metavar="CODE",
                        help="Агентский вход, шаг 2: завершить вход кодом из Telegram")
    parser.add_argument("--submit-password", action="store_true", dest="submit_password",
                        help="Агентский вход, шаг 3 (если включён облачный пароль): "
                             "завершить вход паролем из TG_PASSWORD в .env")
    return parser.parse_args()


def _safe_name(group: str) -> str:
    """Идентификатор группы → безопасное имя файла: '@audi' → 'audi'."""
    return re.sub(r"[^\w.-]", "_", group.lstrip("@")) or "group"


async def main():
    args = parse_args()
    config = load_config(product=args.product, audience=args.audience)

    if args.login:
        me = await login(config["api_id"], config["api_hash"], config["phone"])
        name = getattr(me, "first_name", "") or "аккаунт"
        print(f"✅ Вход выполнен: {name}. Сессия сохранена — код больше не нужен.")
        return

    if args.request_code:
        result = await request_code(config["api_id"], config["api_hash"], config["phone"])
        if result == "already_authorized":
            print("✅ Вход уже выполнен — код не нужен.")
        else:
            print("✅ Код отправлен в Telegram. Пришлите его сюда и выполните: "
                  "python scraper.py --submit-code <код>")
        return

    if args.submit_code:
        state = load_login_state()
        if not state:
            print("❌ Нет ожидающего входа. Сначала: python scraper.py --request-code")
            sys.exit(1)
        try:
            me = await submit_code(config["api_id"], config["api_hash"],
                                   state["phone"], args.submit_code, state["phone_code_hash"])
        except SessionPasswordNeededError:
            if not config["password"]:
                print("🔒 На аккаунте включён облачный пароль (2FA). Код принят — "
                      "остался пароль.\n   Добавьте строку TG_PASSWORD=ваш_пароль в файл "
                      ".env и выполните: python scraper.py --submit-password")
                sys.exit(1)
            me = await submit_password(config["api_id"], config["api_hash"],
                                       config["password"])
        except PhoneCodeInvalidError:
            print("❌ Неверный код. Запросите новый: python scraper.py --request-code")
            sys.exit(1)
        except PhoneCodeExpiredError:
            print("❌ Код истёк. Запросите новый: python scraper.py --request-code")
            sys.exit(1)
        clear_login_state()
        name = getattr(me, "first_name", "") or "аккаунт"
        print(f"✅ Вход выполнен: {name}. Сессия сохранена.")
        return

    if args.submit_password:
        if not config["password"]:
            print("❌ В .env не заполнено TG_PASSWORD. Добавьте строку "
                  "TG_PASSWORD=ваш_облачный_пароль и повторите.")
            sys.exit(1)
        try:
            me = await submit_password(config["api_id"], config["api_hash"],
                                       config["password"])
        except PasswordHashInvalidError:
            print("❌ Облачный пароль не подошёл. Проверьте TG_PASSWORD в .env "
                  "(регистр букв важен) и повторите.")
            sys.exit(1)
        clear_login_state()
        name = getattr(me, "first_name", "") or "аккаунт"
        print(f"✅ Вход выполнен: {name}. Сессия сохранена.")
        return

    if args.list_groups:
        if not session_exists():
            print("❌ Нет сессии. Сначала выполните вход: python scraper.py --login")
            sys.exit(1)
        groups = await list_groups(config["api_id"], config["api_hash"])
        print("Ваши группы и каналы:")
        for g in groups:
            uname = f"@{g['username']}" if g["username"] else "—"
            print(f"  • {g['name']} · id={g['id']} · {uname}")
        print("\nДля приватной группы без @username используйте её id в --group.")
        return

    if not args.group and not args.search:
        print("❌ Укажите группу: --group @handle, или фразу для поиска: --search «нужен бот» "
              "(или --list-groups, чтобы увидеть свои чаты).")
        sys.exit(1)

    if not session_exists():
        print("❌ Нет сессии. Сначала выполните вход: python scraper.py --login")
        sys.exit(1)

    if args.days > 14:
        answer = input(
            f"\n⚠ Парсинг более 14 дней увеличивает время выполнения и снижает качество лидов.\n"
            f"Продолжить? [y/N]: "
        ).strip().lower()
        if answer != "y":
            print("Отменено.")
            sys.exit(0)

    if not config["product"] and not config["audience"]:
        print("⚠ Не задано описание продукта и ЦА. Скоринг будет нулевым.")
        print("  Укажите --product и --audience или заполните .env\n")

    output_dir = Path("output")
    raw_dir = output_dir / "raw"
    all_scored = []
    total_raw = 0
    skipped = []

    if args.search:
        queries = list(dict.fromkeys(args.search))
        print(f"\nПоиск по {len(queries)} фразам во всех ваших чатах | {args.days} дней\n")
        by_source = await search_messages(
            api_id=config["api_id"], api_hash=config["api_hash"],
            queries=queries, days=args.days, limit_per_query=args.limit,
        )
        for source, raw in by_source.items():
            total_raw += len(raw)
            save_raw_json(raw, raw_dir / f"search_{_safe_name(source)}.json")
            all_scored.extend(filter_and_score(
                raw, config["product"], config["audience"],
                min_length=args.min_length, min_score=args.min_score,
                source=f"@{source}",
            ))
        combined = sorted(all_scored, key=lambda m: m.score, reverse=True)
        save_filtered_json(combined, output_dir / "messages_filtered.json")
        save_xlsx(combined, Path(args.output))
        print_summary(total_raw, combined, output_dir / "messages_filtered.json")
        return

    groups = list(dict.fromkeys(args.group))   # dedup, order preserved

    print(f"\nЗапуск: {len(groups)} групп(ы) | {args.days} дней | лимит {args.limit}\n")

    for group in groups:
        try:
            raw = await fetch_messages(
                api_id=config["api_id"], api_hash=config["api_hash"],
                phone=config["phone"], group=group, limit=args.limit, days=args.days,
            )
        except (ChannelPrivateError, ValueError) as e:
            print(f"⚠ Группа {group} пропущена: {e}")
            skipped.append(group)
            continue
        total_raw += len(raw)
        save_raw_json(raw, raw_dir / f"{_safe_name(group)}.json")
        all_scored.extend(filter_and_score(
            raw, config["product"], config["audience"],
            min_length=args.min_length, min_score=args.min_score, source=group,
        ))

    if skipped and len(skipped) == len(groups):
        print("\n❌ Ни одну группу не удалось собрать. "
              "Убедитесь, что аккаунт состоит в этих группах.")
        sys.exit(1)

    combined = sorted(all_scored, key=lambda m: m.score, reverse=True)
    save_filtered_json(combined, output_dir / "messages_filtered.json")
    save_xlsx(combined, Path(args.output))
    print_summary(total_raw, combined, output_dir / "messages_filtered.json")
    if skipped:
        print(f"\n⚠ Пропущено групп: {len(skipped)} ({', '.join(skipped)})")


if __name__ == "__main__":  # pragma: no cover
    asyncio.run(main())
