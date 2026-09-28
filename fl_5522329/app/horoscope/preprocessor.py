from __future__ import annotations


def rating_desc(value: int) -> str:
    if value >= 5:
        return "отличный"
    if value >= 4:
        return "хороший"
    if value >= 3:
        return "умеренный"
    if value >= 2:
        return "сдержанный"
    return "сложный"


def build_rag_query(sign: str, aspects: list, moon: dict) -> str:
    from app.horoscope.knowledge import ZODIAC_SIGNS

    sign_ru = ZODIAC_SIGNS.get(sign, {"ru": sign})["ru"]
    aspect_keywords = [f"{item['planet1']}-{item['planet2']} {item['aspect']}" for item in aspects]
    moon_keywords = f"Луна {moon['phase']} {moon['moon_sign']}"
    spheres = "карьера финансы отношения любовь здоровье работа"
    return f"{sign_ru}; {'; '.join(aspect_keywords)}; {moon_keywords}; {spheres}"


def extract_compact_data(daily: dict, aspects: list, moon: dict) -> dict:
    sphere_names = {"love": "отношения", "work": "работа", "energy": "энергия"}
    ratings_ru = {}
    for key, value in (daily.get("ratings") or {}).items():
        name = sphere_names.get(key, key)
        ratings_ru[name] = f"{rating_desc(int(value))} ({int(value)}/5)"
    aspects_ru = [
        f"{item['planet1']} {item['aspect']} {item['planet2']} (орб {item['orb']}°)" for item in aspects
    ]
    return {
        "date": daily.get("date") or "",
        "sign_ru": daily["sign_ru"],
        "element": daily["element"],
        "ruler": daily["ruler"],
        "aspects": aspects_ru,
        "moon_phase": moon["phase"],
        "moon_illumination": moon["illumination"],
        "moon_sign": moon["moon_sign"],
        "ratings": ratings_ru,
    }


def format_rag_context(rag_results: list) -> list[str]:
    labels = {
        "aspect_sphere": "Аспект",
        "sign_sphere": "Знак",
        "moon_sign": "Луна в знаке",
        "moon_phase": "Фаза Луны",
        "style_example": "Пример стиля",
    }
    formatted = []
    for item in rag_results:
        meta = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
        text = str(item.get("text") or "")
        sentences = text.split(". ")
        if len(sentences) > 4:
            text = ". ".join(sentences[:4]) + "."
        label = labels.get(str(meta.get("type") or ""), "Контекст")
        formatted.append(f"[{label}] {text}")
    return formatted
