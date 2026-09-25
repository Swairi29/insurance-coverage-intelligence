"""FastAPI application for the Explanation & Recommendation Agent (Agent 4, port 8004).

Run: uvicorn agents.explanation_agent.main:app --port 8004 --reload
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from agents.explanation_agent.api import router
from shared.schemas.responses import ErrorResponse

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
