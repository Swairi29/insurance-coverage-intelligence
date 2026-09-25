# Agent 3 API endpoints (Member 3)

"""FastAPI endpoints for the Coverage & Gap Analysis Agent."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from agents.coverage_agent.service import CoverageAnalysisService

from shared.config.settings import get_settings
from shared.schemas.requests import CoverageAnalysisRequest
from shared.schemas.responses import (
    CoverageAnalysisResponse,
    CoverageMetadata,
)
from shared.utils.security import require_internal_api_key

logger = logging.getLogger(__name__)


router = APIRouter(
    tags=["Coverage & Gap Analysis"],
    dependencies=[
        Depends(require_internal_api_key)
    ],
)


@router.post(
    "/api/v1/analyse-coverage",
    response_model=CoverageAnalysisResponse,
)
def analyse_coverage(
    request: CoverageAnalysisRequest,
) -> CoverageAnalysisResponse:

    try:

        service = CoverageAnalysisService()

        result = service.analyse(
            risks=request.risks,
            evidence_results=request.evidence_results,
        )

        settings = get_settings()

        return CoverageAnalysisResponse(
            request_id=request.request_id,
            business_id=request.business_id,
            assessments=result.assessments,
            warnings=result.warnings,
            metadata=CoverageMetadata(
                llm_used=result.llm_used,
                llm_model=result.llm_model,
                processing_ms=result.processing_ms,
            ),
        )

    except Exception:

        logger.exception(
            "Coverage analysis failed."
        )

        # Never expose internal exception details.
        raise HTTPException(
            status_code=500,
            detail=(
                "Coverage analysis could not be completed."
            ),
        ) from None