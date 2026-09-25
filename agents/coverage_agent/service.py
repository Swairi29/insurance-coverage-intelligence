# Agent 3 coverage assessment and gap detection logic (Member 3)

"""Coverage assessment and gap detection service."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Dict, List, Optional

from agents.coverage_agent.interpreter import (
    CoverageInterpreter,
    LLMInvalidResponseError,
    TextGenerator,
)
from agents.coverage_agent.rules import RuleDecision, decide_coverage

from shared.config.settings import Settings, get_settings
from shared.llm.gemini_client import (
    GeminiClient,
    LLMAPIError,
    LLMConfigError,
    LLMError,
    LLMTimeoutError,
)
from shared.models.coverage import (
    AnalysisMethod,
    CoverageAssessment,
    CoverageStatus,
)
from shared.models.policy import RiskEvidenceResult
from shared.models.risk import IdentifiedRisk
from shared.schemas.responses import (
    CoverageAnalysisResponse,
    CoverageMetadata,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CoverageServiceResult:
    """Internal service result."""

    assessments: List[CoverageAssessment]
    warnings: List[str]
    llm_used: bool
    llm_model: Optional[str]
    processing_ms: int


class CoverageAnalysisService:
    """Coordinates deterministic rules and optional LLM interpretation."""

    def __init__(
        self,
        llm_client: Optional[TextGenerator] = None,
        *,
        use_llm: bool = True,
        settings: Optional[Settings] = None,
    ):
        self._llm_client = llm_client
        self._use_llm = use_llm
        self._settings = settings

    def analyse(
        self,
        risks: List[IdentifiedRisk],
        evidence_results: List[RiskEvidenceResult],
    ) -> CoverageServiceResult:

        start = time.perf_counter()

        evidence_by_risk: Dict[str, RiskEvidenceResult] = {
            item.risk_id: item
            for item in evidence_results
        }

        assessments: List[CoverageAssessment] = []
        warnings: List[str] = []

        llm_used = False
        llm_model: Optional[str] = None

        for risk in risks:

            result = evidence_by_risk.get(
                risk.risk_id
            )

            evidence = (
                result.evidence
                if result is not None
                else []
            )

            # --------------------------------------------
            # STEP 1: deterministic analysis
            # --------------------------------------------

            decision: RuleDecision = decide_coverage(
                evidence
            )

            status = decision.status
            reason = decision.reason
            confidence = decision.confidence
            method = AnalysisMethod.RULES
            matched_signals = decision.matched_signals

            # --------------------------------------------
            # STEP 2: LLM only for ambiguous cases
            # --------------------------------------------

            if (
                status is CoverageStatus.UNCLEAR
                and evidence
                and self._use_llm
            ):
                try:

                    interpreter = CoverageInterpreter(
                        self._get_llm_client()
                    )

                    interpretation = interpreter.interpret(
                        risk.name,
                        evidence,
                    )

                    status = interpretation.status
                    reason = interpretation.reason
                    confidence = interpretation.confidence

                    method = AnalysisMethod.RULES_AND_LLM

                    llm_used = True
                    llm_model = (
                        self._get_settings().llm_model
                    )

                except LLMError as exc:

                    logger.warning(
                        "Coverage LLM failed: %s",
                        type(exc).__name__,
                    )

                    warnings.append(
                        f"LLM interpretation was unavailable "
                        f"for risk '{risk.risk_id}'. "
                        f"The deterministic assessment was retained."
                    )

            # --------------------------------------------
            # STEP 3: determine possible gap
            # --------------------------------------------

            potential_gap = status in {
                CoverageStatus.EXCLUDED,
                CoverageStatus.NOT_FOUND,
                CoverageStatus.UNCLEAR,
            }

            # CONDITIONAL is not automatically a gap.
            # Agent 4 can explain that conditions require review.

            assessments.append(
                CoverageAssessment(
                    risk_id=risk.risk_id,
                    risk_name=risk.name,
                    status=status,
                    potential_gap=potential_gap,
                    reason=reason,
                    evidence=evidence,
                    confidence=confidence,
                    method=method,
                    matched_signals=matched_signals,
                )
            )

        processing_ms = int(
            (time.perf_counter() - start) * 1000
        )

        return CoverageServiceResult(
            assessments=assessments,
            warnings=warnings,
            llm_used=llm_used,
            llm_model=llm_model,
            processing_ms=processing_ms,
        )

    def _get_settings(self) -> Settings:

        if self._settings is None:
            self._settings = get_settings()

        return self._settings

    def _get_llm_client(self) -> TextGenerator:

        if self._llm_client is None:
            self._llm_client = GeminiClient(
                self._get_settings()
            )

        return self._llm_client