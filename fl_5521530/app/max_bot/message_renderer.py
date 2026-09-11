from __future__ import annotations

from app.domain.entities import GeneratedContent, Product
from app.infrastructure.max_api.models import MaxMessagePayload

MESSAGE_LIMIT = 4000


def render_max_post(
    content: GeneratedContent,
    product: Product,
    *,
    show_stock: bool,
) -> MaxMessagePayload:
    """Build a MAX channel post. Price and stock always come from Product, never from AI."""
    title = _escape_markdown(content.title.strip())
    description = _escape_markdown(content.description.strip())
    benefits = "\n".join(f"• {_escape_markdown(item)}" for item in content.benefits_json)
    cta = _escape_markdown(content.call_to_action.strip())
    hashtags = " ".join(content.hashtags_json)
    price_line = f"**Цена:** {_escape_markdown(str(product.price))} {product.currency}"
    sku_line = f"**SKU:** `{_escape_markdown(product.sku)}`"
    lines = [
        f"**{title}**",
        "",
        description,
        "",
        benefits,
        "",
        sku_line,
        price_line,
    ]
    if show_stock:
        lines.append(f"**Остаток:** {product.stock}")
    lines.extend(["", cta, "", hashtags])
    text = "\n".join(lines).strip()
    if len(text) > MESSAGE_LIMIT:
        text = text[: MESSAGE_LIMIT - 1] + "…"
    return MaxMessagePayload(text=text, attachments=[], format="markdown")


def render_product_card(product: Product, *, show_stock: bool) -> str:
    lines = [
        f"**{ _escape_markdown(product.name) }**",
        f"SKU: `{_escape_markdown(product.sku)}`",
    ]
    if product.category:
        lines.append(f"Категория: {_escape_markdown(product.category)}")
    lines.append(f"Цена: {product.price} {product.currency}")
    if show_stock:
        lines.append(f"Остаток: {product.stock}")
    if product.description:
        lines.append("")
        lines.append(_escape_markdown(product.description[:500]))
    return "\n".join(lines)


def _escape_markdown(value: str) -> str:
    result = []
    for char in value:
        if char in r"\*_~`[]()":
            result.append("\\")
        result.append(char)
    return "".join(result)
