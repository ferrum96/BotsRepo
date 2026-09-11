from __future__ import annotations

from app.application.catalog_service import CatalogService
from app.domain.exceptions import ValidationError
from app.repositories.import_job_repository import ImportJobRepository
from app.repositories.product_repository import ProductRepository
from tests.conftest import VALID_CSV


async def test_import_valid_csv(session):
    service = CatalogService(
        ProductRepository(session),
        ImportJobRepository(session),
        max_csv_size_bytes=1024 * 1024,
    )
    job = await service.import_csv(filename="catalog.csv", content=VALID_CSV.encode())
    assert job.total_rows == 2
    assert job.created_rows == 2
    assert job.failed_rows == 0
    product = await ProductRepository(session).get_by_sku("SKU-1")
    assert product is not None
    assert product.name == "Tea"
    assert product.source_data["color"] == "black"


async def test_import_broken_row(session):
    raw = (
        "sku,name,price,currency,stock\n"
        "SKU-1,Tea,10,EUR,3\n"
        "SKU-BAD,,not-a-price,EUR,1\n"
    )
    service = CatalogService(
        ProductRepository(session),
        ImportJobRepository(session),
        max_csv_size_bytes=1024 * 1024,
    )
    job = await service.import_csv(filename="bad.csv", content=raw.encode())
    assert job.created_rows == 1
    assert job.failed_rows == 1
    assert job.error_report[0]["row"] == 3


async def test_reimport_updates_by_sku(session):
    service = CatalogService(
        ProductRepository(session),
        ImportJobRepository(session),
        max_csv_size_bytes=1024 * 1024,
    )
    await service.import_csv(filename="a.csv", content=VALID_CSV.encode())
    updated = (
        "sku,name,category,description,price,currency,stock,image_url\n"
        "SKU-1,Tea Premium,Drinks,Updated,12.00,EUR,7,\n"
    )
    job = await service.import_csv(filename="b.csv", content=updated.encode())
    assert job.created_rows == 0
    assert job.updated_rows == 1
    product = await ProductRepository(session).get_by_sku("SKU-1")
    assert product is not None
    assert product.name == "Tea Premium"
    assert product.stock == 7
    remaining = await ProductRepository(session).get_by_sku("SKU-2")
    assert remaining is not None


async def test_reject_non_csv_extension():
    service = CatalogService(
        ProductRepository(None),  # type: ignore[arg-type]
        ImportJobRepository(None),  # type: ignore[arg-type]
        max_csv_size_bytes=10,
    )
    try:
        service.validate_file(filename="catalog.xlsx", size=10, mime_type="text/csv")
    except ValidationError as exc:
        assert "csv" in exc.message.lower()
    else:
        raise AssertionError("expected ValidationError")
