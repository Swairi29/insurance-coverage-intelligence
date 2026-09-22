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

    def identify(
        self,
        scenario: str,
    ) -> ScenarioIdentificationResult:

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

        except ScenarioLLMError as error:
            logger.exception("Scenario LLM error: %s", error)

            return ScenarioIdentificationResult(
                risks=[],
                warnings=[
                    f"LLM processing error: {str(error)}"
                ],
                llm_used=False,
            )

        except Exception as error:
            logger.exception(
                "Unexpected scenario service error: %s",
                error,
            )

            return ScenarioIdentificationResult(
                risks=[],
                warnings=[
                    f"{type(error).__name__}: {str(error)}"
                ],
                llm_used=False,
            )