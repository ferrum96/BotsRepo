import re
from dataclasses import replace
from datetime import timedelta
from typing import List, Pattern

from .models import RawMessage, ScoredMessage

# --- tunable filtering/scoring policy (kept here so limits are discoverable) ---
AGGREGATION_WINDOW = timedelta(minutes=60)  # merge a user's messages within this span
SCORE_CAP = 10                              # max score a single message can earn
QUOTE_MAX_CHARS = 300                       # truncate stored quote to this length
DEFAULT_MIN_LENGTH = 15                     # drop messages shorter than this
DEFAULT_MIN_SCORE = 1                       # permissive prefilter — Claude does the real 0–100 scoring

_STOPWORDS = {
    "что", "как", "это", "для", "где", "когда", "если", "но", "или",
    "и", "в", "на", "по", "с", "из", "от", "до", "за", "при", "без",
    "не", "нет", "да", "мы", "вы", "они", "он", "она", "оно",
    "the", "and", "for", "with", "that", "this", "are", "was", "have",
}

SYSTEM_EVENT_PATTERNS = [
    r"joined the group",
    r"left the group",
    r"pinned a message",
    r"joined via invite",
    r"вступил в группу",
    r"покинул группу",
]


def _is_system_event(text: str) -> bool:
    return any(re.search(p, text, re.IGNORECASE) for p in SYSTEM_EVENT_PATTERNS)


def _extract_keywords(text: str) -> List[str]:
    words = re.findall(r'\b\w{3,}\b', text.lower())
    # Dedup while preserving order: a word repeated in the description must not
    # inflate a message's score (otherwise "продажи продажи" double-counts).
    seen = set()
    keywords = []
    for w in words:
        if w not in _STOPWORDS and w not in seen:
            seen.add(w)
            keywords.append(w)
    return keywords


def _compile_keywords(keywords: List[str]) -> List[Pattern]:
    # Compile each keyword into a word-boundary pattern ONCE, so scoring 2000+
    # messages doesn't rebuild/re-escape the same patterns on every message.
    return [re.compile(r'\b' + re.escape(kw) + r'\b') for kw in keywords]


def _compute_score(text: str, patterns: List[Pattern]) -> int:
    if not patterns:
        return 0
    text_lower = text.lower()
    hits = sum(1 for p in patterns if p.search(text_lower))
    return min(hits, SCORE_CAP)


def _aggregate_user_messages(messages: List[RawMessage]) -> List[RawMessage]:
    if not messages:
        return []

    sorted_msgs = sorted(messages, key=lambda m: (m.user_id, m.date))
    result = []
    current = sorted_msgs[0]

    for msg in sorted_msgs[1:]:
        same_user = msg.user_id == current.user_id
        within_window = (msg.date - current.date) <= AGGREGATION_WINDOW
        # Window is anchored to the start of each segment (current.date never advances).
        # e.g. messages at t=0, t=50, t=100 min: first two merge (50≤60), third doesn't (100>60).

        if same_user and within_window:
            current = replace(current, text=current.text + " " + msg.text)
        else:
            result.append(current)
            current = msg

    result.append(current)
    return result


def build_scorer(product: str, audience: str):
    """Вернуть функцию text → грубый предфильтр-балл 0–10 по описанию продукта.
    Нужна источникам вне Telegram, где нет склейки сообщений по пользователю."""
    patterns = _compile_keywords(_extract_keywords(product + " " + audience))
    return lambda text: _compute_score(text, patterns)


def filter_and_score(
    messages: List[RawMessage],
    product: str,
    audience: str,
    min_length: int = DEFAULT_MIN_LENGTH,
    min_score: int = DEFAULT_MIN_SCORE,
    source: str = "",
) -> List[ScoredMessage]:
    keywords = _extract_keywords(product + " " + audience)
    patterns = _compile_keywords(keywords)

    # A message can score at most len(keywords). If the product/audience
    # description is terse (fewer distinct keywords than min_score), no message
    # could ever reach the threshold and the run would silently return nothing.
    # Clamp the effective threshold so relevant messages still surface — but only
    # when there ARE keywords (an empty description must not flood output).
    effective_min_score = min(min_score, len(keywords)) if keywords else min_score

    # Remove bots and system events BEFORE aggregation (they must never merge
    # into a real user's chain), aggregate, THEN apply the length filter — so a
    # user's short-but-relevant fragments survive inside the merged chain instead
    # of being dropped before they can merge.
    cleaned = [
        m for m in messages
        if not m.is_bot and not _is_system_event(m.text)
    ]
    aggregated = _aggregate_user_messages(cleaned)
    aggregated = [m for m in aggregated if len(m.text) >= min_length]

    scored = []
    for msg in aggregated:
        score = _compute_score(msg.text, patterns)
        if score >= effective_min_score:
            username = f"@{msg.username}" if msg.username else str(msg.user_id)
            name = f"{msg.first_name} {msg.last_name}".strip()
            scored.append(ScoredMessage(
                user_id=msg.user_id,
                username=username,
                name=name,
                text=msg.text[:QUOTE_MAX_CHARS],
                score=score,
                date=msg.date,
                source=source,
            ))

    return sorted(scored, key=lambda m: m.score, reverse=True)
