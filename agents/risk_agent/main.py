"""FastAPI application for the Risk Profiling Agent."""

from fastapi import FastAPI

from agents.risk_agent.api import router
from agents.risk_agent.scenario_api import router as scenario_router

app = FastAPI(
    title="Risk Profiling Agent",
    version="1.0.0",
    description="Identifies potential business risks for SMEs.",
)

app.include_router(router)
app.include_router(scenario_router)


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "agent": "risk-profiling",
    }