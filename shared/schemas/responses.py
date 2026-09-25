# Response schemas for all agent API endpoints (shared)
"""Response bodies returned by the agents' HTTP endpoints.

Each agent adds its own response class here. The Risk Profiling response and the
common validation-error response exist so far.
"""

import re
from datetime import datetime
from enum import Enum
from typing import Any, Iterable, List, Mapping, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from shared.models.analysis import Finding, ReportSummary
from shared.models.business import BusinessType
from shared.models.policy import PolicyDocument, RiskEvidenceResult
from shared.models.risk import IdentifiedRisk

from shared.models.coverage import CoverageAssessment


# Version of the response format. Bump it when a field changes, so consumers can react.
SCHEMA_VERSION = "1.0"


class ProfileStatus(str, Enum):
    COMPLETE = "complete"  # enough input was given for a full assessment
    PARTIAL = "partial"  # some optional input was missing; see `warnings`


class WarningCode(str, Enum):
    MISSING_FIELD = "missing_field"  # an optional field was not provided
    LIMITED_INPUT = "limited_input"  # very little detail; risks are mostly assumed from business type
    LLM_UNAVAILABLE = "llm_unavailable"  # the LLM could not be used; result is rule-based only
    UNSUPPORTED_BUSINESS_TYPE = "unsupported_business_type"  # only general risks were checked


class ProfileWarning(BaseModel):
    """A non-fatal note about the result (the request itself was valid)."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: WarningCode
    field: Optional[str] = Field(default=None, max_length=100)
    message: str = Field(min_length=1, max_length=300)


class ProfileMetadata(BaseModel):
    taxonomy_version: str = Field(min_length=1, max_length=20)
    llm_used: bool
    llm_model: Optional[str] = Field(default=None, max_length=100)
    processing_ms: Optional[int] = Field(default=None, ge=0)


class RiskProfileResponse(BaseModel):
    """Result of a successful (HTTP 200) risk profiling request."""

    schema_version: str = SCHEMA_VERSION
    request_id: str
    status: ProfileStatus
    business_name: str
    business_type: BusinessType
    risks: List[IdentifiedRisk] = Field(default_factory=list)
    warnings: List[ProfileWarning] = Field(default_factory=list)
    metadata: ProfileMetadata

    @model_validator(mode="after")
    def _risk_ids_are_unique(self) -> "RiskProfileResponse":
        ids = [risk.risk_id for risk in self.risks]
        if len(ids) != len(set(ids)):
            raise ValueError("risks must not contain the same risk_id twice.")
        return self


# --- validation errors (HTTP 422) ----------------------------------------------

_MAX_ERROR_DETAILS = 20
_MAX_MESSAGE_LENGTH = 200
_SAFE_FIELD_PART = re.compile(r"^[A-Za-z0-9_\-]{1,60}$")


class ValidationErrorDetail(BaseModel):
    field: str  # e.g. "business.employee_count"
    message: str  # e.g. "Input should be greater than or equal to 0"


class ErrorResponse(BaseModel):
    """Returned when the request is invalid. Never contains the caller's input values."""

    error: str = "validation_error"
    message: str = "The request could not be processed because some input was invalid."
    details: List[ValidationErrorDetail] = Field(default_factory=list)

    @classmethod
    def from_validation_errors(cls, errors: Iterable[Mapping[str, Any]]) -> "ErrorResponse":
        """Build a safe error response from Pydantic or FastAPI validation errors.

        `errors` is what `ValidationError.errors()` (or FastAPI's
        `RequestValidationError.errors()`) returns. Only the field path and a
        short message are kept. The raw `input` value and `ctx` are dropped, so
        secrets or personal data sent by the caller are never echoed back.
        """
        details = [
            ValidationErrorDetail(field=_safe_field(err.get("loc", ())), message=_safe_message(err))
            for err in list(errors)[:_MAX_ERROR_DETAILS]
        ]
        return cls(details=details)


def _safe_field(loc: Iterable[Any]) -> str:
    """Turn ("body", "business", "equipment", 0) into "business.equipment.0"."""
    parts = list(loc)
    if parts and parts[0] == "body":  # FastAPI adds this; callers don't need it
        parts = parts[1:]
    safe_parts = []
    for part in parts:
        text = str(part)
        # Caller-chosen names (e.g. unknown extra fields) are shown only if harmless.
        safe_parts.append(text if _SAFE_FIELD_PART.match(text) else "?")
    return ".".join(safe_parts) or "request"


def _safe_message(err: Mapping[str, Any]) -> str:
    message = str(err.get("msg") or "Invalid value.")
    message = message.removeprefix("Value error, ")  # Pydantic prefixes our own validator messages
    return message[:_MAX_MESSAGE_LENGTH]


# --- Policy Intelligence (Agent 2) ----------------------------------------------------

class PolicyUploadResponse(PolicyDocument):
    """Result of `POST /api/v1/policies`: the stored document plus any warnings."""

    warnings: List[str] = Field(default_factory=list)


class PolicyEvidenceResponse(BaseModel):
    """Result of `POST /api/v1/retrieve-policy-evidence`."""

    business_id: str = Field(min_length=1, max_length=64)
    results: List[RiskEvidenceResult] = Field(default_factory=list)




# --- Coverage % Gap detection (Agent 3) ----------------------------------------------------


class CoverageMetadata(BaseModel):
    """Metadata about Agent 3 processing."""

    llm_used: bool
    llm_model: Optional[str] = None
    processing_ms: Optional[int] = Field(default=None, ge=0)


class CoverageAnalysisResponse(BaseModel):
    """Result returned by Agent 3."""

    schema_version: str = SCHEMA_VERSION

    request_id: str
    business_id: str

    assessments: List[CoverageAssessment] = Field(
        default_factory=list
    )

    warnings: List[str] = Field(
        default_factory=list
    )

    metadata: CoverageMetadata


# --- Explanation & Recommendation (Agent 4) ---


class ExplanationMetadata(BaseModel):
    llm_used: bool
    llm_provider: Optional[str] = None  # "ollama" | "gemini"
    llm_model: Optional[str] = None
    llm_findings: int = Field(ge=0)
    template_findings: int = Field(ge=0)
    processing_ms: Optional[int] = Field(default=None, ge=0)


class ExplanationResponse(BaseModel):
    """Result of `POST /api/v1/generate-report`."""

    schema_version: str = SCHEMA_VERSION
    request_id: str
    business_id: str
    generated_at: datetime
    summary: ReportSummary
    findings: List[Finding] = Field(default_factory=list)
    disclaimer: str
    warnings: List[str] = Field(default_factory=list)
    metadata: ExplanationMetadata
