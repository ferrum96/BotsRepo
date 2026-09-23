from __future__ import annotations

from urllib.parse import quote


def parse_referrer(args: str | None) -> int | None:
    if not args or not args.startswith("ref_"):
        return None
    raw = args.removeprefix("ref_")
    if not raw.isdigit() or len(raw) > 15:
        return None
    value = int(raw)
    if value <= 0:
        return None
    return value


def referral_link(bot_username: str, user_id: int) -> str:
    username = bot_username.lstrip("@").strip()
    if not username:
        raise ValueError("bot username is empty")
    return f"https://t.me/{username}?start=ref_{user_id}"


def share_url(link: str) -> str:
    text = "Проверь совместимость со мной"
    return f"https://t.me/share/url?url={quote(link, safe='')}&text={quote(text)}"
