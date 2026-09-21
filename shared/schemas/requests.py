# Request schemas for all agent API endpoints (shared)
"""Request bodies sent to the agents' HTTP endpoints.

Each agent adds its own request class here. Only the Risk Profiling request
exists so far.
"""

import re
from typing import Optional
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator

from shared.models.business import BusinessProfile

_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9_\-]+$")


def _new_request_id() -> str:
    return str(uuid4())


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
