# Agent 2 service entry point - Policy Intelligence Agent, port 8002 (Member 2)
"""FastAPI application for the Policy Intelligence Agent."""

from fastapi import FastAPI

from agents.policy_agent.api import router

app = FastAPI(
    title="Policy Intelligence Agent",
    version="1.0.0",
    description="Retrieves the policy clauses relevant to each identified business risk.",
)

app.include_router(router)


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "agent": "policy-intelligence",
    }
