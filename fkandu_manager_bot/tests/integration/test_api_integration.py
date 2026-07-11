from fastapi.testclient import TestClient


def test_health_and_leads_endpoints(api_module):
    client = TestClient(api_module.app)

    health = client.get("/api/health")
    assert health.status_code == 200
    payload = health.json()
    assert payload["ok"] is True
    assert payload["leads_count"] == 1

    leads = client.get("/api/leads")
    assert leads.status_code == 200
    assert len(leads.json()) == 1


def test_update_lead_happy_path(api_module):
    client = TestClient(api_module.app)

    response = client.patch(
        "/api/leads/1",
        json={"status": "В работе", "admin_comment": "Созвониться", "deal_amount": 35000},
    )
    assert response.status_code == 200
    assert response.json() == {"ok": True}

    lead = client.get("/api/leads/1")
    payload = lead.json()
    assert payload["status"] == "В работе"
    assert payload["admin_comment"] == "Созвониться"
    assert payload["deal_amount"] == 35000


def test_update_lead_rejects_empty_payload(api_module):
    client = TestClient(api_module.app)
    response = client.patch("/api/leads/1", json={})
    assert response.status_code == 400
    assert response.json()["detail"] == "No fields to update"


def test_update_lead_returns_404_for_unknown_lead(api_module):
    client = TestClient(api_module.app)
    response = client.patch("/api/leads/9999", json={"status": "В работе"})
    assert response.status_code == 404
    assert response.json()["detail"] == "Lead not found"


def test_update_lead_rejects_unknown_field(api_module):
    client = TestClient(api_module.app)
    response = client.patch("/api/leads/1", json={"unexpected": "value"})
    assert response.status_code == 422
