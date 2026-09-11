from __future__ import annotations

from app.domain.entities import Product
from app.domain.exceptions import ProductNotFoundError
from app.repositories.product_repository import ProductRepository

PAGE_SIZE = 5


class ProductSelectionService:
    def __init__(self, products: ProductRepository) -> None:
        self._products = products

    async def list_page(self, page: int = 0) -> tuple[list[Product], int]:
        offset = max(page, 0) * PAGE_SIZE
        items = await self._products.list_active_in_stock(offset=offset, limit=PAGE_SIZE)
        total = await self._products.count_active_in_stock()
        return items, total

    async def random_in_stock(self) -> Product:
        product = await self._products.pick_random_in_stock()
        if product is None:
            raise ProductNotFoundError("No active products with stock > 0")
        return product

    async def stale(self) -> Product:
        product = await self._products.pick_stale()
        if product is None:
            raise ProductNotFoundError("No active products with stock > 0")
        return product

    async def by_category(self, category: str, page: int = 0) -> list[Product]:
        offset = max(page, 0) * PAGE_SIZE
        return await self._products.list_by_category(category, offset=offset, limit=PAGE_SIZE)

    async def categories(self) -> list[str]:
        return await self._products.list_categories()

    async def search(self, query: str) -> list[Product]:
        cleaned = query.strip()
        if not cleaned:
            raise ProductNotFoundError("Search query is empty")
        items = await self._products.search(cleaned, limit=PAGE_SIZE)
        if not items:
            raise ProductNotFoundError("Nothing found by name or SKU")
        return items

    async def get(self, product_id: int) -> Product:
        product = await self._products.get_by_id(product_id)
        if product is None or not product.is_active:
            raise ProductNotFoundError("Product not found")
        return product
