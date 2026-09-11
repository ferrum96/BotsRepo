from __future__ import annotations

from app.domain.exceptions import AccessDeniedError


async def test_whitelist_allows_known_user(services):
    user = await services.access.require_user(1001, "alice")
    assert user.max_user_id == 1001
    assert user.is_active is True


async def test_whitelist_denies_unknown_user(services):
    try:
        await services.access.require_user(9999, "eve")
    except AccessDeniedError:
        return
    raise AssertionError("expected AccessDeniedError")


async def test_is_allowed_sync(services):
    assert services.access.is_allowed(1001) is True
    assert services.access.is_allowed(1) is False
