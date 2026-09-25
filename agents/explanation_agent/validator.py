"""Checks on LLM output before it may replace template wording.

Pure Python, no LLM. An item that fails any check is dropped and the finding
keeps its template text. Problems are short codes ("V3", "EQP_BREAKDOWN: V4"),
never LLM text, so they are safe to log.

| Code | Check                                                                     |
|------|---------------------------------------------------------------------------|
| V1   | Shape: explanation / recommendation strings, cited_chunk_ids list of str   |
| V2   | Known, unique risk_id                                                     |
| V3   | Every cited chunk belongs to that finding's (non-withheld) evidence       |
| V4   | Nothing cited when the finding has no evidence                            |
| V5   | Blocked phrases ("definitely", "fully covered", "not covered", ...)       |
| V6   | Wording consistent with the status decided by Agent 3                     |
| V7   | No echo of injected instructions                                          |
| V8   | No markup or links                                                        |
| V9   | Length limits, not empty                                                  |
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Set, Tuple

from shared.models.coverage import CoverageAssessment, CoverageStatus

MAX_EXPLANATION_WORDS = 120
MAX_EXPLANATION_CHARS = 1200
MAX_RECOMMENDATION_WORDS = 60
MAX_RECOMMENDATION_CHARS = 600

MISSING = "missing"

_BLOCKED = re.compile(
    r"\bdefinitely\b|\bguaranteed?\b|\bfully (covered|insured)\b|100\s?%|\bnot covered\b"
    r"|\byou are covered for everything\b",
)
# Claims of cover, not allowed when the status is not_found / excluded / unclear.
_CLAIMS_COVER = re.compile(r"\b(is|are) covered\b|\byou'?re covered\b|\byou are covered\b")
# Gap wording, not allowed when the status is covered.
_CLAIMS_GAP = re.compile(r"\bexcluded\b|\bgaps?\b|\bnot found\b")
_INJECTION_ECHO = re.compile(
    r"ignore (all )?previous|system note|system prompt|\bas an ai\b|covers everything"
)
_MARKUP = re.compile(r"<[a-z/]|https?://|www\.")
_SAFE_RISK_ID = re.compile(r"^[A-Z][A-Z_]{0,39}$")

_NO_COVER_CLAIM_STATUSES = {CoverageStatus.NOT_FOUND, CoverageStatus.EXCLUDED, CoverageStatus.UNCLEAR}


@dataclass
class ValidationResult:
    ok: bool
    problems: List[str] = field(default_factory=list)


def validate_envelope(data: Any, expected_ids: Set[str]) -> Tuple[Dict[str, dict], List[str]]:
    """Return `{risk_id: item}` for well-formed, expected, non-duplicate items, plus problems.

    Duplicated risk IDs are dropped entirely (we can't tell which copy is right).
    Expected IDs with no item are reported as "<risk_id>: missing".
    """
    findings = data.get("findings") if isinstance(data, dict) else None
    if not isinstance(findings, list):
        return {}, ["envelope: V1"]

    problems: List[str] = []
    seen: Dict[str, dict] = {}
    duplicated: Set[str] = set()

    for item in findings:
        risk_id = item.get("risk_id") if isinstance(item, dict) else None
        if not isinstance(risk_id, str) or not risk_id.strip():
            problems.append("item: V1")
            continue
        risk_id = risk_id.strip()
        if risk_id not in expected_ids:
            problems.append(f"{_safe_id(risk_id)}: V2")
        elif risk_id in seen:
            duplicated.add(risk_id)
        else:
            seen[risk_id] = item

    for risk_id in sorted(duplicated):
        del seen[risk_id]
        problems.append(f"{risk_id}: V2")

    for risk_id in sorted(expected_ids - seen.keys() - duplicated):
        problems.append(f"{risk_id}: {MISSING}")

    return seen, problems


def validate_item(
    item: dict,
    assessment: CoverageAssessment,
    allowed_chunk_ids: Set[str],
) -> ValidationResult:
    """Check one LLM item against the finding it explains.

    `allowed_chunk_ids` are the evidence IDs shown to the LLM for this finding
    (flagged, withheld clauses excluded).
    """
    explanation = item.get("explanation")
    recommendation = item.get("recommendation")
    cited = item.get("cited_chunk_ids")
    if cited is None:  # small models often omit an empty list
        cited = []

    # V1 - shape. Nothing else can be checked without it.
    if (
        not isinstance(explanation, str)
        or not isinstance(recommendation, str)
        or not isinstance(cited, list)
        or not all(isinstance(chunk_id, str) for chunk_id in cited)
    ):
        return ValidationResult(ok=False, problems=["V1"])

    problems: List[str] = []

    # V3 / V4 - citations.
    if cited:
        if not assessment.evidence:
            problems.append("V4")
        elif any(chunk_id not in allowed_chunk_ids for chunk_id in cited):
            problems.append("V3")

    text = _normalise(f"{explanation} \n {recommendation}")

    if _BLOCKED.search(text):
        problems.append("V5")

    if assessment.status in _NO_COVER_CLAIM_STATUSES and _CLAIMS_COVER.search(text):
        problems.append("V6")
    elif assessment.status is CoverageStatus.COVERED and _CLAIMS_GAP.search(text):
        problems.append("V6")

    if _INJECTION_ECHO.search(text):
        problems.append("V7")

    if _MARKUP.search(text):
        problems.append("V8")

    if _too_long_or_empty(explanation, MAX_EXPLANATION_WORDS, MAX_EXPLANATION_CHARS) or _too_long_or_empty(
        recommendation, MAX_RECOMMENDATION_WORDS, MAX_RECOMMENDATION_CHARS
    ):
        problems.append("V9")

    return ValidationResult(ok=not problems, problems=problems)


def _normalise(text: str) -> str:
    """Lower-case, straight apostrophes, single spaces - so phrase checks can't be dodged."""
    text = text.lower().replace("’", "'").replace("‘", "'")
    return re.sub(r"\s+", " ", text)


def _too_long_or_empty(text: str, max_words: int, max_chars: int) -> bool:
    stripped = text.strip()
    return not stripped or len(stripped) > max_chars or len(stripped.split()) > max_words


def _safe_id(risk_id: str) -> str:
    """Unexpected IDs come from the LLM; only log them if they look like taxonomy IDs."""
    return risk_id if _SAFE_RISK_ID.match(risk_id) else "?"
