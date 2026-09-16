from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class RawMessage:
    id: int
    user_id: int
    username: Optional[str]
    first_name: str
    last_name: str
    text: str
    date: datetime
    is_bot: bool


@dataclass
class ScoredMessage:
    user_id: int
    username: str
    name: str
    text: str
    score: int
    date: datetime
    source: str = ""
