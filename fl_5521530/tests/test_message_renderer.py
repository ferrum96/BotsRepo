from __future__ import annotations

from decimal import Decimal

from app.domain.entities import GeneratedContent, Product
from app.domain.enums import ContentStatus
from app.max_bot.message_renderer import render_max_post


def test_render_uses_db_price_and_stock_not_ai_text_only():
    product = Product(
        id=1,
        sku="SKU-1",
        name="Tea",
        category="Drinks",
        description="from catalog",
        price=Decimal("19.99"),
        currency="EUR",
        stock=4,
        image_url=None,
        max_upload_token=None,
        source_data={},
        is_active=True,
    )
    content = GeneratedContent(
        id=1,
        product_id=1,
        title="Отличный чай",
        description="Мягкий вкус.",
        benefits_json=["Аромат", "Упаковка"],
        call_to_action="Закажите в MAX",
        hashtags_json=["#чай", "#магазин"],
        model="test",
        prompt_version="v1",
        status=ContentStatus.READY,
    )
    payload = render_max_post(content, product, show_stock=True)
    assert "19.99" in payload.text
    assert "EUR" in payload.text
    assert "SKU-1" in payload.text
    assert "Остаток:** 4" in payload.text or "Остаток: 4" in payload.text.replace("\\", "")
    assert payload.format == "markdown"
    hidden = render_max_post(content, product, show_stock=False)
    assert "Остаток" not in hidden.text
