"""AstroStone partner outreach MVP — FastAPI app + demo dashboard."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from .architecture import blueprint
from .engine import Store, analytics, import_leads, queue_due_messages, run_demo_scenario
from .excel_import import build_template_xlsx, parse_excel
from .models import DealStage
from .seed import MANAGERS, build_crm_contacts, build_import_leads

STATIC = Path(__file__).resolve().parent.parent / "static"

store = Store()


def bootstrap() -> None:
    """п.2–5 + simulate rest: 100 CRM contacts, import 20 TG leads, run demo."""
    from datetime import datetime

    from .engine import create_deal

    contacts = build_crm_contacts(100)
    store._cid = max(c.id for c in contacts)
    for c in contacts:
        store.contacts[c.id] = c
    store.initial_contact_ids = {c.id for c in contacts}
    store.log("seed", "crm", f"Загружена сущность CRM: {len(contacts)} контактов (для сверки дублей)")

    # Active deals on contacts 1–2 → import must skip duplicate deals (п.3)
    for cid in (1, 2):
        d = create_deal(store, store.contacts[cid])
        d.stage = DealStage.FIRST_TOUCH
        d.messages_sent = 1
        d.messages_delivered = 1
        d.next_touch_day = 3
        d.updated_at = datetime(2026, 9, 1, 12, 0, 0)
        store.log(
            "seed",
            "deal",
            f"В CRM уже есть активная сделка #{d.id} по контакту #{cid}",
            entity_id=d.id,
        )

    leads = build_import_leads()
    store.last_import_leads = leads
    store.last_import_meta = {"source": "seed_telegram", "filename": "seed_telegram.xlsx"}
    store.log("seed", "import", f"Импорт парсинга Telegram: {len(leads)} лидов")
    import_leads(store, leads)
    run_demo_scenario(store)


bootstrap()

app = FastAPI(title="AstroStone Partner Outreach MVP", version="0.1.0")
app.mount("/static", StaticFiles(directory=str(STATIC)), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/health")
def health():
    return {"ok": True, "service": "astrostone-mvp"}


@app.get("/api/overview")
def overview():
    return {
        "goal": (
            "Автоматизировать первичную работу с базой потенциальных партнёров — "
            "практикующих ведических астрологов — от загрузки контакта до первого "
            "сообщения, касаний, фиксации ответа и передачи менеджеру. "
            "Цель: больше квалифицированных партнёров AstroStone при минимуме ручной работы."
        ),
        "managers": [m.model_dump() for m in MANAGERS],
        "pipeline": "Астро-партнёры",
        "stages": [s.value for s in DealStage],
        "analytics": analytics(store),
        "initial_contacts_count": len(store.initial_contact_ids),
        "last_import": store.last_import_meta,
    }


@app.get("/api/contacts")
def contacts(limit: int = 200, offset: int = 0, scope: str = "all"):
    """scope: all | initial | new"""
    items = sorted(store.contacts.values(), key=lambda c: c.id)
    if scope == "initial":
        items = [c for c in items if c.id in store.initial_contact_ids]
    elif scope == "new":
        items = [c for c in items if c.id not in store.initial_contact_ids]
    page = items[offset : offset + limit]
    return {
        "total": len(items),
        "scope": scope,
        "items": [c.model_dump(mode="json") for c in page],
    }


@app.get("/api/leads")
def leads():
    items = store.last_import_leads or build_import_leads()
    return {
        "items": [l.model_dump(mode="json") for l in items],
        "meta": store.last_import_meta,
    }


@app.get("/api/deals")
def deals():
    items = sorted(store.deals.values(), key=lambda d: d.id)
    enriched = []
    for d in items:
        c = store.contacts.get(d.contact_id)
        row = d.model_dump(mode="json")
        row["contact_name"] = f"{c.first_name} {c.last_name}".strip() if c else "?"
        row["contact_tg"] = c.telegram_username if c else None
        row["manager_name"] = next((m.name for m in MANAGERS if m.id == d.manager_id), None)
        enriched.append(row)
    return {"total": len(enriched), "items": enriched}


@app.get("/api/messages")
def messages():
    return {"items": [m.model_dump(mode="json") for m in store.messages]}


@app.get("/api/replies")
def replies():
    return {"items": [r.model_dump(mode="json") for r in store.replies]}


@app.get("/api/tasks")
def tasks():
    items = []
    for t in store.tasks:
        row = t.model_dump(mode="json")
        row["manager_name"] = next((m.name for m in MANAGERS if m.id == t.manager_id), None)
        items.append(row)
    return {"items": items}


@app.get("/api/logs")
def logs(limit: int = 100):
    items = list(reversed(store.logs[-limit:]))
    return {"items": [x.model_dump(mode="json") for x in items]}


@app.get("/api/dedup")
def dedup():
    ir = store.import_result
    if not ir:
        return {"result": None}
    return {"result": ir.model_dump(mode="json")}


@app.get("/api/architecture")
def architecture():
    return blueprint()


@app.get("/api/import/template.xlsx")
def import_template():
    data = build_template_xlsx(build_import_leads())
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=astrostone_leads_template.xlsx"},
    )


@app.post("/api/import/excel")
async def import_excel(file: UploadFile = File(...), run_touches: bool = True):
    name = (file.filename or "").lower()
    if not name.endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "Нужен файл .xlsx")
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Пустой файл")

    leads, errors = parse_excel(raw)
    if not leads and errors:
        raise HTTPException(400, detail={"message": "Не удалось разобрать файл", "errors": errors})
    if not leads:
        raise HTTPException(400, "В файле нет валидных строк")

    store.last_import_leads = leads
    store.last_import_meta = {
        "source": "excel",
        "filename": file.filename,
        "rows_ok": len(leads),
        "rows_failed": len(errors),
        "errors": errors[:20],
    }
    store.log(
        "excel_import",
        "import",
        f"Excel «{file.filename}»: {len(leads)} строк ок, ошибок {len(errors)}",
    )
    result = import_leads(store, leads)
    if run_touches:
        store.demo_day = max(store.demo_day, 0)
        queue_due_messages(store)

    return {
        "ok": True,
        "result": result.model_dump(mode="json"),
        "errors": errors,
        "analytics": analytics(store),
        "meta": store.last_import_meta,
    }


@app.post("/api/reset-demo")
def reset_demo():
    global store
    store = Store()
    bootstrap()
    return {"ok": True, "analytics": analytics(store)}
