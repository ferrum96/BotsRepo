from __future__ import annotations

import csv
import io
import logging
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from app.domain.entities import ImportJob
from app.domain.enums import ImportJobStatus
from app.domain.exceptions import CatalogImportError, ValidationError
from app.repositories.import_job_repository import ImportJobRepository
from app.repositories.product_repository import ProductRepository

logger = logging.getLogger(__name__)

KNOWN_COLUMNS = (
    "sku",
    "name",
    "category",
    "description",
    "price",
    "currency",
    "stock",
    "image_url",
)
ALLOWED_EXTENSIONS = {".csv"}
ALLOWED_MIME_TYPES = {
    "text/csv",
    "application/csv",
    "text/plain",
    "application/vnd.ms-excel",
    "application/octet-stream",
}


class CatalogService:
    def __init__(
        self,
        products: ProductRepository,
        import_jobs: ImportJobRepository,
        *,
        max_csv_size_bytes: int,
    ) -> None:
        self._products = products
        self._import_jobs = import_jobs
        self._max_csv_size_bytes = max_csv_size_bytes

    def validate_file(self, *, filename: str, size: int, mime_type: str | None) -> None:
        lower = filename.lower()
        if not any(lower.endswith(ext) for ext in ALLOWED_EXTENSIONS):
            raise ValidationError("CSV only: filename must end with .csv")
        if size <= 0:
            raise ValidationError("CSV file is empty")
        if size > self._max_csv_size_bytes:
            raise ValidationError(
                f"CSV exceeds size limit ({self._max_csv_size_bytes} bytes)"
            )
        if mime_type and mime_type.split(";")[0].strip().lower() not in ALLOWED_MIME_TYPES:
            raise ValidationError(f"Unsupported CSV MIME type: {mime_type}")

    async def import_csv(self, *, filename: str, content: bytes) -> ImportJob:
        if len(content) > self._max_csv_size_bytes:
            raise ValidationError(
                f"CSV exceeds size limit ({self._max_csv_size_bytes} bytes)"
            )
        job = await self._import_jobs.add(filename)
        created = updated = failed = 0
        errors: list[dict[str, Any]] = []
        rows = _parse_rows(content)
        total = len(rows)
        for index, raw in enumerate(rows, start=2):
            try:
                parsed = _parse_product_row(raw)
                _, was_created = await self._products.upsert_by_sku(**parsed)
                if was_created:
                    created += 1
                else:
                    updated += 1
            except ValidationError as exc:
                failed += 1
                errors.append({"row": index, "error": exc.message})
        status = ImportJobStatus.COMPLETED if total else ImportJobStatus.FAILED
        if total == 0:
            errors.append({"row": 1, "error": "CSV has no data rows"})
        completed = await self._import_jobs.complete(
            job.id,  # type: ignore[arg-type]
            status=status,
            total_rows=total,
            created_rows=created,
            updated_rows=updated,
            failed_rows=failed,
            error_report=errors,
            completed_at=datetime.now(UTC),
        )
        logger.info(
            "import job completed created=%s updated=%s failed=%s",
            created,
            updated,
            failed,
        )
        return completed


def _parse_rows(content: bytes) -> list[dict[str, str]]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise CatalogImportError("CSV must be UTF-8") from exc
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise CatalogImportError("CSV has no header row")
    return [dict(row) for row in reader]


def _parse_product_row(raw: dict[str, str]) -> dict[str, Any]:
    normalized = {(key or "").strip().lower(): (value or "").strip() for key, value in raw.items()}
    sku = normalized.get("sku") or ""
    name = normalized.get("name") or ""
    if not sku:
        raise ValidationError("sku is required")
    if not name:
        raise ValidationError("name is required")
    currency = normalized.get("currency") or ""
    if not currency:
        raise ValidationError("currency is required")
    price = _parse_price(normalized.get("price") or "")
    stock = _parse_stock(normalized.get("stock") or "")
    source_data = {
        key: value
        for key, value in normalized.items()
        if key and key not in KNOWN_COLUMNS
    }
    image_url = normalized.get("image_url") or None
    category = normalized.get("category") or None
    description = normalized.get("description") or None
    return {
        "sku": sku,
        "name": name,
        "category": category,
        "description": description,
        "price": price,
        "currency": currency.upper(),
        "stock": stock,
        "image_url": image_url,
        "source_data": source_data,
        "is_active": True,
    }


def _parse_price(value: str) -> Decimal:
    if not value:
        raise ValidationError("price is required and must be a number")
    try:
        price = Decimal(value.replace(",", ".").replace(" ", ""))
    except InvalidOperation as exc:
        raise ValidationError("price must be a number") from exc
    if price < 0:
        raise ValidationError("price must be >= 0")
    return price.quantize(Decimal("0.01"))


def _parse_stock(value: str) -> int:
    if value == "":
        raise ValidationError("stock is required and must be an integer")
    if "." in value or "," in value:
        raise ValidationError("stock must be an integer")
    try:
        stock = int(value)
    except ValueError as exc:
        raise ValidationError("stock must be an integer") from exc
    if stock < 0:
        raise ValidationError("stock must be >= 0")
    return stock
