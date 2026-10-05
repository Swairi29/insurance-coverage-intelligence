"""Unit tests for the gateway API (services/orchestration/api.py), against fake agents."""

import sqlite3

import bcrypt
import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from services.orchestration.api import NOT_SAVED_WARNING, app, get_pipeline
from services.orchestration.auth import LoginLimiter, QuestionLimiter, get_login_limiter, get_question_limiter
from services.orchestration.database import Database, get_database
from services.orchestration.jobs import JobStore, get_job_store
from services.orchestration.pipeline import REPORT_FAILED_WARNING
from shared.config.settings import get_settings
from shared.schemas.requests import CURRENT_CONSENT_VERSION as CONSENT
from tests.orchestration_fakes import (
    BUSINESS,
    BUSINESS_NAME,
    COVERAGE_PATH,
    EVIDENCE_PATH,
    QUESTION_PATH,
    REPORT_PATH,
    UPLOAD_PATH,
    FakeAgents,
    json_response,
    multipart_field,
    raise_error,
)

PASSWORD = "correct horse"
PDF = ("policy.pdf", b"%PDF-1.4 fake policy", "application/pdf")


@pytest.fixture
def agents():
    return FakeAgents()


@pytest.fixture
def db(tmp_path):
    database = Database(tmp_path / "app.db")
    database.init_schema()
    return database


@pytest.fixture
def client(monkeypatch, agents, db):
    fast_salt = bcrypt.gensalt(rounds=4)  # the default cost makes every login ~0.3 s
    monkeypatch.setattr(bcrypt, "gensalt", lambda: fast_salt)
    monkeypatch.setenv("JWT_SECRET_KEY", "j" * 40)
    monkeypatch.setenv("DOCUMENT_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("MAX_UPLOAD_MB", "1")
    get_settings.cache_clear()
    app.dependency_overrides[get_database] = lambda: db
    app.dependency_overrides[get_pipeline] = agents.pipeline
    limiter = LoginLimiter()  # fresh per test; the real one lives as long as the process
    app.dependency_overrides[get_login_limiter] = lambda: limiter
    question_limiter = QuestionLimiter()
    app.dependency_overrides[get_question_limiter] = lambda: question_limiter
    jobs = JobStore()  # fresh per test; the real one lives as long as the process
    app.dependency_overrides[get_job_store] = lambda: jobs
    yield TestClient(app)
    app.dependency_overrides.clear()


def login(client, email="owner@example.com") -> dict:
    assert client.post("/api/v1/auth/register", json={"email": email, "password": PASSWORD, "consent_version": CONSENT}).status_code == 201
    response = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def upload(client, headers) -> str:
    response = client.post("/api/v1/policies", files={"file": PDF}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["policy_id"]


def start(client, headers, policy_ids):
    """POST /analyses. TestClient runs the background task before it returns."""
    return client.post("/api/v1/analyses", json={"business": BUSINESS, "policy_ids": policy_ids}, headers=headers)


def status(client, headers, request_id):
    return client.get(f"/api/v1/analyses/{request_id}/status", headers=headers)


def analyse(client, headers, policy_ids):
    """Start an analysis and return the response of fetching its result."""
    started = start(client, headers, policy_ids)
    assert started.status_code == 202, started.text
    return client.get(f"/api/v1/analyses/{started.json()['request_id']}", headers=headers)


# --- health ----------------------------------------------------------------------------------


def test_health(client):
    assert client.get("/health").json() == {"status": "healthy", "agent": "orchestration-gateway"}


def test_agents_health(client, agents):
    agents.down_hosts = {"policy.test"}

    body = client.get("/health/agents").json()

    assert body["status"] == "degraded" and body["agents"]["policy_evidence"] == "down"


# --- auth ------------------------------------------------------------------------------------


def test_register_login_and_me(client):
    headers = login(client)

    me = client.get("/api/v1/auth/me", headers=headers).json()
    assert me["email"] == "owner@example.com" and me["business_id"].startswith("B-")
    assert "password" not in str(me) and "hash" not in str(me)


def test_registration_records_the_consent_given(client):
    headers = login(client)

    me = client.get("/api/v1/auth/me", headers=headers).json()
    assert me["consent_version"] == CONSENT
    assert me["consented_at"] is not None


@pytest.mark.parametrize("consent", [None, "", "2020-01-01"])
def test_no_account_without_consent_to_the_current_notice(client, consent):
    body = {"email": "owner@example.com", "password": PASSWORD}
    if consent is not None:
        body["consent_version"] = consent

    response = client.post("/api/v1/auth/register", json=body)

    assert response.status_code == 422
    assert response.json()["details"][0]["field"] == "consent_version"
    login_attempt = client.post("/api/v1/auth/login", json={"email": "owner@example.com", "password": PASSWORD})
    assert login_attempt.status_code == 401  # no account was created


def test_existing_database_gets_the_consent_columns(tmp_path):
    path = tmp_path / "old.db"
    with sqlite3.connect(path) as conn:  # the users table as it was before consent was recorded
        conn.execute("CREATE TABLE users (user_id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, "
                     "password_hash TEXT NOT NULL, business_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL)")
        conn.execute("INSERT INTO users VALUES ('u1', 'old@example.com', 'x', 'B-1', '2026-01-01T00:00:00+00:00')")
    conn.close()

    db = Database(path)
    db.init_schema()
    db.init_schema()  # running it again changes nothing

    old = db.get_user("u1")
    assert old.email == "old@example.com" and old.consent_version is None and old.consented_at is None
    new = db.create_user("new@example.com", "hash", consent_version=CONSENT)
    assert db.get_user(new.user_id).consent_version == CONSENT


def test_duplicate_registration_is_409(client):
    login(client)

    response = client.post("/api/v1/auth/register", json={"email": "OWNER@example.com", "password": PASSWORD, "consent_version": CONSENT})
    assert response.status_code == 409 and response.json()["error"] == "email_taken"


def test_invalid_registration_does_not_echo_the_password(client):
    response = client.post("/api/v1/auth/register", json={"email": "owner@example.com", "password": "hunter2", "consent_version": CONSENT})

    assert response.status_code == 422
    assert response.json()["details"][0]["field"] == "password"
    assert "hunter2" not in response.text


def test_wrong_password_and_unknown_email_look_the_same(client):
    login(client)

    wrong = client.post("/api/v1/auth/login", json={"email": "owner@example.com", "password": "wrong password"})
    unknown = client.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": PASSWORD})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"detail": "Invalid email or password."}


def test_repeated_failed_logins_are_blocked(client):
    client.post("/api/v1/auth/register", json={"email": "owner@example.com", "password": PASSWORD, "consent_version": CONSENT})
    wrong = {"email": "owner@example.com", "password": "wrong password"}
    assert [client.post("/api/v1/auth/login", json=wrong).status_code for _ in range(5)] == [401] * 5

    blocked = client.post("/api/v1/auth/login", json={"email": "Owner@Example.com ", "password": PASSWORD})

    assert blocked.status_code == 429  # even with the right password, until the window passes
    assert blocked.json()["error"] == "too_many_attempts"
    assert int(blocked.headers["Retry-After"]) > 0
    # Other accounts are not affected.
    client.post("/api/v1/auth/register", json={"email": "other@example.com", "password": PASSWORD, "consent_version": CONSENT})
    assert client.post("/api/v1/auth/login", json={"email": "other@example.com",
                                                   "password": PASSWORD}).status_code == 200


def test_unknown_emails_are_limited_the_same_way(client):
    wrong = {"email": "nobody@example.com", "password": "guess"}
    codes = [client.post("/api/v1/auth/login", json=wrong).status_code for _ in range(6)]
    assert codes == [401] * 5 + [429]


def test_login_without_jwt_secret_is_503(client, monkeypatch):
    client.post("/api/v1/auth/register", json={"email": "owner@example.com", "password": PASSWORD, "consent_version": CONSENT})
    monkeypatch.delenv("JWT_SECRET_KEY")
    get_settings.cache_clear()

    response = client.post("/api/v1/auth/login", json={"email": "owner@example.com", "password": PASSWORD})
    assert response.status_code == 503 and "access_token" not in response.text


@pytest.mark.parametrize("method, path", [
    ("get", "/api/v1/auth/me"),
    ("get", "/api/v1/policies"),
    ("post", "/api/v1/policies"),
    ("get", "/api/v1/analyses"),
    ("post", "/api/v1/analyses"),
    ("get", "/api/v1/analyses/run-1"),
    ("get", "/api/v1/analyses/run-1/status"),
])
@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer not-a-token"}, {"Authorization": "Basic abc"}])
def test_protected_endpoints_need_a_valid_token(client, agents, method, path, headers):
    response = getattr(client, method)(path, headers=headers)

    assert response.status_code == 401
    assert agents.calls == []


# --- policies --------------------------------------------------------------------------------


def test_upload_uses_the_logged_in_users_business(client, agents):
    headers = login(client)
    business_id = client.get("/api/v1/auth/me", headers=headers).json()["business_id"]

    policy_id = upload(client, headers)

    assert multipart_field(agents.call(UPLOAD_PATH), "business_id") == business_id
    listed = client.get("/api/v1/policies", headers=headers).json()
    assert [p["policy_id"] for p in listed] == [policy_id]
    other = login(client, "other@example.com")
    assert client.get("/api/v1/policies", headers=other).json() == []


def test_oversized_upload_is_refused_before_agent_2(client, agents):
    headers = login(client)

    big = ("big.pdf", b"%PDF-" + b"x" * (1024 * 1024), "application/pdf")
    response = client.post("/api/v1/policies", files={"file": big}, headers=headers)
    assert response.status_code == 413 and agents.calls == []


def test_invalid_pdf_from_agent_2_is_400(client, agents):
    headers = login(client)
    agents.overrides[UPLOAD_PATH] = json_response(400, {"detail": "internal parser detail"})

    response = client.post("/api/v1/policies", files={"file": PDF}, headers=headers)
    assert response.status_code == 400 and response.json()["error"] == "invalid_pdf"
    assert "internal parser detail" not in response.text


# --- analyses --------------------------------------------------------------------------------


def test_full_analysis(client, agents):
    headers = login(client)
    business_id = client.get("/api/v1/auth/me", headers=headers).json()["business_id"]
    policy_id = upload(client, headers)
    agents.calls.clear()

    started = start(client, headers, [policy_id])

    assert started.status_code == 202, started.text
    accepted = started.json()
    request_id = accepted["request_id"]
    assert accepted["state"] == "running"
    assert [s["state"] for s in accepted["stages"]] == ["queued"] * 4
    assert started.headers["X-Request-ID"] == request_id
    assert started.headers["Location"] == f"/api/v1/analyses/{request_id}/status"

    response = client.get(f"/api/v1/analyses/{request_id}", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "complete" and body["warnings"] == []
    assert body["business_id"] == business_id
    assert {r.headers["X-Request-ID"] for r in agents.calls} == {request_id}
    assert body["report"]["request_id"] == body["coverage"]["request_id"] == request_id
    assert BUSINESS_NAME not in str(body["report"])


def test_status_shows_each_agent_call(client):
    headers = login(client)
    request_id = start(client, headers, [upload(client, headers)]).json()["request_id"]

    progress = status(client, headers, request_id).json()

    assert progress["state"] == "complete"
    stages = {s["stage"]: s for s in progress["stages"]}
    assert list(stages) == ["risk_profile", "policy_evidence", "coverage", "report"]
    assert all(s["state"] == "done" and s["duration_ms"] is not None for s in stages.values())
    # The gateway calls every agent itself (hub and spoke); these are its own calls.
    assert stages["risk_profile"]["endpoint"] == "POST /api/v1/risk-profile"
    assert stages["policy_evidence"]["endpoint"] == "POST /api/v1/retrieve-policy-evidence"
    assert stages["risk_profile"]["sent"] == "business profile"
    assert stages["risk_profile"]["received"] == "1 risk identified"
    assert stages["policy_evidence"]["sent"] == "1 risk, 1 policy"
    assert stages["policy_evidence"]["received"] == "1 clause found"
    assert stages["coverage"]["received"] == "1 risk assessed, 0 potential gaps"
    assert stages["report"]["received"] == "1 finding written (0 by AI)"
    # Counts only: no business or policy content.
    assert BUSINESS_NAME not in str(progress) and "forcible" not in str(progress)


def test_status_of_another_users_analysis_is_404(client):
    owner = login(client)
    request_id = start(client, owner, [upload(client, owner)]).json()["request_id"]
    other = login(client, "other@example.com")

    assert status(client, other, request_id).status_code == 404
    assert client.get(f"/api/v1/analyses/{request_id}", headers=other).status_code == 404


def test_status_after_a_restart_comes_from_the_saved_analysis(client):
    headers = login(client)
    request_id = start(client, headers, [upload(client, headers)]).json()["request_id"]
    fresh = JobStore()  # the gateway restarted: running jobs are forgotten
    app.dependency_overrides[get_job_store] = lambda: fresh

    progress = status(client, headers, request_id).json()

    assert progress["state"] == "complete"
    assert [s["state"] for s in progress["stages"]] == ["done"] * 4
    assert progress["stages"][0]["received"] == "1 risk identified"
    # The timeline is rebuilt too, so the workspace's handoff log and elapsed time are not empty.
    stages = progress["stages"]
    assert all(st["started_at"] and st["finished_at"] and st["sent"] for st in stages)
    assert progress["created_at"] == stages[0]["started_at"]
    assert progress["updated_at"] == stages[-1]["finished_at"]
    for before, after in zip(stages, stages[1:]):
        assert before["finished_at"] == after["started_at"]


def test_a_crash_marks_the_running_agent_as_failed(client, agents):
    headers = login(client)
    policy_id = upload(client, headers)
    # Not an agent error: the coverage response cannot even be read.
    agents.overrides[COVERAGE_PATH] = lambda request: (_ for _ in ()).throw(RuntimeError("bug"))

    request_id = start(client, headers, [policy_id]).json()["request_id"]
    progress = status(client, headers, request_id).json()

    assert progress["state"] == "failed" and progress["error"]["error"] == "analysis_failed"
    assert [s["state"] for s in progress["stages"]] == ["done", "done", "failed", "skipped"]
    assert progress["stages"][2]["received"] == "Unexpected error"
    assert "bug" not in str(progress)


def test_result_of_a_running_analysis_is_409(client):
    headers = login(client)
    user_id = client.get("/api/v1/auth/me", headers=headers).json()["user_id"]
    jobs = JobStore()
    app.dependency_overrides[get_job_store] = lambda: jobs
    jobs.create("run-1", user_id)

    response = client.get("/api/v1/analyses/run-1", headers=headers)

    assert response.status_code == 409 and response.json()["error"] == "analysis_running"
    assert status(client, headers, "run-1").json()["state"] == "running"


def test_policy_of_another_user_is_404_and_no_agent_is_called(client, agents):
    owner = login(client)
    policy_id = upload(client, owner)
    intruder = login(client, "intruder@example.com")
    agents.calls.clear()

    response = start(client, intruder, [policy_id])
    assert response.status_code == 404 and response.json()["error"] == "policy_not_found"
    assert agents.calls == []


@pytest.mark.parametrize("handler, status_code, error", [
    (raise_error(httpx.ConnectError), 503, "agent_unavailable"),
    (raise_error(httpx.ReadTimeout), 504, "agent_timeout"),
    (json_response(500, {"detail": "secret policy wording"}), 502, "agent_failed"),
    (json_response(422, {"detail": "secret policy wording"}), 502, "agent_rejected"),
])
def test_agent_failure_is_a_safe_gateway_error(client, agents, handler, status_code, error):
    headers = login(client)
    policy_id = upload(client, headers)
    agents.overrides[EVIDENCE_PATH] = handler

    started = start(client, headers, [policy_id])
    assert started.status_code == 202
    request_id = started.json()["request_id"]
    response = status(client, headers, request_id)

    progress = response.json()
    assert progress["state"] == "failed"
    assert progress["error"] == {"error": error, "message": progress["error"]["message"],
                                 "stage": "policy_evidence", "request_id": request_id}
    assert [s["state"] for s in progress["stages"]] == ["done", "failed", "skipped", "skipped"]
    assert progress["stages"][1]["received"]  # a short reason, e.g. "Service not reachable"
    assert "secret policy wording" not in response.text
    assert client.get(f"/api/v1/analyses/{request_id}", headers=headers).status_code == 404
    assert client.get("/api/v1/analyses", headers=headers).json() == []  # failed runs are not stored


def test_report_failure_is_a_partial_result(client, agents):
    headers = login(client)
    policy_id = upload(client, headers)
    agents.overrides[REPORT_PATH] = json_response(500, {})

    response = analyse(client, headers, [policy_id])

    body = response.json()
    assert response.status_code == 200 and body["status"] == "partial"
    progress = status(client, headers, body["request_id"]).json()
    assert progress["state"] == "partial"
    assert [s["state"] for s in progress["stages"]] == ["done", "done", "done", "failed"]
    assert body["report"] is None and len(body["coverage"]["assessments"]) == 1
    assert body["warnings"] == [REPORT_FAILED_WARNING]
    assert client.get("/api/v1/analyses", headers=headers).json()[0]["status"] == "partial"


def test_analysis_history(client, db, tmp_path):
    headers = login(client)
    policy_id = upload(client, headers)
    run = analyse(client, headers, [policy_id]).json()

    history = client.get("/api/v1/analyses", headers=headers).json()
    assert history == [{"request_id": run["request_id"], "status": "complete", "created_at": run["created_at"],
                        "total_findings": 1, "potential_gaps": 0}]
    assert client.get(f"/api/v1/analyses/{run['request_id']}", headers=headers).json() == run

    other = login(client, "other@example.com")
    assert client.get(f"/api/v1/analyses/{run['request_id']}", headers=other).status_code == 404
    assert client.get("/api/v1/analyses", headers=other).json() == []

    # The stored result is encrypted: policy wording is not readable in the database file.
    raw = sqlite3.connect(tmp_path / "app.db").execute("SELECT result FROM analyses").fetchone()[0]
    assert b"forcible and violent entry" not in raw and b"Theft" not in raw


def test_analysis_is_returned_even_if_it_cannot_be_saved(client, monkeypatch):
    headers = login(client)
    policy_id = upload(client, headers)
    monkeypatch.delenv("DOCUMENT_ENCRYPTION_KEY")
    get_settings.cache_clear()

    response = analyse(client, headers, [policy_id])

    assert response.status_code == 200 and response.json()["warnings"] == [NOT_SAVED_WARNING]
    assert client.get("/api/v1/analyses", headers=headers).json() == []



# --- questions about an analysis --------------------------------------------------------------


def _saved_analysis(client, headers) -> str:
    response = start(client, headers, [upload(client, headers)])
    assert response.status_code == 202, response.text
    return response.json()["request_id"]


def ask(client, headers, request_id, question="If someone steals my stock, am I covered?"):
    return client.post(f"/api/v1/analyses/{request_id}/questions", json={"question": question}, headers=headers)


def test_question_is_answered_from_the_saved_analysis(client, agents):
    headers = login(client)
    request_id = _saved_analysis(client, headers)

    response = ask(client, headers, request_id)

    assert response.status_code == 200, response.text
    answer = response.json()
    assert answer["answerable"] is True and answer["generated_by"] == "template"
    assert [c["chunk_id"] for c in answer["citations"]] == ["POL-1-p7-c2"]
    assert answer["related_risk_ids"] == ["PROP_THEFT"]
    assert response.headers["X-Request-ID"] == answer["request_id"] != request_id

    sent = agents.body(QUESTION_PATH)
    me = client.get("/api/v1/auth/me", headers=headers).json()
    assert sent["business_id"] == me["business_id"]
    assert sent["question"] == "If someone steals my stock, am I covered?"
    assert [a["risk_id"] for a in sent["assessments"]] == ["PROP_THEFT"]
    assert BUSINESS_NAME not in agents.call(QUESTION_PATH).content.decode()


def test_question_uses_its_own_timeout(client, agents):
    headers = login(client)
    ask(client, headers, _saved_analysis(client, headers))
    # FakeAgents.pipeline() keeps the default question timeout.
    assert agents.call(QUESTION_PATH).extensions["timeout"]["read"] == 150.0


def test_question_about_another_users_analysis_is_404(client, agents):
    request_id = _saved_analysis(client, login(client))
    other = login(client, "other@example.com")

    response = ask(client, other, request_id)

    assert response.status_code == 404 and response.json()["error"] == "analysis_not_found"
    assert QUESTION_PATH not in agents.paths()


def test_question_needs_a_login(client, agents):
    assert ask(client, {}, "anything").status_code == 401
    assert QUESTION_PATH not in agents.paths()


@pytest.mark.parametrize("question", ["?", "x" * 501])
def test_invalid_question_is_422_without_echo(client, agents, question):
    headers = login(client)
    response = ask(client, headers, _saved_analysis(client, headers), question)
    assert response.status_code == 422
    assert "x" * 50 not in response.text
    assert QUESTION_PATH not in agents.paths()


def test_too_many_questions_are_refused(client, agents):
    limiter = QuestionLimiter(max_questions=2)
    app.dependency_overrides[get_question_limiter] = lambda: limiter
    headers = login(client)
    request_id = _saved_analysis(client, headers)

    assert ask(client, headers, "not-mine").status_code == 404  # does not count
    assert ask(client, headers, request_id).status_code == 200
    assert ask(client, headers, request_id).status_code == 200
    response = ask(client, headers, request_id)

    assert response.status_code == 429
    assert response.json()["error"] == "too_many_questions"
    assert int(response.headers["Retry-After"]) > 0
    assert agents.paths().count(QUESTION_PATH) == 2


def test_limit_is_per_user(client):
    limiter = QuestionLimiter(max_questions=1)
    app.dependency_overrides[get_question_limiter] = lambda: limiter
    first, second = login(client), login(client, "other@example.com")
    first_id, second_id = _saved_analysis(client, first), _saved_analysis(client, second)

    assert ask(client, first, first_id).status_code == 200
    assert ask(client, first, first_id).status_code == 429
    assert ask(client, second, second_id).status_code == 200


@pytest.mark.parametrize(
    "handler, status_code, error",
    [
        (raise_error(httpx.ConnectError), 503, "agent_unavailable"),
        (raise_error(httpx.ReadTimeout), 504, "agent_timeout"),
        (json_response(500, {"detail": "boom"}), 502, "agent_failed"),
        (json_response(200, {"unexpected": True}), 502, "agent_bad_response"),
    ],
)
def test_agent_4_failure_is_a_safe_gateway_error(client, agents, handler, status_code, error):
    headers = login(client)
    request_id = _saved_analysis(client, headers)
    agents.overrides[QUESTION_PATH] = handler

    response = ask(client, headers, request_id)

    assert response.status_code == status_code
    assert response.json()["error"] == error and response.json()["stage"] == "question"


def test_answer_for_a_different_question_is_rejected(client, agents):
    headers = login(client)
    request_id = _saved_analysis(client, headers)
    real = agents._question

    def wrong_request_id(request):
        body = real(request).json()
        body["request_id"] = "someone-elses-question"
        return httpx.Response(200, json=body)

    agents.overrides[QUESTION_PATH] = wrong_request_id
    assert ask(client, headers, request_id).json()["error"] == "agent_bad_response"


def test_questions_are_not_saved(client, db):
    headers = login(client)
    request_id = _saved_analysis(client, headers)
    ask(client, headers, request_id)
    assert len(client.get("/api/v1/analyses", headers=headers).json()) == 1


def test_question_about_a_run_that_could_not_be_saved(client, monkeypatch):
    headers = login(client)
    policy_id = upload(client, headers)
    monkeypatch.delenv("DOCUMENT_ENCRYPTION_KEY")  # the result cannot be stored
    get_settings.cache_clear()
    request_id = start(client, headers, [policy_id]).json()["request_id"]

    response = ask(client, headers, request_id)

    assert response.status_code == 200, response.text
    assert response.json()["answerable"] is True


def test_question_about_a_running_analysis_is_409(client):
    headers = login(client)
    user_id = client.get("/api/v1/auth/me", headers=headers).json()["user_id"]
    jobs = JobStore()
    app.dependency_overrides[get_job_store] = lambda: jobs
    jobs.create("run-1", user_id)

    response = ask(client, headers, "run-1")

    assert response.status_code == 409 and response.json()["error"] == "analysis_running"
