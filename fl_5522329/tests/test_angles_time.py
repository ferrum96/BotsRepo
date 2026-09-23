from datetime import datetime, timedelta, timezone

import pytest

from app.astrology.angles import (
    SIGNS,
    angular_separation,
    find_aspect,
    house_of,
    in_house_arc,
    sign_of,
)
from app.timeutil import TROPICAL_YEAR_DAYS, msk_today, secondary_progression_days, seconds_until_msk_midnight


def test_sign_boundaries():
    assert sign_of(0)[0] == "Овен"
    assert sign_of(29.9)[0] == "Овен"
    assert sign_of(30)[0] == "Телец"
    assert sign_of(359.9)[0] == "Рыбы"
    assert sign_of(-1)[0] == "Рыбы"
    assert len(SIGNS) == 12


def test_aspects_and_orbs():
    assert angular_separation(1, 359) == 2
    assert find_aspect(0, 0)["type"] == "conjunction"
    assert find_aspect(10, 70)["type"] == "sextile"
    assert find_aspect(0, 90)["type"] == "square"
    assert find_aspect(0, 120)["type"] == "trine"
    assert find_aspect(0, 180)["type"] == "opposition"
    assert find_aspect(0, 8)["type"] == "conjunction"
    assert find_aspect(0, 8.01) is None
    assert find_aspect(0, 45) is None


def test_houses_wrap_zero():
    cusps = [350, 20, 50, 80, 110, 140, 170, 200, 230, 260, 290, 320]
    assert in_house_arc(355, 350, 20)
    assert not in_house_arc(20, 350, 20)
    assert house_of(355, cusps) == 1
    assert house_of(20, cusps) == 2
    assert house_of(320, cusps) == 12


def test_msk_window():
    evening = datetime(2026, 1, 1, 20, 0, tzinfo=timezone.utc)
    assert msk_today(evening).isoformat() == "2026-01-01"
    assert seconds_until_msk_midnight(evening) == 3600
    late = datetime(2026, 1, 1, 20, 59, 30, tzinfo=timezone.utc)
    assert seconds_until_msk_midnight(late) == 60
    after = datetime(2026, 1, 1, 21, 0, tzinfo=timezone.utc)
    assert msk_today(after).isoformat() == "2026-01-02"


def test_secondary_progression_one_year():
    birth = datetime(2000, 1, 1, tzinfo=timezone.utc)
    now = birth + timedelta(days=TROPICAL_YEAR_DAYS)
    assert secondary_progression_days(birth, now) == pytest.approx(1.0)
