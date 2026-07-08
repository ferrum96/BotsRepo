"""Database operations for leads and files."""

import sqlite3
import os
from contextlib import contextmanager
from typing import Optional


class Database:
    def __init__(self, db_path: str):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self._init_db()

    def _init_db(self):
        with self._get_conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT NOT NULL,
                    mime_type TEXT NOT NULL,
                    data BLOB NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS leads (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    username TEXT,
                    full_name TEXT,
                    category TEXT,
                    product_info TEXT,
                    budget TEXT,
                    timeline TEXT,
                    lead_score TEXT,
                    status TEXT DEFAULT '🆕 Новая',
                    admin_comment TEXT DEFAULT '',
                    next_contact TEXT,
                    deal_amount INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

    @contextmanager
    def _get_conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def save_file(self, file_bytes: bytes, filename: str, mime_type: str) -> int:
        with self._get_conn() as conn:
            cur = conn.execute(
                "INSERT INTO files (filename, mime_type, data) VALUES (?, ?, ?)",
                (filename, mime_type, file_bytes),
            )
            conn.commit()
            return cur.lastrowid

    def get_file(self, file_id: int) -> Optional[tuple]:
        with self._get_conn() as conn:
            return conn.execute(
                "SELECT filename, mime_type, data FROM files WHERE id = ?", (file_id,)
            ).fetchone()

    def save_lead(self, lead_data: dict) -> int:
        with self._get_conn() as conn:
            cur = conn.execute(
                """INSERT INTO leads (user_id, username, full_name, category, product_info, budget, timeline, lead_score, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, '🆕 Новая')""",
                (
                    lead_data["user_id"],
                    lead_data.get("username"),
                    lead_data["full_name"],
                    lead_data["category"],
                    lead_data["product_info"],
                    lead_data["budget"],
                    lead_data["timeline"],
                    lead_data["lead_score"],
                ),
            )
            conn.commit()
            return cur.lastrowid

    def get_leads(self) -> list[dict]:
        with self._get_conn() as conn:
            rows = conn.execute("SELECT * FROM leads ORDER BY created_at DESC").fetchall()
            return [dict(r) for r in rows]

    def get_lead(self, lead_id: int) -> Optional[dict]:
        with self._get_conn() as conn:
            row = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
            return dict(row) if row else None

    def update_lead(self, lead_id: int, data: dict) -> bool:
        fields = {k: v for k, v in data.items() if v is not None}
        if not fields:
            return False
        sets = ", ".join(f"{k} = ?" for k in fields)
        vals = list(fields.values()) + [lead_id]
        with self._get_conn() as conn:
            conn.execute(
                f"UPDATE leads SET {sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                vals,
            )
            conn.commit()
        return True

    def get_stats(self) -> dict:
        with self._get_conn() as conn:
            total = conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
            hot = conn.execute(
                "SELECT COUNT(*) FROM leads WHERE lead_score LIKE '%ГОРЯЧИЙ%'"
            ).fetchone()[0]
            new = conn.execute(
                "SELECT COUNT(*) FROM leads WHERE status = '🆕 Новая'"
            ).fetchone()[0]
            revenue = conn.execute(
                "SELECT COALESCE(SUM(deal_amount), 0) FROM leads"
            ).fetchone()[0]

            by_category = [
                dict(r)
                for r in conn.execute(
                    "SELECT category, COUNT(*) as count FROM leads GROUP BY category"
                ).fetchall()
            ]

            by_score = [
                dict(r)
                for r in conn.execute(
                    "SELECT lead_score, COUNT(*) as count FROM leads GROUP BY lead_score"
                ).fetchall()
            ]

            by_status = [
                dict(r)
                for r in conn.execute(
                    "SELECT status, COUNT(*) as count FROM leads GROUP BY status"
                ).fetchall()
            ]

            monthly = [
                dict(r)
                for r in conn.execute(
                    """
                    SELECT strftime('%Y-%m', created_at) as month, SUM(deal_amount) as revenue
                    FROM leads WHERE deal_amount > 0 GROUP BY month ORDER BY month
                    """
                ).fetchall()
            ]

            cat_revenue = [
                dict(r)
                for r in conn.execute(
                    """
                    SELECT category, SUM(deal_amount) as revenue
                    FROM leads WHERE deal_amount > 0 GROUP BY category ORDER BY revenue DESC
                    """
                ).fetchall()
            ]

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
