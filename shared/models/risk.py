# Business risk data model and risk taxonomy types (shared)
"""Output-side models describing a risk the Risk Profiling Agent identified.

Other agents (Policy, Coverage, Explanation) read these objects, so the field
names and enum values are a contract: change them only after agreeing with the
team. The risk taxonomy identifies *business risks only*; it says nothing about
insurance products or coverage.
"""

import re
from enum import Enum
from typing import List

from pydantic import BaseModel, ConfigDict, Field, field_validator


class RiskCategory(str, Enum):
    """Top-level groups of the risk taxonomy."""

    PROPERTY = "property"
    FIRE = "fire"
    EQUIPMENT = "equipment"
    EMPLOYEE = "employee"
    BUSINESS_INTERRUPTION = "business_interruption"
    LIABILITY = "liability"
    CYBER = "cyber"


class RiskSource(str, Enum):
    """How a risk was identified."""

    RULE = "rule"  # taxonomy rules and spaCy keyword matching
    LLM = "llm"  # suggested by Google GenAI
    RULE_AND_LLM = "rule+llm"  # found by rules and confirmed or reworded by the LLM


class Evidence(BaseModel):
    """One piece of input that led to a risk being identified."""

    model_config = ConfigDict(str_strip_whitespace=True)

    field: str = Field(min_length=1, max_length=60)  # e.g. "equipment"
    value: str = Field(min_length=1, max_length=200)  # e.g. "oven"


# Taxonomy IDs look like FIRE_COOKING or CYB_DATA_BREACH.
_RISK_ID_PATTERN = re.compile(r"^[A-Z]+(_[A-Z]+)+$")


class IdentifiedRisk(BaseModel):
    """A single potential business risk, with the reason it was identified."""

    # Trim text first, so a reason made only of spaces counts as empty and is rejected.
    model_config = ConfigDict(str_strip_whitespace=True)

    risk_id: str = Field(max_length=40)  # taxonomy ID, stable across versions
    name: str = Field(min_length=1, max_length=100)
    category: RiskCategory
    reason: str = Field(min_length=1, max_length=600)
    source: RiskSource
    # 0.0 - 1.0. Lowest for risks only assumed from the business type.
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: List[Evidence] = Field(default_factory=list)

    @field_validator("risk_id")
    @classmethod
    def _check_risk_id(cls, value: str) -> str:
        if not _RISK_ID_PATTERN.match(value):
            raise ValueError("risk_id must look like FIRE_COOKING (capital letters and underscores).")
        return value
