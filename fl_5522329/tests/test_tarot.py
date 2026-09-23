import random

from app.tarot.deck import DECK
from app.tarot.draw import draw_three, render_spread
from app.texts import DISCLAIMER_LINE


def test_deck_and_draw():
    assert len(DECK) == 78
    assert len({card.slug for card in DECK}) == 78
    cards = draw_three(random.Random(1))
    again = draw_three(random.Random(1))
    assert [item.card.slug for item in cards] == [item.card.slug for item in again]
    assert len({item.card.slug for item in cards}) == 3
    text = render_spread(cards)
    assert "Прошлое" in text and "Будущее" in text
    assert DISCLAIMER_LINE in text
