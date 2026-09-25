# Agent 3 API tests (Member 3)

import pytest
from fastapi.testclient import TestClient

from agents.coverage_agent.main import app
from agents.coverage_agent.interpreter import CoverageInterpreter
from agents.coverage_agent.service import CoverageAnalysisService
from shared.models.coverage import CoverageStatus


client = TestClient(app)


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


def make_risk(
    risk_id="MECHANICAL_BREAKDOWN",
    name="Mechanical breakdown",
):
    return {
        "risk_id": risk_id,
        "name": name,
        "category": "property",
        "reason": (
            "Loss or damage caused by mechanical or electrical "
            "breakdown of insured property."
        ),
        "source": "rule",
        "confidence": 0.90,
        "evidence": [],
    }


def make_evidence():
    return [
        {
            "chunk_id": "POLICY-1",
            "policy_id": "POL-001",
            "section": "Exceptions",
            "page": 1,
            "text": (
                "What is not covered (Exceptions): "
                "Mechanical or electrical breakdown or derangement."
            ),
            "score": 0.90,
        }
    ]


def test_health():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_missing_api_key():
    response = client.post(
        "/api/v1/analyse-coverage",
        json={
            "business_id": "B001",
            "risks": [make_risk()],
            "evidence_results": [],
        },
    )

    assert response.status_code == 401


def test_no_evidence_returns_not_found(monkeypatch):
    response = client.post(
        "/api/v1/analyse-coverage",
        headers={"X-API-Key": "test-key"},
        json={
            "business_id": "B001",
            "risks": [make_risk()],
            "evidence_results": [],
        },
    )

    assert response.status_code == 200

    body = response.json()

    assessment = body["assessments"][0]

    assert assessment["status"] == "not_found"
    assert assessment["potential_gap"] is True


def test_llm_interprets_exclusion():
    fake_llm = FakeLLM(
        """
        {
            "status": "excluded",
            "reason": "Mechanical or electrical breakdown is explicitly listed as an exception.",
            "confidence": 0.95,
            "evidence_chunk_ids": ["POLICY-1"]
        }
        """
    )

    interpreter = CoverageInterpreter(
        fake_llm,
        model_name="fake-model",
    )

    service = CoverageAnalysisService(
        interpreter=interpreter,
        use_llm=True,
    )

    result = service.analyse(
        risks=[
            type(
                "Risk",
                (),
                {
                    "risk_id": "MECHANICAL_BREAKDOWN",
                    "name": "Mechanical breakdown",
                    "category": "property",
                    "reason": "Equipment may experience breakdown.",
                },
            )()
        ],
        evidence_results=[
            type(
                "EvidenceResult",
                (),
                {
                    "risk_id": "MECHANICAL_BREAKDOWN",
                    "evidence": [
                        type(
                            "Evidence",
                            (),
                            {
                                "chunk_id": "POLICY-1",
                                "policy_id": "POL-001",
                                "section": "Exceptions",
                                "page": 1,
                                "text": (
                                    "What is not covered: "
                                    "Mechanical or electrical breakdown."
                                ),
                                "score": 0.90,
                            },
                        )()
                    ],
                },
            )()
        ],
    )

    assessment = result.assessments[0]

    assert assessment.status == CoverageStatus.EXCLUDED
    assert assessment.potential_gap is True
    assert assessment.method.value == "rules+llm"