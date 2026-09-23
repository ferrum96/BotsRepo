from __future__ import annotations

from dataclasses import dataclass

from app.astrology.angles import SYNASTRY_BODIES, find_aspect
from app.texts import ensure_disclaimer

_WEIGHTS = {
    "conjunction": 2,
    "trine": 2,
    "sextile": 1,
    "square": -1,
    "opposition": -1,
}


@dataclass(frozen=True)
class SynastryReport:
    score: int
    aspects: list[dict]
    text: str


def inter_aspects(chart_a: dict, chart_b: dict) -> list[dict]:
    rows = []
    for left in SYNASTRY_BODIES:
        for right in SYNASTRY_BODIES:
            aspect = find_aspect(
                chart_a["planets"][left]["longitude"],
                chart_b["planets"][right]["longitude"],
            )
            if aspect is None:
                continue
            rows.append(
                {
                    **aspect,
                    "a": left,
                    "b": right,
                    "a_name": chart_a["planets"][left]["name"],
                    "b_name": chart_b["planets"][right]["name"],
                }
            )
    rows.sort(key=lambda item: item["orb"])
    return rows


def score_aspects(aspects: list[dict]) -> int:
    raw = sum(_WEIGHTS[item["type"]] for item in aspects)
    return max(0, min(100, 50 + raw * 3))


def _band(score: int) -> str:
    if score >= 80:
        return "Много гармоничных связей: договариваться легче, чем спорить."
    if score >= 60:
        return "Есть опора и есть трение. Совместные планы лучше дробить на короткие шаги."
    if score >= 40:
        return "Смешанная динамика. Сначала проговорите ожидания, потом общие дела."
    return "Напряжённых аспектов больше. Контакт держится на ясных правилах, не на догадках."


def render_synastry(chart_a: dict, chart_b: dict, name_a: str, name_b: str) -> SynastryReport:
    aspects = inter_aspects(chart_a, chart_b)
    score = score_aspects(aspects)
    highlights = []
    for aspect in aspects[:3]:
        highlights.append(
            f"{aspect['a_name']} {aspect['title']} {aspect['b_name']} (орб {aspect['orb']}°)"
        )
    detail = "; ".join(highlights) if highlights else "тесных межкарточных аспектов мало"
    text = ensure_disclaimer(
        f"Синастрия {name_a} и {name_b}: условный индекс {score} из 100. {_band(score)} "
        f"Ближе всего: {detail}. Это не приговор паре, а карта тем для разговора."
    )
    return SynastryReport(score=score, aspects=aspects, text=text)
