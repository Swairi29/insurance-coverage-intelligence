"""scripts/seed_demo.py against the real gateway and all four real agents (in-process, no LLM).

Reuses the `gateway` and `agents` fixtures of test_orchestration_real_agents.py.
Skipped when PyMuPDF is not installed.
"""

from __future__ import annotations

import httpx
import pytest

pytest.importorskip("pymupdf")

from scripts.seed_demo import SeedError, seed  # noqa: E402
from services.orchestration.api import app as gateway_app  # noqa: E402
from services.orchestration.api import get_pipeline  # noqa: E402
from tests.integration.test_orchestration_real_agents import (  # noqa: E402,F401
    RealAgents,
    agents,
    gateway,
)

EMAIL = "demo@insureintel.test"
PASSWORD = "demo-password-1"


def _login(client) -> dict:
    token = client.post("/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD})
    return {"Authorization": f"Bearer {token.json()['access_token']}"}


def test_seed_creates_the_account_policies_and_a_finished_analysis(gateway):
    result = seed(gateway, EMAIL, PASSWORD)

    assert result.created_account is True
    assert result.uploaded == ["sunrise-business-pack.pdf", "flood-extension.pdf"]
    assert result.status == "complete"
    assert result.total_findings > 0 and result.llm_findings == 0  # no LLM in tests

    headers = _login(gateway)
    policies = {p["filename"]: p for p in gateway.get("/api/v1/policies", headers=headers).json()}
    assert all(p["status"] == "ready" for p in policies.values())
    assert policies["flood-extension.pdf"]["flagged_chunk_count"] >= 1  # the injected clause

    history = gateway.get("/api/v1/analyses", headers=headers).json()
    assert [a["request_id"] for a in history] == [result.request_id]


def test_running_it_again_reuses_the_account_and_policies(gateway):
    first = seed(gateway, EMAIL, PASSWORD)
    second = seed(gateway, EMAIL, PASSWORD)

    assert second.created_account is False
    assert second.uploaded == []
    assert second.reused == ["sunrise-business-pack.pdf", "flood-extension.pdf"]

    headers = _login(gateway)
    assert len(gateway.get("/api/v1/policies", headers=headers).json()) == 2
    history = {a["request_id"] for a in gateway.get("/api/v1/analyses", headers=headers).json()}
    assert history == {first.request_id, second.request_id}


def test_an_existing_account_with_another_password_is_explained(gateway):
    seed(gateway, EMAIL, PASSWORD)

    with pytest.raises(SeedError, match="already exists with a different password"):
        seed(gateway, EMAIL, "not-the-password")


class Agent1Down(RealAgents):
    def __call__(self, request: httpx.Request) -> httpx.Response:
        if request.url.host == "risk.test":
            raise httpx.ConnectError("down", request=request)
        return super().__call__(request)


def test_it_stops_early_when_an_agent_is_down(gateway):
    gateway_app.dependency_overrides[get_pipeline] = Agent1Down().pipeline

    with pytest.raises(SeedError, match="not running: risk_profile"):
        seed(gateway, EMAIL, PASSWORD)
