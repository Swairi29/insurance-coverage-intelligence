"""FastAPI endpoints for the Explanation & Recommendation Agent (Agent 4)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from agents.explanation_agent.llm import get_client
from agents.explanation_agent.service import ExplanationService
from shared.config.settings import get_settings
from shared.schemas.requests import ExplanationRequest
from shared.schemas.responses import ExplanationResponse
from shared.utils.security import require_internal_api_key

logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["Explanation & Recommendation"],
    dependencies=[Depends(require_internal_api_key)],
)


def get_explanation_service() -> ExplanationService:
    """Builds the service from settings; replaced with a fake in tests."""
    settings = get_settings()
    client, provider, model = get_client(settings)
    return ExplanationService(
        client=client,
        provider=provider,
        model=model,
        use_llm=settings.explanation_use_llm,
    )


@router.post("/api/v1/generate-report", response_model=ExplanationResponse)
def generate_report(
    request: ExplanationRequest,
    service: ExplanationService = Depends(get_explanation_service),
) -> ExplanationResponse:
    try:
        return service.generate(request)
    except Exception as exc:
        # Type only: details could contain policy text.
        logger.error("Report generation failed (%s).", type(exc).__name__)
        raise HTTPException(status_code=500, detail="Report generation could not be completed.") from None
