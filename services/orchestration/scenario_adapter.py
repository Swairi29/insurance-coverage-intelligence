"""Translate flexible scenario risks to the established Agent 2 risk contract."""

import re

from shared.models.risk import Evidence, IdentifiedRisk, RiskCategory, RiskSource
from shared.models.scenario_risk import ScenarioRisk


_CATEGORY_MAP = {
    "property": RiskCategory.PROPERTY,
    "liability": RiskCategory.LIABILITY,
    "cyber": RiskCategory.CYBER,
}


class ScenarioRiskMappingError(ValueError):
    pass


def adapt_scenario_risks(risks: list[ScenarioRisk], *, llm_used: bool) -> list[IdentifiedRisk]:
    """Preserve scenario details while normalizing IDs and known category equivalents.

    Ambiguous categories fail closed rather than being assigned an invented taxonomy.
    Only categories with the same meaning in both contracts are mapped. The
    remaining flexible categories have no safe equivalent in Agent 2's taxonomy.
    """
    adapted = []
    for risk in risks:
        category = _CATEGORY_MAP.get(risk.category.value)
        if category is None:
            raise ScenarioRiskMappingError(f"No safe Agent 2 category mapping for {risk.category.value}.")
        risk_id = re.sub(r"[^A-Za-z0-9]+", "_", risk.risk_id).strip("_").upper()
        adapted.append(IdentifiedRisk(
            risk_id=risk_id,
            name=risk.name,
            category=category,
            reason=risk.reason,
            source=RiskSource.LLM if llm_used else RiskSource.RULE,
            confidence=risk.confidence,
            evidence=[Evidence(field=item.source, value=item.text) for item in risk.evidence],
        ))
    return adapted
