from enum import Enum
from typing import List

from pydantic import BaseModel, Field, field_validator


class FlexibleRiskCategory(str, Enum):
    PROPERTY = "property"
    LIABILITY = "liability"
    MOTOR = "motor"
    HEALTH = "health"
    TRAVEL = "travel"
    CYBER = "cyber"
    MARINE = "marine"
    BUSINESS = "business"
    PERSONAL_ACCIDENT = "personal_accident"
    OTHER = "other"


class ScenarioEvidence(BaseModel):
    text: str = Field(
        ...,
        min_length=1,
        max_length=300
    )

    source: str = Field(
        ...,
        min_length=1,
        max_length=100
    )


class ScenarioRisk(BaseModel):
    risk_id: str = Field(
        ...,
        min_length=3,
        max_length=100
    )

    name: str = Field(
        ...,
        min_length=3,
        max_length=150
    )

    category: FlexibleRiskCategory

    description: str = Field(
        ...,
        min_length=10,
        max_length=500
    )

    reason: str = Field(
        ...,
        min_length=10,
        max_length=500
    )

    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0
    )

    evidence: List[ScenarioEvidence] = Field(
        default_factory=list,
        max_length=5
    )

    @field_validator("risk_id")
    @classmethod
    def validate_risk_id(cls, value: str) -> str:
        cleaned = value.strip().lower().replace(" ", "_")

        if not cleaned.replace("_", "").isalnum():
            raise ValueError("risk_id contains invalid characters")

        return cleaned

    @field_validator("name", "description", "reason")
    @classmethod
    def clean_text(cls, value: str) -> str:
        cleaned = value.strip()

        if not cleaned:
            raise ValueError("Text cannot be empty")

        return cleaned