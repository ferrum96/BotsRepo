from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.entities import Product
from app.infrastructure.database.models import ProductModel, PublicationModel
from app.repositories.mappers import product_to_domain


class ProductRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, product_id: int) -> Product | None:
        row = await self._session.get(ProductModel, product_id)
        return product_to_domain(row) if row else None

    async def get_by_sku(self, sku: str) -> Product | None:
        result = await self._session.execute(
            select(ProductModel).where(ProductModel.sku == sku)
        )
        row = result.scalar_one_or_none()
        return product_to_domain(row) if row else None

    async def upsert_by_sku(
        self,
        *,
        sku: str,
        name: str,
        category: str | None,
        description: str | None,
        price: Decimal,
        currency: str,
        stock: int,
        image_url: str | None,
        source_data: dict[str, Any],
        is_active: bool = True,
    ) -> tuple[Product, bool]:
        existing = await self._session.execute(
            select(ProductModel).where(ProductModel.sku == sku)
        )
        row = existing.scalar_one_or_none()
        created = row is None
        if row is None:
            row = ProductModel(
                sku=sku,
                name=name,
                category=category,
                description=description,
                price=price,
                currency=currency,
                stock=stock,
                image_url=image_url,
                source_data=source_data,
                is_active=is_active,
            )
            self._session.add(row)
        else:
            row.name = name
            row.category = category
            row.description = description
            row.price = price
            row.currency = currency
            row.stock = stock
            row.image_url = image_url
            row.source_data = source_data
            row.is_active = is_active
        await self._session.flush()
        return product_to_domain(row), created

    async def list_active_in_stock(
        self, *, offset: int = 0, limit: int = 10
    ) -> list[Product]:
        result = await self._session.execute(
            select(ProductModel)
            .where(ProductModel.is_active.is_(True), ProductModel.stock > 0)
            .order_by(ProductModel.name)
            .offset(offset)
            .limit(limit)
        )
        return [product_to_domain(row) for row in result.scalars().all()]

    async def count_active_in_stock(self) -> int:
        result = await self._session.execute(
            select(func.count())
            .select_from(ProductModel)
            .where(ProductModel.is_active.is_(True), ProductModel.stock > 0)
        )
        return int(result.scalar_one())

    async def list_categories(self) -> list[str]:
        result = await self._session.execute(
            select(ProductModel.category)
            .where(
                ProductModel.is_active.is_(True),
                ProductModel.stock > 0,
                ProductModel.category.is_not(None),
            )
            .distinct()
            .order_by(ProductModel.category)
        )
        return [row for row in result.scalars().all() if row]

    async def list_by_category(
        self, category: str, *, offset: int = 0, limit: int = 10
    ) -> list[Product]:
        result = await self._session.execute(
            select(ProductModel)
            .where(
                ProductModel.is_active.is_(True),
                ProductModel.stock > 0,
                ProductModel.category == category,
            )
            .order_by(ProductModel.name)
            .offset(offset)
            .limit(limit)
        )
        return [product_to_domain(row) for row in result.scalars().all()]

    async def pick_random_in_stock(self) -> Product | None:
        result = await self._session.execute(
            select(ProductModel)
            .where(ProductModel.is_active.is_(True), ProductModel.stock > 0)
            .order_by(func.random())
            .limit(1)
        )
        row = result.scalar_one_or_none()
        return product_to_domain(row) if row else None

    async def search(self, query: str, *, limit: int = 10) -> list[Product]:
        like = f"%{query.lower()}%"
        result = await self._session.execute(
            select(ProductModel)
            .where(
                ProductModel.is_active.is_(True),
                ProductModel.stock > 0,
                or_(
                    func.lower(ProductModel.name).like(like),
                    func.lower(ProductModel.sku).like(like),
                ),
            )
            .order_by(ProductModel.name)
            .limit(limit)
        )
        return [product_to_domain(row) for row in result.scalars().all()]

    async def pick_stale(self) -> Product | None:
        last_pub = (
            select(
                PublicationModel.product_id,
                func.max(PublicationModel.published_at).label("last_published"),
            )
            .where(PublicationModel.published_at.is_not(None))
            .group_by(PublicationModel.product_id)
            .subquery()
        )
        result = await self._session.execute(
            select(ProductModel)
            .outerjoin(last_pub, last_pub.c.product_id == ProductModel.id)
            .where(ProductModel.is_active.is_(True), ProductModel.stock > 0)
            .order_by(last_pub.c.last_published.asc().nullsfirst(), ProductModel.id)
            .limit(1)
        )
        row = result.scalar_one_or_none()
        return product_to_domain(row) if row else None

    async def save_upload_token(self, product_id: int, token: str) -> None:
        await self._session.execute(
            update(ProductModel)
            .where(ProductModel.id == product_id)
            .values(max_upload_token=token)
        )
