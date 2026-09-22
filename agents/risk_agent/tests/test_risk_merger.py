"""Unit tests for combining rule-based risks with LLM suggestions."""

import pytest

from agents.risk_agent.llm_models import MIN_LLM_CONFIDENCE, LLMRiskSuggestion
from agents.risk_agent.risk_merger import (
    AGREEMENT_BONUS,
    LLM_ONLY_MAX_CONFIDENCE,
    MAX_AGREED_CONFIDENCE,
    merge_risks,
)
from agents.risk_agent.rule_engine import candidate_risks, identify_risks
from agents.risk_agent.taxonomy import RISK_TAXONOMY
from shared.models.business import BusinessProfile, BusinessType
from shared.models.risk import RiskCategory, RiskSource
from shared.schemas.responses import RiskProfileResponse

pytestmark = pytest.mark.unit

DEFINITIONS = candidate_risks(BusinessType.BAKERY)


def suggestion(risk_id, reason="A business-specific reason for this risk.", confidence=0.8):
    return LLMRiskSuggestion(risk_id=risk_id, reason=reason, confidence=confidence)


def rule_risks(**profile_fields):
    profile = BusinessProfile(business_name="B", business_type="bakery", **profile_fields)
    return identify_risks(profile).risks


def by_id(risks):
    return {r.risk_id: r for r in risks}


def test_llm_only_risk_is_added_with_taxonomy_name_and_category():
    base = rule_risks()  # bare bakery: PROP_TRANSIT is not identified by rules
    assert "PROP_TRANSIT" not in by_id(base)

    merged = by_id(merge_risks(base, [suggestion("PROP_TRANSIT", confidence=0.95)], DEFINITIONS))
    risk = merged["PROP_TRANSIT"]
    definition = next(d for d in RISK_TAXONOMY if d.risk_id == "PROP_TRANSIT")

    assert risk.source is RiskSource.LLM
    assert risk.name == definition.name and risk.category is RiskCategory.PROPERTY
    assert risk.confidence == LLM_ONLY_MAX_CONFIDENCE  # capped: 0.95 -> 0.6
    assert risk.evidence == []
    assert risk.reason == "A business-specific reason for this risk."


def test_low_llm_confidence_is_kept_below_the_cap():
    merged = by_id(merge_risks([], [suggestion("PROP_TRANSIT", confidence=0.45)], DEFINITIONS))
    assert merged["PROP_TRANSIT"].confidence == 0.45


def test_agreement_marks_rule_and_llm_and_keeps_rule_evidence():
    base = rule_risks(equipment=["deck oven"])
    rule = by_id(base)["FIRE_COOKING"]
    assert rule.source is RiskSource.RULE and rule.confidence == 0.7

    llm_reason = "The deck oven runs for hours every morning, which raises the fire risk."
    merged = by_id(merge_risks(base, [suggestion("FIRE_COOKING", llm_reason)], DEFINITIONS))
    risk = merged["FIRE_COOKING"]

    assert risk.source is RiskSource.RULE_AND_LLM
    assert risk.reason == llm_reason
    assert risk.confidence == round(0.7 + AGREEMENT_BONUS, 2)
    assert [e.value for e in risk.evidence] == ["deck oven"]  # evidence from the rules survives
    assert risk.name == rule.name and risk.category == rule.category


def test_agreement_bonus_is_capped():
    base = rule_risks(equipment=["oven", "fridge", "POS"], employee_count=3)
    top = max(base, key=lambda r: r.confidence)
    assert top.confidence >= 0.9
    merged = by_id(merge_risks(base, [suggestion(top.risk_id)], DEFINITIONS))
    assert merged[top.risk_id].confidence == MAX_AGREED_CONFIDENCE


def test_assumed_risk_confirmed_by_the_llm_gets_a_small_boost():
    base = rule_risks()  # baseline risks have confidence 0.3
    merged = by_id(merge_risks(base, [suggestion("FIRE_COOKING")], DEFINITIONS))
    assert merged["FIRE_COOKING"].confidence == 0.4
    assert merged["FIRE_COOKING"].source is RiskSource.RULE_AND_LLM


def test_rule_risks_the_llm_did_not_mention_are_unchanged():
    base = rule_risks(equipment=["oven"])
    merged = by_id(merge_risks(base, [suggestion("PROP_TRANSIT")], DEFINITIONS))
    for risk in base:
        assert merged[risk.risk_id] == risk


def test_no_suggestions_returns_the_rule_results():
    base = rule_risks(equipment=["oven"])
    assert merge_risks(base, [], DEFINITIONS) == base


def test_unknown_and_not_applicable_risks_are_ignored():
    base = rule_risks()
    llm = [suggestion("COV_POLICY_GAP"), suggestion("LIA_PRODUCT")]  # invented / retail-only
    merged = merge_risks(base, llm, DEFINITIONS)
    assert {r.risk_id for r in merged} == {r.risk_id for r in base}


def test_suggestions_below_the_minimum_confidence_are_ignored():
    base = rule_risks()
    weak = suggestion("PROP_TRANSIT", confidence=round(MIN_LLM_CONFIDENCE - 0.01, 2))
    ok = suggestion("EMP_INJURY", confidence=MIN_LLM_CONFIDENCE)
    merged = by_id(merge_risks(base, [weak, ok], DEFINITIONS))
    assert "PROP_TRANSIT" not in merged and "EMP_INJURY" in merged


def test_duplicate_suggestions_are_used_once_and_the_first_wins():
    first = suggestion("PROP_TRANSIT", "First explanation about courier deliveries.")
    second = suggestion("PROP_TRANSIT", "Second explanation which must be ignored.")
    merged = merge_risks([], [first, second], DEFINITIONS)
    assert [r.risk_id for r in merged] == ["PROP_TRANSIT"]
    assert merged[0].reason.startswith("First")


def test_duplicate_rule_risks_are_reported_once():
    base = rule_risks(equipment=["oven"])
    fire = by_id(base)["FIRE_COOKING"]
    merged = merge_risks(base + [fire], [], DEFINITIONS)
    assert [r.risk_id for r in merged].count("FIRE_COOKING") == 1


def test_result_is_sorted_by_confidence_then_taxonomy_order():
    base = rule_risks(equipment=["oven", "fridge"], employee_count=2)
    llm = [suggestion("PROP_TRANSIT", confidence=0.9), suggestion("BI_SUPPLIER", confidence=0.5)]
    merged = merge_risks(base, llm, DEFINITIONS)

    assert [r.confidence for r in merged] == sorted((r.confidence for r in merged), reverse=True)
    order = {d.risk_id: i for i, d in enumerate(DEFINITIONS)}
    for first, second in zip(merged, merged[1:]):
        if first.confidence == second.confidence:
            assert order[first.risk_id] < order[second.risk_id]


def test_merging_is_deterministic():
    base = rule_risks(equipment=["oven"])
    llm = [suggestion("PROP_TRANSIT"), suggestion("FIRE_COOKING")]
    assert merge_risks(base, llm, DEFINITIONS) == merge_risks(base, llm, DEFINITIONS)


@pytest.mark.contract
def test_merged_risks_fit_the_response_schema():
    base = rule_risks(equipment=["oven"])
    merged = merge_risks(base, [suggestion("PROP_TRANSIT"), suggestion("FIRE_COOKING")], DEFINITIONS)
    response = RiskProfileResponse(
        request_id="r1", status="complete", business_name="B", business_type="bakery", risks=merged,
        metadata={"taxonomy_version": "1.0", "llm_used": True, "llm_model": "test-model"},
    )
    assert RiskProfileResponse.model_validate_json(response.model_dump_json()) == response
    assert {r.source for r in merged} >= {RiskSource.RULE, RiskSource.LLM, RiskSource.RULE_AND_LLM}
