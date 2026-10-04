"""Context for answering one question about a saved analysis. No LLM here.

An answer may only use what the analysis already contains: Agent 3's
assessments and the policy clauses behind them. Nothing is retrieved again.

1. The question is sanitised and scanned for prompt injection. A suspicious
   question is answered without the LLM (step Q3).
2. Clauses are collected from every assessment. Flagged ones are withheld,
   and a clause that is evidence for several risks appears once.
3. Risks and clauses are scored against the question by keyword overlap
   (rarer words count more). The best clauses are kept.
4. A one-line overview of every risk and its status is always included, so
   questions about the whole analysis ("which risks are gaps?") can be
   answered without clause text.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Dict, FrozenSet, List, Optional, Sequence, Set, Tuple

from agents.explanation_agent.context import (
    classify_evidence,
    evidence_block,
    find_glossary_terms,
    load_glossary,
    sanitize,
)
from agents.explanation_agent.templates import PLAIN_MEANING
from shared.models.coverage import CoverageAssessment, CoverageStatus
from shared.models.policy import EvidenceClause
from shared.schemas.requests import MAX_QUESTION_CHARS
from shared.utils.security import scan_for_prompt_injection

MAX_CONTEXT_CLAUSES = 6  # also the citation limit of QuestionAnswerResponse
MAX_RELATED_RISKS = 5
# Clauses of a related risk that are shown even when their words don't match the question.
CLAUSES_PER_RELATED_RISK = 2
# How much a clause gains from belonging to a risk the question is about.
RISK_MATCH_WEIGHT = 0.5

_WORD = re.compile(r"[a-z0-9]+")

# Words that say nothing about *which* risk or clause is meant. Insurance words like
# "cover", "damage" and "loss" are here too: almost every clause and question uses them.
_STOPWORDS = frozenset(
    """a about after again all also am an and any are as at be been before being but by can
    could did do does doing for from had has have how i if in into is it its just me might
    more most my no nor not of on or our ours out over own same should so some such than that
    the their them then there these they this those through to too under until up very was we
    were what when where which while who whom why will with would you your yours
    cover covered covers coverage insur insurance insured insurer polic policy policies
    claim claims risk risks business shop happen happens get got pay paid
    damage damages damaged loss losses lose lost say says said mean means meaning""".split()
)

# Everyday words people ask with -> words used in risk names and policy wording.
_EVERYDAY_TERMS: Dict[str, Tuple[str, ...]] = {
    "oven": ("equipment", "machinery", "breakdown"),
    "fridge": ("equipment", "machinery", "breakdown", "refrigeration"),
    "freezer": ("equipment", "machinery", "breakdown", "refrigeration"),
    "mixer": ("equipment", "machinery", "breakdown"),
    "machine": ("equipment", "machinery", "breakdown"),
    "broke": ("breakdown",),
    "broken": ("breakdown",),
    "stolen": ("theft", "burglary"),
    "steal": ("theft", "burglary"),
    "robbery": ("theft", "burglary"),
    "robbed": ("theft", "burglary"),
    "break": ("burglary", "breakdown"),
    "rain": ("flood", "storm", "water", "weather"),
    "leak": ("water", "escape"),
    "burn": ("fire",),
    "smoke": ("fire",),
    "card": ("payment", "fraud"),
    "chargeback": ("payment", "fraud"),
    "hack": ("cyber", "data", "breach"),
    "hacked": ("cyber", "data", "breach"),
    "closed": ("closure", "interruption"),
    "close": ("closure", "interruption"),
    "shut": ("closure", "interruption"),
    "income": ("interruption", "profit", "revenue"),
    "customer": ("liability", "public", "injury"),
    "slip": ("liability", "public", "injury"),
    "injured": ("liability", "injury"),
    "staff": ("employee", "employer"),
    "worker": ("employee", "employer"),
}

# Questions about a kind of result rather than a named risk.
_STATUS_INTENTS: Tuple[Tuple[re.Pattern, FrozenSet[CoverageStatus]], ...] = (
    (re.compile(r"\bexclu"), frozenset({CoverageStatus.EXCLUDED})),
    (re.compile(r"\bconditions?\b|\bconditional\b|\brequirements?\b"), frozenset({CoverageStatus.CONDITIONAL})),
    (re.compile(r"\bunclear\b|\buncertain\b|\bnot sure\b"), frozenset({CoverageStatus.UNCLEAR})),
    (re.compile(r"\bnot found\b|\bmissing\b|\bno wording\b"), frozenset({CoverageStatus.NOT_FOUND})),
)
_GAP_INTENT = re.compile(r"\bgaps?\b|\buncovered\b|\bnot covered\b|\bunprotected\b")


@dataclass(frozen=True)
class ContextClause:
    """One clause the LLM may see and cite, with the risks it is evidence for."""

    clause: EvidenceClause
    risk_ids: Tuple[str, ...]
    score: float


@dataclass
class QuestionContext:
    question: str  # sanitised
    flagged: bool  # the question looked like a prompt-injection attempt
    assessments: List[CoverageAssessment]  # every risk, for the overview
    clauses: List[ContextClause] = field(default_factory=list)  # best first
    related_risk_ids: List[str] = field(default_factory=list)  # best first
    asked_statuses: FrozenSet[CoverageStatus] = frozenset()
    asks_about_gaps: bool = False
    withheld_clauses: int = 0  # flagged clauses left out

    @property
    def allowed_chunk_ids(self) -> Set[str]:
        """The chunk IDs the answer may cite: exactly the clauses shown."""
        return {item.clause.chunk_id for item in self.clauses}


# --- text -------------------------------------------------------------------------------------


def _stem(word: str) -> str:
    """A very small suffix stripper: "ovens" -> "oven", "flooded" -> "flood"."""
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    for suffix, min_len in (("ing", 6), ("ed", 5), ("es", 5), ("s", 4)):
        if len(word) >= min_len and word.endswith(suffix) and not word.endswith("ss"):
            return word[: -len(suffix)]
    return word


def terms(text: str) -> Set[str]:
    """Meaningful, stemmed words of `text`."""
    found: Set[str] = set()
    for word in _WORD.findall(text.lower().replace("_", " ")):
        stem = _stem(word)
        if len(stem) >= 3 and word not in _STOPWORDS and stem not in _STOPWORDS:
            found.add(stem)
    return found


# Keyed by stem, because question words are stemmed before the lookup ("closed" -> "clos").
_EVERYDAY_STEMS: Dict[str, Set[str]] = {
    _stem(word): {_stem(extra) for extra in extras} for word, extras in _EVERYDAY_TERMS.items()
}


def question_terms(question: str) -> Set[str]:
    """Terms of the question, plus the risk words its everyday words stand for."""
    found = terms(question)
    for word in list(found):
        found.update(_EVERYDAY_STEMS.get(word, ()))
    return found


# --- building the context ------------------------------------------------------------------------


def build_question_context(question: str, assessments: Sequence[CoverageAssessment]) -> QuestionContext:
    """Everything the answer may use for this question, best matches first."""
    clean = sanitize(question, MAX_QUESTION_CHARS)
    context = QuestionContext(
        question=clean,
        flagged=bool(scan_for_prompt_injection(question)),
        assessments=list(assessments),
    )
    lowered = clean.lower()
    context.asked_statuses = frozenset().union(
        *(statuses for pattern, statuses in _STATUS_INTENTS if pattern.search(lowered))
    )
    context.asks_about_gaps = bool(_GAP_INTENT.search(lowered))
    if context.flagged:
        return context  # nothing from the policies goes near a suspicious question

    pool, context.withheld_clauses = _clause_pool(assessments)
    asked = question_terms(clean)
    risk_scores = _score_risks(asked, assessments, context)
    context.related_risk_ids = [
        risk_id for risk_id, score in sorted(risk_scores.items(), key=lambda kv: -kv[1]) if score > 0
    ][:MAX_RELATED_RISKS]
    context.clauses = _rank_clauses(asked, pool, risk_scores, context.related_risk_ids)
    return context


def _clause_pool(
    assessments: Sequence[CoverageAssessment],
) -> Tuple[Dict[str, Tuple[EvidenceClause, List[str]]], int]:
    """Usable clauses by chunk_id, each with the risks it belongs to; and the withheld count."""
    pool: Dict[str, Tuple[EvidenceClause, List[str]]] = {}
    withheld: Set[str] = set()
    for assessment in assessments:
        usable, flagged = classify_evidence(assessment)
        withheld.update(clause.chunk_id for clause in flagged)
        for clause in usable:
            if clause.chunk_id in pool:
                pool[clause.chunk_id][1].append(assessment.risk_id)
            else:
                pool[clause.chunk_id] = (clause, [assessment.risk_id])
    # A chunk flagged under one risk is withheld everywhere.
    for chunk_id in withheld:
        pool.pop(chunk_id, None)
    return pool, len(withheld)


def _score_risks(
    asked: Set[str], assessments: Sequence[CoverageAssessment], context: QuestionContext
) -> Dict[str, float]:
    """How well each risk matches the question, 0 if not at all."""
    scores: Dict[str, float] = {}
    for assessment in assessments:
        name_terms = terms(f"{assessment.risk_name} {assessment.risk_id}")
        reason_terms = terms(assessment.reason)
        # The name says what the risk is; the reason only mentions things in passing.
        score = 2.0 * len(asked & name_terms) + 0.5 * len(asked & (reason_terms - name_terms))
        if assessment.status in context.asked_statuses:
            score += 2.0
        if context.asks_about_gaps and assessment.potential_gap:
            score += 2.0
        scores[assessment.risk_id] = score
    return scores


def _rank_clauses(
    asked: Set[str],
    pool: Dict[str, Tuple[EvidenceClause, List[str]]],
    risk_scores: Dict[str, float],
    related: List[str],
) -> List[ContextClause]:
    clause_terms = {chunk_id: terms(f"{clause.section or ''} {clause.text}") for chunk_id, (clause, _) in pool.items()}
    # Rarer words in this analysis count more (inverse document frequency).
    count = len(pool)
    idf = {
        term: math.log(1 + count / sum(1 for found in clause_terms.values() if term in found))
        for term in asked
        if any(term in found for found in clause_terms.values())
    }
    best_risk = max(risk_scores.values(), default=0.0) or 1.0

    scored: List[ContextClause] = []
    for chunk_id, (clause, risk_ids) in pool.items():
        words = sum(idf[term] for term in asked & clause_terms[chunk_id] if term in idf)
        risk = max(risk_scores.get(risk_id, 0.0) for risk_id in risk_ids) / best_risk
        scored.append(ContextClause(clause, tuple(risk_ids), round(words + RISK_MATCH_WEIGHT * risk, 4)))

    # Best first; ties keep the order of the analysis (most relevant risk first).
    ranked = sorted((item for item in scored if item.score > 0), key=lambda item: -item.score)
    chosen = ranked[:MAX_CONTEXT_CLAUSES]

    # The question names a risk whose clauses use other words: still show that risk's clauses.
    shown = {item.clause.chunk_id for item in chosen}
    for risk_id in related:
        extra = [item for item in scored if risk_id in item.risk_ids and item.clause.chunk_id not in shown]
        for item in extra[:CLAUSES_PER_RELATED_RISK]:
            if len(chosen) >= MAX_CONTEXT_CLAUSES:
                break
            chosen.append(item)
            shown.add(item.clause.chunk_id)
    return chosen


# --- prompt text --------------------------------------------------------------------------------------


def build_overview_block(assessments: Sequence[CoverageAssessment]) -> str:
    """One line per risk: what the analysis decided. Statuses are final."""
    if not assessments:
        return "This analysis identified no risks."
    lines = []
    for assessment in assessments:
        gap = "yes" if assessment.potential_gap else "no"
        lines.append(
            f"- {assessment.risk_id} | {sanitize(assessment.risk_name, 100)} | "
            f"status: {assessment.status.value} ({PLAIN_MEANING[assessment.status]}) | potential gap: {gap}"
        )
    return "\n".join(lines)


def build_clauses_block(context: QuestionContext) -> str:
    """The chosen clauses as <<<EVIDENCE>>> blocks, each with the risks it belongs to."""
    if not context.clauses:
        note = "No policy wording in this analysis matches the question."
    else:
        blocks = [
            f"(evidence for: {', '.join(item.risk_ids)})\n{evidence_block(item.clause)}" for item in context.clauses
        ]
        note = "\n\n".join(blocks)
    if context.withheld_clauses:
        count = context.withheld_clauses
        note += f"\nnote: {count} clause{'s' if count != 1 else ''} withheld for security review."
    return note


def glossary_for(context: QuestionContext) -> List[dict]:
    """Glossary terms used in the question or the clauses shown."""
    texts = [context.question, *(item.clause.text for item in context.clauses)]
    return find_glossary_terms(texts, load_glossary())


def related_assessments(context: QuestionContext) -> List[CoverageAssessment]:
    """The related risks' assessments, best match first."""
    by_id = {assessment.risk_id: assessment for assessment in context.assessments}
    return [by_id[risk_id] for risk_id in context.related_risk_ids if risk_id in by_id]


def best_clause_for(context: QuestionContext, risk_id: str) -> Optional[ContextClause]:
    """The highest-ranked clause shown for `risk_id`, if any."""
    return next((item for item in context.clauses if risk_id in item.risk_ids), None)
