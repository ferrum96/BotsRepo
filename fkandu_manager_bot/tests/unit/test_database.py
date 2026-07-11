from pathlib import Path

from bot.database import Database


def test_database_file_roundtrip(tmp_path: Path):
    db = Database(str(tmp_path / "db" / "leads.db"))
    file_id = db.save_file(b"hello", "a.txt", "text/plain")
    row = db.get_file(file_id)
    assert row is not None
    assert row["filename"] == "a.txt"
    assert row["mime_type"] == "text/plain"
    assert row["data"] == b"hello"


def test_database_update_lead_returns_false_without_fields(tmp_path: Path):
    db = Database(str(tmp_path / "db" / "leads.db"))
    lead_id = db.save_lead(
        {
            "user_id": 7,
            "username": "user",
            "full_name": "User Name",
            "category": "cat",
            "product_info": "info",
            "budget": "10 000",
            "timeline": "later",
            "lead_score": "cold",
        }
    )
    assert db.update_lead(lead_id, {"status": None}) is False


def test_database_update_lead_returns_false_for_missing_id(tmp_path: Path):
    db = Database(str(tmp_path / "db" / "leads.db"))
    assert db.update_lead(9999, {"status": "done"}) is False


def test_database_update_lead_rejects_unsupported_fields(tmp_path: Path):
    db = Database(str(tmp_path / "db" / "leads.db"))
    lead_id = db.save_lead(
        {
            "user_id": 7,
            "username": "user",
            "full_name": "User Name",
            "category": "cat",
            "product_info": "info",
            "budget": "10 000",
            "timeline": "later",
            "lead_score": "cold",
        }
    )
    assert db.update_lead(lead_id, {"user_id": 2}) is False


def test_database_stats_include_revenue(tmp_path: Path):
    db = Database(str(tmp_path / "db" / "leads.db"))
    lead_id = db.save_lead(
        {
            "user_id": 1,
            "username": "tester",
            "full_name": "Tester",
            "category": "A",
            "product_info": "Product",
            "budget": "50k",
            "timeline": "week",
            "lead_score": "ГОРЯЧИЙ 🔥",
        }
    )
    db.update_lead(lead_id, {"deal_amount": 20000})
    stats = db.get_stats()
    assert stats["total"] == 1
    assert stats["hot"] == 1
    assert stats["revenue"] == 20000
