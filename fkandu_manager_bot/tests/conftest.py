import importlib
import sqlite3
import sys
from pathlib import Path

import pytest


def seed_db(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
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
            """
        )
        conn.execute(
            """
            INSERT INTO leads (
                user_id, username, full_name, category, product_info, budget, timeline, lead_score, status, deal_amount
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                1,
                "tester",
                "Test User",
                "🎨 Развитие и творчество",
                "Описание",
                "30 000 - 50 000 ₽",
                "⚡ На этой неделе",
                "ГОРЯЧИЙ 🔥",
                "🆕 Новая",
                12000,
            ),
        )
        conn.commit()


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    return tmp_path / "data" / "leads.db"


@pytest.fixture
def api_module(monkeypatch: pytest.MonkeyPatch, db_path: Path):
    seed_db(db_path)
    monkeypatch.setenv("DB_PATH", str(db_path))

    module_name = "dashboard.backend.api"
    if module_name in sys.modules:
        module = importlib.reload(sys.modules[module_name])
    else:
        module = importlib.import_module(module_name)
    return module
