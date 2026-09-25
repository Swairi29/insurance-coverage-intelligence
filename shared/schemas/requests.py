# Request schemas for all agent API endpoints (shared)
"""Request bodies sent to the agents' HTTP endpoints.

Each agent adds its own request class here. Only the Risk Profiling request
exists so far.
"""

import re
from typing import List, Optional
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator

from shared.models.business import BusinessProfile, BusinessType
from shared.models.business import FlexibleScenario
from shared.models.risk import IdentifiedRisk

from shared.models.coverage import CoverageAssessment
from shared.models.policy import RiskEvidenceResult
from shared.models.risk import IdentifiedRisk



_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9_\-]+$")


def _new_request_id() -> str:
    return str(uuid4())

class FlexibleRiskProfileRequest(BaseModel):
    """Request body for free-text insurance scenario analysis."""

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True
    )

    request_id: str = Field(
        default_factory=_new_request_id,
        min_length=1,
        max_length=64
    )

    scenario: FlexibleScenario

class RiskProfileRequest(BaseModel):
    """Body of `POST /api/v1/risk-profile` (Risk Profiling Agent)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    # Used to trace one request through several agents and the logs.
    # Generated automatically when the caller does not send one.
    request_id: str = Field(default_factory=_new_request_id, min_length=1, max_length=64)
    business: BusinessProfile

    @field_validator("request_id", mode="before")
    @classmethod
    def _null_means_generate(cls, value: Optional[str]):
        return _new_request_id() if value is None else value

    @field_validator("request_id")
    @classmethod
    def _check_request_id(cls, value: str) -> str:
        # Letters, digits, "-" and "_" only, because the ID is written to logs.
        if not _REQUEST_ID_PATTERN.match(value):
            raise ValueError("request_id may only contain letters, digits, '-' and '_'.")
        return value

from pydantic import BaseModel, Field


class ScenarioRiskRequest(BaseModel):
    scenario: str = Field(
        ...,
        min_length=10,
        max_length=4000,
    )


class PolicyEvidenceRequest(BaseModel):
    """Body of `POST /api/v1/retrieve-policy-evidence` (Policy Intelligence Agent)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    business_id: str = Field(min_length=1, max_length=64)
    # Matches the plan's "5 policies per analysis" limit.
    policy_ids: List[str] = Field(min_length=1, max_length=5)
    risks: List[IdentifiedRisk] = Field(min_length=1, max_length=50)
    top_k: Optional[int] = Field(default=None, ge=1, le=50)




#Agent 3


class CoverageAnalysisRequest(BaseModel):
    """Body of POST /api/v1/analyse-coverage."""

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    request_id: str = Field(
        default_factory=_new_request_id,
        min_length=1,
        max_length=64,
    )

    business_id: str = Field(
        min_length=1,
        max_length=64,
    )

    # Risks produced by Agent 1.
    risks: List[IdentifiedRisk] = Field(
        min_length=1,
        max_length=50,
    )

    # Evidence produced by Agent 2.
    evidence_results: List[RiskEvidenceResult] = Field(
        default_factory=list,
        max_length=50,
    )

    @field_validator("request_id")
    @classmethod
    def _check_request_id(cls, value: str) -> str:
        if not _REQUEST_ID_PATTERN.match(value):
            raise ValueError(
                "request_id may only contain letters, digits, '-' and '_'."
            )
        return value

    @field_validator("risks")
    @classmethod
    def _unique_risks(cls, risks: List[IdentifiedRisk]):
        ids = [risk.risk_id for risk in risks]

        if len(ids) != len(set(ids)):
            raise ValueError("risks must not contain duplicate risk_id values.")

        return risks

    @field_validator("evidence_results")
    @classmethod
    def _unique_evidence_results(
        cls,
        results: List[RiskEvidenceResult],
    ):
        ids = [result.risk_id for result in results]

        if len(ids) != len(set(ids)):
            raise ValueError(
                "evidence_results must not contain duplicate risk_id values."
            )

        return results


# --- Explanation & Recommendation (Agent 4) ---


class ExplanationRequest(BaseModel):
    """Body of `POST /api/v1/generate-report`."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    request_id: str = Field(default_factory=_new_request_id, min_length=1, max_length=64)
    business_id: str = Field(min_length=1, max_length=64)
    # The business name is deliberately not sent to Agent 4.
    business_type: Optional[BusinessType] = None
    risks: List[IdentifiedRisk] = Field(default_factory=list, max_length=50)  # from Agent 1
    assessments: List[CoverageAssessment] = Field(default_factory=list, max_length=50)  # from Agent 3

    @field_validator("request_id", mode="before")
    @classmethod
    def _null_means_generate(cls, value: Optional[str]):
        return _new_request_id() if value is None else value

    @field_validator("request_id")
    @classmethod
    def _check_request_id(cls, value: str) -> str:
        if not _REQUEST_ID_PATTERN.match(value):
            raise ValueError("request_id may only contain letters, digits, '-' and '_'.")
        return value

    @field_validator("risks")
    @classmethod
    def _unique_risks(cls, risks: List[IdentifiedRisk]):
        ids = [risk.risk_id for risk in risks]
        if len(ids) != len(set(ids)):
            raise ValueError("risks must not contain duplicate risk_id values.")
        return risks

    @field_validator("assessments")
    @classmethod
    def _unique_assessments(cls, assessments: List[CoverageAssessment]):
        ids = [assessment.risk_id for assessment in assessments]
        if len(ids) != len(set(ids)):
            raise ValueError("assessments must not contain duplicate risk_id values.")
        return assessments
