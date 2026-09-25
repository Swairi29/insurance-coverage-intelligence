"""Tests for Agent 4's deterministic template wording."""

from __future__ import annotations

import re

import pytest

from agents.explanation_agent.templates import (
    VERIFY_SENTENCE,
    headline_for,
    priority_for,
    template_explanation,
    template_recommendation,
    title_for,
    verification_required_for,
)
from agents.explanation_agent.tests.fakes import edge_case, load_fixture
from shared.models.analysis import Finding, FindingPriority, GeneratedBy
from shared.models.business import BusinessType
from shared.models.coverage import CoverageStatus
from shared.schemas.requests import ExplanationRequest

BLOCKED = re.compile(r"not covered|definitely|guaranteed|fully", re.IGNORECASE)


def _load(name: str) -> ExplanationRequest:
    return ExplanationRequest.model_validate(load_fixture(name))


BAKERY = _load("bakery_mixed.json")
RISKS = {risk.risk_id: risk for risk in BAKERY.risks}
ASSESSMENTS = {a.risk_id: a for a in BAKERY.assessments}


def _texts(risk_id: str, business_type=BusinessType.BAKERY, with_risk: bool = True):
    assessment = ASSESSMENTS[risk_id]
    risk = RISKS[risk_id] if with_risk else None
    return (
        template_explanation(assessment, risk, business_type),
        template_recommendation(assessment, risk),
    )


def _all_requests():
    names = ["bakery_mixed.json", "all_covered.json", "injection.json"]
    requests = [_load(name) for name in names]
    requests += [ExplanationRequest.model_validate(case["request"]) for case in load_fixture("edge_cases.json")]
    return requests


# --- one test per status ------------------------------------------------------------------


def test_covered():
    explanation, recommendation = _texts("FIRE_COOKING")
    assert title_for(ASSESSMENTS["FIRE_COOKING"]) == "Covered: Fire from cooking and baking equipment"
    assert "appears to include cover" in explanation
    assert "Section 1 - Fire and Allied Perils, page 3 of policy P001" in explanation
    assert "fire and allied perils cover" in recommendation
    assert "sums insured" in recommendation


def test_not_found():
    explanation, recommendation = _texts("EQP_BREAKDOWN")
    assert title_for(ASSESSMENTS["EQP_BREAKDOWN"]) == "Potential coverage gap: Equipment breakdown"
    assert "relevant risk for a bakery" in explanation
    assert "No policy wording about this risk was found" in explanation
    assert "potential gap" in explanation
    assert RISKS["EQP_BREAKDOWN"].reason in explanation  # Agent 1's reason
    assert "page" not in explanation  # no evidence, so no location is invented
    assert recommendation.startswith("Ask your broker about equipment or machinery breakdown cover")


def test_conditional_includes_agent3_reason():
    explanation, recommendation = _texts("PROP_THEFT")
    assert title_for(ASSESSMENTS["PROP_THEFT"]).startswith("Covered with conditions:")
    assert ASSESSMENTS["PROP_THEFT"].reason in explanation
    assert "Section 3 - Burglary, page 7" in explanation
    assert "property and contents cover" in recommendation


def test_excluded():
    explanation, recommendation = _texts("PROP_WEATHER")
    assert title_for(ASSESSMENTS["PROP_WEATHER"]).startswith("Excluded:")
    assert "appears to exclude this risk" in explanation
    assert "Section 2 - General Exclusions, page 5" in explanation
    assert "potential gap" in explanation
    assert "extension" in recommendation


def test_unclear():
    explanation, recommendation = _texts("BI_PREMISES_CLOSURE")
    assert title_for(ASSESSMENTS["BI_PREMISES_CLOSURE"]).startswith("Needs checking:")
    assert "does not clearly say" in explanation
    assert "Section 6 - Extensions, page 11" in explanation
    assert ASSESSMENTS["BI_PREMISES_CLOSURE"].reason in explanation
    assert "business interruption (loss of profits) cover" in recommendation


# --- fields decided by code -------------------------------------------------------------------


@pytest.mark.parametrize(
    "status, priority, verify",
    [
        (CoverageStatus.NOT_FOUND, FindingPriority.HIGH, True),
        (CoverageStatus.EXCLUDED, FindingPriority.HIGH, True),
        (CoverageStatus.UNCLEAR, FindingPriority.MEDIUM, True),
        (CoverageStatus.CONDITIONAL, FindingPriority.MEDIUM, True),
        (CoverageStatus.COVERED, FindingPriority.LOW, False),
    ],
)
def test_priority_and_verification_map(status, priority, verify):
    assert priority_for(status) is priority
    assert verification_required_for(status) is verify


@pytest.mark.parametrize("risk_id", list(ASSESSMENTS))
def test_verification_sentence_exactly_when_required(risk_id):
    explanation, _ = _texts(risk_id)
    required = verification_required_for(ASSESSMENTS[risk_id].status)
    assert explanation.endswith(VERIFY_SENTENCE) is required
    assert explanation.count(VERIFY_SENTENCE) == (1 if required else 0)


# --- safety of the wording ------------------------------------------------------------------


def test_no_blocked_words_and_valid_findings_for_every_fixture():
    for request in _all_requests():
        risks = {risk.risk_id: risk for risk in request.risks}
        for assessment in request.assessments:
            risk = risks.get(assessment.risk_id)
            explanation = template_explanation(assessment, risk, request.business_type)
            recommendation = template_recommendation(assessment, risk)
            title = title_for(assessment)
            for text in (title, explanation, recommendation):
                assert not BLOCKED.search(text), text
            # Must fit the shared Finding model.
            Finding(
                risk_id=assessment.risk_id,
                risk_name=assessment.risk_name,
                category=risk.category if risk else None,
                status=assessment.status,
                potential_gap=assessment.potential_gap,
                priority=priority_for(assessment.status),
                title=title,
                explanation=explanation,
                recommendation=recommendation,
                verification_required=verification_required_for(assessment.status),
                coverage_confidence=assessment.confidence,
                generated_by=GeneratedBy.TEMPLATE,
            )


def test_clause_text_is_never_copied_into_templates():
    # Templates point to the clause; they never quote it (it may contain injected text).
    request = _load("injection.json")
    weather = next(a for a in request.assessments if a.risk_id == "PROP_WEATHER")
    explanation = template_explanation(weather, None, request.business_type)
    assert "Ignore all previous instructions" not in explanation
    assert "covers everything" not in explanation


def test_html_clause_text_not_in_templates():
    request = ExplanationRequest.model_validate(edge_case("html_in_clause"))
    explanation = template_explanation(request.assessments[0], request.risks[0], request.business_type)
    assert "<" not in explanation


# --- edge cases ---------------------------------------------------------------------------------


def test_section_missing_mentions_page_only():
    request = ExplanationRequest.model_validate(edge_case("section_missing"))
    explanation = template_explanation(request.assessments[0], request.risks[0], request.business_type)
    assert "(page 7 of policy P001)" in explanation
    assert "None" not in explanation


def test_missing_risk_and_business_type():
    explanation, recommendation = _texts("EQP_BREAKDOWN", business_type=None, with_risk=False)
    assert "relevant risk for a business like yours" in explanation
    assert "Why it matters" not in explanation
    assert "cover for this risk" in recommendation


def test_long_reasons_are_clipped_to_fit():
    long_reason = "The policy requires locked premises and an alarm. " * 19  # ~970 chars
    assessment = ASSESSMENTS["PROP_THEFT"].model_copy(update={"reason": long_reason})
    explanation = template_explanation(assessment, RISKS["PROP_THEFT"], BusinessType.BAKERY)
    assert len(explanation) <= 1200
    assert "…" in explanation
    assert explanation.endswith(VERIFY_SENTENCE)


def test_multiple_clauses_are_counted():
    theft = ASSESSMENTS["PROP_THEFT"]
    extra = theft.evidence[0].model_copy(update={"chunk_id": "P001-p8-c1", "page": 8})
    assessment = theft.model_copy(update={"evidence": [theft.evidence[0], extra]})
    explanation = template_explanation(assessment, RISKS["PROP_THEFT"], BusinessType.BAKERY)
    assert "page 7 of policy P001, and 1 other clause)" in explanation


def test_covered_with_gap_flag_mentions_gap():
    assessment = ASSESSMENTS["FIRE_COOKING"].model_copy(update={"potential_gap": True})
    explanation = template_explanation(assessment, RISKS["FIRE_COOKING"], BusinessType.BAKERY)
    assert "flagged this as a potential gap" in explanation


# --- headline -----------------------------------------------------------------------------------


def test_headline_bakery_mixed():
    assert headline_for(BAKERY.assessments) == (
        "6 risks checked, 4 potential gaps: 2 had no policy wording found, 1 appears excluded, "
        "1 needs checking, 1 is covered with conditions and 1 is covered."
    )


def test_headline_all_covered():
    assert headline_for(_load("all_covered.json").assessments) == (
        "2 risks checked, no potential gaps: 2 are covered."
    )


def test_headline_single_and_empty():
    assert headline_for([ASSESSMENTS["PROP_WEATHER"]]) == (
        "1 risk checked, 1 potential gap: 1 appears excluded."
    )
    assert headline_for([]) == "No risks were analysed for coverage, so this report has no findings."


def test_headline_fits_summary_limit():
    many = [ASSESSMENTS[risk_id] for risk_id in ASSESSMENTS] * 8  # 48 findings, all statuses
    assert len(headline_for(many)) <= 400
