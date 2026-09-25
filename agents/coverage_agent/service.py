# Agent 3 coverage assessment and gap detection logic (Member 3)

"""Business logic for Coverage & Gap Analysis Agent."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Optional

from shared.models.coverage import (
    AnalysisMethod,
    CoverageAssessment,
    CoverageStatus,
)
from shared.models.policy import EvidenceClause, RiskEvidenceResult
from shared.models.risk import IdentifiedRisk

from agents.coverage_agent.interpreter import (
    CoverageInterpreter,
    LLMInvalidResponseError,
)
from agents.coverage_agent.rules import (
    decide_from_evidence,
    potential_gap_for_status,
)


@dataclass
class CoverageServiceResult:
    """Result returned by the coverage analysis service."""

    assessments: list[CoverageAssessment]
    warnings: list[str]
    llm_used: bool
    llm_model: Optional[str]
    processing_ms: int


class CoverageAnalysisService:
    """Coordinates evidence validation and semantic interpretation."""

    def __init__(
        self,
        *,
        interpreter: CoverageInterpreter | None = None,
        use_llm: bool = True,
    ) -> None:
        self.interpreter = interpreter
        self.use_llm = use_llm

    def analyse(
        self,
        *,
        risks: list[IdentifiedRisk],
        evidence_results: list[RiskEvidenceResult],
    ) -> CoverageServiceResult:

        started = time.perf_counter()

        warnings: list[str] = []
        assessments: list[CoverageAssessment] = []

        evidence_by_risk: dict[str, list[EvidenceClause]] = {
            result.risk_id: result.evidence
            for result in evidence_results
        }

        llm_used = False
        llm_model: str | None = None

        for risk in risks:

            evidence = evidence_by_risk.get(
                risk.risk_id,
                [],
            )

            # ---------------------------------------------------------
            # Step 1: deterministic evidence sufficiency check
            # ---------------------------------------------------------

            deterministic = decide_from_evidence(evidence)

            if not evidence:
                assessments.append(
                    CoverageAssessment(
                        risk_id=risk.risk_id,
                        risk_name=risk.name,
                        status=CoverageStatus.NOT_FOUND,
                        potential_gap=True,
                        reason=deterministic.reason,
                        evidence=[],
                        confidence=deterministic.confidence,
                        method=AnalysisMethod.RULES,
                        matched_signals=[],
                    )
                )

                continue

            # ---------------------------------------------------------
            # Step 2: semantic interpretation
            # ---------------------------------------------------------

            if not self.use_llm or self.interpreter is None:
                assessments.append(
                    CoverageAssessment(
                        risk_id=risk.risk_id,
                        risk_name=risk.name,
                        status=CoverageStatus.UNCLEAR,
                        potential_gap=True,
                        reason=(
                            "Relevant policy evidence was retrieved, "
                            "but semantic interpretation is unavailable."
                        ),
                        evidence=evidence,
                        confidence=0.40,
                        method=AnalysisMethod.RULES,
                        matched_signals=[],
                    )
                )

                warnings.append(
                    f"LLM interpretation was unavailable for risk "
                    f"'{risk.risk_id}'."
                )

                continue

            try:
                interpretation_result = self.interpreter.interpret(
                    risk_name=risk.name,
                    risk_category=risk.category,
                    risk_reason=risk.reason,
                    evidence=evidence,
                )

                interpretation = interpretation_result.interpretation

                llm_used = True
                llm_model = interpretation_result.model

                # -----------------------------------------------------
                # Step 3: evidence grounding validation
                # -----------------------------------------------------

                referenced_ids = set(
                    interpretation.evidence_chunk_ids
                )

                if not referenced_ids:
                    raise LLMInvalidResponseError(
                        "LLM did not identify supporting evidence."
                    )

                # Only evidence supplied by Agent 2 is allowed.
                evidence_by_id = {
                    item.chunk_id: item
                    for item in evidence
                }

                referenced_evidence = [
                    evidence_by_id[chunk_id]
                    for chunk_id in interpretation.evidence_chunk_ids
                ]

                # -----------------------------------------------------
                # Step 4: construct final assessment
                # -----------------------------------------------------

                final_status = interpretation.status

                # NOT_FOUND should not normally be returned when
                # evidence exists. Treat it as uncertainty instead.
                if final_status == CoverageStatus.NOT_FOUND:
                    final_status = CoverageStatus.UNCLEAR

                assessments.append(
                    CoverageAssessment(
                        risk_id=risk.risk_id,
                        risk_name=risk.name,
                        status=final_status,
                        potential_gap=potential_gap_for_status(
                            final_status
                        ),
                        reason=interpretation.reason,
                        evidence=referenced_evidence,
                        confidence=interpretation.confidence,
                        method=AnalysisMethod.RULES_AND_LLM,
                        matched_signals=[],
                    )
                )

            except Exception as exc:
                # -----------------------------------------------------
                # Step 5: safe fallback
                # -----------------------------------------------------

                warnings.append(
                    f"LLM interpretation failed for risk "
                    f"'{risk.risk_id}': {exc}"
                )

                assessments.append(
                    CoverageAssessment(
                        risk_id=risk.risk_id,
                        risk_name=risk.name,
                        status=CoverageStatus.UNCLEAR,
                        potential_gap=True,
                        reason=(
                            "Relevant policy evidence was retrieved, "
                            "but it could not be safely interpreted."
                        ),
                        evidence=evidence,
                        confidence=0.30,
                        method=AnalysisMethod.RULES,
                        matched_signals=[],
                    )
                )

        processing_ms = int(
            (time.perf_counter() - started) * 1000
        )

        return CoverageServiceResult(
            assessments=assessments,
            warnings=warnings,
            llm_used=llm_used,
            llm_model=llm_model,
            processing_ms=processing_ms,
        )