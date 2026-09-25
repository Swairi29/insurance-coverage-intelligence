"""Deterministic wording for the Explanation & Recommendation Agent.

Templates are the safety net: every finding can be explained without an LLM.
They also produce the text the LLM is never allowed to write (titles, priority,
verification flag and the report headline).

Wording rules: never say "not covered", "definitely", "guaranteed" or "fully";
describe missing cover as a "potential gap"; recommendations say "ask your
broker about ..." and never recommend a specific product.
"""

from __future__ import annotations

import re
from typing import Iterable, Optional, Protocol

from shared.models.analysis import FindingPriority
from shared.models.business import BusinessType
from shared.models.coverage import CoverageAssessment, CoverageStatus
from shared.models.policy import EvidenceClause
from shared.models.risk import IdentifiedRisk, RiskCategory

VERIFY_SENTENCE = "Check this with your insurer or broker before making decisions."

# Keeps Agent 1 / Agent 3 reasons short enough that every explanation fits
# `Finding.explanation` (1200 characters).
_MAX_REASON_CHARS = 300
_MAX_EXPLANATION_CHARS = 1200
_MAX_RECOMMENDATION_CHARS = 600

_TITLE_PREFIX = {
    CoverageStatus.NOT_FOUND: "Potential coverage gap:",
    CoverageStatus.EXCLUDED: "Excluded:",
    CoverageStatus.UNCLEAR: "Needs checking:",
    CoverageStatus.CONDITIONAL: "Covered with conditions:",
    CoverageStatus.COVERED: "Covered:",
}

_PRIORITY = {
    CoverageStatus.NOT_FOUND: FindingPriority.HIGH,
    CoverageStatus.EXCLUDED: FindingPriority.HIGH,
    CoverageStatus.UNCLEAR: FindingPriority.MEDIUM,
    CoverageStatus.CONDITIONAL: FindingPriority.MEDIUM,
    CoverageStatus.COVERED: FindingPriority.LOW,
}

# One plain-English sentence per status; also used in the LLM prompt (Step 7).
PLAIN_MEANING = {
    CoverageStatus.NOT_FOUND: "No policy wording about this risk was found.",
    CoverageStatus.EXCLUDED: "The policy appears to exclude this risk.",
    CoverageStatus.UNCLEAR: "Wording was found but it does not clearly answer whether this risk is included.",
    CoverageStatus.CONDITIONAL: "The risk is covered only if certain conditions are met.",
    CoverageStatus.COVERED: "Relevant cover for this risk was found.",
}

_CATEGORY_COVER = {
    # Limits are covered by the status wording (e.g. the "covered" recommendation).
    RiskCategory.PROPERTY: "property and contents cover",
    RiskCategory.FIRE: "fire and allied perils cover",
    RiskCategory.EQUIPMENT: "equipment or machinery breakdown cover",
    RiskCategory.EMPLOYEE: "employer's liability or workmen's compensation cover",
    RiskCategory.BUSINESS_INTERRUPTION: "business interruption (loss of profits) cover",
    RiskCategory.LIABILITY: "public and product liability cover",
    RiskCategory.CYBER: "cyber and payment fraud cover",
}

_BUSINESS_LABEL = {
    BusinessType.BAKERY: "a bakery",
    BusinessType.RESTAURANT: "a restaurant",
    BusinessType.RETAIL_SHOP: "a retail shop",
}

# Headline labels in priority order: (status, singular, plural).
_HEADLINE_LABELS = (
    (CoverageStatus.NOT_FOUND, "had no policy wording found", "had no policy wording found"),
    (CoverageStatus.EXCLUDED, "appears excluded", "appear excluded"),
    (CoverageStatus.UNCLEAR, "needs checking", "need checking"),
    (CoverageStatus.CONDITIONAL, "is covered with conditions", "are covered with conditions"),
    (CoverageStatus.COVERED, "is covered", "are covered"),
)


class _HasStatus(Protocol):
    status: CoverageStatus
    potential_gap: bool


# --- fields decided by code, never by the LLM ---------------------------------------------


def title_for(assessment: CoverageAssessment) -> str:
    return f"{_TITLE_PREFIX[assessment.status]} {assessment.risk_name}"


def priority_for(status: CoverageStatus) -> FindingPriority:
    return _PRIORITY[status]


def verification_required_for(status: CoverageStatus) -> bool:
    return status is not CoverageStatus.COVERED


def business_label(business_type: Optional[BusinessType]) -> str:
    """E.g. "a bakery"; used in template wording and the LLM prompt."""
    return _BUSINESS_LABEL.get(business_type, "a business like yours")


# --- explanation ---------------------------------------------------------------------------


def template_explanation(
    assessment: CoverageAssessment,
    risk: Optional[IdentifiedRisk],
    business_type: Optional[BusinessType],
) -> str:
    status = assessment.status
    where = _where(assessment.evidence)
    sentences = []

    if status is CoverageStatus.NOT_FOUND:
        sentences.append(f"This is a relevant risk for {business_label(business_type)}.")
        if risk is not None:
            sentences.append(f"Why it matters: {_clip(risk.reason)}")
        sentences.append(
            "No policy wording about this risk was found in the documents analysed, so this is a potential gap."
        )
    elif status is CoverageStatus.EXCLUDED:
        sentences.append(f"The policy appears to exclude this risk ({where}).")
        sentences.append("A claim for this kind of loss may be refused, so this is a potential gap.")
    elif status is CoverageStatus.UNCLEAR:
        sentences.append(
            f"Policy wording related to this risk was found ({where}), "
            "but it does not clearly say whether this risk is included."
        )
        sentences.append(f"What the analysis found: {_clip(assessment.reason)}")
    elif status is CoverageStatus.CONDITIONAL:
        sentences.append(f"The policy appears to cover this risk only if certain conditions are met ({where}).")
        sentences.append(f"Condition noted: {_clip(assessment.reason)}")
    else:  # COVERED
        sentences.append(f"The analysed policy wording appears to include cover for this risk ({where}).")
        sentences.append("How much is paid still depends on the limits, sums insured and excess in your schedule.")

    # Agent 3 may flag a gap even for covered/conditional risks (e.g. low limits).
    if assessment.potential_gap and status in (CoverageStatus.COVERED, CoverageStatus.CONDITIONAL):
        sentences.append("The coverage analysis still flagged this as a potential gap.")

    if verification_required_for(status):
        sentences.append(VERIFY_SENTENCE)

    return _fit(" ".join(sentences), _MAX_EXPLANATION_CHARS, keep_suffix=VERIFY_SENTENCE)


# --- recommendation ------------------------------------------------------------------------


def template_recommendation(assessment: CoverageAssessment, risk: Optional[IdentifiedRisk]) -> str:
    cover = _CATEGORY_COVER.get(risk.category, "cover for this risk") if risk else "cover for this risk"
    status = assessment.status

    if status is CoverageStatus.NOT_FOUND:
        text = f"Ask your broker about {cover}, because no policy wording for this risk was found."
    elif status is CoverageStatus.EXCLUDED:
        text = f"Ask your broker whether {cover} can be added as an extension or a separate policy."
    elif status is CoverageStatus.UNCLEAR:
        text = f"Ask your insurer or broker to confirm in writing whether this risk is included, and ask about {cover}."
    elif status is CoverageStatus.CONDITIONAL:
        text = f"Check that you can meet the policy conditions for this risk, and ask your broker about {cover} if you cannot."
    else:  # COVERED
        text = f"Ask your broker to confirm that the sums insured, limits and excess for {cover} are adequate for your business."

    return _fit(text, _MAX_RECOMMENDATION_CHARS)


# --- headline ------------------------------------------------------------------------------


def headline_for(findings: Iterable[_HasStatus]) -> str:
    """One-sentence report summary, e.g.
    "6 risks checked, 4 potential gaps: 2 had no policy wording found, 1 appears excluded, ..."
    """
    findings = list(findings)
    total = len(findings)
    if total == 0:
        return "No risks were analysed for coverage, so this report has no findings."

    gaps = sum(1 for f in findings if f.potential_gap)
    counts = {status: sum(1 for f in findings if f.status is status) for status in CoverageStatus}

    parts = [
        f"{counts[status]} {singular if counts[status] == 1 else plural}"
        for status, singular, plural in _HEADLINE_LABELS
        if counts[status]
    ]
    checked = f"{total} risk{'s' if total != 1 else ''} checked"
    gap_text = "no potential gaps" if gaps == 0 else f"{gaps} potential gap{'s' if gaps != 1 else ''}"
    return f"{checked}, {gap_text}: {_join(parts)}."


# --- helpers -------------------------------------------------------------------------------


def _where(evidence: list[EvidenceClause]) -> str:
    """Location of the first evidence clause, e.g. "Section 3 - Burglary, page 7 of policy P001"."""
    if not evidence:
        return "no specific clause was identified"
    first = evidence[0]
    section = _one_line(first.section) if first.section else ""
    location = f"{section}, page {first.page}" if section else f"page {first.page}"
    text = f"{location} of policy {first.policy_id}"
    others = len(evidence) - 1
    if others:
        text += f", and {others} other clause{'s' if others != 1 else ''}"
    return text


def _one_line(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _clip(text: str, max_chars: int = _MAX_REASON_CHARS) -> str:
    """Shorten to `max_chars` on a word boundary, and end with punctuation."""
    text = _one_line(text)
    if len(text) > max_chars:
        cut = text[: max_chars - 1]
        text = (cut.rsplit(" ", 1)[0] if " " in cut else cut).rstrip(",;:") + "…"
    elif text and text[-1] not in ".!?…":
        text += "."
    return text


def _fit(text: str, max_chars: int, keep_suffix: str = "") -> str:
    """Last-resort guard so the text always fits its `Finding` field."""
    if len(text) <= max_chars:
        return text
    if keep_suffix and text.endswith(keep_suffix):
        body = text[: -len(keep_suffix)].rstrip()
        return f"{_clip(body, max_chars - len(keep_suffix) - 1)} {keep_suffix}"
    return _clip(text, max_chars)


def _join(parts: list[str]) -> str:
    if len(parts) <= 1:
        return "".join(parts)
    return ", ".join(parts[:-1]) + " and " + parts[-1]
