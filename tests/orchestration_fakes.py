"""Fake agents for the orchestrator tests. No network, and nothing here calls an LLM.

`FakeAgents` is an httpx transport handler that answers like Agents 1-4, records
every request it receives, and can be told to fail on any path. Agent 4's answer
comes from the real `ExplanationService` in template mode, so reports are genuine.
"""

from __future__ import annotations

import json
import re
from typing import Callable, Dict, List, Optional

import httpx

from agents.explanation_agent.service import ExplanationService
from services.orchestration.pipeline import AgentClient, AgentUrls, AnalysisPipeline
from shared.schemas.requests import ExplanationRequest

API_KEY = "orchestration-test-key"
BUSINESS_NAME = "Sunrise Bakery"

RISK_PATH = "/api/v1/risk-profile"
EVIDENCE_PATH = "/api/v1/retrieve-policy-evidence"
COVERAGE_PATH = "/api/v1/analyse-coverage"
REPORT_PATH = "/api/v1/generate-report"
UPLOAD_PATH = "/api/v1/policies"

URLS = AgentUrls(risk="http://risk.test", policy="http://policy.test",
                 coverage="http://coverage.test", explanation="http://explanation.test")

BUSINESS = {
    "business_name": BUSINESS_NAME,
    "business_type": "bakery",
    "description": "A bakery producing bread, cakes, and pastries.",
    "employee_count": 8,
    "equipment": ["Ovens"],
    "operations": {"handles_cash": True},
    "location": {"city": "Colombo", "country": "Sri Lanka"},
}

RISK = {
    "risk_id": "PROP_THEFT",
    "name": "Theft, burglary and vandalism",
    "category": "property",
    "reason": "The shop keeps cash and stock on the premises overnight.",
    "source": "rule",
    "confidence": 0.7,
    "evidence": [{"field": "operations.handles_cash", "value": "true"}],
}

CLAUSE = {
    "chunk_id": "POL-1-p7-c2",
    "policy_id": "POL-1",
    "section": "Section 3 - Burglary",
    "page": 7,
    "text": "Theft is covered only following forcible and violent entry into the premises.",
    "score": 0.79,
}


def json_response(status_code: int, body) -> Callable[[httpx.Request], httpx.Response]:
    return lambda request: httpx.Response(status_code, json=body)


def raise_error(exc_type: type) -> Callable[[httpx.Request], httpx.Response]:
    def handler(request: httpx.Request) -> httpx.Response:
        raise exc_type("simulated", request=request)
    return handler


class FakeAgents:
    def __init__(self) -> None:
        self.calls: List[httpx.Request] = []
        self.overrides: Dict[str, Callable[[httpx.Request], httpx.Response]] = {}
        self.risks: List[dict] = [RISK]
        self.down_hosts: set = set()
        self._routes = {
            RISK_PATH: self._risk_profile,
            EVIDENCE_PATH: self._evidence,
            COVERAGE_PATH: self._coverage,
            REPORT_PATH: self._report,
            UPLOAD_PATH: self._upload,
            "/health": self._health,
        }

    # --- plumbing -------------------------------------------------------------------------

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        handler = self.overrides.get(request.url.path) or self._routes[request.url.path]
        return handler(request)

    def http_client(self) -> httpx.Client:
        return httpx.Client(transport=httpx.MockTransport(self))

    def pipeline(self, api_key: str = API_KEY, *, timeout: float = 5, report_timeout: float = 50) -> AnalysisPipeline:
        return AnalysisPipeline(AgentClient(self.http_client(), api_key=api_key), URLS,
                                timeout=timeout, report_timeout=report_timeout)

    def paths(self) -> List[str]:
        return [request.url.path for request in self.calls]

    def call(self, path: str) -> httpx.Request:
        return next(request for request in self.calls if request.url.path == path)

    def body(self, path: str) -> dict:
        return json.loads(self.call(path).content)

    # --- agents ---------------------------------------------------------------------------

    def _risk_profile(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        return httpx.Response(200, json={
            "request_id": body["request_id"],
            "status": "complete",
            "business_name": body["business"]["business_name"],
            "business_type": body["business"]["business_type"],
            "risks": self.risks,
            "warnings": [],
            "metadata": {"taxonomy_version": "1.0", "llm_used": False, "processing_ms": 1},
        })

    def _evidence(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        return httpx.Response(200, json={
            "business_id": body["business_id"],
            "results": [{"risk_id": risk["risk_id"], "evidence": [CLAUSE]} for risk in body["risks"]],
        })

    def _coverage(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        assessments = [
            {
                "risk_id": risk["risk_id"],
                "risk_name": risk["name"],
                "status": "conditional",
                "potential_gap": False,
                "reason": "Theft is covered only after forcible and violent entry.",
                "evidence": [CLAUSE],
                "confidence": 0.79,
                "method": "rules",
                "matched_signals": ["forcible and violent entry"],
            }
            for risk in body["risks"]
        ]
        return httpx.Response(200, json={
            "request_id": body["request_id"],
            "business_id": body["business_id"],
            "assessments": assessments,
            "warnings": [],
            "metadata": {"llm_used": False, "processing_ms": 1},
        })

    def _report(self, request: httpx.Request) -> httpx.Response:
        report = ExplanationService(use_llm=False).generate(ExplanationRequest.model_validate_json(request.content))
        return httpx.Response(200, content=report.model_dump_json(), headers={"content-type": "application/json"})

    def _upload(self, request: httpx.Request) -> httpx.Response:
        business_id = multipart_field(request, "business_id")
        return httpx.Response(200, json={
            "policy_id": f"POL-{len(self.calls)}",
            "business_id": business_id,
            "filename": "policy.pdf",
            "status": "ready",
            "page_count": 3,
            "chunk_count": 12,
            "warnings": [],
        })

    def _health(self, request: httpx.Request) -> httpx.Response:
        if request.url.host in self.down_hosts:
            raise httpx.ConnectError("simulated", request=request)
        return httpx.Response(200, json={"status": "healthy"})


def multipart_field(request: httpx.Request, name: str) -> Optional[str]:
    match = re.search(rb'name="' + name.encode() + rb'"\r\n\r\n(.*?)\r\n', request.content)
    return match.group(1).decode() if match else None
