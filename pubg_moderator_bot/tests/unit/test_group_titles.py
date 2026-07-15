from unittest.mock import AsyncMock, MagicMock

from bot.group_titles import (
    CUSTOM_TITLE_MAX_LEN,
    MEMBER_TAG_MAX_LEN,
    assign_game_nick_tag,
    build_game_nick_tag,
    build_game_nick_title,
    sanitize_custom_title,
    sanitize_member_tag,
)


def test_sanitize_empty():
    assert sanitize_member_tag("") == ""
    assert sanitize_member_tag("   ") == ""
    assert sanitize_member_tag(None) == ""  # type: ignore[arg-type]
    assert sanitize_custom_title("") == ""


def test_sanitize_trims_whitespace():
    assert sanitize_member_tag("  Nick  ") == "Nick"


def test_sanitize_clips_to_utf16_limit():
    long_ascii = "A" * 20
    assert len(sanitize_member_tag(long_ascii)) == MEMBER_TAG_MAX_LEN
    assert MEMBER_TAG_MAX_LEN == CUSTOM_TITLE_MAX_LEN

    emoji = "😀" * 9
    assert sanitize_member_tag(emoji) == ""


def test_build_game_nick_tag_unwraps_braces():
    assert build_game_nick_tag("{Shadow}") == "Shadow"
    assert build_game_nick_title("{{Nested}}") == "Nested"
    assert build_game_nick_tag("{  Trim  }") == "Trim"


def test_build_game_nick_tag_empty_after_normalize():
    assert build_game_nick_tag("{}") == ""
    assert build_game_nick_tag("   ") == ""


def test_build_game_nick_tag_preserves_short_nicks():
    assert build_game_nick_tag("Pro") == "Pro"


async def test_assign_game_nick_tag_http(monkeypatch):
    http = AsyncMock(return_value=True)
    monkeypatch.setattr("bot.group_titles._set_chat_member_tag_http", http)

    bot = MagicMock()
    bot.token = "TOKEN"
    # No native PTB helper — force HTTP fallback.
    del bot.set_chat_member_tag

    ok = await assign_game_nick_tag(bot, -100, 7, "AlcoSafr")
    assert ok is True
    http.assert_awaited_once()
    assert http.await_args.kwargs["tag"] == "AlcoSafr"
    assert http.await_args.kwargs["user_id"] == 7


async def test_assign_game_nick_tag_skips_empty():
    bot = AsyncMock()
    bot.token = "TOKEN"
    assert await assign_game_nick_tag(bot, -100, 7, "   ") is False
