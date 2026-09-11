from __future__ import annotations

import ipaddress
import logging
import socket
from datetime import UTC, datetime
from typing import Protocol
from urllib.parse import urlparse

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.entities import GeneratedContent, Product, Publication
from app.domain.enums import PublicationStatus
from app.domain.exceptions import (
    ChannelNotConfiguredError,
    DuplicatePublicationError,
    ImageProcessingError,
    PublicationNotFoundError,
)
from app.infrastructure.max_api.client import MessengerGateway
from app.infrastructure.max_api.errors import MaxApiError, MaxPermissionError
from app.infrastructure.max_api.models import MaxMessagePayload
from app.repositories.content_repository import ContentRepository
from app.repositories.product_repository import ProductRepository
from app.repositories.publication_repository import PublicationRepository

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_MIME = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
    "image/tiff",
    "image/heic",
}


class Clock(Protocol):
    def now(self) -> datetime: ...


class PostRenderer(Protocol):
    def __call__(
        self,
        content: GeneratedContent,
        product: Product,
        *,
        show_stock: bool,
    ) -> MaxMessagePayload: ...


class UtcClock:
    def now(self) -> datetime:
        return datetime.now(UTC)


class PublicationService:
    def __init__(
        self,
        products: ProductRepository,
        contents: ContentRepository,
        publications: PublicationRepository,
        messenger: MessengerGateway,
        http_client: httpx.AsyncClient,
        session: AsyncSession,
        renderer: PostRenderer,
        *,
        max_image_size_bytes: int,
        clock: Clock | None = None,
    ) -> None:
        self._products = products
        self._contents = contents
        self._publications = publications
        self._messenger = messenger
        self._http = http_client
        self._session = session
        self._renderer = renderer
        self._max_image_size_bytes = max_image_size_bytes
        self._clock = clock or UtcClock()

    async def get(self, publication_id: int) -> Publication:
        publication = await self._publications.get_by_id(publication_id)
        if publication is None:
            raise PublicationNotFoundError("Publication not found")
        return publication

    async def confirm_and_publish(
        self, publication_id: int, *, channel_id: int | None, show_stock: bool
    ) -> Publication:
        if channel_id is None:
            raise ChannelNotConfiguredError(
                "Channel chat_id is not set. Add the bot to the channel "
                "or set MAX_CHANNEL_ID."
            )
        row = await self._publications.get_for_update(publication_id)
        if row is None:
            raise PublicationNotFoundError("Publication not found")
        if row.status == PublicationStatus.PUBLISHED.value:
            raise DuplicatePublicationError("This publication is already posted")
        if row.status == PublicationStatus.PUBLISHING.value:
            raise DuplicatePublicationError("Publication is already in progress")
        if row.status == PublicationStatus.CANCELLED.value:
            raise PublicationNotFoundError("Publication was cancelled")
        if row.status not in {
            PublicationStatus.DRAFT.value,
            PublicationStatus.SCHEDULED.value,
            PublicationStatus.FAILED.value,
        }:
            raise DuplicatePublicationError("Publication cannot be posted in current status")

        product = await self._products.get_by_id(row.product_id)
        content = await self._contents.get_by_id(row.content_id)
        if product is None or content is None:
            raise PublicationNotFoundError("Product or content missing")

        row.status = PublicationStatus.PUBLISHING.value
        await self._publications.save_row(row)
        await self._session.commit()

        payload = self._renderer(content, product, show_stock=show_stock)
        try:
            sent = await self._send(channel_id, product, payload, allow_upload_fallback=True)
        except MaxPermissionError:
            await self._mark_failed(
                publication_id,
                "Bot has no permission to publish in the channel. "
                "Grant admin/publish rights and retry.",
            )
            raise
        except ImageProcessingError as exc:
            await self._mark_failed(publication_id, exc.message)
            raise
        except Exception as exc:
            await self._mark_failed(publication_id, str(exc))
            raise

        row = await self._publications.get_for_update(publication_id)
        if row is None:
            raise PublicationNotFoundError("Publication missing after send")
        row.status = PublicationStatus.PUBLISHED.value
        row.max_chat_id = channel_id
        row.max_message_id = sent.message_id
        row.published_at = self._clock.now()
        row.error_message = None
        return await self._publications.save_row(row)

    async def schedule(self, publication_id: int, scheduled_at: datetime) -> Publication:
        row = await self._publications.get_for_update(publication_id)
        if row is None:
            raise PublicationNotFoundError("Publication not found")
        if row.status not in {PublicationStatus.DRAFT.value, PublicationStatus.FAILED.value}:
            raise DuplicatePublicationError("Only a draft can be scheduled")
        if scheduled_at <= self._clock.now():
            raise PublicationNotFoundError("Schedule time must be in the future")
        row.status = PublicationStatus.SCHEDULED.value
        row.scheduled_at = scheduled_at
        return await self._publications.save_row(row)

    async def cancel(self, publication_id: int) -> Publication:
        row = await self._publications.get_for_update(publication_id)
        if row is None:
            raise PublicationNotFoundError("Publication not found")
        if row.status in {PublicationStatus.PUBLISHED.value, PublicationStatus.PUBLISHING.value}:
            raise DuplicatePublicationError("Cannot cancel a published item")
        row.status = PublicationStatus.CANCELLED.value
        return await self._publications.save_row(row)

    async def upload_image_from_url(self, product: Product) -> str:
        if not product.image_url or product.id is None:
            raise ImageProcessingError("Product has no image_url")
        data, filename = await self._download_image(product.image_url)
        slot = await self._messenger.prepare_image_upload()
        token = await self._messenger.upload_file(slot.url, data, filename)
        await self._products.save_upload_token(product.id, token)
        return token

    async def _send(
        self,
        channel_id: int,
        product: Product,
        payload: MaxMessagePayload,
        *,
        allow_upload_fallback: bool,
    ):
        attachments = list(payload.attachments)
        image = await self._image_attachment(product)
        if image:
            attachments.insert(0, image)
        try:
            return await self._messenger.send_message(
                chat_id=channel_id,
                text=payload.text,
                attachments=attachments or None,
                format=payload.format,
                notify=True,
            )
        except (MaxApiError, ImageProcessingError) as exc:
            if not allow_upload_fallback or not product.image_url:
                raise
            logger.warning("image URL send failed, falling back to /uploads")
            try:
                token = await self.upload_image_from_url(product)
            except ImageProcessingError:
                raise
            product.max_upload_token = token
            product.image_url = None
            return await self._send(
                channel_id, product, payload, allow_upload_fallback=False
            )

    async def _image_attachment(self, product: Product) -> dict | None:
        if product.image_url:
            _assert_safe_url(product.image_url)
            return {"type": "image", "payload": {"url": product.image_url}}
        if product.max_upload_token:
            return {"type": "image", "payload": {"token": product.max_upload_token}}
        return None

    async def _download_image(self, url: str) -> tuple[bytes, str]:
        _assert_safe_url(url)
        try:
            async with self._http.stream(
                "GET", url, follow_redirects=False, timeout=20.0
            ) as response:
                if response.status_code != 200:
                    raise ImageProcessingError(f"Image download HTTP {response.status_code}")
                mime = (response.headers.get("content-type") or "").split(";")[0].strip().lower()
                if mime and mime not in ALLOWED_IMAGE_MIME:
                    raise ImageProcessingError(f"Unsupported image MIME type: {mime}")
                length = response.headers.get("content-length")
                if length and int(length) > self._max_image_size_bytes:
                    raise ImageProcessingError("Image exceeds size limit")
                chunks: list[bytes] = []
                total = 0
                async for chunk in response.aiter_bytes():
                    total += len(chunk)
                    if total > self._max_image_size_bytes:
                        raise ImageProcessingError("Image exceeds size limit")
                    chunks.append(chunk)
        except ImageProcessingError:
            raise
        except Exception as exc:
            raise ImageProcessingError(f"Failed to download image: {exc}") from exc
        filename = urlparse(url).path.rsplit("/", 1)[-1] or "image.jpg"
        return b"".join(chunks), filename

    async def _mark_failed(self, publication_id: int, message: str) -> None:
        row = await self._publications.get_by_id(publication_id)
        if row is None:
            return
        orm = await self._publications.get_for_update(publication_id)
        if orm is None:
            return
        orm.status = PublicationStatus.FAILED.value
        orm.error_message = message[:2000]
        await self._publications.save_row(orm)


def _assert_safe_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ImageProcessingError("Image URL must be http or https")
    host = parsed.hostname
    if not host:
        raise ImageProcessingError("Image URL has no host")
    if host.lower() in {"localhost", "metadata.google.internal"}:
        raise ImageProcessingError("Image URL host is not allowed")
    try:
        addresses = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise ImageProcessingError("Image URL host cannot be resolved") from exc
    for item in addresses:
        ip = ipaddress.ip_address(item[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise ImageProcessingError("Image URL resolves to a private address")
