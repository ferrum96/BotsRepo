from bot.config import Config
from bot.keyboards import (
    activity_keyboard,
    age_keyboard,
    join_clan_keyboard,
    level_keyboard,
    perspective_keyboard,
    text_step_back_keyboard,
)


def _callback_data(markup) -> set[str]:
    data = set()
    for row in markup.inline_keyboard:
        for button in row:
            if button.callback_data:
                data.add(button.callback_data)
    return data


def test_age_keyboard_options():
    assert _callback_data(age_keyboard()) == {"age:under", "age:ok"}


def test_level_keyboard_options():
    assert _callback_data(level_keyboard()) == {"level:under", "level:ok"}


def test_activity_keyboard_options():
    assert _callback_data(activity_keyboard()) == {"activity:low", "activity:ok"}


def test_perspective_keyboard_options():
    assert _callback_data(perspective_keyboard()) == {
        "perspective:fpp",
        "perspective:tpp",
        "perspective:mixed",
    }


def test_text_step_back_keyboard():
    assert _callback_data(text_step_back_keyboard("back:level")) == {"back:level"}


def test_join_clan_keyboard_with_links():
    cfg = Config(
        bot_token="t",
        group_id=1,
        telegram_group_link="https://t.me/+g",
        discord_link="https://discord.gg/d",
    )
    markup = join_clan_keyboard(cfg)
    urls = [btn.url for row in markup.inline_keyboard for btn in row]
    assert urls == ["https://t.me/+g", "https://discord.gg/d"]


def test_join_clan_keyboard_fallback_without_links():
    cfg = Config(bot_token="t", group_id=1)
    assert _callback_data(join_clan_keyboard(cfg)) == {"join:info"}
