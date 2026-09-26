"""Unit tests for services/orchestration/pipeline.py, against fake agents (no network, no LLM)."""

import httpx
import pytest

from services.orchestration.pipeline import (
    NO_RISKS_WARNING,
    REPORT_FAILED_WARNING,
    AgentCallError,
    ErrorKind,
    Stage,
)
from shared.models.business import BusinessProfile
from tests.orchestration_fakes import (
    API_KEY,
    BUSINESS,
    BUSINESS_NAME,
    COVERAGE_PATH,
    EVIDENCE_PATH,
    REPORT_PATH,
    RISK_PATH,
    FakeAgents,
    json_response,
    raise_error,
)

REQUEST_ID = "run-001"
BUSINESS_ID = "B-0001"
CHAIN = [RISK_PATH, EVIDENCE_PATH, COVERAGE_PATH, REPORT_PATH]


@pytest.fixture
def agents():
    return FakeAgents()


def run(agents, **kwargs):
    return agents.pipeline(**kwargs).run(
        request_id=REQUEST_ID, business_id=BUSINESS_ID,
        business=BusinessProfile.model_validate(BUSINESS), policy_ids=["POL-1"],
    )


# --- happy path --------------------------------------------------------------------------


def test_calls_the_four_agents_in_order(agents):
    result = run(agents)

    assert agents.paths() == CHAIN
    assert [str(r.url).split("/api")[0] for r in agents.calls] == [
        "http://risk.test", "http://policy.test", "http://coverage.test", "http://explanation.test"]
    assert result.report is not None and result.warnings == []
    assert set(result.stage_ms) == {"risk_profile", "policy_evidence", "coverage", "report"}


def test_one_request_id_and_the_api_key_reach_every_agent(agents):
    run(agents)

    for request in agents.calls:
        assert request.headers["X-Request-ID"] == REQUEST_ID
        assert request.headers["X-API-Key"] == API_KEY
    for path in (RISK_PATH, COVERAGE_PATH, REPORT_PATH):
        assert agents.body(path)["request_id"] == REQUEST_ID
    # Agent 2's schema forbids unknown fields, so it only gets the header.
    assert "request_id" not in agents.body(EVIDENCE_PATH)


def test_business_id_comes_from_the_caller(agents):
    result = run(agents)

    for path in (EVIDENCE_PATH, COVERAGE_PATH, REPORT_PATH):
        assert agents.body(path)["business_id"] == BUSINESS_ID
    assert agents.body(EVIDENCE_PATH)["policy_ids"] == ["POL-1"]
    assert result.report.business_id == BUSINESS_ID


def test_business_name_only_goes_to_agent_1(agents):
    run(agents)

    assert BUSINESS_NAME.encode() in agents.call(RISK_PATH).content
    for request in agents.calls[1:]:
        assert BUSINESS_NAME.encode() not in request.content


def test_report_explains_agent_3_without_changing_it(agents):
    result = run(agents)

    assert {f.risk_id: (f.status, f.potential_gap) for f in result.report.findings} == {
        a.risk_id: (a.status, a.potential_gap) for a in result.coverage.assessments}


def test_agent_4_gets_the_longer_timeout(agents):
    run(agents, timeout=5, report_timeout=50)

    assert agents.call(RISK_PATH).extensions["timeout"]["read"] == 5
    assert agents.call(REPORT_PATH).extensions["timeout"]["read"] == 50


# --- no risks ------------------------------------------------------------------------------


def test_no_risks_skips_agents_2_and_3(agents):
    agents.risks = []

    result = run(agents)

    assert agents.paths() == [RISK_PATH, REPORT_PATH]
    assert result.coverage.assessments == [] and result.coverage.request_id == REQUEST_ID
    assert result.report.findings == []
    assert result.warnings == [NO_RISKS_WARNING]


# --- failures ------------------------------------------------------------------------------

FAILURES = [
    (raise_error(httpx.ConnectError), ErrorKind.UNAVAILABLE, None),
    (raise_error(httpx.ReadTimeout), ErrorKind.TIMEOUT, None),
    (json_response(401, {"detail": "Missing or invalid API key."}), ErrorKind.REJECTED, 401),
    (json_response(422, {"detail": "secret policy wording"}), ErrorKind.REJECTED, 422),
    (json_response(500, {"detail": "secret policy wording"}), ErrorKind.FAILED, 500),
    (json_response(200, {"unexpected": "secret policy wording"}), ErrorKind.BAD_RESPONSE, 200),
]
STAGES = [(RISK_PATH, Stage.RISK_PROFILE), (EVIDENCE_PATH, Stage.POLICY_EVIDENCE), (COVERAGE_PATH, Stage.COVERAGE)]


@pytest.mark.parametrize("path, stage", STAGES)
@pytest.mark.parametrize("handler, kind, status_code", FAILURES)
def test_agent_failure_stops_the_chain(agents, path, stage, handler, kind, status_code):
    agents.overrides[path] = handler

    with pytest.raises(AgentCallError) as caught:
        run(agents)

    assert (caught.value.stage, caught.value.kind, caught.value.status_code) == (stage, kind, status_code)
    assert agents.paths() == CHAIN[: CHAIN.index(path) + 1]  # nothing after the failed stage
    assert "secret policy wording" not in str(caught.value)


@pytest.mark.parametrize("handler, kind, status_code", FAILURES)
def test_report_failure_returns_a_partial_result(agents, handler, kind, status_code):
    agents.overrides[REPORT_PATH] = handler

    result = run(agents)

    assert result.report is None
    assert len(result.coverage.assessments) == 1
    assert result.warnings == [REPORT_FAILED_WARNING]


def test_a_different_request_id_breaks_the_chain(agents):
    real = agents._risk_profile

    def wrong_id(request):
        response = real(request)
        body = response.json() | {"request_id": "someone-elses-run"}
        return httpx.Response(200, json=body)

    agents.overrides[RISK_PATH] = wrong_id
    with pytest.raises(AgentCallError) as caught:
        run(agents)
    assert (caught.value.stage, caught.value.kind) == (Stage.RISK_PROFILE, ErrorKind.BAD_RESPONSE)


def test_evidence_for_another_business_is_rejected(agents):
    agents.overrides[EVIDENCE_PATH] = json_response(200, {"business_id": "B-OTHER", "results": []})

    with pytest.raises(AgentCallError) as caught:
        run(agents)
    assert (caught.value.stage, caught.value.kind) == (Stage.POLICY_EVIDENCE, ErrorKind.BAD_RESPONSE)
    assert COVERAGE_PATH not in agents.paths()


# --- outside the chain ----------------------------------------------------------------------


def test_upload_forwards_the_business_id(agents):
    document = agents.pipeline().upload_policy(
        request_id=REQUEST_ID, business_id=BUSINESS_ID, filename="policy.pdf",
        content=b"%PDF-1.4 fake", content_type="application/pdf")

    assert document.business_id == BUSINESS_ID
    request = agents.calls[0]
    assert request.headers["X-API-Key"] == API_KEY and request.headers["X-Request-ID"] == REQUEST_ID
    assert b"%PDF-1.4 fake" in request.content


def test_upload_answer_for_another_business_is_rejected(agents):
    agents.overrides["/api/v1/policies"] = json_response(200, {
        "policy_id": "POL-9", "business_id": "B-OTHER", "filename": "x.pdf", "status": "ready",
        "page_count": 1})

    with pytest.raises(AgentCallError) as caught:
        agents.pipeline().upload_policy(request_id=REQUEST_ID, business_id=BUSINESS_ID, filename="x.pdf",
                                        content=b"%PDF-", content_type="application/pdf")
    assert (caught.value.stage, caught.value.kind) == (Stage.POLICY_UPLOAD, ErrorKind.BAD_RESPONSE)


def test_check_agents_reports_each_agent(agents):
    agents.down_hosts = {"coverage.test"}

    assert agents.pipeline().check_agents() == {
        "risk_profile": "up", "policy_evidence": "up", "coverage": "down", "report": "up"}
