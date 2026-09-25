"""Final report models produced by the Explanation & Recommendation Agent (Agent 4)."""

from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from shared.models.coverage import CoverageStatus
from shared.models.risk import RiskCategory

DISCLAIMER = (
    "This report is decision support only. It is based on the policy text that was "
    "analysed and identifies potential coverage gaps; it is not a legal or binding "
    "coverage decision. Confirm every finding with your insurer or insurance broker."
)


class GeneratedBy(str, Enum):
    LLM = "llm"
    TEMPLATE = "template"


class FindingPriority(str, Enum):
    HIGH = "high"  # not_found, excluded
    MEDIUM = "medium"  # unclear, conditional
    LOW = "low"  # covered


class EvidenceCitation(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    chunk_id: str = Field(min_length=1, max_length=80)
    policy_id: str = Field(min_length=1, max_length=64)
    section: Optional[str] = Field(default=None, max_length=200)
    page: int = Field(ge=1)
    excerpt: str = Field(min_length=1, max_length=400)  # trimmed clause text for display
    flagged: bool = False  # looked like a prompt-injection attempt


class Finding(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    risk_id: str = Field(min_length=1, max_length=40)
    risk_name: str = Field(min_length=1, max_length=100)
    category: Optional[RiskCategory] = None
    status: CoverageStatus  # copied from Agent 3, never changed
    potential_gap: bool  # copied from Agent 3, never changed
    priority: FindingPriority
    title: str = Field(min_length=1, max_length=150)
    explanation: str = Field(min_length=1, max_length=1200)
    recommendation: str = Field(min_length=1, max_length=600)
    evidence: List[EvidenceCitation] = Field(default_factory=list)
    verification_required: bool
    coverage_confidence: float = Field(ge=0.0, le=1.0)  # Agent 3's confidence
    generated_by: GeneratedBy


class ReportSummary(BaseModel):
    total_findings: int = Field(ge=0)
    potential_gaps: int = Field(ge=0)
    counts_by_status: Dict[str, int] = Field(default_factory=dict)
    headline: str = Field(min_length=1, max_length=400)  # template-generated, never LLM
