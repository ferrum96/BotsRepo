import asyncio
import time

import httpx
from fastapi.testclient import TestClient

from tests.conftest import PROD_GROUP_SIZE_CAP, seed_member_sync


def test_api_health_load(api_module):
    total_requests = 200
    with TestClient(api_module.app) as client:
        start = time.perf_counter()
        responses = [client.get("/health") for _ in range(total_requests)]
        elapsed = time.perf_counter() - start

    ok_count = sum(1 for r in responses if r.status_code == 200)
    assert ok_count == total_requests
    # Smoke threshold: detects severe performance regressions.
    assert elapsed < 10


def test_api_members_list_load(api_module, db_path):
    with TestClient(api_module.app) as client:
        seed_member_sync(db_path, 1, track_in_group=True)
        seed_member_sync(db_path, 2, track_in_group=True)
        seed_member_sync(db_path, 3, track_in_group=True)

        start = time.perf_counter()
        responses = [client.get("/api/members") for _ in range(100)]
        elapsed = time.perf_counter() - start

    ok_count = sum(1 for r in responses if r.status_code == 200)
    assert ok_count == 100
    assert elapsed < 10


def test_api_members_list_prod_size_payload(api_module, db_path):
    """Repeated reads of a full ~100-member roster stay fast enough."""
    with TestClient(api_module.app) as client:
        for i in range(1, PROD_GROUP_SIZE_CAP + 1):
            seed_member_sync(
                db_path,
                user_id=40_000 + i,
                game_nick=f"Load{i}",
                track_in_group=True,
            )

        start = time.perf_counter()
        responses = [client.get("/api/members") for _ in range(20)]
        elapsed = time.perf_counter() - start

    assert all(r.status_code == 200 for r in responses)
    assert all(len(r.json()) == PROD_GROUP_SIZE_CAP for r in responses)
    assert elapsed < 10


async def _fire_concurrent_health(app, total_requests: int) -> tuple[int, float]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Warm up lifespan-equivalent init via TestClient first is required for DB;
        # health does not need DB, so concurrent ASGI calls are fine.
        start = time.perf_counter()
        responses = await asyncio.gather(
            *[client.get("/health") for _ in range(total_requests)]
        )
        elapsed = time.perf_counter() - start
    ok_count = sum(1 for r in responses if r.status_code == 200)
    return ok_count, elapsed


def test_api_health_concurrent_load(api_module):
    ok_count, elapsed = asyncio.run(_fire_concurrent_health(api_module.app, 150))
    assert ok_count == 150
    assert elapsed < 10
