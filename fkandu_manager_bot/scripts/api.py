import sqlite3
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from contextlib import contextmanager
import os

app = FastAPI(title="FKandu CRM API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "db", "leads.db")

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


class LeadUpdate(BaseModel):
    status: Optional[str] = None
    admin_comment: Optional[str] = None
    next_contact: Optional[str] = None
    deal_amount: Optional[float] = None


@app.get("/api/leads")
def get_leads():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM leads ORDER BY created_at DESC").fetchall()
        return [dict(r) for r in rows]


@app.get("/api/leads/{lead_id}")
def get_lead(lead_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Lead not found")
        return dict(row)


@app.patch("/api/leads/{lead_id}")
def update_lead(lead_id: int, data: LeadUpdate):
    fields = {k: v for k, v in data.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    sets = ", ".join(f"{k} = ?" for k in fields)
    vals = list(fields.values()) + [lead_id]
    with get_db() as conn:
        conn.execute(f"UPDATE leads SET {sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?", vals)
        conn.commit()
    return {"ok": True}


@app.get("/api/stats")
def get_stats():
    with get_db() as conn:
        total = conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
        hot = conn.execute("SELECT COUNT(*) FROM leads WHERE lead_score LIKE '%ГОРЯЧИЙ%'").fetchone()[0]
        new = conn.execute("SELECT COUNT(*) FROM leads WHERE status = '🆕 Новая'").fetchone()[0]
        revenue = conn.execute("SELECT COALESCE(SUM(deal_amount), 0) FROM leads").fetchone()[0]

        by_category = [dict(r) for r in conn.execute(
            "SELECT category, COUNT(*) as count FROM leads GROUP BY category"
        ).fetchall()]

        by_score = [dict(r) for r in conn.execute(
            "SELECT lead_score, COUNT(*) as count FROM leads GROUP BY lead_score"
        ).fetchall()]

        by_status = [dict(r) for r in conn.execute(
            "SELECT status, COUNT(*) as count FROM leads GROUP BY status"
        ).fetchall()]

        monthly = [dict(r) for r in conn.execute("""
            SELECT strftime('%Y-%m', created_at) as month, SUM(deal_amount) as revenue
            FROM leads WHERE deal_amount > 0 GROUP BY month ORDER BY month
        """).fetchall()]

        cat_revenue = [dict(r) for r in conn.execute("""
            SELECT category, SUM(deal_amount) as revenue
            FROM leads WHERE deal_amount > 0 GROUP BY category ORDER BY revenue DESC
        """).fetchall()]

        return {
            "total": total,
            "hot": hot,
            "new": new,
            "revenue": revenue,
            "by_category": by_category,
            "by_score": by_score,
            "by_status": by_status,
            "monthly_revenue": monthly,
            "category_revenue": cat_revenue,
        }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
