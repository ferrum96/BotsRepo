from datetime import date

import pytest

from app.geo.coords import (
    InputError,
    clean_place,
    parse_birth_date,
    parse_birth_time,
    parse_coord_pair,
    validate_coords,
)
from app.referral import parse_referrer, referral_link, share_url


def test_coords():
    validate_coords(55.75, 37.61)
    validate_coords(-90, -180)
    with pytest.raises(InputError):
        validate_coords(90.1, 0)
    with pytest.raises(InputError):
        validate_coords(float("nan"), 0)
    assert parse_coord_pair("55.75, 37.61") == (55.75, 37.61)
    assert parse_coord_pair("Москва") is None


def test_birth_inputs():
    assert parse_birth_date("01.01.2000", today=date(2026, 1, 1)) == date(2000, 1, 1)
    assert parse_birth_date("2000-01-01", today=date(2026, 1, 1)) == date(2000, 1, 1)
    with pytest.raises(InputError):
        parse_birth_date("01.01.1899", today=date(2026, 1, 1))
    with pytest.raises(InputError):
        parse_birth_date("02.01.2026", today=date(2026, 1, 1))
    parsed, known = parse_birth_time("7:05")
    assert (parsed.hour, parsed.minute, known) == (7, 5, True)
    _, unknown = parse_birth_time("не знаю")
    assert unknown is False
    with pytest.raises(InputError):
        parse_birth_time("25:00")
    assert clean_place("  Москва   ") == "Москва"


def test_referral():
    assert parse_referrer("ref_42") == 42
    assert parse_referrer("hello") is None
    assert parse_referrer("ref_0") is None
    link = referral_link("@AstroBot", 7)
    assert link == "https://t.me/AstroBot?start=ref_7"
    assert "t.me/share/url" in share_url(link)
    with pytest.raises(ValueError):
        referral_link("  ", 1)
