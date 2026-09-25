"""Deterministic checks for Coverage & Gap Analysis Agent.

This module intentionally does not attempt to understand insurance language.
Semantic interpretation is delegated to the LLM interpreter.

The deterministic layer is responsible for:
- handling missing evidence
- validating that evidence exists
- providing safe defaults
- deriving whether a potential gap exists
"""

from dataclasses import dataclass
from typing import List

from shared.models.policy import EvidenceClause
from shared.models.coverage import CoverageStatus


@dataclass
class EvidenceDecision:
    """Deterministic decision based only on evidence availability."""

    status: CoverageStatus
    potential_gap: bool
    reason: str
    confidence: float
    matched_signals: List[str]


def decide_from_evidence(
    evidence: List[EvidenceClause],
) -> EvidenceDecision:
    """Handle cases that can be determined without semantic interpretation.

    Important:
    This function does NOT classify policy wording as covered/excluded.
    That task belongs to the semantic interpreter.
    """

    if not evidence:
        return EvidenceDecision(
            status=CoverageStatus.NOT_FOUND,
            potential_gap=True,
            reason=(
                "No relevant policy evidence was retrieved for this risk. "
                "Coverage could not be established from the available evidence."
            ),
            confidence=0.95,
            matched_signals=[],
        )

    return EvidenceDecision(
        status=CoverageStatus.UNCLEAR,
        potential_gap=True,
        reason=(
            "Relevant policy evidence was retrieved, but semantic "
            "interpretation is required."
        ),
        confidence=0.40,
        matched_signals=[],
    )


def potential_gap_for_status(status: CoverageStatus) -> bool:
    """Derive potential gap deterministically from final status."""

    return status in {
        CoverageStatus.EXCLUDED,
        CoverageStatus.UNCLEAR,
        CoverageStatus.NOT_FOUND,
    }