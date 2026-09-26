"""Report assembly for the Explanation & Recommendation Agent (Agent 4).

Golden rule: Agent 4 explains Agent 3's decisions; it never changes them.
`status`, `potential_gap`, `title`, `priority`, `verification_required`,
`coverage_confidence` and the evidence list always come from code. The LLM
may only supply `explanation` and `recommendation`, and only after validation.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Sequence

from agents.explanation_agent.context import FindingPair, classify_evidence, make_excerpt, sanitize
from agents.explanation_agent.llm import TextGenerator
from agents.explanation_agent.rag import generate_llm_items
from agents.explanation_agent.templates import (
    headline_for,
    priority_for,
    template_explanation,
    template_recommendation,
    title_for,
    verification_required_for,
)
from shared.models.analysis import (
    DISCLAIMER,
    EvidenceCitation,
    Finding,
    FindingPriority,
    GeneratedBy,
    ReportSummary,
)
from shared.models.business import BusinessType
from shared.models.coverage import CoverageStatus
from shared.schemas.requests import ExplanationRequest
from shared.schemas.responses import ExplanationMetadata, ExplanationResponse

logger = logging.getLogger(__name__)

_PRIORITY_RANK = {FindingPriority.HIGH: 0, FindingPriority.MEDIUM: 1, FindingPriority.LOW: 2}

LLM_UNAVAILABLE_WARNING = "AI wording unavailable; standard wording used for every finding."
FLAGGED_EXCERPT = (
    "Clause text withheld because it contained instruction-like text. "
    "Read page {page} of the policy document directly."
)
LLM_PARTIAL_WARNING ="Some findings use standard wording because the AI wording did not pass the safety checks."
LLM_TIME_BUDGET_WARNING = (
    "Some findings use standard wording because the AI wording took too long to generate."
)


class ExplanationService:
    def __init__(
        self,
        *,
        client: Optional[TextGenerator] = None,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        use_llm: bool = True,
        llm_budget_seconds: Optional[float] = None,
    ) -> None:
        self._client = client
        self._provider = provider
        self._model = model
        self._use_llm = use_llm
        self._llm_budget_seconds = llm_budget_seconds

    def generate(self, request: ExplanationRequest) -> ExplanationResponse:
        started = time.perf_counter()
        warnings: List[str] = []

        pairs = _order(_pair(request, warnings))

        llm_items: Dict[str, dict] = {}
        problems: List[str] = []
        llm_attempted = bool(self._use_llm and self._client is not None and pairs)
        if llm_attempted:
            deadline = started + self._llm_budget_seconds if self._llm_budget_seconds else None
            llm_items, problems = generate_llm_items(pairs, request.business_type, self._client,
                                                     deadline=deadline)
            if problems:
                logger.info("LLM items rejected or missing: %s", ", ".join(problems))
        out_of_time = any(problem.endswith("time_budget") for problem in problems)

        findings = [_finding(pair, request.business_type, llm_items.get(pair.assessment.risk_id)) for pair in pairs]
        warnings.extend(_flagged_clause_warnings(pairs))

        llm_count = sum(1 for f in findings if f.generated_by is GeneratedBy.LLM)
        if llm_attempted and llm_count == 0:
            warnings.append(LLM_UNAVAILABLE_WARNING)
        elif llm_attempted and llm_count < len(findings):
            warnings.append(LLM_TIME_BUDGET_WARNING if out_of_time else LLM_PARTIAL_WARNING)

        processing_ms = int((time.perf_counter() - started) * 1000)
        logger.info(
            "Report generated: %d findings (%d llm, %d template), provider=%s, %d ms.",
            len(findings), llm_count, len(findings) - llm_count,
            self._provider if llm_attempted else None, processing_ms,
        )

        return ExplanationResponse(
            request_id=request.request_id,
            business_id=request.business_id,
            generated_at=datetime.now(timezone.utc),
            summary=_summary(findings),
            findings=findings,
            disclaimer=DISCLAIMER,
            warnings=warnings,
            metadata=ExplanationMetadata(
                llm_used=llm_count > 0,
                llm_provider=self._provider if llm_attempted else None,
                llm_model=self._model if llm_attempted else None,
                llm_findings=llm_count,
                template_findings=len(findings) - llm_count,
                processing_ms=processing_ms,
            ),
        )


# --- pairing and ordering (plan sections 3.4 and 3.5) --------------------------------------------


def _pair(request: ExplanationRequest, warnings: List[str]) -> List[FindingPair]:
    risks = {risk.risk_id: risk for risk in request.risks}
    assessed = {assessment.risk_id for assessment in request.assessments}

    pairs = []
    for assessment in request.assessments:
        risk = risks.get(assessment.risk_id)
        if risk is None:
            warnings.append(
                f"Risk {assessment.risk_id} was assessed for coverage but is missing from the risk "
                "profile, so its category is unknown."
            )
        pairs.append(FindingPair(assessment, risk))

    for risk in request.risks:
        if risk.risk_id not in assessed:
            warnings.append(
                f"Risk {risk.risk_id} was not assessed for coverage and is not included in this report."
            )
    return pairs


def _order(pairs: Sequence[FindingPair]) -> List[FindingPair]:
    """Priority (high first), then Agent 1 risk confidence (high first), then risk name."""

    def key(pair: FindingPair):
        confidence = pair.risk.confidence if pair.risk else -1.0
        return (_PRIORITY_RANK[priority_for(pair.assessment.status)], -confidence, pair.assessment.risk_name)

    return sorted(pairs, key=key)


# --- building the report ---------------------------------------------------------------------------


def _finding(pair: FindingPair, business_type: Optional[BusinessType], llm_item: Optional[dict]) -> Finding:
    assessment, risk = pair
    if llm_item is not None:
        explanation, recommendation = llm_item["explanation"], llm_item["recommendation"]
        generated_by = GeneratedBy.LLM
    else:
        explanation = template_explanation(assessment, risk, business_type)
        recommendation = template_recommendation(assessment, risk)
        generated_by = GeneratedBy.TEMPLATE

    return Finding(
        risk_id=assessment.risk_id,
        risk_name=assessment.risk_name,
        category=risk.category if risk else None,
        status=assessment.status,
        potential_gap=assessment.potential_gap,
        priority=priority_for(assessment.status),
        title=title_for(assessment),
        explanation=explanation,
        recommendation=recommendation,
        evidence=_citations(pair),
        verification_required=verification_required_for(assessment.status),
        coverage_confidence=assessment.confidence,
        generated_by=generated_by,
    )


def _citations(pair: FindingPair) -> List[EvidenceCitation]:
    """Built only from Agent 3's evidence, never from the LLM's cited_chunk_ids."""
    _, flagged = classify_evidence(pair.assessment)
    flagged_ids = {id(clause) for clause in flagged}
    citations = []
    for clause in pair.assessment.evidence:
        is_flagged = id(clause) in flagged_ids
        # Injected text is not passed on to whatever displays or processes the report.
        excerpt = FLAGGED_EXCERPT.format(page=clause.page) if is_flagged else make_excerpt(clause.text)
        citations.append(
            EvidenceCitation(
                chunk_id=clause.chunk_id,
                policy_id=clause.policy_id,
                section=clause.section,
                page=clause.page,
                excerpt=excerpt,
                flagged=is_flagged,
            )
        )
    return citations


def _flagged_clause_warnings(pairs: Sequence[FindingPair]) -> List[str]:
    warnings = []
    for pair in pairs:
        _, flagged = classify_evidence(pair.assessment)
        for clause in flagged:
            warnings.append(
                f"A clause in policy {sanitize(clause.policy_id, 64)}, page {clause.page} contained "
                "instruction-like text and was not sent to the AI model."
            )
    return warnings


def _summary(findings: Sequence[Finding]) -> ReportSummary:
    return ReportSummary(
        total_findings=len(findings),
        potential_gaps=sum(1 for f in findings if f.potential_gap),
        counts_by_status={status.value: sum(1 for f in findings if f.status is status) for status in CoverageStatus},
        headline=headline_for(findings),
    )
