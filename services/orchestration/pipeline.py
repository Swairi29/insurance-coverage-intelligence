# End-to-end agent orchestration pipeline
"""Runs one analysis through the four agents over HTTP.

    Agent 1  POST /api/v1/risk-profile             business profile -> risks
    Agent 2  POST /api/v1/retrieve-policy-evidence  risks -> policy clauses per risk
    Agent 3  POST /api/v1/analyse-coverage          risks + clauses -> coverage assessments
    Agent 4  POST /api/v1/generate-report           risks + assessments -> plain-English report

Every call carries the shared `X-API-Key` and an `X-Request-ID` header, and the
same request_id goes in the body of every agent that accepts one (Agent 2 does
not, so it only gets the header). Each agent must echo the request_id back;
a different one means the chain is broken and is treated as a bad response.

Only the request_id, stage, HTTP status and duration are logged - never the
business profile, risks or policy text.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Type, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from agents.explanation_agent.mapping import build_explanation_request
from shared.config.settings import Settings
from shared.models.business import BusinessProfile
from shared.schemas.responses import (
    CoverageAnalysisResponse,
    CoverageMetadata,
    ExplanationResponse,
    PolicyEvidenceResponse,
    PolicyUploadResponse,
    RiskProfileResponse,
)

logger = logging.getLogger(__name__)

ModelT = TypeVar("ModelT", bound=BaseModel)

NO_RISKS_WARNING = "No risks were identified, so no policy evidence was checked."
REPORT_FAILED_WARNING = (
    "The written report could not be generated; the coverage results are shown without it."
)


class Stage(str, Enum):
    RISK_PROFILE = "risk_profile"  # Agent 1
    POLICY_EVIDENCE = "policy_evidence"  # Agent 2
    COVERAGE = "coverage"  # Agent 3
    REPORT = "report"  # Agent 4
    POLICY_UPLOAD = "policy_upload"  # Agent 2, outside the analysis chain


class ErrorKind(str, Enum):
    UNAVAILABLE = "agent_unavailable"  # could not connect
    TIMEOUT = "agent_timeout"
    REJECTED = "agent_rejected"  # 4xx: our request or our API key was wrong
    FAILED = "agent_failed"  # 5xx
    BAD_RESPONSE = "agent_bad_response"  # body did not match the contract


class AgentCallError(Exception):
    """An agent call failed. Carries no agent output, so it is safe to log."""

    def __init__(self, stage: Stage, kind: ErrorKind, status_code: Optional[int] = None):
        self.stage = stage
        self.kind = kind
        self.status_code = status_code
        super().__init__(f"{stage.value}: {kind.value} (HTTP {status_code})")


@dataclass(frozen=True)
class AgentUrls:
    risk: str
    policy: str
    coverage: str
    explanation: str

    @classmethod
    def from_settings(cls, settings: Settings) -> "AgentUrls":
        return cls(
            risk=settings.risk_agent_url.rstrip("/"),
            policy=settings.policy_agent_url.rstrip("/"),
            coverage=settings.coverage_agent_url.rstrip("/"),
            explanation=settings.explanation_agent_url.rstrip("/"),
        )


class AgentClient:
    """Sends one request to an agent and turns every failure into an `AgentCallError`."""

    def __init__(self, http: httpx.Client, *, api_key: str):
        self._http = http
        self._api_key = api_key

    def post_json(self, stage: Stage, url: str, body: dict, *, request_id: str,
                  timeout: float, response_model: Type[ModelT]) -> ModelT:
        return self._send(stage, url, request_id, timeout, response_model, json=body)

    def post_file(self, stage: Stage, url: str, *, data: dict, file: tuple, request_id: str,
                  timeout: float, response_model: Type[ModelT]) -> ModelT:
        return self._send(stage, url, request_id, timeout, response_model, data=data, files={"file": file})

    def is_healthy(self, url: str, timeout: float) -> bool:
        try:
            return self._http.get(url, timeout=timeout).status_code == 200
        except httpx.HTTPError:
            return False

    def _send(self, stage: Stage, url: str, request_id: str, timeout: float,
              response_model: Type[ModelT], **content) -> ModelT:
        headers = {"X-API-Key": self._api_key, "X-Request-ID": request_id}
        started = time.perf_counter()
        try:
            response = self._http.post(url, headers=headers, timeout=timeout, **content)
        except httpx.TimeoutException:
            logger.warning("Agent call %s timed out (request %s).", stage.value, request_id)
            raise AgentCallError(stage, ErrorKind.TIMEOUT) from None
        except httpx.TransportError:
            logger.warning("Agent call %s could not connect (request %s).", stage.value, request_id)
            raise AgentCallError(stage, ErrorKind.UNAVAILABLE) from None

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        logger.info("Agent call %s: HTTP %s in %d ms (request %s).",
                    stage.value, response.status_code, elapsed_ms, request_id)

        if response.status_code == 401:
            logger.error("Agent call %s was refused: INTERNAL_API_KEY differs between the "
                         "gateway and the agent.", stage.value)
        if response.status_code >= 500:
            raise AgentCallError(stage, ErrorKind.FAILED, response.status_code)
        if response.status_code >= 400:
            raise AgentCallError(stage, ErrorKind.REJECTED, response.status_code)
        try:
            return response_model.model_validate_json(response.content)
        except ValidationError:
            logger.error("Agent call %s returned a body that does not match %s (request %s).",
                         stage.value, response_model.__name__, request_id)
            raise AgentCallError(stage, ErrorKind.BAD_RESPONSE, response.status_code) from None


@dataclass
class PipelineResult:
    request_id: str
    business_id: str
    risk_profile: RiskProfileResponse
    coverage: CoverageAnalysisResponse
    report: Optional[ExplanationResponse]  # None when Agent 4 failed
    warnings: List[str] = field(default_factory=list)
    stage_ms: Dict[str, int] = field(default_factory=dict)


class AnalysisPipeline:
    def __init__(self, client: AgentClient, urls: AgentUrls, *,
                 timeout: float, report_timeout: float):
        self._client = client
        self._urls = urls
        self._timeout = timeout
        self._report_timeout = report_timeout

    @classmethod
    def from_settings(cls, settings: Settings, http: httpx.Client) -> "AnalysisPipeline":
        api_key = settings.internal_api_key.get_secret_value().strip() if settings.internal_api_key else ""
        if not api_key:
            # The agents would answer 401; say why in the log instead.
            logger.error("INTERNAL_API_KEY is not set; every agent call will be refused.")
        return cls(
            AgentClient(http, api_key=api_key),
            AgentUrls.from_settings(settings),
            timeout=settings.request_timeout_seconds,
            report_timeout=settings.explanation_timeout_seconds,
        )

    # --- analysis chain -------------------------------------------------------------------

    def run(self, *, request_id: str, business_id: str, business: BusinessProfile,
            policy_ids: List[str]) -> PipelineResult:
        """Agents 1 -> 2 -> 3 -> 4. Raises `AgentCallError` if Agent 1, 2 or 3 fails.

        An Agent 4 failure is not raised: the result is returned without a report
        and with a warning, because the coverage results are still useful.
        """
        stage_ms: Dict[str, int] = {}
        warnings: List[str] = []

        profile = self._timed(stage_ms, Stage.RISK_PROFILE, lambda: self._client.post_json(
            Stage.RISK_PROFILE, f"{self._urls.risk}/api/v1/risk-profile",
            {"request_id": request_id, "business": business.model_dump(mode="json", exclude_none=True)},
            request_id=request_id, timeout=self._timeout, response_model=RiskProfileResponse,
        ))
        _check_echo(Stage.RISK_PROFILE, profile.request_id, request_id)

        if profile.risks:
            coverage = self._coverage(request_id, business_id, policy_ids, profile, stage_ms)
        else:
            # Agents 2 and 3 require at least one risk.
            warnings.append(NO_RISKS_WARNING)
            coverage = CoverageAnalysisResponse(
                request_id=request_id, business_id=business_id, metadata=CoverageMetadata(llm_used=False),
            )

        report: Optional[ExplanationResponse] = None
        try:
            report = self._timed(stage_ms, Stage.REPORT, lambda: self._client.post_json(
                Stage.REPORT, f"{self._urls.explanation}/api/v1/generate-report",
                build_explanation_request(risk_profile=profile, coverage=coverage).model_dump(mode="json"),
                request_id=request_id, timeout=self._report_timeout, response_model=ExplanationResponse,
            ))
            _check_echo(Stage.REPORT, report.request_id, request_id)
        except AgentCallError as exc:
            logger.warning("Report stage failed (%s); returning a partial result (request %s).",
                           exc.kind.value, request_id)
            report = None
            warnings.append(REPORT_FAILED_WARNING)

        return PipelineResult(
            request_id=request_id,
            business_id=business_id,
            risk_profile=profile,
            coverage=coverage,
            report=report,
            warnings=warnings,
            stage_ms=stage_ms,
        )

    def _coverage(self, request_id: str, business_id: str, policy_ids: List[str],
                  profile: RiskProfileResponse, stage_ms: Dict[str, int]) -> CoverageAnalysisResponse:
        risks = [risk.model_dump(mode="json") for risk in profile.risks]

        evidence = self._timed(stage_ms, Stage.POLICY_EVIDENCE, lambda: self._client.post_json(
            Stage.POLICY_EVIDENCE, f"{self._urls.policy}/api/v1/retrieve-policy-evidence",
            {"business_id": business_id, "policy_ids": policy_ids, "risks": risks},
            request_id=request_id, timeout=self._timeout, response_model=PolicyEvidenceResponse,
        ))
        if evidence.business_id != business_id:
            raise AgentCallError(Stage.POLICY_EVIDENCE, ErrorKind.BAD_RESPONSE)

        coverage = self._timed(stage_ms, Stage.COVERAGE, lambda: self._client.post_json(
            Stage.COVERAGE, f"{self._urls.coverage}/api/v1/analyse-coverage",
            {
                "request_id": request_id,
                "business_id": business_id,
                "risks": risks,
                "evidence_results": [result.model_dump(mode="json") for result in evidence.results],
            },
            request_id=request_id, timeout=self._timeout, response_model=CoverageAnalysisResponse,
        ))
        _check_echo(Stage.COVERAGE, coverage.request_id, request_id)
        if coverage.business_id != business_id:
            raise AgentCallError(Stage.COVERAGE, ErrorKind.BAD_RESPONSE)
        return coverage

    # --- outside the chain ------------------------------------------------------------------

    def upload_policy(self, *, request_id: str, business_id: str, filename: str,
                      content: bytes, content_type: str) -> PolicyUploadResponse:
        """Forward one policy PDF to Agent 2."""
        document = self._client.post_file(
            Stage.POLICY_UPLOAD, f"{self._urls.policy}/api/v1/policies",
            data={"business_id": business_id}, file=(filename, content, content_type),
            request_id=request_id, timeout=self._timeout, response_model=PolicyUploadResponse,
        )
        if document.business_id != business_id:
            raise AgentCallError(Stage.POLICY_UPLOAD, ErrorKind.BAD_RESPONSE)
        return document

    def check_agents(self, timeout: float = 3.0) -> Dict[str, str]:
        """`up` / `down` per agent from its `/health` endpoint."""
        targets = {
            Stage.RISK_PROFILE.value: self._urls.risk,
            Stage.POLICY_EVIDENCE.value: self._urls.policy,
            Stage.COVERAGE.value: self._urls.coverage,
            Stage.REPORT.value: self._urls.explanation,
        }
        return {
            name: "up" if self._client.is_healthy(f"{base}/health", timeout) else "down"
            for name, base in targets.items()
        }

    @staticmethod
    def _timed(stage_ms: Dict[str, int], stage: Stage, call):
        started = time.perf_counter()
        try:
            return call()
        finally:
            stage_ms[stage.value] = int((time.perf_counter() - started) * 1000)


def _check_echo(stage: Stage, returned: str, expected: str) -> None:
    if returned != expected:
        logger.error("Agent call %s returned a different request_id (expected %s).", stage.value, expected)
        raise AgentCallError(stage, ErrorKind.BAD_RESPONSE)
