import asyncio
import time

import httpx


async def _fire_requests(app, total_requests: int) -> tuple[int, float]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        start = time.perf_counter()
        responses = await asyncio.gather(
            *[client.get("/api/health") for _ in range(total_requests)]
        )
        elapsed = time.perf_counter() - start
    ok_count = sum(1 for r in responses if r.status_code == 200)
    return ok_count, elapsed


def test_api_health_load(api_module):
    total_requests = 200
    ok_count, elapsed = asyncio.run(_fire_requests(api_module.app, total_requests))

    assert ok_count == total_requests
    # Smoke threshold: detects severe performance regressions.
    assert elapsed < 10
