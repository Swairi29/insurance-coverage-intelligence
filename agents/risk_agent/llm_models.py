"""What we accept from the LLM, and the limits we put on it.

The LLM may only say *which* taxonomy risk applies, *why*, and *how sure it is*.
It cannot choose a risk name or category (those come from the taxonomy) and it has
no field for insurance products or coverage. Anything else it returns is ignored.
"""

import re
from typing import Any, List

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Suggestions below this confidence are not used at all.
MIN_LLM_CONFIDENCE = 0.4

MAX_REASON_LENGTH = 400

# Words that would mean the LLM is talking about insurance products or coverage.
# This tool identifies business risks only, so such a reason is rejected.
_INSURANCE_TERMS = re.compile(
    r"\b(insur\w*|coverage|polic(?:y|ies)|premiums?|claims?|claimed|underwrit\w*|"
    r"indemnit\w*|deductibles?)\b",
    re.IGNORECASE,
)
_URL = re.compile(r"https?://|www\.", re.IGNORECASE)


class LLMRiskSuggestion(BaseModel):
    """One risk the LLM believes is likely for the business."""

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)  # extra fields are dropped

    risk_id: str
    reason: str = Field(min_length=10, max_length=MAX_REASON_LENGTH)
    confidence: float = Field(ge=0.0, le=1.0)

    @field_validator("risk_id", mode="before")
    @classmethod
    def _normalize_id(cls, value: Any) -> Any:
        return value.strip().upper() if isinstance(value, str) else value

    @field_validator("reason", mode="before")
    @classmethod
    def _tidy_reason(cls, value: Any) -> Any:
        if not isinstance(value, str):
            return value
        printable = "".join(ch for ch in value if ch.isprintable() or ch.isspace())
        return " ".join(printable.split())  # one line, single spaces

    @field_validator("reason")
    @classmethod
    def _reason_must_stay_on_topic(cls, value: str) -> str:
        if _INSURANCE_TERMS.search(value):
            raise ValueError("reason mentions insurance or coverage")
        if _URL.search(value):
            raise ValueError("reason contains a link")
        return value


class LLMResponse(BaseModel):
    """The JSON envelope we ask for: {"risks": [...]}.

    Items are kept raw here and validated one by one, so a single bad item does
    not throw away the good ones.
    """

    model_config = ConfigDict(extra="ignore")

    risks: List[Any]
