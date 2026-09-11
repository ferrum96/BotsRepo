from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class BotResponse:
    text: str | None = None
    attachments: list[dict[str, Any]] = field(default_factory=list)
    format: str | None = "markdown"
    replace_original: bool = False
    notification: str | None = None
    silent: bool = False

    @classmethod
    def text_with_keyboard(cls, text: str, keyboard: dict, *, replace: bool = False) -> BotResponse:
        return cls(text=text, attachments=[keyboard], replace_original=replace)
