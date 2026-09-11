from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

HASHTAG_RE = re.compile(r"^#[^\s#]{1,64}$")
PROMPT_VERSION = "v1"
TITLE_MAX_LEN = 120
DESCRIPTION_MAX_LEN = 700
SYSTEM_PROMPT = """Ты — контент-агент MAX-магазина.

Подготовь публикацию о товаре на русском языке.

Работай только с PRODUCT_DATA.

Правила:
- не выдумывай характеристики;
- не изменяй название, цену, валюту и SKU;
- не добавляй скидки, доставку, гарантию или возврат без входных данных;
- не используй неподтверждённые утверждения;
- не сообщай остаток, если SHOW_STOCK=false;
- не добавляй ссылки, если их нет во входных данных;
- не используй HTML или Markdown внутри JSON;
- не упоминай AI;
- используй от 2 до 5 преимуществ;
- используй от 2 до 5 релевантных хэштегов;
- описание должно быть понятным и подходить для MAX;
- длина description не более 700 символов;
- верни только JSON.

Формат:

{
  "title": "string",
  "description": "string",
  "benefits": ["string"],
  "call_to_action": "string",
  "hashtags": ["string"]
}"""


class ProductContentSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=TITLE_MAX_LEN)
    description: str = Field(min_length=1, max_length=DESCRIPTION_MAX_LEN)
    benefits: list[str] = Field(min_length=2, max_length=5)
    call_to_action: str = Field(min_length=1, max_length=300)
    hashtags: list[str] = Field(min_length=2, max_length=5)

    @field_validator("title", "description", "call_to_action")
    @classmethod
    def no_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("empty string")
        return cleaned

    @field_validator("benefits")
    @classmethod
    def benefits_clean(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip() for item in value]
        if any(not item for item in cleaned):
            raise ValueError("benefit must not be empty")
        return cleaned

    @field_validator("hashtags")
    @classmethod
    def hashtags_format(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip() for item in value]
        if any(not HASHTAG_RE.fullmatch(item) for item in cleaned):
            raise ValueError("hashtag must look like #tag without spaces")
        return cleaned


JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["title", "description", "benefits", "call_to_action", "hashtags"],
    "properties": {
        "title": {"type": "string", "minLength": 1, "maxLength": TITLE_MAX_LEN},
        "description": {"type": "string", "minLength": 1, "maxLength": DESCRIPTION_MAX_LEN},
        "benefits": {
            "type": "array",
            "minItems": 2,
            "maxItems": 5,
            "items": {"type": "string", "minLength": 1},
        },
        "call_to_action": {"type": "string", "minLength": 1},
        "hashtags": {
            "type": "array",
            "minItems": 2,
            "maxItems": 5,
            "items": {"type": "string", "pattern": "^#[^\\s#]{1,64}$"},
        },
    },
}
