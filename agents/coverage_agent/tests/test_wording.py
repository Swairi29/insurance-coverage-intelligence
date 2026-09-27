"""Rule-based reading of policy wording (agents/coverage_agent/wording.py)."""

from __future__ import annotations

import pytest

from agents.coverage_agent.service import CoverageAnalysisService
from agents.coverage_agent.wording import read_wording, risk_keywords
from shared.models.coverage import AnalysisMethod, CoverageStatus
from shared.models.policy import EvidenceClause, RiskEvidenceResult
from shared.models.risk import IdentifiedRisk


def clause(text: str, section: str = "Section 1 - Cover", chunk: str = "c1") -> EvidenceClause:
    return EvidenceClause(chunk_id=chunk, policy_id="POL-1", section=section, page=1, text=text,
                          score=0.5)


FIRE = clause(
    "We will pay for loss or damage caused by fire, lightning or explosion. This includes fires "
    "that start in cooking equipment such as deep fryers. Cover for fires that start in deep "
    "fryers applies only if an automatic fire suppression system is fitted.",
    "Section 1 - Fire and Explosion",
)
EXCLUSIONS = clause(
    "This policy does not cover loss caused by flood, storm surge or rising sea water. It does not\n"
    "cover losses from cyber attacks, hacking or data breaches. Card payment fraud and chargebacks "
    "are not covered. Injury to employees must be insured under a separate workmen's compensation "
    "policy.",
    "Section 6 - General Exclusions",
    "c6",
)
LIABILITY = clause(
    "We will cover your legal liability for accidental bodily injury to visitors at the premises.",
    "Section 4 - Public Liability",
    "c4",
)


def test_keywords_skip_generic_words():
    assert risk_keywords("Customer data breach") == ["data", "breach"]
    assert risk_keywords("Loss or damage of goods in delivery") == ["delivery"]
    assert "supply" not in risk_keywords("Supplier or supply-chain disruption")


@pytest.mark.parametrize(
    ("risk", "evidence", "status"),
    [
        ("Flood, storm and water damage", [EXCLUSIONS], CoverageStatus.EXCLUDED),
        ("Customer data breach", [EXCLUSIONS], CoverageStatus.EXCLUDED),  # "does not\ncover"
        ("Payment fraud and chargebacks", [EXCLUSIONS], CoverageStatus.EXCLUDED),
        ("Employee injury at work", [LIABILITY, EXCLUSIONS], CoverageStatus.EXCLUDED),
        ("Customer or visitor injury on premises", [LIABILITY], CoverageStatus.COVERED),
        # Covered wording plus a condition in the same clause is never plain COVERED.
        ("Fire from cooking and baking equipment", [FIRE], CoverageStatus.CONDITIONAL),
    ],
)
def test_reads_the_status_from_the_wording(risk, evidence, status):
    assert read_wording(risk, evidence).status == status


def test_mixed_covering_and_excluding_wording_is_conditional():
    theft = clause(
        "Theft of stock is covered only after forcible entry. Cash is kept in a safe. "
        "Theft without forced entry is not covered."
    )
    assert read_wording("Theft, burglary and vandalism", [theft]).status == CoverageStatus.CONDITIONAL


def test_the_most_specific_sentence_decides():
    theft = clause(
        "Theft of stock is covered only after forcible entry. Theft by employees is not covered."
    )
    # "employee" + "theft" in one sentence outweighs the general theft condition.
    assert read_wording("Employee theft or fraud", [theft]).status == CoverageStatus.EXCLUDED


def test_unrelated_or_unreadable_wording_stays_unclear():
    utilities = clause("Loss of income caused by a failure of the public water supply is excluded.")
    assert read_wording("Supplier or supply-chain disruption", [utilities]).status == CoverageStatus.UNCLEAR
    neutral = clause("The flood map for the district was updated in 2024.")
    assert read_wording("Flood, storm and water damage", [neutral]).status == CoverageStatus.UNCLEAR
    assert read_wording("Flood, storm and water damage", []).status == CoverageStatus.UNCLEAR


def test_reason_quotes_the_sentence_and_lists_the_phrases():
    decision = read_wording("Payment fraud and chargebacks", [EXCLUSIONS])

    assert "Section 6 - General Exclusions, page 1" in decision.reason
    assert '"Card payment fraud and chargebacks are not covered."' in decision.reason
    assert "rule-based" in decision.reason
    assert "excluded: are not covered" in decision.matched_signals
    assert decision.clause is EXCLUSIONS


def risk(risk_id: str, name: str) -> IdentifiedRisk:
    return IdentifiedRisk(risk_id=risk_id, name=name, category="property", reason="test",
                          source="rule", confidence=0.8, evidence=[])


def test_service_uses_the_wording_rules_without_an_llm():
    risks = [risk("PROP_FLOOD", "Flood, storm and water damage"),
             risk("LIA_PUBLIC", "Customer or visitor injury on premises"),
             risk("PROP_THEFT", "Theft, burglary and vandalism")]
    evidence = [RiskEvidenceResult(risk_id="PROP_FLOOD", evidence=[EXCLUSIONS]),
                RiskEvidenceResult(risk_id="LIA_PUBLIC", evidence=[LIABILITY])]

    result = CoverageAnalysisService(use_llm=False).analyse(risks=risks, evidence_results=evidence)
    by_id = {a.risk_id: a for a in result.assessments}

    assert by_id["PROP_FLOOD"].status == CoverageStatus.EXCLUDED
    assert by_id["PROP_FLOOD"].potential_gap is True
    assert by_id["LIA_PUBLIC"].status == CoverageStatus.COVERED
    assert by_id["LIA_PUBLIC"].potential_gap is False
    assert by_id["PROP_THEFT"].status == CoverageStatus.NOT_FOUND
    assert all(a.method == AnalysisMethod.RULES for a in result.assessments)
    assert result.llm_used is False
    assert result.warnings == []  # no more "LLM interpretation was unavailable" per risk
