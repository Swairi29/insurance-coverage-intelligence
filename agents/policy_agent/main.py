# Agent 2 service entry point - Policy Intelligence Agent, port 8002 (Member 2)
"""FastAPI application for the Policy Intelligence Agent."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from agents.policy_agent.api import router
from agents.policy_agent.service import load_index_from_disk
from shared.schemas.responses import ErrorResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Reload chunks from any previous run, so a restart doesn't lose access
    # to already-uploaded policies (the files on disk are the durable record).
    load_index_from_disk()
    yield


app = FastAPI(
    title="Policy Intelligence Agent",
    version="1.0.0",
    description="Retrieves the policy clauses relevant to each identified business risk.",
    lifespan=lifespan,
)

app.include_router(router)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # FastAPI's default 422 body echoes the caller's input (which may be a
    # business_id or policy text); the shared ErrorResponse keeps only field
    # paths and messages.
    body = ErrorResponse.from_validation_errors(exc.errors())
    return JSONResponse(status_code=422, content=body.model_dump())


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "agent": "policy-intelligence",
    }
