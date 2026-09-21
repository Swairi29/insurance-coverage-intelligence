"""Rule-based risk identification.

How it works, in plain steps:
1. Read the indicator tags (with evidence) that the profile supports (`features.py`).
2. Go through the taxonomy for this business type.
3. A risk is identified when at least one of its indicators is present. Every
   risk is identified at most once, so there are no duplicates.
4. A risk marked as "baseline" for this business type is also identified when no
   indicator matched, but with low confidence and a reason that says it is assumed.

There is no LLM here. The result is fully explainable: each risk carries a reason
and the evidence that triggered it.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence

from agents.risk_agent.features import FeatureMap, extract_features
from agents.risk_agent.taxonomy import ALL_TYPES, RISK_TAXONOMY, RiskDefinition
from shared.models.business import BusinessProfile, BusinessType
from shared.models.risk import Evidence, IdentifiedRisk, RiskSource
from shared.schemas.responses import ProfileWarning, WarningCode

# --- confidence scoring (0.0 - 1.0), kept simple and explainable ---------------
BASELINE_CONFIDENCE = 0.3  # assumed from the business type only
MATCH_CONFIDENCE_START = 0.6  # plus MATCH_CONFIDENCE_STEP for each matching indicator tag
MATCH_CONFIDENCE_STEP = 0.1
MAX_CONFIDENCE = 0.9

MAX_ITEMS_IN_REASON = 4


@dataclass(frozen=True)
class RuleResult:
    risks: List[IdentifiedRisk]  # highest confidence first; ties keep taxonomy order
    warnings: List[ProfileWarning]


def identify_risks(
    profile: BusinessProfile, taxonomy: Sequence[RiskDefinition] = RISK_TAXONOMY
) -> RuleResult:
    """Identify the risks that apply to `profile`.

    `taxonomy` can be replaced in tests to try a small custom list of risks.
    """
    business_type = _as_business_type(getattr(profile, "business_type", None))
    warnings: List[ProfileWarning] = []

    if business_type is None:
        # Unknown business type: we cannot assume anything about it. Report only
        # the general risks that apply to every business AND are backed by evidence.
        candidates = [r for r in taxonomy if r.applies_to >= ALL_TYPES]
        warnings.append(
            ProfileWarning(
                code=WarningCode.UNSUPPORTED_BUSINESS_TYPE,
                field="business_type",
                message="This business type is not supported yet, so only general risks "
                "backed by the details provided are reported.",
            )
        )
    else:
        candidates = [r for r in taxonomy if business_type in r.applies_to]

    features = extract_features(profile)

    found: Dict[str, IdentifiedRisk] = {}
    for definition in candidates:
        if definition.risk_id in found:  # never report the same risk twice
            continue
        risk = _evaluate(definition, features, business_type)
        if risk is not None:
            found[definition.risk_id] = risk

    # sorted() is stable, so equal confidences stay in taxonomy order.
    ordered = sorted(found.values(), key=lambda r: r.confidence, reverse=True)
    return RuleResult(risks=ordered, warnings=warnings)


def _as_business_type(value) -> Optional[BusinessType]:
    try:
        return BusinessType(value)
    except (ValueError, TypeError):
        return None


def _evaluate(
    definition: RiskDefinition, features: FeatureMap, business_type: Optional[BusinessType]
) -> Optional[IdentifiedRisk]:
    matched_tags = [tag for tag in definition.indicators if tag in features]

    if matched_tags:
        evidence = _collect_evidence(matched_tags, features)
        confidence = min(
            MAX_CONFIDENCE,
            round(MATCH_CONFIDENCE_START + MATCH_CONFIDENCE_STEP * len(matched_tags), 2),
        )
        reason = f"{definition.reason} (based on: {_join_values(evidence)})"
    elif business_type is not None and business_type in definition.baseline_for:
        evidence = []
        confidence = BASELINE_CONFIDENCE
        label = business_type.value.replace("_", " ")
        reason = (
            f"{definition.reason} (assumed for a {label}; no matching details were provided)"
        )
    else:
        return None

    return IdentifiedRisk(
        risk_id=definition.risk_id,
        name=definition.name,
        category=definition.category,
        reason=reason,
        source=RiskSource.RULE,
        confidence=confidence,
        evidence=evidence,
    )


def _collect_evidence(tags: List[str], features: FeatureMap) -> List[Evidence]:
    """Evidence for the matched tags, without repeats."""
    evidence: List[Evidence] = []
    for tag in tags:
        for item in features[tag]:
            if item not in evidence:
                evidence.append(item)
    return evidence


def _join_values(evidence: List[Evidence]) -> str:
    """'oven', 'oven and fridge', 'a, b and c', or 'a, b, c, d and 2 more'."""
    values: List[str] = []
    for item in evidence:
        if item.value.lower() not in (v.lower() for v in values):
            values.append(item.value)
    shown, extra = values[:MAX_ITEMS_IN_REASON], len(values) - MAX_ITEMS_IN_REASON
    if extra > 0:
        return f"{', '.join(shown)} and {extra} more"
    if len(shown) <= 1:
        return "".join(shown)
    return f"{', '.join(shown[:-1])} and {shown[-1]}"
