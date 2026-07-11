from bot.group_titles import (
    CUSTOM_TITLE_MAX_LEN,
    build_game_nick_title,
    sanitize_custom_title,
)


def test_sanitize_empty():
    assert sanitize_custom_title("") == ""
    assert sanitize_custom_title("   ") == ""
    assert sanitize_custom_title(None) == ""  # type: ignore[arg-type]


def test_sanitize_trims_whitespace():
    assert sanitize_custom_title("  Nick  ") == "Nick"


def test_sanitize_clips_to_utf16_limit():
    # BMP characters: 1 UTF-16 unit each
    long_ascii = "A" * 20
    assert len(sanitize_custom_title(long_ascii)) == CUSTOM_TITLE_MAX_LEN

    # Emoji are 2 UTF-16 units each — 9 emoji = 18 units → clip to 8 emoji
    emoji = "😀" * 9
    clipped = sanitize_custom_title(emoji)
    assert len(clipped.encode("utf-16-le")) // 2 == CUSTOM_TITLE_MAX_LEN


def test_build_game_nick_title_unwraps_braces():
    assert build_game_nick_title("{Shadow}") == "Shadow"
    assert build_game_nick_title("{{Nested}}") == "Nested"
    assert build_game_nick_title("{  Trim  }") == "Trim"


def test_build_game_nick_title_empty_after_normalize():
    assert build_game_nick_title("{}") == ""
    assert build_game_nick_title("   ") == ""


def test_build_game_nick_title_preserves_short_nicks():
    assert build_game_nick_title("Pro") == "Pro"
