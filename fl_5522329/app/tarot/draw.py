from __future__ import annotations

import random
from dataclasses import dataclass

from app.tarot.deck import DECK, POSITIONS, Card
from app.texts import ensure_disclaimer


@dataclass(frozen=True)
class DrawnCard:
    position: str
    card: Card


def draw_three(rng: random.Random | None = None) -> list[DrawnCard]:
    source = rng or random.SystemRandom()
    picked = source.sample(list(DECK), 3)
    return [DrawnCard(position, card) for position, card in zip(POSITIONS, picked, strict=True)]


def render_spread(cards: list[DrawnCard]) -> str:
    if len(cards) != 3:
        raise ValueError("spread expects 3 cards")
    lines = ["Три карты."]
    for item in cards:
        lines.append(f"{item.position}: {item.card.name}. {item.card.meaning}.")
    lines.append("Смотри на связку, не на одну карту: где тема повторяется, туда и внимание.")
    return ensure_disclaimer("\n".join(lines))
