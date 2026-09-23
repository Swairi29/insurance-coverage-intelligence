"""Unit tests for the Policy Intelligence Agent's shared data models."""

import pytest
from pydantic import ValidationError

from shared.models.policy import (
    EvidenceClause,
    PolicyChunk,
    PolicyDocument,
    PolicyStatus,
    RiskEvidenceResult,
)

pytestmark = pytest.mark.unit


def policy_document(**overrides):
    data = {
        "policy_id": "POL001",
        "business_id": "B001",
        "filename": "fire_policy.pdf",
        "status": "ready",
        "page_count": 5,
    }
    data.update(overrides)
    return PolicyDocument(**data)


def policy_chunk(**overrides):
    data = {
        "chunk_id": "POL001-p2-0",
        "policy_id": "POL001",
        "business_id": "B001",
        "section": "Section 4 - Exclusions",
        "page": 2,
        "text": "This policy does not cover damage caused by flooding.",
    }
    data.update(overrides)
    return PolicyChunk(**data)


def evidence_clause(**overrides):
    data = {
        "chunk_id": "POL001-p2-0",
        "policy_id": "POL001",
        "section": "Section 4 - Exclusions",
        "page": 2,
        "text": "This policy does not cover damage caused by flooding.",
        "score": 0.82,
    }
    data.update(overrides)
    return EvidenceClause(**data)


# --- PolicyDocument -------------------------------------------------------------------

def test_valid_policy_document_has_the_required_fields():
    doc = policy_document()
    assert doc.status is PolicyStatus.READY
    assert doc.chunk_count == 0  # defaults to 0 until chunking finishes
    assert doc.uploaded_at is not None


@pytest.mark.parametrize("status", ["processing", "ready", "failed"])
def test_all_statuses_are_accepted(status):
    assert policy_document(status=status).status.value == status


def test_policy_document_rejects_unknown_status():
    with pytest.raises(ValidationError):
        policy_document(status="uploaded")


def test_policy_document_rejects_negative_counts():
    with pytest.raises(ValidationError):
        policy_document(page_count=-1)
    with pytest.raises(ValidationError):
        policy_document(chunk_count=-1)


def test_policy_document_requires_ids_and_filename():
    with pytest.raises(ValidationError) as excinfo:
        PolicyDocument(status="ready", page_count=1)
    missing = {e["loc"][0] for e in excinfo.value.errors()}
    assert {"policy_id", "business_id", "filename"} <= missing


# --- PolicyChunk -----------------------------------------------------------------------

def test_valid_chunk_defaults_to_not_flagged():
    chunk = policy_chunk()
    assert chunk.flagged is False
    assert chunk.flag_reason is None


def test_chunk_can_be_flagged_with_a_reason():
    chunk = policy_chunk(flagged=True, flag_reason="Looks like an instruction override attempt.")
    assert chunk.flagged is True
    assert "instruction" in chunk.flag_reason


def test_chunk_section_is_optional():
    chunk = policy_chunk(section=None)
    assert chunk.section is None


@pytest.mark.parametrize(
    "field, value",
    [
        ("page", 0),          # pages are 1-indexed
        ("page", -1),
        ("text", ""),
        ("chunk_id", ""),
        ("policy_id", ""),
        ("business_id", ""),
    ],
)
def test_invalid_chunk_values_are_rejected(field, value):
    with pytest.raises(ValidationError):
        policy_chunk(**{field: value})


# --- EvidenceClause ----------------------------------------------------------------------

def test_valid_evidence_clause():
    ev = evidence_clause()
    assert 0.0 <= ev.score <= 1.0


@pytest.mark.parametrize("score", [-0.1, 1.1])
def test_evidence_score_must_be_between_zero_and_one(score):
    with pytest.raises(ValidationError):
        evidence_clause(score=score)


def test_evidence_clause_has_no_confidence_or_status_fields():
    # Agent 2 only reports *where* text came from, never a coverage decision.
    ev = evidence_clause()
    assert not hasattr(ev, "coverage_status")
    assert not hasattr(ev, "confidence")


# --- RiskEvidenceResult ------------------------------------------------------------------

def test_risk_evidence_result_defaults_to_no_evidence():
    result = RiskEvidenceResult(risk_id="PROP_WEATHER")
    assert result.evidence == []


def test_risk_evidence_result_holds_multiple_clauses():
    result = RiskEvidenceResult(
        risk_id="PROP_WEATHER",
        evidence=[evidence_clause(), evidence_clause(chunk_id="POL001-p3-1", page=3, score=0.4)],
    )
    assert len(result.evidence) == 2
    assert {e.page for e in result.evidence} == {2, 3}


def test_risk_evidence_result_requires_risk_id():
    with pytest.raises(ValidationError):
        RiskEvidenceResult()
