from __future__ import annotations

from typing import Any

from app.domain.entities import GeneratedContent, Product, Publication
from app.domain.enums import ContentStatus, PublicationStatus
from app.domain.exceptions import ContentNotFoundError, ProductNotFoundError
from app.infrastructure.ai.client import AIProvider
from app.infrastructure.ai.schemas import PROMPT_VERSION
from app.repositories.content_repository import ContentRepository
from app.repositories.product_repository import ProductRepository
from app.repositories.publication_repository import PublicationRepository


class ContentGenerationService:
    def __init__(
        self,
        products: ProductRepository,
        contents: ContentRepository,
        publications: PublicationRepository,
        ai: AIProvider,
        *,
        model_name: str,
    ) -> None:
        self._products = products
        self._contents = contents
        self._publications = publications
        self._ai = ai
        self._model_name = model_name

    async def generate(
        self, product_id: int, *, show_stock: bool
    ) -> tuple[Product, GeneratedContent, Publication]:
        product, content = await self._create_content(product_id, show_stock=show_stock)
        if product.id is None or content.id is None:
            raise ContentNotFoundError("Failed to store generated content")
        publication = await self._publications.add(
            product_id=product.id,
            content_id=content.id,
            status=PublicationStatus.DRAFT,
        )
        return product, content, publication

    async def regenerate(
        self, publication_id: int, *, show_stock: bool
    ) -> tuple[Product, GeneratedContent, Publication]:
        publication = await self._publications.get_by_id(publication_id)
        if publication is None or publication.id is None:
            raise ContentNotFoundError("Publication not found")
        if publication.status not in {PublicationStatus.DRAFT, PublicationStatus.FAILED}:
            raise ContentNotFoundError("Can regenerate only a draft")
        product, content = await self._create_content(
            publication.product_id, show_stock=show_stock
        )
        row = await self._publications.get_for_update(publication.id)
        if row is None or content.id is None:
            raise ContentNotFoundError("Publication not found")
        row.content_id = content.id
        row.status = PublicationStatus.DRAFT.value
        row.error_message = None
        updated = await self._publications.save_row(row)
        return product, content, updated

    async def get_content(self, content_id: int) -> GeneratedContent:
        content = await self._contents.get_by_id(content_id)
        if content is None:
            raise ContentNotFoundError("Content not found")
        return content

    async def update_field(
        self, content_id: int, field: str, value: str
    ) -> GeneratedContent:
        allowed = {"title", "description", "call_to_action"}
        if field not in allowed:
            raise ContentNotFoundError("Unknown content field")
        cleaned = value.strip()
        if not cleaned:
            raise ContentNotFoundError("Value must not be empty")
        updated = await self._contents.update_fields(content_id, **{field: cleaned})
        if updated is None:
            raise ContentNotFoundError("Content not found")
        return updated

    async def _create_content(
        self, product_id: int, *, show_stock: bool
    ) -> tuple[Product, GeneratedContent]:
        product = await self._products.get_by_id(product_id)
        if product is None or product.id is None:
            raise ProductNotFoundError("Product not found")
        schema = await self._ai.generate_product_content(
            _product_payload(product, show_stock=show_stock),
            show_stock=show_stock,
        )
        content = await self._contents.add(
            product_id=product.id,
            title=schema.title,
            description=schema.description,
            benefits=schema.benefits,
            call_to_action=schema.call_to_action,
            hashtags=schema.hashtags,
            model=self._model_name,
            prompt_version=PROMPT_VERSION,
            status=ContentStatus.READY,
        )
        return product, content


def _product_payload(product: Product, *, show_stock: bool) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "sku": product.sku,
        "name": product.name,
        "category": product.category,
        "description": product.description,
        "price": str(product.price),
        "currency": product.currency,
    }
    if show_stock:
        payload["stock"] = product.stock
    if product.image_url:
        payload["image_url"] = product.image_url
    return payload
