"""FastAPI application for the Explanation & Recommendation Agent (Agent 4, port 8004).

Run: uvicorn agents.explanation_agent.main:app --port 8004 --reload
"""

import logging
import os

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from agents.explanation_agent.api import router
from shared.schemas.responses import ErrorResponse


def _configure_logging() -> None:
    """Show Agent 4's own logs (counts, timings, validator codes) under uvicorn.

    Uvicorn only configures its own loggers, so without this our INFO lines -
    e.g. "LLM items rejected or missing: EQP_BREAKDOWN: V4" - are hidden.
    The logs never contain prompts, clause text or LLM output.
    """
    logger = logging.getLogger("agents.explanation_agent")
    if logger.handlers:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(handler)
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    logger.setLevel(level if level in logging.getLevelNamesMapping() else "INFO")


_configure_logging()

app = FastAPI(
    title="Explanation & Recommendation Agent",
    version="1.0.0",
    description="Explains coverage findings in plain English and recommends next steps.",
)

app.include_router(router)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # FastAPI's default 422 body echoes the caller's input (which may be policy
    # text); the shared ErrorResponse keeps only field paths and messages.
    body = ErrorResponse.from_validation_errors(exc.errors())
    return JSONResponse(status_code=422, content=body.model_dump())


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "agent": "explanation-recommendation",
    }
