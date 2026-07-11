import sqlite3

from fastapi.testclient import TestClient


def test_crm_flow_from_read_to_update_to_stats(api_module):
    client = TestClient(api_module.app)

    lead_before = client.get("/api/leads/1")
    assert lead_before.status_code == 200
    assert lead_before.json()["status"] == "🆕 Новая"

    update = client.patch(
        "/api/leads/1",
        json={
            "status": "✅ Сделка",
            "admin_comment": "Клиент подтвердил размещение",
            "deal_amount": 50000,
        },
    )
    assert update.status_code == 200

    lead_after = client.get("/api/leads/1")
    payload = lead_after.json()
    assert payload["status"] == "✅ Сделка"
    assert payload["deal_amount"] == 50000

    stats = client.get("/api/stats")
    assert stats.status_code == 200
    assert stats.json()["revenue"] == 50000


def test_e2e_missing_lead_returns_404(api_module):
    client = TestClient(api_module.app)
    missing = client.get("/api/leads/999")
    assert missing.status_code == 404


def test_e2e_db_persists_updates(api_module):
    client = TestClient(api_module.app)
    response = client.patch("/api/leads/1", json={"status": "В работе"})
    assert response.status_code == 200

    with sqlite3.connect(api_module.DB_PATH) as conn:
        row = conn.execute("SELECT status FROM leads WHERE id = 1").fetchone()
    assert row[0] == "В работе"
