from __future__ import annotations

from datetime import datetime, timezone

from app.astrology.forecast import (
    current_chart,
    progressed_chart,
    render_daily,
    render_monthly,
    transit_aspects,
)
from app.astrology.synastry import SynastryReport, render_synastry
from app.db.models import NatalChart
from app.services import chart_payload
from app.timeutil import MSK


def _moment(now: datetime | None) -> datetime:
    return now or datetime.now(timezone.utc)


def daily_horoscope(row: NatalChart, now: datetime | None = None) -> str:
    moment = _moment(now)
    payload = chart_payload(row)
    current = current_chart(float(row.latitude), float(row.longitude), moment)
    transits = transit_aspects(payload, current)
    label = moment.astimezone(MSK).strftime("%d.%m.%Y")
    return render_daily(payload, transits, label)


def monthly_forecast(row: NatalChart, now: datetime | None = None) -> str:
    moment = _moment(now)
    payload = chart_payload(row)
    birth_utc = datetime.fromisoformat(payload["birth_utc"])
    progressed = progressed_chart(birth_utc, float(row.latitude), float(row.longitude), moment)
    current = current_chart(float(row.latitude), float(row.longitude), moment)
    transits = transit_aspects(payload, current)
    label = moment.astimezone(MSK).strftime("%m.%Y")
    return render_monthly(payload, progressed, transits, label)


def synastry_text(left: NatalChart, right: NatalChart, name_left: str, name_right: str) -> SynastryReport:
    return render_synastry(chart_payload(left), chart_payload(right), name_left, name_right)
