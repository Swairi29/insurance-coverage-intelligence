"""Rule-based reading of policy wording, used when no LLM interpreter is available.

`rules.py` only checks whether evidence exists. This module goes one step further: it looks for
plain insurance phrases in the evidence sentences that mention the risk, and decides:

- "not covered", "is excluded", "does not cover" ...       -> EXCLUDED
- "only if", "only after", "up to", "subject to" ...        -> CONDITIONAL
- "we will pay", "we will cover", "is covered", "includes"  -> COVERED
- nothing recognisable                                       -> UNCLEAR

It is deliberately cautious. COVERED is only returned when no relevant sentence carries a
condition or an exclusion; a mix of covering and excluding wording becomes CONDITIONAL, and
anything it cannot read stays UNCLEAR. The sentence it relied on is quoted in the reason and the
phrases it matched are returned as `matched_signals`, so every decision can be checked. The LLM
interpreter, when configured, can still give a better reading.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional

from shared.models.coverage import CoverageStatus
from shared.models.policy import EvidenceClause

# Words in risk names that say nothing about which clause is relevant.
_GENERIC = {
    "a", "an", "and", "or", "of", "the", "at", "from", "to", "by", "in", "on", "for", "with",
    "other", "general", "caused", "loss", "damage", "risk", "business", "premises", "goods",
    "customer", "customers", "incident", "incidents",
    # "supply chain" would otherwise match "power, gas or water supply".
    "supply",
}

_EXCLUDED = re.compile(
    r"\b(?:is|are) not covered\b|\bnot covered\b|\b(?:is|are) excluded\b|\bexcluded\b"
    r"|\bdoes not cover\b|\bdo not cover\b|\bwill not pay\b|\bnot insured\b"
    r"|\bmust be insured under a separate\b",
    re.IGNORECASE,
)
_CONDITION = re.compile(
    r"\bonly if\b|\bonly after\b|\bonly when\b|\bcovered only\b|\bprovided that\b"
    r"|\bsubject to\b|\bup to\b|\bon condition that\b|\bas long as\b|\bthe limit is\b",
    re.IGNORECASE,
)
_COVERED = re.compile(
    r"\bwe will pay\b|\bwe will cover\b|\bwe will indemnify\b|\b(?:is|are) covered\b"
    r"|\bcovers\b|\bincludes?\b",
    re.IGNORECASE,
)

_SENTENCE_SPLIT = re.compile(r"(?<=[.;!?])\s+")
_WORD = re.compile(r"[a-z]+")
_MAX_QUOTE = 280


@dataclass
class WordingDecision:
    status: CoverageStatus
    reason: str
    confidence: float
    matched_signals: List[str] = field(default_factory=list)
    clause: Optional[EvidenceClause] = None


def risk_keywords(risk_name: str) -> List[str]:
    """Distinctive words of a risk name, e.g. 'Customer data breach' -> ['data', 'breach']."""
    words = [w for w in _WORD.findall(risk_name.lower()) if w not in _GENERIC and len(w) > 2]
    return list(dict.fromkeys(words))


def _stem(word: str) -> str:
    # "refrigeration"/"refrigerator" -> "refrig", "deliveries"/"delivery" -> "delive".
    if len(word) >= 7:
        return word[:6]
    return word[:-1] if word.endswith("s") and len(word) > 3 else word


def _matches(sentence: str, keywords: List[str]) -> int:
    """How many distinct risk keywords appear in the sentence."""
    stems = {_stem(w) for w in _WORD.findall(sentence.lower())}
    return sum(1 for k in keywords if _stem(k) in stems)


def _signals(sentence: str) -> dict[str, list[str]]:
    return {
        "excluded": _EXCLUDED.findall(sentence),
        "condition": _CONDITION.findall(sentence),
        "covered": _COVERED.findall(sentence),
    }


def _decide(signals: List[dict[str, list[str]]]) -> Optional[CoverageStatus]:
    has = {kind: any(s[kind] for s in signals) for kind in ("excluded", "condition", "covered")}
    if not any(has.values()):
        return None
    if has["excluded"] and not has["condition"] and not has["covered"]:
        return CoverageStatus.EXCLUDED
    if has["covered"] and not has["condition"] and not has["excluded"]:
        return CoverageStatus.COVERED
    return CoverageStatus.CONDITIONAL


def _quote(sentence: str) -> str:
    sentence = " ".join(sentence.split())
    return sentence if len(sentence) <= _MAX_QUOTE else sentence[: _MAX_QUOTE - 1].rstrip() + "…"


def read_wording(risk_name: str, evidence: List[EvidenceClause]) -> WordingDecision:
    """Decide a coverage status from the evidence wording for one risk."""
    keywords = risk_keywords(risk_name)
    unclear = WordingDecision(
        status=CoverageStatus.UNCLEAR,
        reason=(
            "Policy wording related to this risk was found, but it does not clearly say whether "
            "the risk is covered, covered with conditions or excluded."
        ),
        confidence=0.40,
    )
    if not keywords or not evidence:
        return unclear

    # 1. The clause that talks most about this risk (ties: Agent 2's order, best score first).
    scored = []
    for index, clause in enumerate(evidence):
        # PDF text breaks lines mid-phrase ("does not" / "cover"), so normalise whitespace first.
        text = " ".join(clause.text.split())
        sentences = [s for s in _SENTENCE_SPLIT.split(text) if s.strip()]
        relevant = [(s, _matches(s, keywords)) for s in sentences]
        relevant = [(s, n) for s, n in relevant if n > 0]
        best_sentence = max((n for _, n in relevant), default=0)
        scored.append((best_sentence, sum(n for _, n in relevant), -index, clause, relevant))
    # The most specific clause wins: first by its best sentence, then by all its mentions.
    best_sentence, _, _, clause, relevant = max(scored, key=lambda item: item[:3])
    if best_sentence == 0:
        return unclear

    # 2. Focus on the sentences that mention the most risk keywords.
    best = max(n for _, n in relevant)
    focus = [s for s, n in relevant if n == best] if best >= 2 else [s for s, _ in relevant]
    focus_signals = [_signals(s) for s in focus]
    status = _decide(focus_signals)
    if status is None:
        focus = [s for s, _ in relevant]
        focus_signals = [_signals(s) for s in focus]
        status = _decide(focus_signals)
    if status is None:
        return unclear

    # 3. Never say COVERED if another relevant sentence adds a condition or an exclusion.
    all_signals = [_signals(s) for s, _ in relevant]
    if status == CoverageStatus.COVERED and any(
        s["condition"] or s["excluded"] for s in all_signals
    ):
        status = CoverageStatus.CONDITIONAL

    matched = sorted({
        f"{kind}: {phrase.lower()}"
        for signals in all_signals
        for kind, phrases in signals.items()
        for phrase in phrases
    })
    key_sentence = next(
        (s for s, sig in zip(focus, focus_signals) if any(sig.values())), focus[0]
    )
    where = f"{clause.section or 'policy wording'}, page {clause.page}"
    lead = {
        CoverageStatus.COVERED: "The policy wording appears to cover this risk",
        CoverageStatus.CONDITIONAL: "The policy wording appears to cover this risk only with "
                                    "conditions, limits or exclusions",
        CoverageStatus.EXCLUDED: "The policy wording appears to exclude this risk",
    }[status]
    reason = f'{lead} ({where}): "{_quote(key_sentence)}" This is a rule-based reading of the wording.'
    confidence = 0.65 if best >= 2 else 0.55
    return WordingDecision(status, reason, confidence, matched, clause)
