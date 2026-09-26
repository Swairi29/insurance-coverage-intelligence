"""Integration: gateway -> the real Agents 1, 2, 3 and 4, with nothing stubbed.

Unlike `test_orchestration_end_to_end.py`, Agent 2 runs for real too: a policy
PDF is built with PyMuPDF, uploaded through the gateway, chunked and indexed by
Agent 2, and its clauses are retrieved during the analysis. Every agent runs
in-process (rule and template mode), so there is no network and no LLM call.
Skipped when PyMuPDF is not installed.
"""

from __future__ import annotations

import bcrypt
import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

pymupdf = pytest.importorskip("pymupdf")

from agents.coverage_agent.main import app as coverage_app  # noqa: E402
from agents.explanation_agent.main import app as explanation_app  # noqa: E402
from agents.policy_agent.main import app as policy_app  # noqa: E402
from agents.risk_agent.main import app as risk_app  # noqa: E402
from services.orchestration.api import app as gateway_app  # noqa: E402
from services.orchestration.api import get_pipeline  # noqa: E402
from services.orchestration.database import Database, get_database  # noqa: E402
from services.orchestration.pipeline import AgentClient, AnalysisPipeline  # noqa: E402
from shared.config.settings import get_settings  # noqa: E402
from tests.integration.test_agent3_to_agent4 import BUSINESS  # noqa: E402
from tests.orchestration_fakes import URLS  # noqa: E402

API_KEY = "real-agents-key"
PASSWORD = "correct horse"

# Synthetic wording written for this test.
POLICY_PAGES = [
    "Section 1 - Fire. We will pay for loss or damage to buildings, stock and contents caused by "
    "fire, lightning or explosion at the premises.",
    "Section 2 - Burglary. Theft of stock and cash is covered only following forcible and violent "
    "entry into the premises.",
    "Section 3 - Machinery. Breakdown of ovens, refrigerators and other machinery is excluded.",
]


def _policy_pdf() -> bytes:
    doc = pymupdf.open()
    for text in POLICY_PAGES:
        doc.new_page().insert_textbox(pymupdf.Rect(50, 50, 545, 800), text, fontsize=11)
    return doc.tobytes()


class RealAgents:
    """Routes each agent call to that agent's real FastAPI app."""

    def __init__(self) -> None:
        self.apps = {"risk.test": TestClient(risk_app), "policy.test": TestClient(policy_app),
                     "coverage.test": TestClient(coverage_app),
                     "explanation.test": TestClient(explanation_app)}
        self.calls: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        headers = {k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length")}
        answer = self.apps[request.url.host].request(request.method, request.url.path,
                                                      content=request.content, headers=headers)
        return httpx.Response(answer.status_code, headers=answer.headers, content=answer.content)

    def pipeline(self) -> AnalysisPipeline:
        http = httpx.Client(transport=httpx.MockTransport(self))
        return AnalysisPipeline(AgentClient(http, api_key=API_KEY), URLS, timeout=30, report_timeout=30)


@pytest.fixture
def agents():
    return RealAgents()


@pytest.fixture
def gateway(monkeypatch, tmp_path, agents):
    monkeypatch.setenv("INTERNAL_API_KEY", API_KEY)
    monkeypatch.setenv("EXPLANATION_USE_LLM", "false")
    monkeypatch.setenv("JWT_SECRET_KEY", "j" * 40)
    monkeypatch.setenv("DOCUMENT_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("PROCESSED_DIR", str(tmp_path / "processed"))
    monkeypatch.setenv("OCR_ENABLED", "false")
    fast_salt = bcrypt.gensalt(rounds=4)
    monkeypatch.setattr(bcrypt, "gensalt", lambda: fast_salt)
    get_settings.cache_clear()

    db = Database(tmp_path / "app.db")
    db.init_schema()
    gateway_app.dependency_overrides[get_database] = lambda: db
    gateway_app.dependency_overrides[get_pipeline] = agents.pipeline
    yield TestClient(gateway_app)
    gateway_app.dependency_overrides.clear()
    get_settings.cache_clear()


def _login(gateway) -> dict:
    gateway.post("/api/v1/auth/register", json={"email": "owner@sunrise.test", "password": PASSWORD})
    token = gateway.post("/api/v1/auth/login", json={"email": "owner@sunrise.test", "password": PASSWORD})
    return {"Authorization": f"Bearer {token.json()['access_token']}"}


def test_upload_and_analysis_through_all_four_real_agents(gateway, agents):
    headers = _login(gateway)

    upload = gateway.post("/api/v1/policies", headers=headers,
                          files={"file": ("sunrise.pdf", _policy_pdf(), "application/pdf")})
    assert upload.status_code == 200, upload.text
    policy = upload.json()
    assert policy["status"] == "ready"
    assert policy["page_count"] == len(POLICY_PAGES) and policy["chunk_count"] >= 1
    agents.calls.clear()

    response = gateway.post("/api/v1/analyses", headers=headers,
                            json={"business": BUSINESS, "policy_ids": [policy["policy_id"]]})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "complete", body["warnings"]
    assert [r.url.host for r in agents.calls] == ["risk.test", "policy.test", "coverage.test", "explanation.test"]
    assert {r.headers["X-Request-ID"] for r in agents.calls} == {body["request_id"]}

    # Agent 2 found clauses from the uploaded PDF, and Agent 3 cited them.
    cited = [e for a in body["coverage"]["assessments"] for e in a["evidence"]]
    assert cited and {e["policy_id"] for e in cited} == {policy["policy_id"]}

    # Agent 4 explains every assessment without changing Agent 3's decision.
    coverage = {a["risk_id"]: (a["status"], a["potential_gap"]) for a in body["coverage"]["assessments"]}
    report = {f["risk_id"]: (f["status"], f["potential_gap"]) for f in body["report"]["findings"]}
    assert report == coverage and len(report) == len(body["risk_profile"]["risks"])
    assert body["report"]["metadata"]["llm_used"] is False

    # The business name only goes to Agent 1, and the run can be read back.
    assert all(b"Sunrise Bakery" not in r.content for r in agents.calls[1:])
    assert gateway.get(f"/api/v1/analyses/{body['request_id']}", headers=headers).json() == body


def test_a_second_user_cannot_analyse_someone_elses_policy(gateway):
    owner = _login(gateway)
    policy_id = gateway.post("/api/v1/policies", headers=owner,
                             files={"file": ("sunrise.pdf", _policy_pdf(), "application/pdf")}).json()["policy_id"]

    gateway.post("/api/v1/auth/register", json={"email": "other@shop.test", "password": PASSWORD})
    token = gateway.post("/api/v1/auth/login", json={"email": "other@shop.test", "password": PASSWORD})
    other = {"Authorization": f"Bearer {token.json()['access_token']}"}

    response = gateway.post("/api/v1/analyses", headers=other,
                            json={"business": BUSINESS, "policy_ids": [policy_id]})

    assert response.status_code == 404
    assert response.json()["error"] == "policy_not_found"
