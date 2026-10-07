"""Deterministic safety checks for Coverage & Gap Analysis Agent.

This module provides a small, conservative fallback for cases where the
LLM interpreter is unavailable. It does not attempt to understand the full
meaning of insurance policy language.

The deterministic layer is responsible for:
- handling missing evidence
- recognizing a small set of explicit coverage/exclusion signals
- providing safe defaults when wording is ambiguous
- deriving whether a potential gap exists
"""

from dataclasses import dataclass
import re
from typing import List

from shared.models.policy import EvidenceClause
from shared.models.coverage import CoverageStatus


@dataclass
class EvidenceDecision:
    """Deterministic decision based on high-confidence evidence signals."""

    status: CoverageStatus
    potential_gap: bool
    reason: str
    confidence: float
    matched_signals: List[str]


# These patterns intentionally cover only explicit phrases.
# They are not intended to be a complete insurance-language engine.

_EXCLUSION_PATTERNS = (
    r"\bnot\s+covered\b",
    r"\bnot\s+cover(?:ed|s)\b",
    r"\bexcluded\b",
    r"\bexclusion(?:s)?\b",
    r"\bdoes\s+not\s+cover\b",
)

_CONDITIONAL_PATTERNS = (
    r"\bsubject\s+to\b",
    r"\bonly\s+if\b",
    r"\bprovided\s+that\b",
    r"\bprovided\b",
    r"\bconditional(?:ly)?\b",
)

_COVERAGE_PATTERNS = (
    r"\bis\s+covered\b",
    r"\bare\s+covered\b",
    r"\bcovered\s+against\b",
    r"\bcover(?:s|ed)\b",
)


def _find_matches(
    text: str,
    patterns: tuple[str, ...],
) -> List[str]:
    """Return the explicit signal phrases found in policy text."""

    matches: List[str] = []
    lowered = text.lower()

    for pattern in patterns:
        match = re.search(pattern, lowered)

        if match:
            matches.append(match.group(0))

    return matches


def decide_from_evidence(
    evidence: List[EvidenceClause],
) -> EvidenceDecision:
    """Produce a conservative deterministic fallback decision.

    This is intentionally much smaller than a full semantic policy
    interpreter. The LLM remains the primary interpreter when available.
    """

    # -------------------------------------------------------------
    # 1. No evidence means coverage cannot be established.
    #
    # Absence of retrieved evidence is NOT proof that the policy
    # excludes the risk, so confidence is deliberately modest.
    # -------------------------------------------------------------

    if not evidence:
        return EvidenceDecision(
            status=CoverageStatus.NOT_FOUND,
            potential_gap=True,
            reason=(
                "No relevant policy evidence was retrieved for this risk. "
                "Coverage could not be established from the available evidence."
            ),
            confidence=0.55,
            matched_signals=[],
        )

    # -------------------------------------------------------------
    # 2. Inspect only the evidence supplied by Agent 2.
    #
    # This module does not retrieve additional policy text.
    # -------------------------------------------------------------

    exclusion_signals: List[str] = []
    conditional_signals: List[str] = []
    coverage_signals: List[str] = []

    for clause in evidence:
        text = clause.text or ""

        exclusion_signals.extend(
            _find_matches(
                text,
                _EXCLUSION_PATTERNS,
            )
        )

        conditional_signals.extend(
            _find_matches(
                text,
                _CONDITIONAL_PATTERNS,
            )
        )

        coverage_signals.extend(
            _find_matches(
                text,
                _COVERAGE_PATTERNS,
            )
        )

    # Remove duplicate signals while preserving order.
    exclusion_signals = list(
        dict.fromkeys(exclusion_signals)
    )

    conditional_signals = list(
        dict.fromkeys(conditional_signals)
    )

    coverage_signals = list(
        dict.fromkeys(coverage_signals)
    )

    # -------------------------------------------------------------
    # 3. Explicit exclusion.
    # -------------------------------------------------------------

    if exclusion_signals:
        return EvidenceDecision(
            status=CoverageStatus.EXCLUDED,
            potential_gap=True,
            reason=(
                "The available policy evidence contains explicit wording "
                "indicating that the risk is not covered or is excluded."
            ),
            confidence=0.85,
            matched_signals=exclusion_signals,
        )

    # -------------------------------------------------------------
    # 4. Explicit conditional wording.
    # -------------------------------------------------------------

    if conditional_signals:
        return EvidenceDecision(
            status=CoverageStatus.CONDITIONAL,
            potential_gap=False,
            reason=(
                "The available policy evidence indicates that coverage is "
                "subject to a condition or qualification."
            ),
            confidence=0.75,
            matched_signals=conditional_signals,
        )

    # -------------------------------------------------------------
    # 5. Explicit positive coverage wording.
    # -------------------------------------------------------------

    if coverage_signals:
        return EvidenceDecision(
            status=CoverageStatus.COVERED,
            potential_gap=False,
            reason=(
                "The available policy evidence contains explicit wording "
                "indicating coverage."
            ),
            confidence=0.75,
            matched_signals=coverage_signals,
        )

    # -------------------------------------------------------------
    # 6. Evidence exists, but no safe deterministic signal was found.
    # -------------------------------------------------------------

    return EvidenceDecision(
        status=CoverageStatus.UNCLEAR,
        potential_gap=True,
        reason=(
            "Policy wording related to this risk was found, but it does not "
            "contain a clear deterministic coverage or exclusion signal."
        ),
        confidence=0.40,
        matched_signals=[],
    )


def potential_gap_for_status(
    status: CoverageStatus,
) -> bool:
    """Derive potential gap deterministically from final status."""

    return status in {
        CoverageStatus.EXCLUDED,
        CoverageStatus.UNCLEAR,
        CoverageStatus.NOT_FOUND,
    }