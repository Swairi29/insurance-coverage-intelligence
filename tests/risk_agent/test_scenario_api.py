from fastapi import FastAPI
from fastapi.testclient import TestClient

from agents.risk_agent.scenario_api import (
    router,
    get_scenario_service,
)
from agents.risk_agent.scenario_service import (
    ScenarioIdentificationResult,
)
from shared.models.scenario_risk import ScenarioRisk


class FakeScenarioService:
    def identify(self, scenario):
        return ScenarioIdentificationResult(
            risks=[
                ScenarioRisk(
                    risk_id="motorcycle_accident",
                    name="Motorcycle Accident",
                    category="motor",
                    description="Motorcycles may be involved in delivery accidents.",
                    reason="The business uses motorcycles for deliveries.",
                    confidence=0.9,
                )
            ],
            warnings=[],
            llm_used=True,
        )


app = FastAPI()
app.include_router(router)

app.dependency_overrides = {}


def test_scenario_endpoint(monkeypatch):
    monkeypatch.setattr(
        "agents.risk_agent.scenario_api.get_scenario_service",
        lambda: FakeScenarioService(),
    )

    client = TestClient(app)

    response = client.post(
        "/api/v1/scenario-risk-profile",
        json={
            "scenario": "We use motorcycles for deliveries."
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert len(data["risks"]) == 1
    assert data["risks"][0]["risk_id"] == "motorcycle_accident"
    assert data["llm_used"] is True


def test_empty_scenario_is_rejected():
    client = TestClient(app)

    response = client.post(
        "/api/v1/scenario-risk-profile",
        json={
            "scenario": ""
        },
    )

    assert response.status_code == 422


def test_short_scenario_is_rejected():
    client = TestClient(app)

    response = client.post(
        "/api/v1/scenario-risk-profile",
        json={
            "scenario": "Short"
        },
    )

    assert response.status_code == 422