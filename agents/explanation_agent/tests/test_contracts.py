"""Contract tests for Agent 4's shared request/response models."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from shared.models.analysis import (
    DISCLAIMER,
    EvidenceCitation,
    Finding,
    FindingPriority,
    GeneratedBy,
    ReportSummary,
)
from shared.models.coverage import CoverageStatus
from shared.models.risk import RiskCategory
from shared.schemas.requests import ExplanationRequest
from shared.schemas.responses import ExplanationMetadata, ExplanationResponse


def _risk(risk_id: str = "PROP_THEFT") -> dict:
    return {
        "risk_id": risk_id,
        "name": "Theft of stock or equipment",
        "category": "property",
        "reason": "The bakery keeps valuable equipment on site.",
        "source": "rule",
        "confidence": 0.7,
        "evidence": [{"field": "equipment", "value": "oven"}],
    }


def _assessment(risk_id: str = "PROP_THEFT") -> dict:
    return {
        "risk_id": risk_id,
        "risk_name": "Theft of stock or equipment",
        "status": "conditional",
        "potential_gap": False,
        "reason": "Theft is covered only following forcible entry.",
        "evidence": [
            {
                "chunk_id": "P001-p7-c2",
                "policy_id": "P001",
                "section": "Section 3 - Burglary",
                "page": 7,
                "text": "Theft is covered only where there is forcible and violent entry.",
                "score": 0.82,
            }
        ],
        "confidence": 0.7,
        "method": "rules",
        "matched_signals": ["forcible entry"],
    }


def _request(**overrides) -> dict:
    body = {
        "request_id": "req-001",
        "business_id": "B001",
        "business_type": "bakery",
        "risks": [_risk()],
        "assessments": [_assessment()],
    }
    body.update(overrides)
    return body


def _finding(**overrides) -> Finding:
    data = {
        "risk_id": "PROP_THEFT",
        "risk_name": "Theft of stock or equipment",
        "category": RiskCategory.PROPERTY,
        "status": CoverageStatus.CONDITIONAL,
        "potential_gap": False,
        "priority": FindingPriority.MEDIUM,
        "title": "Covered with conditions: Theft of stock or equipment",
        "explanation": "Theft is covered only after a forced break-in.",
        "recommendation": "Ask your broker what locks and alarms the policy requires.",
        "evidence": [
            EvidenceCitation(
                chunk_id="P001-p7-c2",
                policy_id="P001",
                section="Section 3 - Burglary",
                page=7,
                excerpt="Theft is covered only where there is forcible and violent entry.",
            )
        ],
        "verification_required": True,
        "coverage_confidence": 0.7,
        "generated_by": GeneratedBy.TEMPLATE,
    }
    data.update(overrides)
    return Finding(**data)


def _response() -> ExplanationResponse:
    return ExplanationResponse(
        request_id="req-001",
        business_id="B001",
        generated_at=datetime(2026, 9, 25, tzinfo=timezone.utc),
        summary=ReportSummary(
            total_findings=1,
            potential_gaps=0,
            counts_by_status={"conditional": 1},
            headline="1 risk checked: 1 covered with conditions.",
        ),
        findings=[_finding()],
        disclaimer=DISCLAIMER,
        metadata=ExplanationMetadata(llm_used=False, llm_findings=0, template_findings=1),
    )


# --- ExplanationRequest ------------------------------------------------------------


def test_valid_request_round_trip():
    request = ExplanationRequest.model_validate(_request())
    again = ExplanationRequest.model_validate_json(request.model_dump_json())
    assert again == request
    assert again.assessments[0].status is CoverageStatus.CONDITIONAL


def test_request_id_generated_when_missing_or_null():
    body = _request()
    del body["request_id"]
    assert ExplanationRequest.model_validate(body).request_id
    assert ExplanationRequest.model_validate(_request(request_id=None)).request_id


def test_empty_request_is_valid():
    request = ExplanationRequest.model_validate(_request(risks=[], assessments=[], business_type=None))
    assert request.risks == [] and request.assessments == []


def test_duplicate_assessment_risk_id_rejected():
    with pytest.raises(ValidationError, match="assessments must not contain duplicate"):
        ExplanationRequest.model_validate(_request(assessments=[_assessment(), _assessment()]))


def test_duplicate_risk_id_rejected():
    with pytest.raises(ValidationError, match="risks must not contain duplicate"):
        ExplanationRequest.model_validate(_request(risks=[_risk(), _risk()]))


@pytest.mark.parametrize("bad_id", ["req 001", "req;drop", "req/001", "<script>"])
def test_bad_request_id_characters_rejected(bad_id):
    with pytest.raises(ValidationError, match="request_id"):
        ExplanationRequest.model_validate(_request(request_id=bad_id))


def test_unknown_extra_field_rejected():
    with pytest.raises(ValidationError):
        ExplanationRequest.model_validate(_request(business_name="Sweet Bakes"))


def test_unknown_business_type_rejected():
    with pytest.raises(ValidationError):
        ExplanationRequest.model_validate(_request(business_type="casino"))


# --- Finding / ExplanationResponse ---------------------------------------------------


def test_valid_response_round_trip():
    response = _response()
    again = ExplanationResponse.model_validate_json(response.model_dump_json())
    assert again == response
    assert again.schema_version == response.schema_version


def test_finding_rejects_explanation_over_1200_chars():
    with pytest.raises(ValidationError):
        _finding(explanation="a" * 1201)
    assert len(_finding(explanation="a" * 1200).explanation) == 1200


def test_finding_rejects_empty_recommendation():
    with pytest.raises(ValidationError):
        _finding(recommendation="   ")


def test_citation_excerpt_limited_to_400_chars():
    with pytest.raises(ValidationError):
        EvidenceCitation(chunk_id="c1", policy_id="P001", page=1, excerpt="x" * 401)


def test_citation_defaults_not_flagged():
    citation = EvidenceCitation(chunk_id="c1", policy_id="P001", page=1, excerpt="text")
    assert citation.flagged is False and citation.section is None


def test_metadata_counts_non_negative():
    with pytest.raises(ValidationError):
        ExplanationMetadata(llm_used=True, llm_findings=-1, template_findings=0)
