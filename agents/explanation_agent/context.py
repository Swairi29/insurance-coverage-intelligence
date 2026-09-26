"""Builds the safe, data-only context that Agent 4 sends to the LLM.

Two-layer injection defence:
1. Clauses that look like prompt injection are withheld from the prompt
   (the finding still cites them, marked `flagged`).
2. Everything else is sanitised and wrapped in <<<EVIDENCE ...>>> blocks that
   the system prompt says are data, never instructions.
The validator (Step 5) then checks whatever comes back.
"""

from __future__ import annotations

import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, NamedTuple, Optional, Sequence, Set, Tuple

from agents.explanation_agent.templates import PLAIN_MEANING
from shared.models.coverage import CoverageAssessment
from shared.models.policy import EvidenceClause
from shared.models.risk import IdentifiedRisk
from shared.utils.security import scan_for_prompt_injection

GLOSSARY_PATH = Path(__file__).resolve().parents[2] / "data" / "knowledge_base" / "glossary.json"

MAX_CLAUSE_CHARS = 1200
MAX_REASON_CHARS = 400
MAX_EXCERPT_CHARS = 400
MAX_EVIDENCE_PER_FINDING = 3

_DELIMITERS = re.compile(r"<{3,}|>{3,}")
_ATTRIBUTE_UNSAFE = re.compile(r'["<>]')


class FindingPair(NamedTuple):
    """One assessment from Agent 3 and, if Agent 1 sent it, the matching risk."""

    assessment: CoverageAssessment
    risk: Optional[IdentifiedRisk]


# --- text cleaning -----------------------------------------------------------------------


def sanitize(text: str, max_chars: int = MAX_CLAUSE_CHARS) -> str:
    """Make untrusted text safe to place in a prompt as data.

    Removes control and invisible formatting characters, removes our block
    delimiters (<<< and >>>), collapses whitespace and truncates with "…".
    """
    text = "".join(ch for ch in text if unicodedata.category(ch) not in ("Cc", "Cf") or ch in "\n\t")
    # PDF extraction splits words at line ends ("in-\ndemnify" -> "indemnify").
    text = re.sub(r"(?<=[a-z])-[ \t]*\r?\n[ \t]*(?=[a-z])", "", text)
    # Loop: removing one delimiter can join the pieces of another ("<<>>><" -> "<<<").
    previous = None
    while previous != text:
        previous, text = text, _DELIMITERS.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return _truncate(text, max_chars)


def make_excerpt(text: str, max_chars: int = MAX_EXCERPT_CHARS) -> str:
    """Short clause text for display in the report (fits `EvidenceCitation.excerpt`)."""
    return sanitize(text, max_chars) or "(empty clause)"


def _truncate(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    cut = text[: max_chars - 1]
    if " " in cut[max_chars // 2 :]:  # prefer a word boundary if one is reasonably close
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip() + "…"


def _attribute(text: str, max_chars: int = 200) -> str:
    """A value that is safe inside `name="..."` in an evidence block header."""
    return _ATTRIBUTE_UNSAFE.sub("", sanitize(text, max_chars))


# --- evidence ----------------------------------------------------------------------------------


def classify_evidence(assessment: CoverageAssessment) -> Tuple[List[EvidenceClause], List[EvidenceClause]]:
    """Split evidence into (usable, flagged) using the shared prompt-injection scan."""
    usable: List[EvidenceClause] = []
    flagged: List[EvidenceClause] = []
    for clause in assessment.evidence:
        suspicious = scan_for_prompt_injection(clause.text) or (
            clause.section and scan_for_prompt_injection(clause.section)
        )
        (flagged if suspicious else usable).append(clause)
    return usable, flagged


def prompt_evidence(assessment: CoverageAssessment) -> List[EvidenceClause]:
    """The clauses the LLM will see (and may cite) for this finding."""
    usable, _ = classify_evidence(assessment)
    return usable[:MAX_EVIDENCE_PER_FINDING]


# --- glossary ------------------------------------------------------------------------------------


@lru_cache
def load_glossary(path: Path = GLOSSARY_PATH) -> Tuple[dict, ...]:
    """Glossary entries `{"term", "definition", "aliases"}` (read once)."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return tuple(data["terms"])


def find_glossary_terms(texts: Sequence[str], glossary: Sequence[dict], max_terms: int = 6) -> List[dict]:
    """Glossary terms used in `texts`, in order of first appearance, as `{"term", "definition"}`."""
    combined = " ".join(texts)
    found = []
    for entry in glossary:
        words = [entry["term"], *entry.get("aliases", [])]
        positions = [
            match.start()
            for word in words
            for match in [re.search(rf"\b{re.escape(word)}(s|es)?\b", combined, re.IGNORECASE)]
            if match
        ]
        if positions:
            found.append((min(positions), entry))
    found.sort(key=lambda pair: pair[0])
    return [{"term": entry["term"], "definition": entry["definition"]} for _, entry in found[:max_terms]]


def glossary_texts(pairs: Sequence[FindingPair]) -> List[str]:
    """The texts shown to the LLM, for choosing glossary terms (never flagged clauses)."""
    texts: List[str] = []
    for pair in pairs:
        texts.append(pair.assessment.reason)
        texts.extend(clause.text for clause in prompt_evidence(pair.assessment))
    return texts


# --- prompt block ---------------------------------------------------------------------------------


def build_findings_block(pairs: Sequence[FindingPair]) -> Tuple[str, Dict[str, Set[str]]]:
    """Prompt text describing a batch of findings, and the chunk IDs each may cite."""
    blocks: List[str] = []
    allowed: Dict[str, Set[str]] = {}

    for number, (assessment, risk) in enumerate(pairs, start=1):
        shown = prompt_evidence(assessment)
        usable, flagged = classify_evidence(assessment)
        allowed[assessment.risk_id] = {clause.chunk_id for clause in shown}

        lines = [
            f"FINDING {number}",
            f"risk_id: {assessment.risk_id}",
            f"risk: {sanitize(assessment.risk_name, 100)}",
            f"category: {risk.category.value if risk else 'unknown'}",
            f"status: {assessment.status.value} - {PLAIN_MEANING[assessment.status]}",
        ]
        if risk is not None:
            lines.append(f"why this risk matters: {_safe_reason(risk.reason)}")
        lines.append(f"coverage analysis: {_safe_reason(assessment.reason)}")

        if shown:
            lines.append("evidence:")
            lines.extend(_evidence_block(clause) for clause in shown)
        elif not flagged:
            lines.append("evidence: No policy wording was found for this risk.")
        else:
            lines.append("evidence: none available.")

        if flagged:
            count = len(flagged)
            lines.append(f"note: {count} clause{'s' if count != 1 else ''} withheld for security review.")
        omitted = len(usable) - len(shown)
        if omitted:
            lines.append(f"note: {omitted} further clause{'s' if omitted != 1 else ''} not shown.")

        blocks.append("\n".join(lines))

    return "\n\n".join(blocks), allowed


def _evidence_block(clause: EvidenceClause) -> str:
    attributes = [f'chunk_id="{_attribute(clause.chunk_id, 80)}"', f'policy="{_attribute(clause.policy_id, 64)}"']
    if clause.section:
        attributes.append(f'section="{_attribute(clause.section)}"')
    attributes.append(f'page="{clause.page}"')
    return f"<<<EVIDENCE {' '.join(attributes)}>>>\n{sanitize(clause.text)}\n<<<END EVIDENCE>>>"


def _safe_reason(text: str) -> str:
    # Agent 1/3 reasons may quote policy text, so they get the same injection scan.
    if scan_for_prompt_injection(text):
        return "(withheld for security review)"
    return sanitize(text, MAX_REASON_CHARS)
