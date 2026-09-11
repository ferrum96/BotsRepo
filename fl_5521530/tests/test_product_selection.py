from __future__ import annotations

from datetime import UTC, datetime

from app.domain.enums import PublicationStatus
from app.repositories.publication_repository import PublicationRepository
from tests.conftest import add_product


async def test_random_product(session, services):
    await add_product(session, sku="ONLY")
    product = await services.selection.random_in_stock()
    assert product.sku == "ONLY"


async def test_stale_product_prefers_never_published(session, services):
    fresh = await add_product(session, sku="FRESH", name="Fresh")
    stale = await add_product(session, sku="STALE", name="Stale")
    assert fresh.id and stale.id
    _, content, publication = await services.content.generate(fresh.id, show_stock=True)
    assert publication.id and content.id
    row = await PublicationRepository(session).get_for_update(publication.id)
    assert row is not None
    row.status = PublicationStatus.PUBLISHED.value
    row.published_at = datetime.now(UTC)
    await session.flush()
    picked = await services.selection.stale()
    assert picked.sku == "STALE"


async def test_search_by_sku(session, services):
    await add_product(session, sku="ABC-9", name="Other")
    found = await services.selection.search("ABC-9")
    assert found[0].sku == "ABC-9"
