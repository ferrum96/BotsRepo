from __future__ import annotations

from datetime import timedelta

import pytest

from app.domain.exceptions import DuplicatePublicationError, ImageProcessingError
from tests.conftest import add_product


async def test_double_publication_blocked(services, session, messenger):
    product = await add_product(session)
    assert product.id
    _, _, publication = await services.content.generate(product.id, show_stock=True)
    assert publication.id
    first = await services.publication.confirm_and_publish(
        publication.id, channel_id=777, show_stock=True
    )
    assert first.max_message_id == "mid.1"
    assert len(messenger.sent) == 1
    with pytest.raises(DuplicatePublicationError):
        await services.publication.confirm_and_publish(
            publication.id, channel_id=777, show_stock=True
        )


async def test_schedule_publication(services, session, clock):
    product = await add_product(session)
    assert product.id
    _, _, publication = await services.content.generate(product.id, show_stock=True)
    assert publication.id
    when = clock.now() + timedelta(hours=2)
    scheduled = await services.publication.schedule(publication.id, when)
    assert scheduled.status.value == "scheduled"
    due = await services.scheduling.publish_due(
        clock.now() + timedelta(hours=3), channel_id=777, show_stock=True
    )
    assert len(due) == 1
    assert due[0].status.value == "published"


async def test_image_private_url_rejected(services, session):
    product = await add_product(session, image_url="http://127.0.0.1/secret.jpg")
    assert product.id
    _, _, publication = await services.content.generate(product.id, show_stock=True)
    assert publication.id
    with pytest.raises(ImageProcessingError):
        await services.publication.confirm_and_publish(
            publication.id, channel_id=777, show_stock=True
        )
