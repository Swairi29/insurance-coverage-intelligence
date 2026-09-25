# Agent 3 deterministic coverage decision rules (Member 3)

"""Deterministic coverage decision rules for Agent 3."""

import re
from dataclasses import dataclass
from typing import List

from shared.models.coverage import CoverageStatus
from shared.models.policy import EvidenceClause


# Explicit exclusion language.
EXCLUSION_PATTERNS = (
    r"\bexcluded\b",
    r"\bexclusion\b",
    r"\bnot covered\b",
    r"\bnot insured\b",
    r"\bdoes not cover\b",
    r"\bwill not cover\b",
    r"\bno cover\b",
)

# Explicit coverage language.
COVERAGE_PATTERNS = (
    r"\bcovered\b",
    r"\bcoverage\b",
    r"\binsured\b",
    r"\bwe will cover\b",
    r"\bwe cover\b",
    r"\bindemnif",
    r"\bpay for\b",
)

# Language indicating that coverage depends on a condition.
CONDITION_PATTERNS = (
    r"\bprovided that\b",
    r"\bsubject to\b",
    r"\bon condition that\b",
    r"\bonly if\b",
    r"\bprovided\b",
    r"\bunless\b",
    r"\bwithin \d+ days\b",
)


@dataclass(frozen=True)
class RuleDecision:
    """Internal result produced by the deterministic rule engine."""

    status: CoverageStatus
    reason: str
    confidence: float
    matched_signals: List[str]
    potential_gap: bool


def _matches(text: str, patterns: tuple[str, ...]) -> List[str]:
    """Return the patterns that matched the supplied text."""

    text = text.lower()

    return [
        pattern
        for pattern in patterns
        if re.search(pattern, text)
    ]


def _analyse_clause(clause: EvidenceClause) -> dict:
    """Identify coverage/exclusion/condition signals in one clause."""

    text = clause.text

    return {
        "exclusions": _matches(text, EXCLUSION_PATTERNS),
        "coverage": _matches(text, COVERAGE_PATTERNS),
        "conditions": _matches(text, CONDITION_PATTERNS),
    }


def decide_coverage(
    evidence: List[EvidenceClause],
) -> RuleDecision:
    """
    Determine coverage status from retrieved policy evidence.

    Rules:
    1. No evidence -> NOT_FOUND.
    2. Coverage + exclusion conflict -> UNCLEAR.
    3. Explicit exclusion -> EXCLUDED.
    4. Coverage + condition -> CONDITIONAL.
    5. Explicit coverage -> COVERED.
    6. Condition only -> CONDITIONAL.
    7. Otherwise -> UNCLEAR.
    """

    if not evidence:
        return RuleDecision(
            status=CoverageStatus.NOT_FOUND,
            reason=(
                "No relevant policy evidence was retrieved for this risk."
            ),
            confidence=0.95,
            matched_signals=[],
            potential_gap=True,
        )

    all_exclusions: List[str] = []
    all_coverage: List[str] = []
    all_conditions: List[str] = []

    for clause in evidence:
        signals = _analyse_clause(clause)

        all_exclusions.extend(signals["exclusions"])
        all_coverage.extend(signals["coverage"])
        all_conditions.extend(signals["conditions"])

    # Remove duplicates while preserving order.
    all_exclusions = list(dict.fromkeys(all_exclusions))
    all_coverage = list(dict.fromkeys(all_coverage))
    all_conditions = list(dict.fromkeys(all_conditions))

    # Conflicting evidence must not be silently resolved.
    if all_exclusions and all_coverage:
        return RuleDecision(
            status=CoverageStatus.UNCLEAR,
            reason=(
                "The retrieved policy evidence contains both coverage "
                "and exclusion language. The policy wording requires "
                "further review."
            ),
            confidence=0.55,
            matched_signals=(
                all_exclusions
                + all_coverage
                + all_conditions
            ),
            potential_gap=True,
        )

    if all_exclusions:
        return RuleDecision(
            status=CoverageStatus.EXCLUDED,
            reason=(
                "The retrieved policy evidence contains explicit "
                "exclusion language for this risk."
            ),
            confidence=0.90,
            matched_signals=(
                all_exclusions + all_conditions
            ),
            potential_gap=True,
        )

    if all_coverage and all_conditions:
        return RuleDecision(
            status=CoverageStatus.CONDITIONAL,
            reason=(
                "The policy contains coverage language, but the "
                "coverage is subject to one or more conditions."
            ),
            confidence=0.85,
            matched_signals=(
                all_coverage + all_conditions
            ),
            potential_gap=False,
        )

    if all_coverage:
        return RuleDecision(
            status=CoverageStatus.COVERED,
            reason=(
                "The retrieved policy evidence contains explicit "
                "coverage language for this risk."
            ),
            confidence=0.90,
            matched_signals=all_coverage,
            potential_gap=False,
        )

    if all_conditions:
        return RuleDecision(
            status=CoverageStatus.CONDITIONAL,
            reason=(
                "The policy contains conditional language, but "
                "explicit coverage wording could not be established."
            ),
            confidence=0.65,
            matched_signals=all_conditions,
            potential_gap=False,
        )

    return RuleDecision(
        status=CoverageStatus.UNCLEAR,
        reason=(
            "Relevant policy evidence was retrieved, but the wording "
            "does not clearly establish coverage or exclusion."
        ),
        confidence=0.40,
        matched_signals=[],
        potential_gap=True,
    )