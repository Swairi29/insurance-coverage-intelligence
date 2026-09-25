# Agent 3 API tests (Member 3)


import os

import pytest
from fastapi.testclient import TestClient

from agents.coverage_agent.main import app
from agents.coverage_agent.rules import decide_coverage

from shared.models.policy import EvidenceClause
from shared.models.coverage import CoverageStatus


client = TestClient(app)


def _evidence(text: str):
    return EvidenceClause(
        chunk_id="CHUNK-001",
        policy_id="POL-001",
        section="Coverage",
        page=5,
        text=text,
        score=0.85,
    )


def test_fire_is_covered():

    decision = decide_coverage(
        [_evidence(
            "Loss or damage caused by fire is covered."
        )]
    )

    assert decision.status is CoverageStatus.COVERED
    assert decision.potential_gap is False


def test_equipment_breakdown_is_excluded():

    decision = decide_coverage(
        [_evidence(
            "Mechanical or electrical breakdown is excluded."
        )]
    )

    assert decision.status is CoverageStatus.EXCLUDED
    assert decision.potential_gap is True


def test_business_interruption_is_conditional():

    decision = decide_coverage(
        [_evidence(
            "Business interruption is covered subject to the conditions below."
        )]
    )

    assert decision.status is CoverageStatus.CONDITIONAL
    assert decision.potential_gap is False


def test_no_evidence_is_not_found():

    decision = decide_coverage([])

    assert decision.status is CoverageStatus.NOT_FOUND
    assert decision.potential_gap is True


def test_conflicting_evidence_is_unclear():

    decision = decide_coverage(
        [
            _evidence("Fire damage is covered."),
            _evidence("Fire damage is excluded."),
        ]
    )

    assert decision.status is CoverageStatus.UNCLEAR
    assert decision.potential_gap is True


def test_health_endpoint():

    response = client.get("/health")

    assert response.status_code == 200

    body = response.json()

    assert body["status"] == "healthy"
    assert body["agent"] == "coverage-gap-analysis"


def test_missing_api_key_is_rejected(monkeypatch):

    monkeypatch.setenv(
        "INTERNAL_API_KEY",
        "test-secret",
    )

    from shared.config.settings import get_settings

    get_settings.cache_clear()

    response = client.post(
        "/api/v1/analyse-coverage",
        json={
            "business_id": "B001",
            "risks": [],
            "evidence_results": [],
        },
    )

    assert response.status_code in (401, 422)


def test_authenticated_request(monkeypatch):

    monkeypatch.setenv(
        "INTERNAL_API_KEY",
        "test-secret",
    )

    from shared.config.settings import get_settings

    get_settings.cache_clear()

    payload = {
        "business_id": "B001",
        "risks": [
            {
                "risk_id": "FIRE_COOKING",
                "name": "Cooking fire",
                "category": "fire",
                "reason": "Commercial cooking creates fire exposure.",
                "source": "rule",
                "confidence": 0.8,
                "evidence": [],
            }
        ],
        "evidence_results": [
            {
                "risk_id": "FIRE_COOKING",
                "evidence": [
                    {
                        "chunk_id": "CHUNK-001",
                        "policy_id": "POL-001",
                        "section": "Property Coverage",
                        "page": 5,
                        "text": "Fire damage is covered.",
                        "score": 0.9,
                    }
                ],
            }
        ],
    }

    response = client.post(
        "/api/v1/analyse-coverage",
        headers={
            "X-API-Key": "test-secret",
        },
        json=payload,
    )

    assert response.status_code == 200

    body = response.json()

    assert len(body["assessments"]) == 1
    assert body["assessments"][0]["status"] == "covered"
    assert body["assessments"][0]["potential_gap"] is False

class FakeLLM:

    def __init__(self, response: str):
        self.response = response

    def generate_text(
        self,
        prompt,
        *,
        system_instruction=None,
        json_output=False,
    ):
        return self.response

def test_llm_can_resolve_ambiguous_clause():

    from agents.coverage_agent.interpreter import CoverageInterpreter

    fake_llm = FakeLLM(
        """
        {
            "status": "conditional",
            "reason": "Coverage depends on the stated policy conditions.",
            "confidence": 0.82
        }
        """
    )

    interpreter = CoverageInterpreter(fake_llm)

    result = interpreter.interpret(
        "Business interruption",
        [
            _evidence(
                "Business interruption may apply subject to policy conditions."
            )
        ],
    )

    assert result.status.value == "conditional"
    assert result.confidence == 0.82