# Agent 1 API tests (Member 1)
import pytest
from fastapi.testclient import TestClient

from agents.risk_agent.main import app
from agents.risk_agent import api as risk_api
from shared.config.settings import get_settings

API_KEY = "test-key"

client = TestClient(app, headers={"X-API-Key": API_KEY})


@pytest.fixture(autouse=True)
def _api_key(monkeypatch):
    monkeypatch.setenv("INTERNAL_API_KEY", API_KEY)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def valid_payload():
    return {
        "business": {
            "business_name": "Sunrise Bakery",
            "business_type": "bakery",
            "description": "A bakery producing bread, cakes, and pastries.",
            "employee_count": 8,
            "equipment": [
                "Ovens",
                "Refrigerators",
            ],
            "operations": {
                "sales_channels": [],
                "accepts_card_payments": True,
                "handles_cash": True,
                "stores_customer_data": False,
                "operates_single_location": True,
            },
            "location": {
                "city": "Colombo",
                "country": "Sri Lanka",
            },
        }
    }


def test_health_endpoint():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_valid_risk_profile_request(valid_payload):
    response = client.post(
        "/api/v1/risk-profile",
        json=valid_payload,
    )

    assert response.status_code == 200

    body = response.json()

    assert "request_id" in body
    assert "risks" in body
    assert "warnings" in body
    assert "metadata" in body
    assert body["business_name"] == "Sunrise Bakery"
    assert body["business_type"] == "bakery"


def test_missing_api_key_is_rejected(valid_payload):
    response = TestClient(app).post("/api/v1/risk-profile", json=valid_payload)

    assert response.status_code == 401
    assert response.json() == {"detail": "Missing or invalid API key."}


def test_missing_business_field():
    response = client.post(
        "/api/v1/risk-profile",
        json={},
    )

    assert response.status_code == 422


def test_invalid_business_type(valid_payload):
    valid_payload["business"]["business_type"] = "invalid_business"

    response = client.post(
        "/api/v1/risk-profile",
        json=valid_payload,
    )

    assert response.status_code == 422


def test_extra_request_field_is_rejected(valid_payload):
    valid_payload["unexpected_field"] = "malicious input"

    response = client.post(
        "/api/v1/risk-profile",
        json=valid_payload,
    )

    assert response.status_code == 422


def test_invalid_operations_structure(valid_payload):
    valid_payload["business"]["operations"] = [
        "Food production",
        "Retail sales",
    ]

    response = client.post(
        "/api/v1/risk-profile",
        json=valid_payload,
    )

    assert response.status_code == 422

def test_internal_error_does_not_expose_details(
    valid_payload,
    monkeypatch,
):
    def raise_internal_error(self, profile):
        raise RuntimeError("Database password leaked")

    monkeypatch.setattr(
        risk_api.RiskIdentificationService,
        "identify",
        raise_internal_error,
    )

    response = client.post(
        "/api/v1/risk-profile",
        json=valid_payload,
    )

    assert response.status_code == 500

    body = response.json()

    assert body["detail"] == "Risk profiling could not be completed."
    assert "Database password leaked" not in response.text

def test_response_metadata_structure(valid_payload):
    response = client.post(
        "/api/v1/risk-profile",
        json=valid_payload,
    )

    assert response.status_code == 200

    body = response.json()
    metadata = body["metadata"]

    assert metadata["taxonomy_version"] == "1.0"
    assert isinstance(metadata["llm_used"], bool)
    assert isinstance(metadata["processing_ms"], int)
    assert metadata["processing_ms"] >= 0