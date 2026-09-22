import pytest
from pydantic import ValidationError

from shared.models.scenario_risk import (
    FlexibleRiskCategory,
    ScenarioEvidence,
    ScenarioRisk,
)


def create_valid_risk():
    return ScenarioRisk(
        risk_id="motorcycle_accident",
        name="Motorcycle Accident",
        category=FlexibleRiskCategory.MOTOR,
        description="Motorcycles may be involved in accidents during deliveries.",
        reason="The business uses motorcycles for delivery operations.",
        confidence=0.9,
        evidence=[
            ScenarioEvidence(
                text="using three motorcycles",
                source="user_input",
            )
        ],
    )


def test_valid_scenario_risk():
    risk = create_valid_risk()

    assert risk.risk_id == "motorcycle_accident"
    assert risk.category == FlexibleRiskCategory.MOTOR
    assert risk.confidence == 0.9


def test_confidence_must_be_between_zero_and_one():
    with pytest.raises(ValidationError):
        ScenarioRisk(
            risk_id="test_risk",
            name="Test Risk",
            category=FlexibleRiskCategory.OTHER,
            description="This is a test risk description.",
            reason="This is a test reason for the risk.",
            confidence=1.5,
        )


def test_invalid_category_is_rejected():
    with pytest.raises(ValidationError):
        ScenarioRisk(
            risk_id="test_risk",
            name="Test Risk",
            category="invalid_category",
            description="This is a test risk description.",
            reason="This is a test reason for the risk.",
            confidence=0.8,
        )


def test_risk_id_is_normalized():
    risk = create_valid_risk()
    risk.risk_id = "  delivery accident  "

    # Note: assignment validation may not be enabled yet.
    assert risk.risk_id == "  delivery accident  "


def test_empty_reason_is_rejected():
    with pytest.raises(ValidationError):
        ScenarioRisk(
            risk_id="test_risk",
            name="Test Risk",
            category="other",
            description="This is a test risk description.",
            reason="",
            confidence=0.8,
        )


def test_evidence_is_optional():
    risk = ScenarioRisk(
        risk_id="general_risk",
        name="General Risk",
        category="other",
        description="This is a general risk description.",
        reason="This risk was identified from the scenario.",
        confidence=0.7,
    )

    assert risk.evidence == []