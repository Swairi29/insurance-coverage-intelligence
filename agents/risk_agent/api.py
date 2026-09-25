# Agent 1 API endpoints (Member 1)
"""FastAPI endpoints for the Risk Profiling Agent."""

import time

from fastapi import APIRouter, Depends, HTTPException

from agents.risk_agent.service import RiskIdentificationService
from agents.risk_agent.taxonomy import TAXONOMY_VERSION
from shared.schemas.requests import RiskProfileRequest
from shared.schemas.responses import (
    ProfileMetadata,
    ProfileStatus,
    RiskProfileResponse,
)
from shared.utils.security import require_internal_api_key

router = APIRouter(tags=["Risk Profiling"], dependencies=[Depends(require_internal_api_key)])


@router.post(
    "/api/v1/risk-profile",
    response_model=RiskProfileResponse,
)
def identify_risks(request: RiskProfileRequest) -> RiskProfileResponse:
    """Identify potential business risks from a business profile."""

    start_time = time.perf_counter()

    try:
        service = RiskIdentificationService()
        result = service.identify(request.business)

        processing_ms = int((time.perf_counter() - start_time) * 1000)

        status = (
            ProfileStatus.PARTIAL
            if result.warnings
            else ProfileStatus.COMPLETE
        )

        return RiskProfileResponse(
            request_id=request.request_id,
            status=status,
            business_name=request.business.business_name,
            business_type=request.business.business_type,
            risks=result.risks,
            warnings=result.warnings,
            metadata=ProfileMetadata(
                taxonomy_version=TAXONOMY_VERSION,
                llm_used=result.llm_used,
                llm_model=result.llm_model,
                processing_ms=processing_ms,
            ),
        )

    except Exception:
        # Do not expose internal exception details to API clients.
        raise HTTPException(
            status_code=500,
            detail="Risk profiling could not be completed.",
        ) from None