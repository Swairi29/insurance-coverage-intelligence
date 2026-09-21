"""Combine rule-based risks with the LLM's suggestions.

Rules of the merge:
- Every risk appears once (by `risk_id`).
- Rule results are the trusted base and are never removed.
- If the LLM agrees with a rule result, it is marked `rule+llm`, gets a small
  confidence bonus, and takes the LLM's business-specific reason. The evidence
  found by the rules is kept.
- If only the LLM found it, it is added as `llm` with a capped confidence and no
  evidence. Its name and category always come from the taxonomy, never from the LLM.
- LLM suggestions that are unknown or below the minimum confidence are ignored.
"""

from typing import Dict, List, Sequence

from agents.risk_agent.llm_models import MIN_LLM_CONFIDENCE, LLMRiskSuggestion
from agents.risk_agent.taxonomy import RiskDefinition
from shared.models.risk import IdentifiedRisk, RiskSource

AGREEMENT_BONUS = 0.1  # rule and LLM agree
MAX_AGREED_CONFIDENCE = 0.95
LLM_ONLY_MAX_CONFIDENCE = 0.6  # the LLM alone never outranks a rule match (0.7 and up)


def merge_risks(
    rule_risks: Sequence[IdentifiedRisk],
    suggestions: Sequence[LLMRiskSuggestion],
    definitions: Sequence[RiskDefinition],
) -> List[IdentifiedRisk]:
    """Return one list of unique risks, highest confidence first (ties: taxonomy order)."""
    known = {d.risk_id: d for d in definitions}
    merged: Dict[str, IdentifiedRisk] = {}

    for risk in rule_risks:
        merged.setdefault(risk.risk_id, risk)

    seen: set = set()
    for suggestion in suggestions:
        if suggestion.risk_id in seen or suggestion.confidence < MIN_LLM_CONFIDENCE:
            continue
        seen.add(suggestion.risk_id)

        definition = known.get(suggestion.risk_id)
        if definition is None:
            continue  # not in the taxonomy for this business: ignore

        existing = merged.get(suggestion.risk_id)
        if existing is not None:
            merged[suggestion.risk_id] = IdentifiedRisk.model_validate(
                {
                    **existing.model_dump(),
                    "source": RiskSource.RULE_AND_LLM,
                    "reason": suggestion.reason,
                    "confidence": min(
                        MAX_AGREED_CONFIDENCE, round(existing.confidence + AGREEMENT_BONUS, 2)
                    ),
                }
            )
        else:
            merged[suggestion.risk_id] = IdentifiedRisk(
                risk_id=definition.risk_id,
                name=definition.name,
                category=definition.category,
                reason=suggestion.reason,
                source=RiskSource.LLM,
                confidence=min(suggestion.confidence, LLM_ONLY_MAX_CONFIDENCE),
                evidence=[],
            )

    order = {d.risk_id: i for i, d in enumerate(definitions)}
    return sorted(merged.values(), key=lambda r: (-r.confidence, order.get(r.risk_id, len(order))))
