"""Focused tests for the separate scenario analysis gateway path."""

import bcrypt
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from services.orchestration.api import app, get_pipeline
from services.orchestration.auth import LoginLimiter, get_login_limiter
from services.orchestration.database import Database, get_database
from services.orchestration.jobs import JobStore, get_job_store
from services.orchestration.pipeline import AgentCallError, ErrorKind, Stage
from shared.config.settings import get_settings
from shared.models.scenario_risk import ScenarioRisk
from services.orchestration.scenario_adapter import ScenarioRiskMappingError, adapt_scenario_risks
from shared.schemas.requests import CURRENT_CONSENT_VERSION as CONSENT
from tests.orchestration_fakes import FakeAgents, SCENARIO_RISK_PATH


@pytest.fixture
def setup_scenario(monkeypatch, tmp_path):
    agents = FakeAgents()
    db = Database(tmp_path / "scenario.db")
    db.init_schema()
    salt = bcrypt.gensalt(rounds=4)
    monkeypatch.setattr(bcrypt, "gensalt", lambda: salt)
    monkeypatch.setenv("JWT_SECRET_KEY", "j" * 40)
    monkeypatch.setenv("DOCUMENT_ENCRYPTION_KEY", Fernet.generate_key().decode())
    get_settings.cache_clear()
    app.dependency_overrides[get_database] = lambda: db
    app.dependency_overrides[get_pipeline] = agents.pipeline
    app.dependency_overrides[get_login_limiter] = lambda: LoginLimiter()
    client = TestClient(app)
    yield client, db, agents
    app.dependency_overrides.clear()


def signed_in(client, email="scenario@example.com"):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse", "consent_version": CONSENT})
    token = client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def create_policy(client, headers):
    return client.post("/api/v1/policies", files={"file": ("policy.pdf", b"%PDF-1.4 policy", "application/pdf")}, headers=headers).json()["policy_id"]


def test_scenario_risks_map_to_agent2_contract():
    risk = ScenarioRisk.model_validate({"risk_id":"oven_fire", "name":"Oven fire", "category":"property", "description":"Commercial ovens can cause fire.", "reason":"The scenario includes commercial ovens.", "confidence":0.9, "evidence":[{"text":"commercial ovens", "source":"scenario"}]})
    mapped = adapt_scenario_risks([risk], llm_used=True)[0]
    assert (mapped.risk_id, mapped.name, mapped.category.value, mapped.reason, mapped.confidence) == ("OVEN_FIRE", "Oven fire", "property", risk.reason, 0.9)
    assert mapped.evidence[0].value == "commercial ovens"


def test_unmapped_category_fails_safely():
    risk = ScenarioRisk.model_validate({"risk_id":"travel_risk", "name":"Travel risk", "category":"travel", "description":"A travel related risk exists.", "reason":"The scenario describes travel exposure.", "confidence":0.5})
    with pytest.raises(ScenarioRiskMappingError):
        adapt_scenario_risks([risk], llm_used=True)


def test_scenario_analysis_success_and_uses_authenticated_business(setup_scenario):
    client, db, agents = setup_scenario
    headers = signed_in(client)
    policy_id = create_policy(client, headers)
    response = client.post("/api/v1/scenario-analyses", headers=headers, json={"scenario":"Bakery uses commercial ovens with five staff.", "policy_ids":[policy_id]})
    assert response.status_code == 202, response.text
    progress = client.get(f"/api/v1/scenario-analyses/{response.json()['request_id']}/status", headers=headers).json()
    assert progress["state"] == "complete"
    assert progress["stages"][0]["endpoint"] == "POST /api/v1/scenario-risk-profile"
    result = client.get(f"/api/v1/scenario-analyses/{progress['request_id']}", headers=headers)
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["business_id"] == db.get_user_by_email("scenario@example.com").business_id
    assert body["risks"][0]["name"] == "Commercial oven fire"
    assert body["coverage"]["assessments"][0]["risk_id"] == "OVEN_FIRE"
    assert body["report"] is not None
    assert agents.body("/api/v1/retrieve-policy-evidence")["business_id"] == body["business_id"]
    assert agents.paths().count(SCENARIO_RISK_PATH) == 1


def test_scenario_analysis_requires_auth(setup_scenario):
    client, _, _ = setup_scenario
    response = client.post("/api/v1/scenario-analyses", json={"scenario":"A valid sufficiently long scenario.", "policy_ids":["P1"]})
    assert response.status_code == 401


def test_scenario_analysis_rejects_invalid_scenario(setup_scenario):
    client, _, _ = setup_scenario
    response = client.post("/api/v1/scenario-analyses", headers=signed_in(client), json={"scenario":"   ", "policy_ids":["P1"]})
    assert response.status_code == 422


def test_scenario_analysis_enforces_policy_ownership(setup_scenario):
    client, _, agents = setup_scenario
    headers = signed_in(client)
    other = signed_in(client, "another@example.com")
    foreign_id = create_policy(client, other)
    response = client.post("/api/v1/scenario-analyses", headers=headers, json={"scenario":"A valid sufficiently long scenario.", "policy_ids":[foreign_id]})
    assert response.status_code == 404
    assert SCENARIO_RISK_PATH not in agents.paths()


@pytest.mark.parametrize("stage,expected_status", [(Stage.RISK_PROFILE, 502), (Stage.POLICY_EVIDENCE, 502), (Stage.COVERAGE, 502)])
def test_required_agent_failure_returns_stage(setup_scenario, stage, expected_status):
    client, _, agents = setup_scenario
    headers = signed_in(client)
    policy_id = create_policy(client, headers)
    paths = {Stage.RISK_PROFILE: SCENARIO_RISK_PATH, Stage.POLICY_EVIDENCE: "/api/v1/retrieve-policy-evidence", Stage.COVERAGE: "/api/v1/analyse-coverage"}
    agents.overrides[paths[stage]] = lambda request: __import__("httpx").Response(503, json={"error":"down"})
    response = client.post("/api/v1/scenario-analyses", headers=headers, json={"scenario":"A valid sufficiently long scenario.", "policy_ids":[policy_id]})
    assert response.status_code == 202
    failed = client.get(f"/api/v1/scenario-analyses/{response.json()['request_id']}", headers=headers)
    assert failed.status_code == expected_status
    assert failed.json()["stage"] == stage.value


def test_scenario_report_failure_is_partial(setup_scenario):
    import httpx
    client, _, agents = setup_scenario
    headers = signed_in(client)
    policy_id = create_policy(client, headers)
    agents.overrides["/api/v1/generate-report"] = lambda request: httpx.Response(503, json={"error":"down"})
    started = client.post("/api/v1/scenario-analyses", headers=headers, json={"scenario":"A valid sufficiently long scenario.", "policy_ids":[policy_id]})
    response = client.get(f"/api/v1/scenario-analyses/{started.json()['request_id']}", headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "partial" and response.json()["report"] is None


def run_scenario(client, headers):
    policy_id = create_policy(client, headers)
    started = client.post("/api/v1/scenario-analyses", headers=headers, json={"scenario":"Bakery uses commercial ovens with five staff.", "policy_ids":[policy_id]})
    assert started.status_code == 202, started.text
    return started.json()["request_id"]


def test_finished_scenario_is_saved_encrypted_and_listed(setup_scenario):
    client, db, _ = setup_scenario
    headers = signed_in(client)
    request_id = run_scenario(client, headers)
    listed = client.get("/api/v1/scenario-analyses", headers=headers)
    assert listed.status_code == 200
    [summary] = listed.json()
    assert summary["request_id"] == request_id and summary["status"] == "complete"
    assert summary["total_findings"] >= 1
    user_id = db.get_user_by_email("scenario@example.com").user_id
    stored = db.get_scenario_analysis(user_id=user_id, request_id=request_id)
    assert stored is not None and b"Commercial oven fire" not in stored  # encrypted at rest


def test_saved_scenario_survives_a_gateway_restart(setup_scenario):
    client, _, _ = setup_scenario
    headers = signed_in(client)
    request_id = run_scenario(client, headers)
    # A restart empties the in-memory job store.
    app.dependency_overrides[get_job_store] = lambda: JobStore()
    result = client.get(f"/api/v1/scenario-analyses/{request_id}", headers=headers)
    assert result.status_code == 200, result.text
    assert result.json()["risks"][0]["name"] == "Commercial oven fire"
    status = client.get(f"/api/v1/scenario-analyses/{request_id}/status", headers=headers).json()
    assert status["state"] == "complete"
    assert status["stages"][0]["endpoint"] == "POST /api/v1/scenario-risk-profile"
    assert status["stages"][0]["sent"] == "scenario text"


def test_saved_scenario_is_private_to_its_owner(setup_scenario):
    client, _, _ = setup_scenario
    request_id = run_scenario(client, signed_in(client))
    other = signed_in(client, "another@example.com")
    app.dependency_overrides[get_job_store] = lambda: JobStore()
    assert client.get("/api/v1/scenario-analyses", headers=other).json() == []
    assert client.get(f"/api/v1/scenario-analyses/{request_id}", headers=other).status_code == 404
    assert client.get(f"/api/v1/scenario-analyses/{request_id}/status", headers=other).status_code == 404


def test_failed_scenario_is_not_saved(setup_scenario):
    import httpx
    client, _, agents = setup_scenario
    headers = signed_in(client)
    agents.overrides[SCENARIO_RISK_PATH] = lambda request: httpx.Response(503, json={"error":"down"})
    run_scenario(client, headers)
    assert client.get("/api/v1/scenario-analyses", headers=headers).json() == []
