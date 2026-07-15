from typing import Optional
from unittest.mock import AsyncMock, MagicMock

from telegram.constants import ChatMemberStatus

from bot.config import Config
from bot.database import Database, SurveyProgress
from bot.handlers.admin import (
    _may_enter_group,
    _promote_from_completed_survey,
    _reject_unauthorized_join,
    _soft_kick_user_ids,
    ban_user_in_group,
    enforce_blacklist_telegram_bans,
    on_chat_join_request,
    on_chat_member_update,
)
from tests.conftest import GROUP_ID, seed_member


class _User:
    def __init__(self, user_id: int, username: str = "u", first_name: str = "U"):
        self.id = user_id
        self.username = username
        self.first_name = first_name
        self.is_bot = False


def _member_update(
    *,
    user_id: int,
    old_status: str,
    new_status: str,
    chat_id: int = GROUP_ID,
    old_tag: Optional[str] = None,
    new_tag: Optional[str] = None,
):
    user = _User(user_id)
    old_cm = MagicMock()
    old_cm.status = old_status
    old_cm.tag = None
    old_cm.custom_title = None
    old_cm.api_kwargs = {"tag": old_tag} if old_tag is not None else {}
    new_cm = MagicMock()
    new_cm.status = new_status
    new_cm.user = user
    new_cm.tag = None
    new_cm.custom_title = None
    # Mimic PTB <22.7: tag lives in api_kwargs, not as a typed attribute.
    new_cm.api_kwargs = {"tag": new_tag} if new_tag is not None else {}
    chat_member = MagicMock()
    chat_member.chat.id = chat_id
    chat_member.old_chat_member = old_cm
    chat_member.new_chat_member = new_cm
    update = MagicMock()
    update.chat_member = chat_member
    return update


async def test_may_enter_group_denies_blacklisted(db: Database, config: Config):
    await db.add_to_blacklist(1, "survey_failed")
    assert await _may_enter_group(db, config, 1) is False


async def test_may_enter_group_allows_admin(db: Database, config: Config):
    assert await _may_enter_group(db, config, 42) is True


async def test_may_enter_group_allows_member(db: Database, config: Config):
    await seed_member(db, 77, track_in_group=False)
    assert await _may_enter_group(db, config, 77) is True


async def test_may_enter_group_allows_completed_survey(db: Database, config: Config):
    await db.set_progress(
        SurveyProgress(
            user_id=88,
            step="completed",
            game_nick="Nick",
            real_name="Name",
            perspective="TPP",
        )
    )
    assert await _may_enter_group(db, config, 88) is True


async def test_may_enter_group_denies_stranger(db: Database, config: Config):
    assert await _may_enter_group(db, config, 999) is False


async def test_promote_from_completed_survey(db: Database):
    await db.set_progress(
        SurveyProgress(
            user_id=200,
            step="completed",
            game_nick="Fox",
            real_name="Alex",
            discord_nick="fox#1",
            perspective="Mixed",
        )
    )
    promoted = await _promote_from_completed_survey(db, _User(200, "fox", "Alex"))
    assert promoted is True
    member = await db.get_member(200)
    assert member is not None
    assert member.game_nick == "Fox"
    assert member.perspective == "Mixed"
    assert await db.get_progress(200) is None


async def test_promote_from_incomplete_survey_fails(db: Database):
    await db.set_progress(SurveyProgress(user_id=201, step="age"))
    assert await _promote_from_completed_survey(db, _User(201)) is False
    assert await db.is_member(201) is False


async def test_ban_user_in_group_permanent_skips_unban(config: Config, monkeypatch):
    bot = AsyncMock()
    bot.ban_chat_member = AsyncMock()
    bot.unban_chat_member = AsyncMock()
    monkeypatch.setattr(
        "bot.handlers.admin.remove_from_group_header",
        AsyncMock(return_value=True),
    )

    ok = await ban_user_in_group(bot, config, 55, permanent=True)
    assert ok is True
    bot.ban_chat_member.assert_awaited_once_with(config.group_id, 55)
    bot.unban_chat_member.assert_not_called()


async def test_ban_user_in_group_soft_unbans(config: Config, monkeypatch):
    bot = AsyncMock()
    bot.ban_chat_member = AsyncMock()
    bot.unban_chat_member = AsyncMock()
    monkeypatch.setattr(
        "bot.handlers.admin.remove_from_group_header",
        AsyncMock(return_value=True),
    )

    ok = await ban_user_in_group(bot, config, 56, permanent=False)
    assert ok is True
    bot.ban_chat_member.assert_awaited_once()
    bot.unban_chat_member.assert_awaited_once_with(config.group_id, 56)


async def test_reject_blacklisted_join_hard_bans(db: Database, config: Config, monkeypatch):
    await db.add_to_blacklist(300, "survey_failed")
    await db.track_group_member(300)

    ban = AsyncMock(return_value=True)
    monkeypatch.setattr("bot.handlers.admin.ban_user_in_group", ban)

    await _reject_unauthorized_join(MagicMock(), config, db, 300)

    ban.assert_awaited_once()
    assert ban.await_args.kwargs["permanent"] is True
    assert 300 not in await db.get_group_member_ids()


async def test_reject_unvetted_join_soft_kicks(db: Database, config: Config, monkeypatch):
    await db.track_group_member(301)

    ban = AsyncMock(return_value=True)
    monkeypatch.setattr("bot.handlers.admin.ban_user_in_group", ban)

    await _reject_unauthorized_join(MagicMock(), config, db, 301)

    ban.assert_awaited_once()
    assert ban.await_args.kwargs["permanent"] is False
    assert 301 not in await db.get_group_member_ids()


async def test_soft_kick_marks_user_for_blacklist_skip(config: Config, monkeypatch):
    bot = AsyncMock()
    bot.ban_chat_member = AsyncMock()
    bot.unban_chat_member = AsyncMock()
    monkeypatch.setattr(
        "bot.handlers.admin.remove_from_group_header",
        AsyncMock(return_value=True),
    )
    _soft_kick_user_ids.discard(777)

    await ban_user_in_group(bot, config, 777, permanent=False)
    assert 777 in _soft_kick_user_ids
    bot.unban_chat_member.assert_awaited_once()
    _soft_kick_user_ids.discard(777)


async def test_soft_kick_keeps_marker_when_unban_fails(config: Config, monkeypatch):
    from telegram.error import BadRequest

    bot = AsyncMock()
    bot.ban_chat_member = AsyncMock()
    bot.unban_chat_member = AsyncMock(side_effect=BadRequest("unban failed"))
    monkeypatch.setattr(
        "bot.handlers.admin.remove_from_group_header",
        AsyncMock(return_value=True),
    )
    _soft_kick_user_ids.discard(778)

    ok = await ban_user_in_group(bot, config, 778, permanent=False)
    assert ok is False
    assert 778 in _soft_kick_user_ids
    _soft_kick_user_ids.discard(778)


async def test_reject_skips_clan_members(db: Database, config: Config, monkeypatch):
    await seed_member(db, 302, track_in_group=True)

    ban = AsyncMock(return_value=True)
    monkeypatch.setattr("bot.handlers.admin.ban_user_in_group", ban)

    await _reject_unauthorized_join(MagicMock(), config, db, 302)

    ban.assert_not_called()
    assert 302 in await db.get_group_member_ids()


async def test_handle_join_assigns_member_tag(
    db: Database, config: Config, monkeypatch
):
    from bot.handlers.admin import _handle_vetted_group_join

    user = _User(303, "fox", "Alex")
    await seed_member(db, 303, game_nick="FoxNick", track_in_group=False)

    assign = AsyncMock(return_value=True)
    reject = AsyncMock()
    restrict = AsyncMock(return_value=True)
    monkeypatch.setattr("bot.handlers.admin.assign_game_nick_tag", assign)
    monkeypatch.setattr("bot.handlers.admin._reject_unauthorized_join", reject)
    monkeypatch.setattr(
        "bot.handlers.admin._apply_default_member_permissions", restrict
    )
    monkeypatch.setattr("bot.handlers.admin.check_activity_on_join", AsyncMock())
    monkeypatch.setattr(
        "bot.handlers.admin._promote_from_completed_survey",
        AsyncMock(return_value=False),
    )
    checks = iter([False, True])

    async def _is_member(_user_id: int) -> bool:
        return next(checks)

    monkeypatch.setattr(db, "is_member", _is_member)

    bot = MagicMock()
    await _handle_vetted_group_join(bot, config, db, user)

    reject.assert_not_called()
    restrict.assert_awaited_once_with(bot, config, 303)
    assign.assert_awaited_once()
    assert assign.await_args.args[3] == "FoxNick"


async def test_apply_default_member_permissions_messages_and_media_only(
    config: Config,
):
    from bot.handlers.admin import _apply_default_member_permissions
    from telegram import ChatPermissions

    bot = AsyncMock()
    ok = await _apply_default_member_permissions(bot, config, 909)
    assert ok is True
    bot.restrict_chat_member.assert_awaited_once()
    kwargs = bot.restrict_chat_member.await_args.kwargs
    assert kwargs["chat_id"] == config.group_id
    assert kwargs["user_id"] == 909
    perms: ChatPermissions = kwargs["permissions"]
    assert perms.can_send_messages is True
    assert perms.can_send_photos is True
    assert perms.can_send_videos is True
    assert perms.can_send_documents is True
    assert perms.can_send_polls is True
    assert perms.can_send_other_messages is True
    assert perms.can_invite_users is False
    assert perms.can_pin_messages is False
    assert perms.can_change_info is False
    assert perms.api_kwargs.get("can_edit_tag") is False
    assert perms.api_kwargs.get("can_react_to_messages") is True


async def test_apply_default_member_permissions_skips_config_admin(config: Config):
    from bot.handlers.admin import _apply_default_member_permissions

    bot = AsyncMock()
    ok = await _apply_default_member_permissions(bot, config, config.admin_ids[0])
    assert ok is False
    bot.restrict_chat_member.assert_not_called()


async def test_soft_kick_banned_event_does_not_blacklist(
    db: Database, mock_context, monkeypatch
):
    await db.track_group_member(410)
    _soft_kick_user_ids.add(410)
    monkeypatch.setattr(
        "bot.handlers.admin.sync_group_members_state",
        AsyncMock(
            return_value={
                "total": 0,
                "present": 0,
                "missing": 0,
                "blacklisted": 0,
                "errors": 0,
            }
        ),
    )

    update = _member_update(
        user_id=410,
        old_status=ChatMemberStatus.MEMBER,
        new_status=ChatMemberStatus.BANNED,
    )
    await on_chat_member_update(update, mock_context)

    assert await db.is_blacklisted(410) is False
    assert 410 not in _soft_kick_user_ids
    assert 410 not in await db.get_group_member_ids()


async def test_admin_ban_event_adds_blacklist(db: Database, mock_context, monkeypatch):
    await seed_member(db, 411, track_in_group=True)
    _soft_kick_user_ids.discard(411)
    monkeypatch.setattr(
        "bot.handlers.admin.sync_group_members_state",
        AsyncMock(
            return_value={
                "total": 0,
                "present": 0,
                "missing": 0,
                "blacklisted": 0,
                "errors": 0,
            }
        ),
    )

    update = _member_update(
        user_id=411,
        old_status=ChatMemberStatus.MEMBER,
        new_status=ChatMemberStatus.BANNED,
    )
    await on_chat_member_update(update, mock_context)

    assert await db.is_blacklisted(411) is True


async def test_voluntary_leave_does_not_blacklist(db: Database, mock_context, monkeypatch):
    await seed_member(db, 412, track_in_group=True)
    monkeypatch.setattr(
        "bot.handlers.admin.sync_group_members_state",
        AsyncMock(
            return_value={
                "total": 0,
                "present": 0,
                "missing": 0,
                "blacklisted": 0,
                "errors": 0,
            }
        ),
    )

    update = _member_update(
        user_id=412,
        old_status=ChatMemberStatus.MEMBER,
        new_status=ChatMemberStatus.LEFT,
    )
    await on_chat_member_update(update, mock_context)

    assert await db.is_blacklisted(412) is False


async def test_join_request_blacklisted_declines_and_bans(
    db: Database, mock_context, monkeypatch
):
    await db.add_to_blacklist(420, "survey_failed")
    ban = AsyncMock(return_value=True)
    monkeypatch.setattr("bot.handlers.admin.ban_user_in_group", ban)

    user = _User(420)
    req = MagicMock()
    req.chat.id = GROUP_ID
    req.from_user = user
    update = MagicMock()
    update.chat_join_request = req
    mock_context.bot.decline_chat_join_request = AsyncMock()

    await on_chat_join_request(update, mock_context)

    mock_context.bot.decline_chat_join_request.assert_awaited_once_with(
        chat_id=GROUP_ID,
        user_id=420,
    )
    ban.assert_awaited_once()
    assert ban.await_args.kwargs["permanent"] is True


async def test_enforce_blacklist_bans_non_banned_users(
    db: Database, config: Config, monkeypatch
):
    await db.add_to_blacklist(430, "kicked_from_dashboard")
    await db.add_to_blacklist(431, "survey_failed")

    bot = AsyncMock()

    async def _get_chat_member(_chat_id, user_id):
        member = MagicMock()
        member.status = (
            ChatMemberStatus.BANNED if user_id == 431 else ChatMemberStatus.LEFT
        )
        return member

    bot.get_chat_member = AsyncMock(side_effect=_get_chat_member)
    ban = AsyncMock(return_value=True)
    monkeypatch.setattr("bot.handlers.admin.ban_user_in_group", ban)

    result = await enforce_blacklist_telegram_bans(bot, db, config)

    assert result["total"] == 2
    assert result["banned"] == 1
    assert result["skipped"] == 1
    assert result["errors"] == 0
    ban.assert_awaited_once()
    assert ban.await_args.args[2] == 430
    assert ban.await_args.kwargs["permanent"] is True


async def test_enforce_blacklist_skips_admins(db: Database, config: Config, monkeypatch):
    await db.add_to_blacklist(42, "removed_from_group")
    bot = AsyncMock()
    ban = AsyncMock(return_value=True)
    monkeypatch.setattr("bot.handlers.admin.ban_user_in_group", ban)

    result = await enforce_blacklist_telegram_bans(bot, db, config)

    assert result["skipped"] == 1
    assert result["banned"] == 0
    ban.assert_not_called()


async def test_unauthorized_join_event_rejects(
    db: Database, mock_context, monkeypatch
):
    reject = AsyncMock()
    monkeypatch.setattr("bot.handlers.admin._reject_unauthorized_join", reject)

    update = _member_update(
        user_id=440,
        old_status=ChatMemberStatus.LEFT,
        new_status=ChatMemberStatus.MEMBER,
    )
    await on_chat_member_update(update, mock_context)

    reject.assert_awaited_once()
    assert reject.await_args.args[3] == 440


async def test_manual_member_tag_change_updates_game_nick(
    db: Database, mock_context
):
    await seed_member(db, 450, game_nick="OldNick", track_in_group=True)

    update = _member_update(
        user_id=450,
        old_status=ChatMemberStatus.MEMBER,
        new_status=ChatMemberStatus.MEMBER,
        old_tag="OldNick",
        new_tag="ManualNick",
    )
    await on_chat_member_update(update, mock_context)

    member = await db.get_member(450)
    assert member is not None
    assert member.game_nick == "ManualNick"


async def test_manual_tag_change_for_group_administrator(
    db: Database, mock_context
):
    """Admin/owner title or tag edits must also land in DB."""
    await seed_member(db, 452, game_nick="OldAdmin", track_in_group=True)

    update = _member_update(
        user_id=452,
        old_status=ChatMemberStatus.ADMINISTRATOR,
        new_status=ChatMemberStatus.ADMINISTRATOR,
        old_tag="OldAdmin",
        new_tag="NewAdminTitle",
    )
    await on_chat_member_update(update, mock_context)

    member = await db.get_member(452)
    assert member is not None
    assert member.game_nick == "NewAdminTitle"


async def test_manual_tag_change_for_config_admin_id(
    db: Database, mock_context, config: Config
):
    admin_id = config.admin_ids[0]
    await seed_member(db, admin_id, game_nick="BossOld", track_in_group=True)

    update = _member_update(
        user_id=admin_id,
        old_status=ChatMemberStatus.MEMBER,
        new_status=ChatMemberStatus.MEMBER,
        old_tag="BossOld",
        new_tag="BossNew",
    )
    await on_chat_member_update(update, mock_context)

    member = await db.get_member(admin_id)
    assert member is not None
    assert member.game_nick == "BossNew"


async def test_member_tag_from_api_kwargs():
    from types import MappingProxyType

    from bot.handlers.admin import _member_tag_from_chat_member
    from telegram import ChatMemberMember

    # Real PTB path: unknown fields land in mappingproxy api_kwargs.
    cm = ChatMemberMember.de_json(
        {
            "status": "member",
            "user": {"id": 1, "is_bot": False, "first_name": "Ab"},
            "tag": "FromKwargs",
        },
        None,
    )
    assert isinstance(cm.api_kwargs, MappingProxyType)
    assert _member_tag_from_chat_member(cm) == "FromKwargs"


async def test_member_tag_from_real_ptb_cyrillic():
    from bot.handlers.admin import _member_tag_from_chat_member
    from telegram import ChatMemberMember

    cm = ChatMemberMember.de_json(
        {
            "status": "member",
            "user": {"id": 2, "is_bot": False, "first_name": "Ab"},
            "tag": "AlcoSafпарк",
        },
        None,
    )
    assert _member_tag_from_chat_member(cm) == "AlcoSafпарк"


async def test_matching_member_tag_does_not_rewrite_long_nick(
    db: Database, mock_context
):
    long_nick = "VeryLongNicknameXX"
    await seed_member(db, 451, game_nick=long_nick, track_in_group=True)
    from bot.group_titles import build_game_nick_tag

    clipped = build_game_nick_tag(long_nick)
    update = _member_update(
        user_id=451,
        old_status=ChatMemberStatus.MEMBER,
        new_status=ChatMemberStatus.MEMBER,
        old_tag=clipped,
        new_tag=clipped,
    )
    await on_chat_member_update(update, mock_context)

    member = await db.get_member(451)
    assert member is not None
    assert member.game_nick == long_nick
