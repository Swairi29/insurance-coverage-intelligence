"""API tests for the Explanation & Recommendation Agent. No real LLM is called."""

from __future__ import annotations

import copy

import pytest
from fastapi.testclient import TestClient

from agents.explanation_agent.api import get_explanation_service
from agents.explanation_agent.main import app
from agents.explanation_agent.service import ExplanationService
from agents.explanation_agent.tests.fakes import FakeLLM, load_fixture, load_llm_response
from shared.config.settings import get_settings
from shared.llm.ollama_client import OllamaClient
from shared.schemas.responses import ExplanationResponse

API_KEY = "test-internal-key"
HEADERS = {"X-API-Key": API_KEY}
URL = "/api/v1/generate-report"

client = TestClient(app)


@pytest.fixture(autouse=True)
def _api_key(monkeypatch):
    monkeypatch.setenv("INTERNAL_API_KEY", API_KEY)
    # Never reach a real model, whatever the developer's shell says.
    monkeypatch.setenv("EXPLANATION_USE_LLM", "false")
    get_settings.cache_clear()
    yield
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def _use_service(service: ExplanationService) -> None:
    app.dependency_overrides[get_explanation_service] = lambda: service


def _body(name: str = "bakery_mixed.json") -> dict:
    return copy.deepcopy(load_fixture(name))


# --- auth ------------------------------------------------------------------------------------------


def test_missing_key_401():
    response = client.post(URL, json=_body())
    assert response.status_code == 401
    assert response.json() == {"detail": "Missing or invalid API key."}


def test_wrong_key_401():
    assert client.post(URL, json=_body(), headers={"X-API-Key": "wrong"}).status_code == 401


def test_key_not_configured_on_server_401(monkeypatch):
    monkeypatch.delenv("INTERNAL_API_KEY")
    get_settings.cache_clear()
    assert client.post(URL, json=_body(), headers=HEADERS).status_code == 401


def test_auth_checked_before_body():
    assert client.post(URL, json={"nonsense": True}).status_code == 401


# --- success -------------------------------------------------------------------------------------------


def test_valid_request_with_templates():
    # Real dependency; EXPLANATION_USE_LLM=false so no client is built.
    response = client.post(URL, json=_body(), headers=HEADERS)
    assert response.status_code == 200
    report = ExplanationResponse.model_validate(response.json())
    assert report.request_id == "fixture-bakery-mixed"
    assert len(report.findings) == 6
    assert {f.generated_by.value for f in report.findings} == {"template"}
    assert report.metadata.llm_used is False


def test_valid_request_with_fake_llm():
    # Batch 1 answers well; batch 2's LLM call fails, so those two findings use templates.
    fake = FakeLLM([load_llm_response("bakery_mixed_good.json"), TimeoutError()])
    _use_service(ExplanationService(client=fake, provider="ollama", model="qwen3:8b"))
    response = client.post(URL, json=_body(), headers=HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert len(fake.calls) == 2
    assert body["metadata"]["llm_used"] is True and body["metadata"]["llm_provider"] == "ollama"
    assert body["metadata"]["llm_findings"] == 4 and body["metadata"]["template_findings"] == 2
    assert "standard wording" in " ".join(body["warnings"])


def test_injection_fixture_through_api():
    response = client.post(URL, json=_body("injection.json"), headers=HEADERS)
    assert response.status_code == 200
    weather = next(f for f in response.json()["findings"] if f["risk_id"] == "PROP_WEATHER")
    assert weather["status"] == "excluded" and weather["evidence"][0]["flagged"] is True
    assert "Ignore all previous instructions" not in response.text


def test_empty_request():
    body = {"business_id": "B001", "risks": [], "assessments": []}
    response = client.post(URL, json=body, headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["summary"]["total_findings"] == 0
    assert response.json()["request_id"]  # generated when not sent


# --- validation errors ------------------------------------------------------------------------------


def test_invalid_body_422_without_echoing_input():
    body = _body()
    body["assessments"][0]["evidence"][0]["page"] = 0
    body["assessments"][0]["evidence"][0]["text"] = "SECRET-CLAUSE-TEXT"
    body["assessments"][0]["status"] = "definitely_covered_SECRET"
    response = client.post(URL, json=body, headers=HEADERS)
    assert response.status_code == 422
    data = response.json()
    assert data["error"] == "validation_error"
    fields = {detail["field"] for detail in data["details"]}
    assert "assessments.0.evidence.0.page" in fields and "assessments.0.status" in fields
    assert "SECRET" not in response.text


def test_extra_field_422():
    body = _body()
    body["business_name"] = "Sweet Bakes"
    response = client.post(URL, json=body, headers=HEADERS)
    assert response.status_code == 422
    assert "Sweet Bakes" not in response.text


def test_duplicate_assessments_422():
    body = _body()
    body["assessments"].append(copy.deepcopy(body["assessments"][0]))
    assert client.post(URL, json=body, headers=HEADERS).status_code == 422


# --- errors ---------------------------------------------------------------------------------------------


def test_service_exception_500_generic_message(caplog):
    class Broken(ExplanationService):
        def generate(self, request):
            raise RuntimeError("secret internal detail")

    _use_service(Broken())
    response = client.post(URL, json=_body(), headers=HEADERS)
    assert response.status_code == 500
    assert response.json() == {"detail": "Report generation could not be completed."}
    assert "secret internal detail" not in caplog.text


# --- dependency -----------------------------------------------------------------------------------------


def test_dependency_builds_llm_service_when_enabled(monkeypatch):
    monkeypatch.setenv("EXPLANATION_USE_LLM", "true")
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen3:8b")
    get_settings.cache_clear()
    service = get_explanation_service()  # building the client does not contact Ollama
    assert isinstance(service._client, OllamaClient)
    assert (service._provider, service._model, service._use_llm) == ("ollama", "qwen3:8b", True)


def test_dependency_without_llm():
    service = get_explanation_service()
    assert service._client is None and service._use_llm is False


# --- health ---------------------------------------------------------------------------------------------


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "agent": "explanation-recommendation"}


def test_openapi_lists_the_endpoint():
    assert URL in client.get("/openapi.json").json()["paths"]
