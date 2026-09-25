# Agent 3 service entry point - Coverage & Gap Analysis Agent, port 8003 (Member 3)


"""FastAPI application for the Coverage & Gap Analysis Agent."""

from fastapi import FastAPI

from agents.coverage_agent.api import router


app = FastAPI(
    title="Coverage & Gap Analysis Agent",
    version="1.0.0",
    description=(
        "Analyses retrieved insurance policy evidence "
        "against identified business risks."
    ),
)


app.include_router(router)


@app.get("/health")
def health_check():

    return {
        "status": "healthy",
        "agent": "coverage-gap-analysis",
    }