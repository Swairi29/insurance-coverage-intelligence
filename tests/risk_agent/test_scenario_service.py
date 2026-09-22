import json

from agents.risk_agent.scenario_llm import ScenarioLLMError
from agents.risk_agent.scenario_service import ScenarioRiskService
from shared.models.scenario_risk import ScenarioRisk


class FakeExtractor:
    def __init__(self, risks=None, error=None):
        self.risks = risks or []
        self.error = error

    def extract(self, scenario):
        if self.error:
            raise self.error
        return self.risks


def create_risk():
    return ScenarioRisk(
        risk_id="motorcycle_accident",
        name="Motorcycle Accident",
        category="motor",
        description="Motorcycles may be involved in delivery accidents.",
        reason="The business uses motorcycles for deliveries.",
        confidence=0.9,
    )


def test_service_returns_identified_risks():
    extractor = FakeExtractor(risks=[create_risk()])
    service = ScenarioRiskService(extractor)

    result = service.identify(
        "We use motorcycles for deliveries."
    )

    assert len(result.risks) == 1
    assert result.risks[0].risk_id == "motorcycle_accident"
    assert result.llm_used is True
    assert result.warnings == []


def test_service_handles_llm_error():
    extractor = FakeExtractor(
        error=ScenarioLLMError("Test error")
    )
    service = ScenarioRiskService(extractor)

    result = service.identify(
        "We operate a delivery business."
    )

    assert result.risks == []
    assert result.llm_used is False
    assert len(result.warnings) == 1


def test_service_handles_unexpected_error():
    extractor = FakeExtractor(
        error=RuntimeError("Unexpected error")
    )
    service = ScenarioRiskService(extractor)

    result = service.identify(
        "We operate a delivery business."
    )

    assert result.risks == []
    assert result.llm_used is False
    assert len(result.warnings) == 1


def test_empty_scenario_is_handled():
    extractor = FakeExtractor()
    service = ScenarioRiskService(extractor)

    result = service.identify("")

    assert result.risks == []
    assert result.llm_used is False
    assert result.warnings == ["Scenario must not be empty."]


def test_whitespace_scenario_is_handled():
    extractor = FakeExtractor()
    service = ScenarioRiskService(extractor)

    result = service.identify("   ")

    assert result.risks == []
    assert result.llm_used is False


def test_service_supports_multiple_risks():
    risks = [
        create_risk(),
        ScenarioRisk(
            risk_id="customer_data_breach",
            name="Customer Data Breach",
            category="cyber",
            description="Customer data may be exposed through cyber incidents.",
            reason="The business stores customer information.",
            confidence=0.85,
        ),
    ]

    extractor = FakeExtractor(risks=risks)
    service = ScenarioRiskService(extractor)

    result = service.identify(
        "We deliver products and store customer information."
    )

    assert len(result.risks) == 2