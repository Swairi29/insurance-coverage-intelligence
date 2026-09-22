import json

import pytest
from pydantic import ValidationError

from agents.risk_agent.scenario_llm import (
    ScenarioLLMError,
    ScenarioRiskExtractor,
    build_prompt,
    parse_response,
)


class FakeLLMClient:
    def __init__(self, response):
        self.response = response
        self.last_prompt = None

    def generate_text(
        self,
        prompt,
        *,
        system_instruction=None,
        json_output=False,
    ):
        self.last_prompt = prompt
        return self.response


def valid_risk():
    return {
        "risk_id": "motorcycle_accident",
        "name": "Motorcycle Accident",
        "category": "motor",
        "description": "Motorcycles may be involved in delivery accidents.",
        "reason": "The business uses motorcycles for deliveries.",
        "confidence": 0.9,
        "evidence": [
            {
                "text": "using motorcycles for deliveries",
                "source": "user_input",
            }
        ],
    }


def test_valid_response_is_parsed():
    response = json.dumps({"risks": [valid_risk()]})

    risks = parse_response(response)

    assert len(risks) == 1
    assert risks[0].risk_id == "motorcycle_accident"


def test_invalid_category_is_discarded():
    risk = valid_risk()
    risk["category"] = "invalid_category"

    response = json.dumps({"risks": [risk]})

    risks = parse_response(response)

    assert risks == []


def test_duplicate_risks_are_removed():
    risk = valid_risk()

    response = json.dumps({"risks": [risk, risk]})

    risks = parse_response(response)

    assert len(risks) == 1


def test_invalid_json_is_rejected():
    with pytest.raises(ScenarioLLMError):
        parse_response("not valid json")


def test_missing_risks_field_is_rejected():
    with pytest.raises(ScenarioLLMError):
        parse_response(json.dumps({"items": []}))


def test_extractor_calls_llm():
    response = json.dumps({"risks": [valid_risk()]})
    client = FakeLLMClient(response)

    extractor = ScenarioRiskExtractor(client)
    risks = extractor.extract(
        "We use motorcycles to deliver customer packages."
    )

    assert len(risks) == 1
    assert client.last_prompt is not None


def test_empty_scenario_is_rejected():
    client = FakeLLMClient("{}")
    extractor = ScenarioRiskExtractor(client)

    with pytest.raises(ScenarioLLMError):
        extractor.extract("")


def test_prompt_does_not_expose_email():
    prompt = build_prompt(
        "Contact me at test@example.com about my business."
    )

    assert "test@example.com" not in prompt
    assert "[email removed]" in prompt