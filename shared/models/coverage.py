"""Coverage assessment models shared by Agent 3 and Agent 4."""

from enum import Enum
from typing import List

from pydantic import BaseModel, ConfigDict, Field

from shared.models.policy import EvidenceClause


class CoverageStatus(str, Enum):
    """Coverage status assigned by the Coverage & Gap Analysis Agent."""

    COVERED = "covered"
    EXCLUDED = "excluded"
    CONDITIONAL = "conditional"
    UNCLEAR = "unclear"
    NOT_FOUND = "not_found"


class AnalysisMethod(str, Enum):
    """How the coverage assessment was produced."""

    RULES = "rules"
    RULES_AND_LLM = "rules+llm"


class CoverageAssessment(BaseModel):
    """Coverage assessment for one identified business risk."""

    model_config = ConfigDict(str_strip_whitespace=True)

    risk_id: str = Field(min_length=1, max_length=40)
    risk_name: str = Field(min_length=1, max_length=100)

    status: CoverageStatus

    # True means the existing policy evidence does not clearly address
    # the risk in a satisfactory way.
    potential_gap: bool

    # Human-readable explanation grounded in retrieved evidence.
    reason: str = Field(min_length=1, max_length=1000)

    # Original evidence returned by Agent 2.
    evidence: List[EvidenceClause] = Field(default_factory=list)

    # Internal confidence of the classification.
    # This is NOT legal certainty.
    confidence: float = Field(ge=0.0, le=1.0)

    method: AnalysisMethod

    # Useful for Agent 4 and for audit/debugging.
    matched_signals: List[str] = Field(default_factory=list)