# Agent 3 API endpoints (Member 3)

"""FastAPI endpoints for the Coverage & Gap Analysis Agent."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

# Agent 3's own semantic interpreter.
from agents.coverage_agent.interpreter import CoverageInterpreter
from agents.coverage_agent.llm_provider import (
    create_coverage_llm_provider,
)

# Main Coverage & Gap Analysis service.
from agents.coverage_agent.service import CoverageAnalysisService

from shared.config.settings import get_settings
from shared.schemas.requests import CoverageAnalysisRequest
from shared.schemas.responses import (
    CoverageAnalysisResponse,
    CoverageMetadata,
)
from shared.utils.security import require_internal_api_key


logger = logging.getLogger(__name__)


# -------------------------------------------------------------
# Agent 3 API router
#
# Every endpoint in this router requires the internal API key.
# This protects communication between the project's agents.
# -------------------------------------------------------------

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
        # Step 2: Create Agent 3's independent LLM provider
        #
        # With your current .env:
        #
        #     LLM_PROVIDER=gemini
        #
        # the provider will:
        #
        #     1. Try Gemini first
        #     2. If Gemini fails, try Ollama
        #     3. If both fail, the service falls back to
        #        deterministic wording/rules
        #
        # Agent 3 therefore does NOT depend on Agent 4's
        # explanation_agent/llm.py.
        # ---------------------------------------------------------

        llm_provider = create_coverage_llm_provider(
            settings
        )

        # ---------------------------------------------------------
        # Step 3: Create the semantic CoverageInterpreter
        #
        # CoverageInterpreter does not need to know whether the
        # underlying LLM is Gemini or Ollama.
        #
        # The provider exposes the same generate_text() interface
        # expected by the interpreter.
        #
        # If no LLM provider can be created, interpreter is None.
        # The CoverageAnalysisService will then use its
        # deterministic fallback behaviour.
        # ---------------------------------------------------------

        interpreter = (
            CoverageInterpreter(
                llm_provider,
                model_name=None,
            )
            if llm_provider is not None
            else None
        )

        # ---------------------------------------------------------
        # Step 4: Inject the interpreter into Agent 3 service
        #
        # use_llm=True means the service is allowed to use the
        # interpreter when relevant evidence exists.
        #
        # The actual provider selection is handled by
        # CoverageLLMProvider.
        # ---------------------------------------------------------

        service = CoverageAnalysisService(
            interpreter=interpreter,
            use_llm=llm_provider is not None,
            llm_budget_seconds=settings.coverage_llm_budget_seconds,
        )

        # ---------------------------------------------------------
        # Step 5: Analyse the identified risks using the evidence
        # supplied by Agent 2.
        #
        # Agent 3 does NOT retrieve policy documents itself.
        # ---------------------------------------------------------

        result = service.analyse(
            risks=request.risks,
            evidence_results=request.evidence_results,
        )

        # ---------------------------------------------------------
        # Step 6: Record which LLM provider/model actually
        # succeeded.
        #
        # Example:
        #
        #     gemini:gemini-3.5-flash
        #
        # or:
        #
        #     ollama:qwen3:4b
        #
        # If both LLM providers fail, the provider has no
        # active_model and the service's deterministic fallback
        # remains responsible for the assessment.
        # ---------------------------------------------------------

        if (
            llm_provider is not None
            and llm_provider.active_model
        ):
            result.llm_model = (
                f"{llm_provider.active_provider}:"
                f"{llm_provider.active_model}"
            )

        # ---------------------------------------------------------
        # Step 7: Return the structured Agent 3 response
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
        # ---------------------------------------------------------
        # Log the complete exception internally.
        #
        # Do not expose internal implementation details,
        # API keys, provider errors, or stack traces to the
        # API caller.
        # ---------------------------------------------------------

        logger.exception(
            "Coverage analysis failed."
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Coverage analysis could not be completed."
            ),
        ) from None