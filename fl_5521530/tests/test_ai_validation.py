from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.infrastructure.ai.schemas import ProductContentSchema


def test_ai_valid_payload():
    schema = ProductContentSchema.model_validate(
        {
            "title": "Чай",
            "description": "Описание товара без выдуманных скидок.",
            "benefits": ["Вкус", "Аромат"],
            "call_to_action": "Купить",
            "hashtags": ["#чай", "#max"],
        }
    )
    assert schema.title == "Чай"


def test_ai_rejects_extra_fields():
    with pytest.raises(ValidationError):
        ProductContentSchema.model_validate(
            {
                "title": "Чай",
                "description": "Описание",
                "benefits": ["Вкус", "Аромат"],
                "call_to_action": "Купить",
                "hashtags": ["#чай", "#max"],
                "price": "0",
            }
        )


def test_ai_rejects_long_description():
    with pytest.raises(ValidationError):
        ProductContentSchema.model_validate(
            {
                "title": "Чай",
                "description": "x" * 701,
                "benefits": ["Вкус", "Аромат"],
                "call_to_action": "Купить",
                "hashtags": ["#чай", "#max"],
            }
        )


def test_ai_rejects_bad_hashtag():
    with pytest.raises(ValidationError):
        ProductContentSchema.model_validate(
            {
                "title": "Чай",
                "description": "Описание",
                "benefits": ["Вкус", "Аромат"],
                "call_to_action": "Купить",
                "hashtags": ["чай", "#max"],
            }
        )


def test_ai_rejects_empty_benefit():
    with pytest.raises(ValidationError):
        ProductContentSchema.model_validate(
            {
                "title": "Чай",
                "description": "Описание",
                "benefits": ["Вкус", "  "],
                "call_to_action": "Купить",
                "hashtags": ["#чай", "#max"],
            }
        )
