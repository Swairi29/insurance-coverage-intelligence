import logging

from fastapi import APIRouter

from agents.risk_agent.scenario_llm import ScenarioRiskExtractor
from agents.risk_agent.scenario_service import ScenarioRiskService
from shared.config.settings import get_settings
from shared.llm.gemini_client import GeminiClient
from shared.llm.ollama_client import OllamaClient
from shared.schemas.requests import ScenarioRiskRequest
from shared.schemas.scenario_responses import ScenarioRiskResponse

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1",
    tags=["Scenario Risk Identification"],
)


def get_scenario_service() -> ScenarioRiskService:
    settings = get_settings()

    if settings.llm_provider == "ollama":
        client = OllamaClient(
            model=settings.ollama_model,
            host=settings.ollama_host,
        )
    else:
        client = GeminiClient(settings=settings)

    extractor = ScenarioRiskExtractor(client)
    return ScenarioRiskService(extractor)


@router.post(
    "/scenario-risk-profile",
    response_model=ScenarioRiskResponse,
)
def identify_scenario_risks(
    request: ScenarioRiskRequest,
) -> ScenarioRiskResponse:
    service = get_scenario_service()

    result = service.identify(request.scenario)

    return ScenarioRiskResponse(
        risks=result.risks,
        warnings=result.warnings,
        llm_used=result.llm_used,
    )