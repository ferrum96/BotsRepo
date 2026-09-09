"""Deterministic seed: 100 CRM contacts + 20 Telegram import leads (with overlaps)."""

from __future__ import annotations

from datetime import datetime, timedelta

from .models import (
    AttractionSource,
    Contact,
    Deal,
    DealStage,
    Manager,
    ParseSource,
    ParsedLead,
    QualStatus,
)

NOW = datetime(2026, 9, 8, 12, 0, 0)

MANAGERS = [
    Manager(id=1, name="Мария Ковалёва", telegram="@maria_astrostone"),
    Manager(id=2, name="Алексей Орлов", telegram="@alex_astrostone"),
    Manager(id=3, name="Елена Смирнова", telegram="@elena_astrostone"),
]

FIRST = [
    "Анна", "Дмитрий", "Елена", "Игорь", "Мария", "Сергей", "Ольга", "Павел",
    "Наталья", "Артём", "Виктория", "Кирилл", "Юлия", "Максим", "Татьяна",
    "Роман", "Светлана", "Андрей", "Екатерина", "Никита", "Полина", "Владимир",
    "Алина", "Глеб", "Дарья", "Илья", "Ксения", "Лев", "Мила", "Олег",
    "Рита", "Тимур", "Ульяна", "Фёдор", "Элина", "Яна", "Борис", "Вера",
    "Георгий", "Зоя", "Инна", "Лара", "Мирон", "Нина", "Пётр", "Рада",
    "Софья", "Тарас", "Эмма", "Юрий",
]
LAST = [
    "Иванова", "Петров", "Сидорова", "Кузнецов", "Смирнова", "Попов", "Васильева",
    "Новиков", "Фёдорова", "Морозов", "Волкова", "Алексеев", "Лебедева", "Семёнов",
    "Егорова", "Павлов", "Козлова", "Степанов", "Николаева", "Орлов", "Андреева",
    "Макаров", "Захарова", "Зайцев", "Соловьёва", "Борисов", "Яковлева", "Григорьев",
    "Романова", "Воробьёв", "Сергеева", "Михайлов", "Фомина", "Белов", "Тарасова",
    "Комаров", "Киселёва", "Медведев", "Ершова", "Щербаков",
]
CITIES = [
    "Москва", "СПб", "Казань", "Екатеринбург", "Новосибирск", "Минск", "Алматы",
    "Тбилиси", "Сочи", "Краснодар", "Самара", "Нижний Новгород", "Пермь", "Уфа",
]
SCHOOLS = [
    "Jyotish Lab", "Veda School", "Nakshatra Hub", "AstroPath", "Dasha Academy",
    "Graha Institute", "Rashi Studio", "Karma Jyotish", "Surya Practice", None,
]


def _phone(i: int) -> str:
    return f"+7903{1000000 + i:07d}"


def _email(uname: str) -> str:
    return f"{uname}@mail.example"


def build_crm_contacts(n: int = 100) -> list[Contact]:
    contacts: list[Contact] = []
    for i in range(1, n + 1):
        fn = FIRST[(i - 1) % len(FIRST)]
        ln = LAST[(i - 1) % len(LAST)]
        uname = f"jyotish_{i:03d}"
        entered = NOW - timedelta(days=90 - (i % 60))
        contacts.append(
            Contact(
                id=i,
                first_name=fn,
                last_name=ln,
                telegram_username=uname,
                telegram_id=100000 + i,
                phone=_phone(i),
                whatsapp=_phone(i),
                email=_email(uname),
                tg_channel=f"https://t.me/{uname}_channel" if i % 3 == 0 else None,
                vk=f"https://vk.com/{uname}" if i % 5 == 0 else None,
                site=f"https://{uname}.example" if i % 7 == 0 else None,
                instagram=f"@{uname}_ig" if i % 4 == 0 else None,
                school=SCHOOLS[(i - 1) % len(SCHOOLS)],
                city=CITIES[(i - 1) % len(CITIES)],
                source_found="историческая база",
                comment="Контакт уже в CRM",
                is_vedic=True,
                activity_note="консультации / обучение",
                parse_source=ParseSource.TELEGRAM if i % 2 else ParseSource.VK,
                profile_link=f"https://t.me/{uname}",
                qualification_status=QualStatus.NOT_QUALIFIED,
                attraction_source=AttractionSource.PARSE_TG,
                entered_at=entered,
                created_at=entered,
                updated_at=entered,
            )
        )
    return contacts


def build_import_leads() -> list[ParsedLead]:
    """20 Telegram-parsed leads. Indices 0–4 intentionally overlap CRM (dedup demo)."""
    leads: list[ParsedLead] = []

    # --- overlaps with CRM contacts 1..5 (phone / telegram / email / username) ---
    overlaps = [
        # by phone → contact 1
        ParsedLead(
            first_name="Анна",
            last_name="Иванова",
            telegram_username="anna_new_tg",
            telegram_id=900001,
            phone=_phone(1),
            email="anna.extra@mail.example",
            city="Москва",
            school="Jyotish Lab",
            source_found="Telegram",
            comment="повтор: тот же телефон",
            activity_note="вед. астролог, канал 2к",
        ),
        # by telegram username → contact 2
        ParsedLead(
            first_name="Дмитрий",
            last_name="Петров",
            telegram_username="jyotish_002",
            telegram_id=900002,
            phone="+79039990002",
            city="СПб",
            source_found="Telegram",
            comment="повтор: username",
        ),
        # by email → contact 3
        ParsedLead(
            first_name="Елена",
            last_name="Сидорова",
            telegram_username="elena_sid_new",
            telegram_id=900003,
            email=_email("jyotish_003"),
            city="Казань",
            source_found="Telegram",
            comment="повтор: email",
        ),
        # by telegram_id → contact 4
        ParsedLead(
            first_name="Игорь",
            last_name="Кузнецов",
            telegram_username="igor_kuz_alt",
            telegram_id=100004,
            phone="+79039990004",
            city="Екатеринбург",
            source_found="Telegram",
            comment="повтор: telegram_id",
        ),
        # by profile link / username → contact 5
        ParsedLead(
            first_name="Мария",
            last_name="Смирнова",
            telegram_username="jyotish_005",
            telegram_id=900005,
            tg_channel="https://t.me/jyotish_005_channel",
            city="Новосибирск",
            source_found="Telegram",
            comment="повтор: username/channel",
        ),
    ]
    leads.extend(overlaps)

    # --- 15 unique new leads ---
    new_names = [
        ("Арина", "Белова"), ("Григорий", "Титов"), ("Лилия", "Крылова"),
        ("Станислав", "Гусев"), ("Валерия", "Савина"), ("Денис", "Рябов"),
        ("Карина", "Белоусова"), ("Марк", "Суханов"), ("Эвелина", "Гордеева"),
        ("Платон", "Куликов"), ("Агата", "Лапина"), ("Руслан", "Баранов"),
        ("Милана", "Тихонова"), ("Ярослав", "Котов"), ("Злата", "Власова"),
    ]
    for idx, (fn, ln) in enumerate(new_names, start=1):
        i = 200 + idx
        uname = f"astro_partner_{idx:02d}"
        leads.append(
            ParsedLead(
                first_name=fn,
                last_name=ln,
                telegram_username=uname,
                telegram_id=500000 + idx,
                phone=_phone(i),
                email=_email(uname),
                tg_channel=f"https://t.me/{uname}" if idx % 2 == 0 else None,
                school=SCHOOLS[idx % len(SCHOOLS)],
                city=CITIES[idx % len(CITIES)],
                source_found="Telegram",
                comment="новый контакт из парсинга TG",
                is_vedic=True,
                activity_note="практикующий джйотиш" if idx % 3 else "школа + консультации",
            )
        )
    assert len(leads) == 20
    return leads


def empty_deals() -> list[Deal]:
    return []
