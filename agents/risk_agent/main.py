# Agent 1 service entry point - Risk Profiling Agent, port 8001 (Member 1)
"""FastAPI application for the Risk Profiling Agent."""

from fastapi import FastAPI

from agents.risk_agent.api import router

app = FastAPI(
    title="Risk Profiling Agent",
    version="1.0.0",
    description="Identifies potential business risks for SMEs.",
)

app.include_router(router)


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "agent": "risk-profiling",
    }