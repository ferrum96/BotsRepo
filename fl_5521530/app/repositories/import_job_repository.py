from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.entities import ImportJob
from app.domain.enums import ImportJobStatus
from app.infrastructure.database.models import ImportJobModel
from app.repositories.mappers import import_job_to_domain


class ImportJobRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, filename: str) -> ImportJob:
        row = ImportJobModel(
            filename=filename,
            status=ImportJobStatus.PENDING.value,
            error_report=[],
        )
        self._session.add(row)
        await self._session.flush()
        return import_job_to_domain(row)

    async def complete(
        self,
        job_id: int,
        *,
        status: ImportJobStatus,
        total_rows: int,
        created_rows: int,
        updated_rows: int,
        failed_rows: int,
        error_report: list[dict[str, Any]],
        completed_at: datetime,
    ) -> ImportJob:
        row = await self._session.get(ImportJobModel, job_id)
        if row is None:
            raise RuntimeError(f"import job {job_id} missing")
        row.status = status.value
        row.total_rows = total_rows
        row.created_rows = created_rows
        row.updated_rows = updated_rows
        row.failed_rows = failed_rows
        row.error_report = error_report
        row.completed_at = completed_at
        await self._session.flush()
        return import_job_to_domain(row)
