"""Maps Agent 1 and Agent 3 responses into Agent 4's request.

For the orchestrator (`services/orchestration/`):

    request = build_explanation_request(risk_profile=agent1_response, coverage=agent3_response)
    POST /api/v1/generate-report  with  request.model_dump(mode="json")

The business name is deliberately dropped; Agent 4 only needs the business type.
"""

from __future__ import annotations

from shared.schemas.requests import ExplanationRequest
from shared.schemas.responses import CoverageAnalysisResponse, RiskProfileResponse


def build_explanation_request(
    *,
    risk_profile: RiskProfileResponse,
    coverage: CoverageAnalysisResponse,
) -> ExplanationRequest:
    return ExplanationRequest(
        # One request_id traces the run through every agent; Agent 3's is used
        # because it is the call Agent 4 directly follows.
        request_id=coverage.request_id,
        business_id=coverage.business_id,
        business_type=risk_profile.business_type,
        risks=risk_profile.risks,
        assessments=coverage.assessments,
    )
