from __future__ import annotations

MONTHS_GENITIVE = (
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
)

SIGN_RU_TO_SLUG = {
    "Овен": "aries",
    "Телец": "taurus",
    "Близнецы": "gemini",
    "Рак": "cancer",
    "Лев": "leo",
    "Дева": "virgo",
    "Весы": "libra",
    "Скорпион": "scorpio",
    "Стрелец": "sagittarius",
    "Козерог": "capricorn",
    "Водолей": "aquarius",
    "Рыбы": "pisces",
}

SIGN_GENITIVE = {
    "Овен": "Овна",
    "Телец": "Тельца",
    "Близнецы": "Близнецов",
    "Рак": "Рака",
    "Лев": "Льва",
    "Дева": "Девы",
    "Весы": "Весов",
    "Скорпион": "Скорпиона",
    "Стрелец": "Стрельца",
    "Козерог": "Козерога",
    "Водолей": "Водолея",
    "Рыбы": "Рыб",
}

PLANETS = {
    "sun": "Солнце",
    "moon": "Луна",
    "mercury": "Меркурий",
    "venus": "Венера",
    "mars": "Марс",
    "jupiter": "Юпитер",
    "saturn": "Сатурн",
    "uranus": "Уран",
    "neptune": "Нептун",
    "pluto": "Плутон",
}

ASPECTS = {
    "conjunction": "соединение",
    "sextile": "секстиль",
    "square": "квадрат",
    "trine": "трин",
    "opposition": "оппозиция",
}

SIGNS_EN = {
    "aries": "Овен",
    "taurus": "Телец",
    "gemini": "Близнецы",
    "cancer": "Рак",
    "leo": "Лев",
    "virgo": "Дева",
    "libra": "Весы",
    "scorpio": "Скорпион",
    "sagittarius": "Стрелец",
    "capricorn": "Козерог",
    "aquarius": "Водолей",
    "pisces": "Рыбы",
}

PHASES = {
    "new moon": "новолуние",
    "waxing crescent": "растущий серп",
    "first quarter": "первая четверть",
    "waxing gibbous": "растущая луна",
    "full moon": "полнолуние",
    "waning gibbous": "убывающая луна",
    "last quarter": "последняя четверть",
    "third quarter": "последняя четверть",
    "waning crescent": "убывающий серп",
}

COLORS = {
    "red": "красный",
    "blue": "синий",
    "green": "зелёный",
    "gold": "золотой",
    "golden": "золотой",
    "silver": "серебро",
    "white": "белый",
    "black": "чёрный",
    "yellow": "жёлтый",
    "purple": "фиолетовый",
    "violet": "фиолетовый",
    "pink": "розовый",
    "orange": "оранжевый",
    "brown": "коричневый",
    "turquoise": "бирюзовый",
    "beige": "бежевый",
    "grey": "серый",
    "gray": "серый",
}

THEMES = {
    "initiative": "инициатива",
    "love": "близость",
    "career": "работа",
    "focus": "сосредоточенность",
    "rest": "передышка",
    "change": "перемена",
    "communication": "разговор",
    "money": "деньги",
    "health": "самочувствие",
    "creativity": "творческий ход",
    "stability": "устойчивость",
    "sensuality": "телесный комфорт",
    "growth": "рост",
    "caution": "осторожность",
    "harmony": "согласие",
    "tension": "напряжение",
    "energy": "запас сил",
    "action": "действие",
}

SPHERE_BY_SCORE = (
    ("career", "Работа / карьера"),
    ("money", "Финансы"),
    ("love", "Отношения / любовь"),
    ("health", "Здоровье / самочувствие"),
)

PLANET_SPHERE = {
    "sun": "Работа / карьера",
    "mercury": "Учеба / развитие",
    "venus": "Отношения / любовь",
    "mars": "Здоровье / самочувствие",
    "jupiter": "Финансы",
    "saturn": "Работа / карьера",
    "moon": "Отношения / любовь",
    "uranus": "Учеба / развитие",
    "neptune": "Отношения / любовь",
    "pluto": "Работа / карьера",
}

SCORE_LABELS = {
    "overall": "Общая оценка",
    "love": "Любовь",
    "career": "Карьера",
    "money": "Деньги",
    "health": "Самочувствие",
}


def lookup(table: dict[str, str], raw: str) -> str | None:
    key = " ".join(str(raw).strip().lower().replace("_", " ").split())
    return table.get(key)


def russian_date(day) -> str:
    return f"{day.day} {MONTHS_GENITIVE[day.month - 1]}"
