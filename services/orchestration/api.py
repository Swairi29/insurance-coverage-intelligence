# Orchestration gateway API consumed by the frontend
"""The gateway the frontend talks to (port 8000).

Run: uvicorn services.orchestration.api:app --port 8000 --reload

The frontend logs in here and gets a JWT; only the gateway knows
`INTERNAL_API_KEY` and the agents' URLs. The business_id always comes from the
logged-in user, never from the request body.

Error bodies:
- 401 (auth): `{"detail": "..."}`
- 422 (invalid body): `ErrorResponse`, without the caller's input values
- agent failures and other gateway errors: `GatewayError`
"""

from __future__ import annotations

import logging
import sqlite3
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from functools import lru_cache
from typing import List

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from services.orchestration.auth import (
    AuthConfigError,
    LoginLimiter,
    QuestionLimiter,
    authenticate,
    create_access_token,
    get_current_user,
    get_login_limiter,
    get_question_limiter,
    register_user,
)
from services.orchestration.database import Database, DuplicateEmailError, UserRecord, get_database
from services.orchestration.jobs import JobStore, get_job_store, progress_from_analysis
from services.orchestration.pipeline import AgentCallError, AnalysisPipeline, ErrorKind, PipelineResult
from shared.config.settings import get_settings
from shared.models.policy import PolicyDocument
from shared.schemas.requests import AnalysisRequest, AskQuestionRequest, LoginRequest, RegisterRequest
from shared.schemas.responses import (
    AnalysisProgress,
    AnalysisResponse,
    AnalysisStatus,
    AnalysisSummary,
    ErrorResponse,
    GatewayError,
    PolicyUploadResponse,
    QuestionAnswerResponse,
    RunState,
    TokenResponse,
    UserResponse,
)
from shared.utils.security import SecurityConfigError, decrypt_bytes, encrypt_bytes

logger = logging.getLogger(__name__)

NOT_SAVED_WARNING = "This analysis could not be saved to your history."
ANALYSIS_FAILED_MESSAGE = "The analysis could not be completed. Please try again."

_AGENT_ERRORS = {
    ErrorKind.UNAVAILABLE: (503, "A required analysis service is not available. Please try again later."),
    ErrorKind.TIMEOUT: (504, "An analysis service took too long to respond. Please try again."),
    ErrorKind.REJECTED: (502, "An analysis service could not complete the request."),
    ErrorKind.FAILED: (502, "An analysis service could not complete the request."),
    ErrorKind.BAD_RESPONSE: (502, "An analysis service could not complete the request."),
}


# --- dependencies ------------------------------------------------------------------------


@lru_cache
def _http_client() -> httpx.Client:
    return httpx.Client()


def get_pipeline() -> AnalysisPipeline:
    """Builds the pipeline from settings; replaced with a fake in tests."""
    return AnalysisPipeline.from_settings(get_settings(), _http_client())


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    if _http_client.cache_info().currsize:
        _http_client().close()
        _http_client.cache_clear()


app = FastAPI(
    title="Orchestration Gateway",
    version="1.0.0",
    description="Runs the four agents in order and serves the frontend.",
    lifespan=lifespan,
)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # The default 422 body echoes the input (business details, passwords).
    body = ErrorResponse.from_validation_errors(exc.errors())
    return JSONResponse(status_code=422, content=body.model_dump())


def _new_request_id() -> str:
    return uuid.uuid4().hex


def _error(status_code: int, error: str, message: str, *, stage: str | None = None,
           request_id: str | None = None) -> JSONResponse:
    body = GatewayError(error=error, message=message, stage=stage, request_id=request_id)
    headers = {"X-Request-ID": request_id} if request_id else None
    return JSONResponse(status_code=status_code, content=body.model_dump(exclude_none=True), headers=headers)


def _agent_error(exc: AgentCallError, request_id: str) -> JSONResponse:
    status_code, message = _AGENT_ERRORS[exc.kind]
    return _error(status_code, exc.kind.value, message, stage=exc.stage.value, request_id=request_id)


# --- health ----------------------------------------------------------------------------------


@app.get("/health")
def health_check():
    return {"status": "healthy", "agent": "orchestration-gateway"}


@app.get("/health/agents")
def agents_health(pipeline: AnalysisPipeline = Depends(get_pipeline)):
    agents = pipeline.check_agents()
    return {"status": "healthy" if all(v == "up" for v in agents.values()) else "degraded", "agents": agents}


# --- auth ------------------------------------------------------------------------------------


def _user_response(user: UserRecord) -> UserResponse:
    return UserResponse(user_id=user.user_id, email=user.email, business_id=user.business_id,
                        created_at=user.created_at, consent_version=user.consent_version,
                        consented_at=user.consented_at)


@app.post("/api/v1/auth/register", response_model=UserResponse, status_code=201)
def register(body: RegisterRequest, db: Database = Depends(get_database)):
    try:
        user = register_user(db, body.email, body.password, body.consent_version)
    except DuplicateEmailError:
        return _error(409, "email_taken", "An account with this email already exists.")
    return _user_response(user)


@app.post("/api/v1/auth/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Database = Depends(get_database),
          limiter: LoginLimiter = Depends(get_login_limiter)):
    wait = limiter.retry_after(body.email)
    if wait:
        logger.warning("Login blocked after repeated failures.")  # no email in the log
        response = _error(429, "too_many_attempts",
                          "Too many failed logins. Please wait a few minutes and try again.")
        response.headers["Retry-After"] = str(wait)
        return response
    user = authenticate(db, body.email, body.password)
    if user is None:
        limiter.record_failure(body.email)
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    limiter.reset(body.email)
    try:
        token, expires_in = create_access_token(user.user_id, get_settings())
    except AuthConfigError:
        logger.error("JWT_SECRET_KEY is not configured; login is unavailable.")
        return _error(503, "login_unavailable", "Login is not available right now.")
    return TokenResponse(access_token=token, expires_in=expires_in)


@app.get("/api/v1/auth/me", response_model=UserResponse)
def me(user: UserRecord = Depends(get_current_user)):
    return _user_response(user)


# --- policies --------------------------------------------------------------------------------


@app.get("/api/v1/policies", response_model=List[PolicyDocument])
def list_policies(user: UserRecord = Depends(get_current_user), db: Database = Depends(get_database)):
    return db.list_policies(user.business_id)


@app.post("/api/v1/policies", response_model=PolicyUploadResponse)
def upload_policy(
    response: Response,
    file: UploadFile = File(...),
    user: UserRecord = Depends(get_current_user),
    db: Database = Depends(get_database),
    pipeline: AnalysisPipeline = Depends(get_pipeline),
):
    request_id = _new_request_id()
    limit = get_settings().max_upload_mb * 1024 * 1024
    content = file.file.read(limit + 1)
    if len(content) > limit:
        return _error(413, "file_too_large", f"The file is larger than {get_settings().max_upload_mb} MB.",
                      request_id=request_id)

    try:
        document = pipeline.upload_policy(
            request_id=request_id, business_id=user.business_id, filename=file.filename or "policy.pdf",
            content=content, content_type=file.content_type or "application/pdf",
        )
    except AgentCallError as exc:
        if exc.status_code == 400:
            return _error(400, "invalid_pdf", "The file is not a valid PDF.", request_id=request_id)
        if exc.status_code == 413:
            return _error(413, "file_too_large", "The file is too large.", request_id=request_id)
        return _agent_error(exc, request_id)

    db.add_policy(document)
    response.headers["X-Request-ID"] = request_id
    return document


# --- analyses --------------------------------------------------------------------------------


def _to_response(result: PipelineResult) -> AnalysisResponse:
    return AnalysisResponse(
        request_id=result.request_id,
        business_id=result.business_id,
        status=AnalysisStatus.COMPLETE if result.report else AnalysisStatus.PARTIAL,
        created_at=datetime.now(timezone.utc),
        risk_profile=result.risk_profile,
        coverage=result.coverage,
        report=result.report,
        warnings=list(result.warnings),
        stage_ms=result.stage_ms,
    )


def _summary(analysis: AnalysisResponse) -> AnalysisSummary:
    if analysis.report is not None:
        total, gaps = analysis.report.summary.total_findings, analysis.report.summary.potential_gaps
    else:
        assessments = analysis.coverage.assessments
        total, gaps = len(assessments), sum(1 for a in assessments if a.potential_gap)
    return AnalysisSummary(request_id=analysis.request_id, status=analysis.status,
                           created_at=analysis.created_at, total_findings=total, potential_gaps=gaps)


@app.post("/api/v1/analyses", status_code=202, response_model=AnalysisProgress)
def run_analysis(
    body: AnalysisRequest,
    response: Response,
    background: BackgroundTasks,
    user: UserRecord = Depends(get_current_user),
    db: Database = Depends(get_database),
    pipeline: AnalysisPipeline = Depends(get_pipeline),
    jobs: JobStore = Depends(get_job_store),
):
    """Start an analysis and answer at once (202); the agents run in the background.

    Follow it with GET /api/v1/analyses/{request_id}/status, then fetch the result.
    """
    request_id = _new_request_id()
    if db.owned_policy_ids(user.business_id, body.policy_ids) != set(body.policy_ids):
        return _error(404, "policy_not_found", "One or more policies were not found for your account.",
                      request_id=request_id)

    logger.info("Analysis started (request %s).", request_id)
    progress = jobs.create(request_id, user.user_id)
    background.add_task(_run_analysis_job, pipeline, jobs, db, user, body, request_id)
    response.headers["X-Request-ID"] = request_id
    response.headers["Location"] = f"/api/v1/analyses/{request_id}/status"
    return progress


def _run_analysis_job(pipeline: AnalysisPipeline, jobs: JobStore, db: Database, user: UserRecord,
                      body: AnalysisRequest, request_id: str) -> None:
    """The pipeline run behind POST /analyses. Never raises: failures go to the job."""
    try:
        result = pipeline.run(request_id=request_id, business_id=user.business_id,
                              business=body.business, policy_ids=body.policy_ids,
                              progress=jobs.reporter(request_id))
    except AgentCallError as exc:
        logger.warning("Analysis failed at %s (%s) (request %s).", exc.stage.value, exc.kind.value, request_id)
        _, message = _AGENT_ERRORS[exc.kind]
        jobs.fail(request_id, GatewayError(error=exc.kind.value, message=message, stage=exc.stage.value,
                                           request_id=request_id))
        return
    except Exception as exc:  # a bug must not leave the run "running" forever
        logger.error("Analysis crashed (%s) (request %s).", type(exc).__name__, request_id)
        jobs.fail(request_id, GatewayError(error="analysis_failed", message=ANALYSIS_FAILED_MESSAGE,
                                           request_id=request_id))
        return

    analysis = _to_response(result)
    try:
        encrypted = encrypt_bytes(analysis.model_dump_json().encode("utf-8"))
        db.save_analysis(user_id=user.user_id, summary=_summary(analysis), encrypted_result=encrypted)
    except (SecurityConfigError, sqlite3.Error) as exc:
        logger.error("Analysis could not be saved (%s) (request %s).", type(exc).__name__, request_id)
        analysis.warnings.append(NOT_SAVED_WARNING)
    jobs.complete(request_id, analysis)


@app.get("/api/v1/analyses/{request_id}/status", response_model=AnalysisProgress)
def analysis_status(request_id: str, user: UserRecord = Depends(get_current_user),
                    db: Database = Depends(get_database), jobs: JobStore = Depends(get_job_store)):
    """Which agent is working, and what each one received and returned (counts only)."""
    job = jobs.get(request_id, user.user_id)
    if job is not None:
        return job.progress
    saved = _load_analysis(db, user, request_id)
    if isinstance(saved, JSONResponse):
        return saved
    return progress_from_analysis(saved)


@app.get("/api/v1/analyses", response_model=List[AnalysisSummary])
def list_analyses(user: UserRecord = Depends(get_current_user), db: Database = Depends(get_database)):
    return db.list_analyses(user.user_id)


def _load_analysis(db: Database, user: UserRecord, request_id: str) -> AnalysisResponse | JSONResponse:
    """One of the user's saved analyses, or the error response to return instead."""
    encrypted = db.get_analysis(user_id=user.user_id, request_id=request_id)
    if encrypted is None:  # also when it belongs to someone else
        return _error(404, "analysis_not_found", "Analysis not found.")
    try:
        return AnalysisResponse.model_validate_json(decrypt_bytes(encrypted))
    except SecurityConfigError:
        logger.error("Stored analysis could not be decrypted (request %s).", request_id)
        return _error(500, "analysis_unreadable", "The stored analysis could not be read.")


def _find_analysis(db: Database, jobs: JobStore, user: UserRecord,
                   request_id: str) -> AnalysisResponse | JSONResponse:
    """The user's analysis from the database, else a finished run kept in memory (it could not
    be saved), else 409 while it is still running, else 404."""
    saved = _load_analysis(db, user, request_id)
    if not (isinstance(saved, JSONResponse) and saved.status_code == 404):
        return saved
    job = jobs.get(request_id, user.user_id)
    if job is None:
        return saved
    if job.result is not None:
        return job.result
    if job.progress.state is RunState.RUNNING:
        return _error(409, "analysis_running", "The analysis is still running.", request_id=request_id)
    return saved


@app.get("/api/v1/analyses/{request_id}", response_model=AnalysisResponse)
def get_analysis(request_id: str, user: UserRecord = Depends(get_current_user),
                 db: Database = Depends(get_database), jobs: JobStore = Depends(get_job_store)):
    return _find_analysis(db, jobs, user, request_id)


@app.post("/api/v1/analyses/{request_id}/questions", response_model=QuestionAnswerResponse)
def ask_question(
    request_id: str,
    body: AskQuestionRequest,
    response: Response,
    user: UserRecord = Depends(get_current_user),
    db: Database = Depends(get_database),
    pipeline: AnalysisPipeline = Depends(get_pipeline),
    limiter: QuestionLimiter = Depends(get_question_limiter),
    jobs: JobStore = Depends(get_job_store),
):
    """Answer one question from this saved analysis only. Nothing is stored."""
    question_id = _new_request_id()
    wait = limiter.retry_after(user.user_id)
    if wait:
        limited = _error(429, "too_many_questions",
                         f"Too many questions in a short time. Please wait {wait} seconds.",
                         request_id=question_id)
        limited.headers["Retry-After"] = str(wait)
        return limited

    analysis = _find_analysis(db, jobs, user, request_id)
    if isinstance(analysis, JSONResponse):
        return analysis

    # Counted once the analysis is found: only real questions use up the limit.
    limiter.record(user.user_id)
    # The question text is never logged.
    logger.info("Question about analysis %s (request %s).", request_id, question_id)
    try:
        answer = pipeline.answer_question(request_id=question_id, business_id=user.business_id,
                                          analysis=analysis, question=body.question)
    except AgentCallError as exc:
        logger.warning("Question failed at %s (%s) (request %s).", exc.stage.value, exc.kind.value, question_id)
        return _agent_error(exc, question_id)

    response.headers["X-Request-ID"] = question_id
    return answer
