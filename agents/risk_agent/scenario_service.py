"""Service for identifying risks from free-text scenarios."""

import logging
from typing import List

from agents.risk_agent.scenario_llm import (
    ScenarioLLMError,
    ScenarioRiskExtractor,
)
from shared.models.scenario_risk import ScenarioRisk

logger = logging.getLogger(__name__)


class ScenarioIdentificationResult:
    def __init__(
        self,
        risks: List[ScenarioRisk],
        warnings: List[str],
        llm_used: bool,
    ):
        self.risks = risks
        self.warnings = warnings
        self.llm_used = llm_used


class ScenarioRiskService:
    """Identify risks from an unrestricted text scenario."""

    def __init__(self, extractor: ScenarioRiskExtractor):
        self._extractor = extractor

    def identify(self, scenario: str) -> ScenarioIdentificationResult:
        if not isinstance(scenario, str) or not scenario.strip():
            return ScenarioIdentificationResult(
                risks=[],
                warnings=["Scenario must not be empty."],
                llm_used=False,
            )

        try:
            risks = self._extractor.extract(scenario)

            return ScenarioIdentificationResult(
                risks=risks,
                warnings=[],
                llm_used=True,
            )

        except ScenarioLLMError:
            logger.warning("Scenario risk identification failed")

            return ScenarioIdentificationResult(
                risks=[],
                warnings=[
                    "Risk identification could not be completed."
                ],
                llm_used=False,
            )

        except Exception:
            logger.exception("Unexpected scenario service failure")

            return ScenarioIdentificationResult(
                risks=[],
                warnings=[
                    "An unexpected error occurred during risk identification."
                ],
                llm_used=False,
            )