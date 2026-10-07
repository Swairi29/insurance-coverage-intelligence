# Agent 3 API endpoints (Member 3)

"""FastAPI endpoints for the Coverage & Gap Analysis Agent."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from agents.coverage_agent.interpreter import CoverageInterpreter
from agents.coverage_agent.service import CoverageAnalysisService
from agents.explanation_agent.llm import get_client

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
        # ---------------------------------------------------------
        # Step 1: Load application settings
        # ---------------------------------------------------------

        settings = get_settings()

        # ---------------------------------------------------------
        # Step 2: Create the configured LLM client
        #
        # This reuses the same LLM client factory used by Agent 4.
        # It supports the provider configured in .env:
        #
        # LLM_PROVIDER=ollama
        # or
        # LLM_PROVIDER=gemini
        # ---------------------------------------------------------

        client, _provider, model = get_client(settings)

        # ---------------------------------------------------------
        # Step 3: Create the semantic CoverageInterpreter
        #
        # If no LLM client is available, interpreter remains None
        # and the service uses its safe fallback behaviour.
        # ---------------------------------------------------------

        interpreter = (
            CoverageInterpreter(
                client,
                model_name=model,
            )
            if client is not None
            else None
        )

        # ---------------------------------------------------------
        # Step 4: Inject the interpreter into Agent 3 service
        # ---------------------------------------------------------

        service = CoverageAnalysisService(
            interpreter=interpreter,
            use_llm=False,
        )

        # ---------------------------------------------------------
        # Step 5: Analyse the risks using Agent 2 evidence
        # ---------------------------------------------------------

        result = service.analyse(
            risks=request.risks,
            evidence_results=request.evidence_results,
        )

        # ---------------------------------------------------------
        # Step 6: Return the structured Agent 3 response
        # ---------------------------------------------------------

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
        # Log the complete exception internally.
        # Do not expose internal details to the API caller.
        logger.exception(
            "Coverage analysis failed."
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Coverage analysis could not be completed."
            ),
        ) from None