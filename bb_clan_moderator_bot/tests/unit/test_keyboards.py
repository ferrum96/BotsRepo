from bot.config import AdminContact, Config
from bot.keyboards import (
    activity_keyboard,
    admin_contact_keyboard,
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


def _urls(markup) -> list[str]:
    return [btn.url for row in markup.inline_keyboard for btn in row if btn.url]


def _texts(markup) -> list[str]:
    return [btn.text for row in markup.inline_keyboard for btn in row]


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
        admin_contacts=[
            AdminContact(username="clan_admin"),
            AdminContact(username="helper", label="Помощник"),
        ],
    )
    markup = join_clan_keyboard(cfg)
    assert _urls(markup) == [
        "https://t.me/+g",
        "https://discord.gg/d",
    ]
    assert "👤 @clan_admin" not in _texts(markup)
    assert "👤 Помощник" not in _texts(markup)


def test_join_clan_keyboard_fallback_without_links():
    cfg = Config(bot_token="t", group_id=1)
    assert _callback_data(join_clan_keyboard(cfg)) == {"join:info"}


def test_admin_contact_keyboard_single():
    cfg = Config(
        bot_token="t",
        group_id=1,
        admin_contacts=[AdminContact(username="boss")],
    )
    markup = admin_contact_keyboard(cfg)
    assert markup is not None
    assert _urls(markup) == ["https://t.me/boss"]
    assert _texts(markup) == ["👤 Написать админу"]


def test_admin_contact_keyboard_multiple():
    cfg = Config(
        bot_token="t",
        group_id=1,
        admin_contacts=[
            AdminContact(username="a"),
            AdminContact(username="b", label="Боб"),
        ],
    )
    markup = admin_contact_keyboard(cfg)
    assert markup is not None
    assert _urls(markup) == ["https://t.me/a", "https://t.me/b"]
    assert _texts(markup) == ["👤 @a", "👤 Боб"]


def test_admin_contact_keyboard_missing():
    cfg = Config(bot_token="t", group_id=1)
    assert admin_contact_keyboard(cfg) is None
