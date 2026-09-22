from typing import List

from pydantic import BaseModel, Field

from shared.models.scenario_risk import ScenarioRisk


class ScenarioRiskResponse(BaseModel):
    risks: List[ScenarioRisk] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    llm_used: bool = False