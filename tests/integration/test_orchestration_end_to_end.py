"""Integration: frontend -> gateway -> Agent 1 -> Agent 2 -> Agent 3 -> Agent 4.

The gateway runs for real, and so do Agents 1, 3 and 4 (in-process, rule and
template mode, no network, no LLM). Their HTTP calls are routed by host to each
agent's FastAPI app, so the real `X-API-Key` checks and schemas apply.
Agent 2 needs PyMuPDF and real PDFs, so it is stubbed with the synthetic
evidence from `test_agent3_to_agent4.py`.
"""

from __future__ import annotations

import json

import bcrypt
import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from agents.coverage_agent.main import app as coverage_app
from agents.explanation_agent.main import app as explanation_app
from agents.risk_agent.main import app as risk_app
from services.orchestration.api import app as gateway_app
from services.orchestration.api import get_pipeline
from services.orchestration.database import Database, get_database
from services.orchestration.pipeline import AgentClient, AnalysisPipeline
from shared.config.settings import get_settings
from shared.models.coverage import CoverageStatus
from tests.integration.test_agent3_to_agent4 import BUSINESS, EVIDENCE
from tests.orchestration_fakes import URLS, multipart_field

API_KEY = "integration-key"
PASSWORD = "correct horse"


class AgentRouter:
    """Sends each agent call to the right in-process app; stubs Agent 2."""

    def __init__(self) -> None:
        self.apps = {"risk.test": TestClient(risk_app), "coverage.test": TestClient(coverage_app),
                     "explanation.test": TestClient(explanation_app)}
        self.calls: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        if request.url.host == "policy.test":
            return self._policy_agent(request)
        headers = {k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length")}
        answer = self.apps[request.url.host].request(request.method, request.url.path,
                                                      content=request.content, headers=headers)
        return httpx.Response(answer.status_code, headers=answer.headers, content=answer.content)

    @staticmethod
    def _policy_agent(request: httpx.Request) -> httpx.Response:
        if request.headers.get("X-API-Key") != API_KEY:
            return httpx.Response(401, json={"detail": "Missing or invalid API key."})
        if request.url.path == "/api/v1/policies":
            return httpx.Response(200, json={
                "policy_id": "POL-SUN-01", "business_id": multipart_field(request, "business_id"),
                "filename": "sunrise.pdf", "status": "ready", "page_count": 24, "chunk_count": 60})
        body = json.loads(request.content)
        return httpx.Response(200, json={
            "business_id": body["business_id"],
            "results": [{"risk_id": r["risk_id"], "evidence": EVIDENCE.get(r["risk_id"], [])} for r in body["risks"]],
        })

    def pipeline(self, api_key: str = API_KEY) -> AnalysisPipeline:
        http = httpx.Client(transport=httpx.MockTransport(self))
        return AnalysisPipeline(AgentClient(http, api_key=api_key), URLS, timeout=30, report_timeout=30)


@pytest.fixture
def router():
    return AgentRouter()


@pytest.fixture
def gateway(monkeypatch, tmp_path, router):
    monkeypatch.setenv("INTERNAL_API_KEY", API_KEY)
    monkeypatch.setenv("EXPLANATION_USE_LLM", "false")  # Agent 4 never calls a real model here
    monkeypatch.setenv("JWT_SECRET_KEY", "j" * 40)
    monkeypatch.setenv("DOCUMENT_ENCRYPTION_KEY", Fernet.generate_key().decode())
    fast_salt = bcrypt.gensalt(rounds=4)
    monkeypatch.setattr(bcrypt, "gensalt", lambda: fast_salt)
    get_settings.cache_clear()

    db = Database(tmp_path / "app.db")
    db.init_schema()
    gateway_app.dependency_overrides[get_database] = lambda: db
    gateway_app.dependency_overrides[get_pipeline] = router.pipeline
    yield TestClient(gateway_app)
    gateway_app.dependency_overrides.clear()
    get_settings.cache_clear()


def _login(gateway) -> dict:
    gateway.post("/api/v1/auth/register", json={"email": "owner@sunrise.test", "password": PASSWORD})
    token = gateway.post("/api/v1/auth/login", json={"email": "owner@sunrise.test", "password": PASSWORD})
    return {"Authorization": f"Bearer {token.json()['access_token']}"}


def test_full_run_through_the_gateway(gateway, router):
    headers = _login(gateway)
    policy = gateway.post("/api/v1/policies", headers=headers,
                          files={"file": ("sunrise.pdf", b"%PDF-1.4 synthetic", "application/pdf")})
    assert policy.status_code == 200, policy.text
    router.calls.clear()

    response = gateway.post("/api/v1/analyses", headers=headers,
                            json={"business": BUSINESS, "policy_ids": [policy.json()["policy_id"]]})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "complete", body["warnings"]
    request_id = body["request_id"]

    # Every agent was called once, in order, with the same request_id and the API key.
    assert [r.url.host for r in router.calls] == ["risk.test", "policy.test", "coverage.test", "explanation.test"]
    assert {r.headers["X-Request-ID"] for r in router.calls} == {request_id}
    assert all(r.headers["X-API-Key"] == API_KEY for r in router.calls)
    for part in (body["risk_profile"], body["coverage"], body["report"]):
        assert part["request_id"] == request_id

    # Golden rule: the report explains Agent 3's decisions without changing them.
    coverage = {a["risk_id"]: (a["status"], a["potential_gap"]) for a in body["coverage"]["assessments"]}
    report = {f["risk_id"]: (f["status"], f["potential_gap"]) for f in body["report"]["findings"]}
    assert report == coverage and len(report) == len(body["risk_profile"]["risks"])
    # Agent 3's HTTP API has no interpreter yet (issue I7).
    assert {status for status, _ in coverage.values()} <= {CoverageStatus.UNCLEAR.value,
                                                           CoverageStatus.NOT_FOUND.value}

    # The business name is only sent to Agent 1.
    assert all(b"Sunrise Bakery" not in r.content for r in router.calls[1:])

    # The run is stored and can be read back.
    assert gateway.get(f"/api/v1/analyses/{request_id}", headers=headers).json() == body


def test_real_agent_1_refuses_a_wrong_api_key(gateway, router):
    headers = _login(gateway)
    gateway.post("/api/v1/policies", headers=headers,
                 files={"file": ("sunrise.pdf", b"%PDF-1.4 synthetic", "application/pdf")})
    gateway_app.dependency_overrides[get_pipeline] = lambda: router.pipeline(api_key="wrong-key")
    router.calls.clear()

    response = gateway.post("/api/v1/analyses", headers=headers,
                            json={"business": BUSINESS, "policy_ids": ["POL-SUN-01"]})

    assert response.status_code == 502
    assert response.json() | {"request_id": None} == {
        "error": "agent_rejected", "message": "An analysis service could not complete the request.",
        "stage": "risk_profile", "request_id": None}
    assert [r.url.host for r in router.calls] == ["risk.test"]
