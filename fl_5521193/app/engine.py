"""Dedup, contact/deal creation, messaging, scoring, partner funnel simulation."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from .models import (
    AttractionSource,
    AuditLog,
    Contact,
    Deal,
    DealStage,
    DedupMatch,
    ImportResult,
    IncomingReply,
    MessageTemplate,
    OutboundMessage,
    ParseSource,
    ParsedLead,
    PartnerFunnelStage,
    QualStatus,
    Qualification,
    ScoreTier,
    Task,
)
from .seed import MANAGERS, NOW

TOUCH_SEQUENCE: list[MessageTemplate] = [
    MessageTemplate(
        day=0,
        name="Первое касание (квалификация)",
        body=(
            "Здравствуйте, {name}! Меня зовут {manager}, AstroStone. "
            "Увидела, что вы практикуете ведическую астрологию"
            "{school_part}. Подскажите, пожалуйста, используете ли вы в своей "
            "практике рекомендации по астрологическим камням?"
        ),
    ),
    MessageTemplate(
        day=3,
        name="Второе касание",
        body=(
            "{name}, добрый день! Коротко напомню о себе — {manager} из AstroStone. "
            "Будет полезно узнать, назначаете ли вы камни клиентам?"
        ),
    ),
    MessageTemplate(
        day=7,
        name="Полезный материал",
        body=(
            "{name}, мы подготовили памятку о требованиях к астрологическим камням "
            "в Джйотиш. Могу прислать — будет актуально для вашей практики?"
        ),
    ),
    MessageTemplate(
        day=14,
        name="Кейс астролога",
        body=(
            "{name}, короткий кейс: астролог из вашей ниши начал рекомендовать "
            "камни через AstroStone и получил первых клиентов за 2 недели. "
            "Интересно посмотреть детали?"
        ),
    ),
    MessageTemplate(
        day=30,
        name="Мягкое финальное касание",
        body=(
            "{name}, на всякий случай оставляю контакт. Если тема камней "
            "станет актуальна — напишите, поможем аккуратно встроить в практику."
        ),
    ),
]

DAILY_LIMIT_PER_MANAGER = 20


def normalize_phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    digits = "".join(c for c in phone if c.isdigit())
    return digits or None


def normalize_username(u: Optional[str]) -> Optional[str]:
    if not u:
        return None
    return u.lstrip("@").lower().strip()


def normalize_email(e: Optional[str]) -> Optional[str]:
    if not e:
        return None
    return e.lower().strip()


def normalize_link(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    return s.lower().rstrip("/").strip()


class Store:
    def __init__(self) -> None:
        self.contacts: dict[int, Contact] = {}
        self.deals: dict[int, Deal] = {}
        self.messages: list[OutboundMessage] = []
        self.replies: list[IncomingReply] = []
        self.tasks: list[Task] = []
        self.logs: list[AuditLog] = []
        self.import_result: Optional[ImportResult] = None
        self.initial_contact_ids: set[int] = set()
        self.last_import_leads: list[ParsedLead] = []
        self.last_import_meta: dict = {}
        self._cid = 0
        self._did = 0
        self._mid = 0
        self._rid = 0
        self._tid = 0
        self._lid = 0
        self._rr_index = 0
        self.demo_day = 0  # simulated day of automation

    def next_manager_id(self) -> int:
        mid = MANAGERS[self._rr_index % len(MANAGERS)].id
        self._rr_index += 1
        return mid

    def log(self, action: str, entity: str, detail: str, entity_id: int | None = None, manager_id: int | None = None) -> None:
        self._lid += 1
        self.logs.append(
            AuditLog(
                id=self._lid,
                at=NOW + timedelta(minutes=self._lid),
                action=action,
                entity=entity,
                entity_id=entity_id,
                detail=detail,
                manager_id=manager_id,
            )
        )


def find_duplicate(store: Store, lead: ParsedLead) -> tuple[Optional[Contact], Optional[str]]:
    """Order: phone → Telegram → email → link/username (п.3)."""
    phone = normalize_phone(lead.phone)
    if phone:
        for c in store.contacts.values():
            if normalize_phone(c.phone) == phone or normalize_phone(c.whatsapp) == phone:
                return c, "phone"

    uname = normalize_username(lead.telegram_username)
    tid = lead.telegram_id
    if uname or tid:
        for c in store.contacts.values():
            if tid and c.telegram_id == tid:
                return c, "telegram"
            if uname and normalize_username(c.telegram_username) == uname:
                return c, "telegram"

    email = normalize_email(lead.email)
    if email:
        for c in store.contacts.values():
            if normalize_email(c.email) == email:
                return c, "email"

    link_candidates = [
        normalize_link(lead.tg_channel),
        normalize_link(lead.vk),
        normalize_link(lead.site),
        normalize_link(lead.instagram),
        normalize_username(lead.telegram_username),
    ]
    for c in store.contacts.values():
        existing = [
            normalize_link(c.tg_channel),
            normalize_link(c.vk),
            normalize_link(c.site),
            normalize_link(c.instagram),
            normalize_username(c.telegram_username),
            normalize_link(c.profile_link),
        ]
        for cand in link_candidates:
            if cand and cand in existing:
                return c, "link/username"
    return None, None


def enrich_contact(contact: Contact, lead: ParsedLead) -> Contact:
    data = contact.model_dump()
    for field in (
        "first_name", "last_name", "telegram_username", "telegram_id", "phone",
        "whatsapp", "email", "tg_channel", "vk", "site", "instagram", "school",
        "city", "comment", "activity_note",
    ):
        new_val = getattr(lead, field)
        if new_val and not data.get(field):
            data[field] = new_val
        elif new_val and field in ("comment", "activity_note", "school", "city"):
            # soft enrich: keep old, append note
            pass
    if lead.school and not data.get("school"):
        data["school"] = lead.school
    reentries = list(data.get("reentry_sources") or [])
    reentries.append(f"{lead.source_found} @ {NOW.date().isoformat()}")
    data["reentry_sources"] = reentries
    data["updated_at"] = NOW
    if lead.telegram_username:
        data["profile_link"] = data.get("profile_link") or f"https://t.me/{lead.telegram_username.lstrip('@')}"
    return Contact(**data)


def lead_to_contact(store: Store, lead: ParsedLead) -> Contact:
    store._cid += 1
    uname = lead.telegram_username
    profile = f"https://t.me/{uname.lstrip('@')}" if uname else lead.tg_channel
    c = Contact(
        id=store._cid,
        first_name=lead.first_name,
        last_name=lead.last_name,
        telegram_username=lead.telegram_username,
        telegram_id=lead.telegram_id,
        phone=lead.phone,
        whatsapp=lead.whatsapp or lead.phone,
        email=lead.email,
        tg_channel=lead.tg_channel,
        vk=lead.vk,
        site=lead.site,
        instagram=lead.instagram,
        school=lead.school,
        city=lead.city,
        source_found=lead.source_found,
        comment=lead.comment,
        is_vedic=lead.is_vedic,
        activity_note=lead.activity_note,
        contact_type="потенциальный астро-партнёр",
        direction="Джйотиш / ведическая астрология",
        source="парсинг",
        entered_at=NOW,
        parse_source=ParseSource.TELEGRAM,
        profile_link=profile,
        qualification_status=QualStatus.NOT_QUALIFIED,
        attraction_source=AttractionSource.PARSE_TG,
        created_at=NOW,
        updated_at=NOW,
    )
    return c


def active_deal_for_contact(store: Store, contact_id: int) -> Optional[Deal]:
    closed = {
        DealStage.NOT_TARGET,
        DealStage.REFUSED,
        DealStage.NO_CONTACT,
        DealStage.NO_STONES,
    }
    for d in store.deals.values():
        if d.contact_id == contact_id and d.stage not in closed:
            return d
    return None


def create_deal(store: Store, contact: Contact) -> Deal:
    store._did += 1
    manager_id = store.next_manager_id()
    deal = Deal(
        id=store._did,
        contact_id=contact.id,
        title=f"Партнёр: {contact.first_name} {contact.last_name}".strip(),
        pipeline="Астро-партнёры",
        stage=DealStage.NEW,
        manager_id=manager_id,
        next_touch_day=0,
        created_at=NOW,
        updated_at=NOW,
    )
    store.deals[deal.id] = deal
    store.log(
        "deal_created",
        "deal",
        f"Сделка в воронке «Астро-партнёры», этап «{deal.stage.value}»",
        entity_id=deal.id,
        manager_id=manager_id,
    )
    store.log(
        "manager_assigned",
        "deal",
        f"Назначен менеджер id={manager_id} (round-robin)",
        entity_id=deal.id,
        manager_id=manager_id,
    )
    return deal


def import_leads(store: Store, leads: list[ParsedLead]) -> ImportResult:
    matches: list[DedupMatch] = []
    created_c = enriched = created_d = skipped_d = 0

    for idx, lead in enumerate(leads):
        dup, matched_by = find_duplicate(store, lead)
        if dup and matched_by:
            enriched_c = enrich_contact(dup, lead)
            store.contacts[enriched_c.id] = enriched_c
            enriched += 1
            matches.append(
                DedupMatch(
                    lead_index=idx,
                    matched_contact_id=dup.id,
                    matched_by=matched_by,
                    action="enrich",
                )
            )
            store.log(
                "dedup_hit",
                "contact",
                f"Дубль по {matched_by}: контакт #{dup.id} обогащён, новый не создан. "
                f"Источник повторного попадания: {lead.source_found}",
                entity_id=dup.id,
            )
            existing = active_deal_for_contact(store, dup.id)
            if existing:
                skipped_d += 1
                store.log(
                    "deal_skip_duplicate",
                    "deal",
                    f"Активная сделка #{existing.id} уже есть — новую не создаём",
                    entity_id=existing.id,
                )
            else:
                create_deal(store, enriched_c)
                created_d += 1
        else:
            contact = lead_to_contact(store, lead)
            store.contacts[contact.id] = contact
            created_c += 1
            store.log(
                "contact_created",
                "contact",
                "Контакт создан: тип=потенциальный астро-партнёр, направление=Джйотиш, "
                f"источник=парсинг, источник парсинга=Telegram, статус={contact.qualification_status.value}",
                entity_id=contact.id,
            )
            create_deal(store, contact)
            created_d += 1

    result = ImportResult(
        total_leads=len(leads),
        created_contacts=created_c,
        enriched_contacts=enriched,
        created_deals=created_d,
        skipped_duplicate_deals=skipped_d,
        matches=matches,
    )
    store.import_result = result
    return result


def personalize(tpl: MessageTemplate, contact: Contact, manager_name: str) -> str:
    school_part = f" ({contact.school})" if contact.school else ""
    return tpl.body.format(
        name=contact.first_name,
        manager=manager_name.split()[0],
        school_part=school_part,
    )


def queue_due_messages(store: Store) -> list[OutboundMessage]:
    """Dose sending: up to DAILY_LIMIT_PER_MANAGER per manager per demo day."""
    sent_today: dict[int, int] = {m.id: 0 for m in MANAGERS}
    created: list[OutboundMessage] = []

    for deal in sorted(store.deals.values(), key=lambda d: d.id):
        if deal.automation_stopped or deal.next_touch_day is None:
            continue
        if deal.stage in {
            DealStage.REPLIED, DealStage.QUALIFIED, DealStage.INTEREST,
            DealStage.CALL, DealStage.THINKING, DealStage.CONNECTED, DealStage.ACTIVE,
            DealStage.NOT_TARGET, DealStage.REFUSED, DealStage.NO_CONTACT, DealStage.NO_STONES,
        }:
            continue

        tpl = next((t for t in TOUCH_SEQUENCE if t.day == deal.next_touch_day), None)
        if not tpl:
            deal.stage = DealStage.NO_REPLY_WARM
            deal.next_touch_day = None
            deal.updated_at = NOW + timedelta(days=store.demo_day)
            store.log("automation_warm", "deal", "Серия касаний завершена → длительный прогрев", entity_id=deal.id)
            continue

        # only send when simulated day >= touch day relative to deal creation day 0
        if store.demo_day < tpl.day:
            continue

        mid = deal.manager_id or 1
        if sent_today[mid] >= DAILY_LIMIT_PER_MANAGER:
            continue

        contact = store.contacts[deal.contact_id]
        manager = next(m for m in MANAGERS if m.id == mid)
        body = personalize(tpl, contact, manager.name)

        store._mid += 1
        msg = OutboundMessage(
            id=store._mid,
            deal_id=deal.id,
            contact_id=contact.id,
            day=tpl.day,
            template_name=tpl.name,
            body=body,
            personalized=True,
            status="delivered",
            sent_at=NOW + timedelta(days=store.demo_day, minutes=store._mid),
        )
        store.messages.append(msg)
        created.append(msg)
        deal.messages_sent += 1
        deal.messages_delivered += 1
        sent_today[mid] += 1

        if tpl.day == 0:
            deal.stage = DealStage.FIRST_TOUCH
        else:
            deal.stage = DealStage.NO_REPLY_WARM

        # advance to next touch in sequence
        seq_days = [t.day for t in TOUCH_SEQUENCE]
        pos = seq_days.index(tpl.day)
        deal.next_touch_day = seq_days[pos + 1] if pos + 1 < len(seq_days) else None
        deal.updated_at = NOW + timedelta(days=store.demo_day)

        store.log(
            "message_sent",
            "message",
            f"День {tpl.day}: «{tpl.name}» → {contact.first_name} (доставлено). Персонализация: имя/школа",
            entity_id=msg.id,
            manager_id=mid,
        )
    return created


def stop_automation_on_reply(store: Store, deal: Deal, text: str) -> IncomingReply:
    store._rid += 1
    reply = IncomingReply(
        id=store._rid,
        deal_id=deal.id,
        contact_id=deal.contact_id,
        text=text,
        received_at=NOW + timedelta(days=store.demo_day, hours=2),
    )
    store.replies.append(reply)
    deal.has_reply = True
    deal.automation_stopped = True
    deal.next_touch_day = None
    deal.stage = DealStage.REPLIED
    deal.updated_at = reply.received_at

    store.log(
        "reply_received",
        "deal",
        f"Ответ зафиксирован в сделке. Автоцепочка остановлена. Текст: «{text[:80]}»",
        entity_id=deal.id,
        manager_id=deal.manager_id,
    )
    store.log(
        "automation_stopped",
        "deal",
        "Любой ответ останавливает автоматизацию (п.12)",
        entity_id=deal.id,
        manager_id=deal.manager_id,
    )

    store._tid += 1
    store.tasks.append(
        Task(
            id=store._tid,
            deal_id=deal.id,
            manager_id=deal.manager_id or 1,
            title="Ручная обработка ответа астролога",
            created_at=reply.received_at,
        )
    )
    store.log(
        "manager_notified",
        "task",
        "Задача менеджеру: взять диалог в работу",
        entity_id=store._tid,
        manager_id=deal.manager_id,
    )
    return reply


def compute_score(q: Qualification, is_vedic: bool, interest_flag: bool = False) -> tuple[int, ScoreTier]:
    """Configurable scoring: A≥18, B 10–17, C 0–9."""
    score = 0
    if is_vedic:
        score += 3
    if q.does_consultations:
        score += 3
    if q.assigns_stones == "регулярно":
        score += 5
    elif q.assigns_stones == "иногда":
        score += 2
    if q.has_supplier is False:
        score += 3
    if q.consultations_per_month == "50+":
        score += 5
    elif q.consultations_per_month == "20–50":
        score += 4
    elif q.consultations_per_month == "5–20":
        score += 2
    if q.interest == "высокий" or interest_flag:
        score += 5
    elif q.interest == "средний":
        score += 3
    elif q.interest == "низкий":
        score += 1

    if score >= 18:
        tier = ScoreTier.A
    elif score >= 10:
        tier = ScoreTier.B
    else:
        tier = ScoreTier.C
    return score, tier


def apply_qualification(store: Store, deal_id: int, q: Qualification) -> Deal:
    deal = store.deals[deal_id]
    contact = store.contacts[deal.contact_id]
    deal.qualification = q
    score, tier = compute_score(q, contact.is_vedic)
    deal.score = score
    deal.score_tier = tier
    contact.qualification_status = QualStatus.QUALIFIED
    contact.updated_at = NOW + timedelta(days=store.demo_day)
    deal.stage = DealStage.QUALIFIED
    deal.updated_at = contact.updated_at

    if q.interest == "высокий":
        deal.stage = DealStage.INTEREST
        store._tid += 1
        store.tasks.append(
            Task(
                id=store._tid,
                deal_id=deal.id,
                manager_id=deal.manager_id or 1,
                title="Назначить созвон / презентацию партнёрства",
                created_at=deal.updated_at,
            )
        )
        store.log(
            "interest",
            "deal",
            "Интерес к партнёрству → задача на созвон",
            entity_id=deal.id,
            manager_id=deal.manager_id,
        )

    store.log(
        "qualified",
        "deal",
        f"Квалификация заполнена. Score={score}, tier={tier.value}",
        entity_id=deal.id,
        manager_id=deal.manager_id,
    )
    return deal


def advance_partner_funnel(store: Store, deal_id: int) -> Deal:
    deal = store.deals[deal_id]
    order = list(PartnerFunnelStage)
    if deal.partner_funnel is None:
        deal.stage = DealStage.CONNECTED
        deal.partner_funnel = PartnerFunnelStage.CONNECTED
    else:
        idx = order.index(deal.partner_funnel)
        if idx + 1 < len(order):
            deal.partner_funnel = order[idx + 1]
            if deal.partner_funnel == PartnerFunnelStage.FIRST_CLIENT:
                deal.partner_leads += 1
            if deal.partner_funnel == PartnerFunnelStage.FIRST_SALE:
                deal.partner_sales += 1
            if deal.partner_funnel == PartnerFunnelStage.ACTIVE:
                deal.stage = DealStage.ACTIVE
    deal.updated_at = NOW + timedelta(days=store.demo_day)
    store.log(
        "partner_funnel",
        "deal",
        f"Этап пост-подключения: {deal.partner_funnel.value if deal.partner_funnel else '-'}",
        entity_id=deal.id,
        manager_id=deal.manager_id,
    )
    return deal


def analytics(store: Store) -> dict:
    contacts_loaded = len(store.contacts)
    msgs = store.messages
    sent = len([m for m in msgs if m.status in ("sent", "delivered")])
    delivered = len([m for m in msgs if m.status == "delivered"])
    deals = list(store.deals.values())
    replied = [d for d in deals if d.has_reply]
    qualified = [d for d in deals if d.stage in {
        DealStage.QUALIFIED, DealStage.INTEREST, DealStage.CALL, DealStage.THINKING,
        DealStage.CONNECTED, DealStage.ACTIVE,
    } or d.qualification.practices_jyotish is not None]
    interested = [d for d in deals if d.stage in {
        DealStage.INTEREST, DealStage.CALL, DealStage.THINKING, DealStage.CONNECTED, DealStage.ACTIVE,
    }]
    calls = [d for d in deals if d.stage in {DealStage.CALL, DealStage.THINKING, DealStage.CONNECTED, DealStage.ACTIVE}]
    connected = [d for d in deals if d.stage in {DealStage.CONNECTED, DealStage.ACTIVE} or d.partner_funnel]
    first_rec = [d for d in deals if d.partner_funnel in {
        PartnerFunnelStage.FIRST_REC, PartnerFunnelStage.FIRST_CLIENT,
        PartnerFunnelStage.FIRST_SALE, PartnerFunnelStage.ACTIVE,
    }]
    first_client = [d for d in deals if d.partner_funnel in {
        PartnerFunnelStage.FIRST_CLIENT, PartnerFunnelStage.FIRST_SALE, PartnerFunnelStage.ACTIVE,
    }]
    sales = [d for d in deals if d.partner_sales > 0 or d.partner_funnel in {
        PartnerFunnelStage.FIRST_SALE, PartnerFunnelStage.ACTIVE,
    }]

    def pct(part: int, whole: int) -> float:
        return round(100.0 * part / whole, 1) if whole else 0.0

    stage_counts: dict[str, int] = {}
    for d in deals:
        stage_counts[d.stage.value] = stage_counts.get(d.stage.value, 0) + 1

    funnel = [
        {"name": "База (CRM)", "count": contacts_loaded},
        {"name": "Сделки", "count": len(deals)},
        {"name": "Ответ", "count": len(replied)},
        {"name": "Квалифицирован", "count": len(qualified)},
        {"name": "Интерес", "count": len(interested)},
        {"name": "Подключён", "count": len(connected)},
        {"name": "Первая рекомендация", "count": len(first_rec)},
        {"name": "Первый клиент", "count": len(first_client)},
        {"name": "Продажа", "count": len(sales)},
    ]

    return {
        "contacts_loaded": contacts_loaded,
        "messages_sent": sent,
        "delivery_pct": pct(delivered, sent) if sent else 0.0,
        "reply_pct": pct(len(replied), len(deals)),
        "qualified_pct": pct(len(qualified), len(deals)),
        "interested_pct": pct(len(interested), len(deals)),
        "call_pct": pct(len(calls), len(deals)),
        "connected_pct": pct(len(connected), len(deals)),
        "first_rec_pct": pct(len(first_rec), len(deals)),
        "deals_total": len(deals),
        "replied": len(replied),
        "qualified": len(qualified),
        "interested": len(interested),
        "connected": len(connected),
        "stage_counts": stage_counts,
        "funnel": funnel,
        "import_result": store.import_result.model_dump() if store.import_result else None,
        "demo_day": store.demo_day,
        "daily_limit": DAILY_LIMIT_PER_MANAGER,
        "legal_note": (
            "Telegram: нельзя рассчитывать на «бот пишет любому username». "
            "MVP симулирует канал касания; прод требует легальный канал (userbot/официальный API/"
            "ручной старт / согласие)."
        ),
    }


def run_demo_scenario(store: Store) -> None:
    """Simulate days + sample replies, qualifications, partner funnel for demo richness."""
    # Day 0: first touches
    store.demo_day = 0
    queue_due_messages(store)

    # Some reply on day 1
    store.demo_day = 1
    deal_list = sorted(store.deals.values(), key=lambda d: d.id)
    reply_scripts = [
        (0, "Да, иногда рекомендую камни клиентам. Расскажите подробнее?"),
        (1, "Кто вы? Откуда номер?"),
        (2, "Не интересно, спасибо"),
        (3, "Интересно, давайте созвонимся"),
    ]
    for offset, text in reply_scripts:
        if offset < len(deal_list):
            d = deal_list[offset]
            if not d.automation_stopped and d.messages_sent > 0:
                stop_automation_on_reply(store, d, text)

    # Day 3 touches for non-replied
    store.demo_day = 3
    queue_due_messages(store)

    # Day 7
    store.demo_day = 7
    queue_due_messages(store)

    # Qualify those who replied positively
    for d in deal_list[:4]:
        if not d.has_reply:
            continue
        text = next((r.text for r in store.replies if r.deal_id == d.id), "")
        if "не интерес" in text.lower():
            d.stage = DealStage.REFUSED
            d.automation_stopped = True
            store.log("closed", "deal", "Отказ после ответа", entity_id=d.id, manager_id=d.manager_id)
            continue
        q = Qualification(
            practices_jyotish=True,
            does_consultations=True,
            assigns_stones="регулярно" if "камн" in text.lower() or "интерес" in text.lower() else "иногда",
            has_supplier=False,
            consultations_per_month="20–50" if "созвон" in text.lower() else "5–20",
            interest="высокий" if "интерес" in text.lower() or "созвон" in text.lower() else "средний",
        )
        apply_qualification(store, d.id, q)

    # Advance interested to call / connected / partner funnel
    for d in store.deals.values():
        if d.stage == DealStage.INTEREST:
            d.stage = DealStage.CALL
            store.log("stage", "deal", "Созвон / презентация", entity_id=d.id, manager_id=d.manager_id)
            d.stage = DealStage.CONNECTED
            d.partner_funnel = PartnerFunnelStage.CONNECTED
            advance_partner_funnel(store, d.id)  # materials
            advance_partner_funnel(store, d.id)  # first rec
            advance_partner_funnel(store, d.id)  # first client
            advance_partner_funnel(store, d.id)  # first sale

    # Day 14 + 30 for remaining automation
    store.demo_day = 14
    queue_due_messages(store)
    store.demo_day = 30
    queue_due_messages(store)
