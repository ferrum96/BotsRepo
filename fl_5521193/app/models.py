"""Domain models for AstroStone partner outreach MVP (amoCRM-like)."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class ParseSource(str, Enum):
    TELEGRAM = "Telegram"
    VK = "VK"
    SITE = "сайт"
    INSTAGRAM = "Instagram"
    OTHER = "другое"


class AttractionSource(str, Enum):
    PARSE_TG = "парсинг Telegram"
    TG_ADS = "Telegram Ads"
    VK = "VK"
    YOUTUBE = "YouTube"
    SEO = "SEO"
    REFERRAL = "рекомендация"
    CONFERENCE = "конференция"
    OUTBOUND = "исходящий поиск"
    OTHER = "другое"


class QualStatus(str, Enum):
    NOT_QUALIFIED = "не квалифицирован"
    QUALIFIED = "квалифицирован"


class DealStage(str, Enum):
    NEW = "Новый потенциальный партнёр"
    FIRST_TOUCH = "Первое касание отправлено"
    NO_REPLY_WARM = "Нет ответа / прогрев"
    REPLIED = "Ответил"
    QUALIFIED = "Квалифицирован"
    INTEREST = "Интерес к партнёрству"
    CALL = "Созвон / презентация"
    THINKING = "Думает"
    CONNECTED = "Подключён как партнёр"
    ACTIVE = "Активный партнёр"
    # closed
    NOT_TARGET = "Не целевой"
    REFUSED = "Отказ"
    NO_CONTACT = "Нет связи"
    NO_STONES = "Не занимается подбором камней"


class PartnerFunnelStage(str, Enum):
    CONNECTED = "Подключён"
    MATERIALS = "Ознакомился с материалами"
    FIRST_REC = "Первая рекомендация"
    FIRST_CLIENT = "Первый клиент"
    FIRST_SALE = "Первая продажа"
    ACTIVE = "Активный партнёр"


class ScoreTier(str, Enum):
    A = "A — горячий"
    B = "B — перспективный"
    C = "C — долгосрочный прогрев"


class Manager(BaseModel):
    id: int
    name: str
    telegram: str


class Contact(BaseModel):
    id: int
    first_name: str
    last_name: str = ""
    telegram_username: Optional[str] = None
    telegram_id: Optional[int] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[str] = None
    tg_channel: Optional[str] = None
    vk: Optional[str] = None
    site: Optional[str] = None
    instagram: Optional[str] = None
    school: Optional[str] = None
    city: Optional[str] = None
    source_found: Optional[str] = None
    comment: Optional[str] = None
    is_vedic: bool = True
    activity_note: Optional[str] = None
    # CRM fields (п.4)
    contact_type: str = "потенциальный астро-партнёр"
    direction: str = "Джйотиш / ведическая астрология"
    source: str = "парсинг"
    entered_at: datetime
    parse_source: ParseSource = ParseSource.TELEGRAM
    profile_link: Optional[str] = None
    qualification_status: QualStatus = QualStatus.NOT_QUALIFIED
    attraction_source: AttractionSource = AttractionSource.PARSE_TG
    reentry_sources: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ParsedLead(BaseModel):
    """Raw import row from scraped base (п.2)."""

    first_name: str
    last_name: str = ""
    telegram_username: Optional[str] = None
    telegram_id: Optional[int] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[str] = None
    tg_channel: Optional[str] = None
    vk: Optional[str] = None
    site: Optional[str] = None
    instagram: Optional[str] = None
    school: Optional[str] = None
    city: Optional[str] = None
    source_found: str = "Telegram"
    comment: Optional[str] = None
    is_vedic: bool = True
    activity_note: Optional[str] = None


class Qualification(BaseModel):
    practices_jyotish: Optional[bool] = None
    does_consultations: Optional[bool] = None
    assigns_stones: Optional[str] = None  # регулярно / иногда / не назначает
    has_supplier: Optional[bool] = None
    consultations_per_month: Optional[str] = None  # 0–5 / 5–20 / 20–50 / 50+
    interest: Optional[str] = None  # высокий / средний / низкий


class Deal(BaseModel):
    id: int
    contact_id: int
    title: str
    pipeline: str = "Астро-партнёры"
    stage: DealStage = DealStage.NEW
    manager_id: Optional[int] = None
    automation_stopped: bool = False
    score: int = 0
    score_tier: Optional[ScoreTier] = None
    qualification: Qualification = Field(default_factory=Qualification)
    partner_funnel: Optional[PartnerFunnelStage] = None
    partner_leads: int = 0
    partner_sales: int = 0
    messages_sent: int = 0
    messages_delivered: int = 0
    has_reply: bool = False
    next_touch_day: Optional[int] = None  # day index in sequence
    created_at: datetime
    updated_at: datetime


class MessageTemplate(BaseModel):
    day: int
    name: str
    body: str


class OutboundMessage(BaseModel):
    id: int
    deal_id: int
    contact_id: int
    day: int
    template_name: str
    body: str
    personalized: bool = True
    status: str = "queued"  # queued / sent / delivered / failed
    sent_at: Optional[datetime] = None


class IncomingReply(BaseModel):
    id: int
    deal_id: int
    contact_id: int
    text: str
    received_at: datetime


class Task(BaseModel):
    id: int
    deal_id: int
    manager_id: int
    title: str
    done: bool = False
    created_at: datetime


class AuditLog(BaseModel):
    id: int
    at: datetime
    action: str
    entity: str
    entity_id: Optional[int] = None
    detail: str
    manager_id: Optional[int] = None


class DedupMatch(BaseModel):
    lead_index: int
    matched_contact_id: int
    matched_by: str  # phone | telegram | email | link/username
    action: str  # skip_create | enrich


class ImportResult(BaseModel):
    total_leads: int
    created_contacts: int
    enriched_contacts: int
    created_deals: int
    skipped_duplicate_deals: int
    matches: list[DedupMatch]
