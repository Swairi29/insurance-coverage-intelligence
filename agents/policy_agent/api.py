# Agent 2 API endpoints (Member 2)
"""FastAPI endpoints for the Policy Intelligence Agent.

Both endpoints sit behind `require_internal_api_key`, so a request without a
valid `X-API-Key` header is rejected before either service runs.
"""

import logging
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from agents.policy_agent.service import (
    FileTooLargeError,
    InvalidPdfError,
    PolicyIngestionService,
    PolicyRetrievalService,
)
from shared.models.policy import PolicyStatus
from shared.schemas.requests import PolicyEvidenceRequest
from shared.schemas.responses import PolicyEvidenceResponse, PolicyUploadResponse
from shared.utils.security import require_internal_api_key

logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["Policy Intelligence"],
    dependencies=[Depends(require_internal_api_key)],
)


@router.post(
    "/api/v1/policies",
    response_model=PolicyUploadResponse,
)
async def upload_policy(
    business_id: str = Form(...),
    file: UploadFile = File(...),
) -> PolicyUploadResponse:
    """Validate, encrypt, store and chunk one uploaded policy PDF."""

    contents = await file.read()

    try:
        document = PolicyIngestionService().ingest(business_id, file.filename or "", contents)
    except InvalidPdfError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except FileTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from None
    except Exception:
        # Do not expose internal exception details to API clients.
        logger.exception("Unexpected error while ingesting a policy upload")
        raise HTTPException(
            status_code=500,
            detail="Policy upload could not be processed.",
        ) from None

    warnings: List[str] = []
    if document.status is PolicyStatus.FAILED:
        warnings.append("The document could not be processed; no chunks were indexed.")
    if document.flagged_chunk_count:
        warnings.append(
            f"{document.flagged_chunk_count} chunk(s) contained instruction-like "
            "phrasing and were flagged for review."
        )

    return PolicyUploadResponse(**document.model_dump(), warnings=warnings)


@router.post(
    "/api/v1/retrieve-policy-evidence",
    response_model=PolicyEvidenceResponse,
)
def retrieve_policy_evidence(request: PolicyEvidenceRequest) -> PolicyEvidenceResponse:
    """Find the policy evidence relevant to each requested risk."""

    try:
        results = PolicyRetrievalService().retrieve(
            business_id=request.business_id,
            policy_ids=request.policy_ids,
            risks=request.risks,
            top_k=request.top_k,
        )
    except Exception:
        logger.exception("Unexpected error while retrieving policy evidence")
        raise HTTPException(
            status_code=500,
            detail="Policy evidence retrieval could not be completed.",
        ) from None

    return PolicyEvidenceResponse(business_id=request.business_id, results=results)
