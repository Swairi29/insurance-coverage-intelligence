"""Unit tests for the gateway API (services/orchestration/api.py), against fake agents."""

import sqlite3

import bcrypt
import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from services.orchestration.api import NOT_SAVED_WARNING, app, get_pipeline
from services.orchestration.auth import LoginLimiter, get_login_limiter
from services.orchestration.database import Database, get_database
from services.orchestration.pipeline import REPORT_FAILED_WARNING
from shared.config.settings import get_settings
from tests.orchestration_fakes import (
    BUSINESS,
    BUSINESS_NAME,
    EVIDENCE_PATH,
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
    yield TestClient(app)
    app.dependency_overrides.clear()


def login(client, email="owner@example.com") -> dict:
    assert client.post("/api/v1/auth/register", json={"email": email, "password": PASSWORD}).status_code == 201
    response = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def upload(client, headers) -> str:
    response = client.post("/api/v1/policies", files={"file": PDF}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["policy_id"]


def analyse(client, headers, policy_ids):
    return client.post("/api/v1/analyses", json={"business": BUSINESS, "policy_ids": policy_ids}, headers=headers)


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


def test_duplicate_registration_is_409(client):
    login(client)

    response = client.post("/api/v1/auth/register", json={"email": "OWNER@example.com", "password": PASSWORD})
    assert response.status_code == 409 and response.json()["error"] == "email_taken"


def test_invalid_registration_does_not_echo_the_password(client):
    response = client.post("/api/v1/auth/register", json={"email": "owner@example.com", "password": "hunter2"})

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
    client.post("/api/v1/auth/register", json={"email": "owner@example.com", "password": PASSWORD})
    wrong = {"email": "owner@example.com", "password": "wrong password"}
    assert [client.post("/api/v1/auth/login", json=wrong).status_code for _ in range(5)] == [401] * 5

    blocked = client.post("/api/v1/auth/login", json={"email": "Owner@Example.com ", "password": PASSWORD})

    assert blocked.status_code == 429  # even with the right password, until the window passes
    assert blocked.json()["error"] == "too_many_attempts"
    assert int(blocked.headers["Retry-After"]) > 0
    # Other accounts are not affected.
    client.post("/api/v1/auth/register", json={"email": "other@example.com", "password": PASSWORD})
    assert client.post("/api/v1/auth/login", json={"email": "other@example.com",
                                                   "password": PASSWORD}).status_code == 200


def test_unknown_emails_are_limited_the_same_way(client):
    wrong = {"email": "nobody@example.com", "password": "guess"}
    codes = [client.post("/api/v1/auth/login", json=wrong).status_code for _ in range(6)]
    assert codes == [401] * 5 + [429]


def test_login_without_jwt_secret_is_503(client, monkeypatch):
    client.post("/api/v1/auth/register", json={"email": "owner@example.com", "password": PASSWORD})
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

    response = analyse(client, headers, [policy_id])

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "complete" and body["warnings"] == []
    assert body["business_id"] == business_id
    assert response.headers["X-Request-ID"] == body["request_id"]
    assert {r.headers["X-Request-ID"] for r in agents.calls} == {body["request_id"]}
    assert body["report"]["request_id"] == body["coverage"]["request_id"] == body["request_id"]
    assert BUSINESS_NAME not in str(body["report"])


def test_policy_of_another_user_is_404_and_no_agent_is_called(client, agents):
    owner = login(client)
    policy_id = upload(client, owner)
    intruder = login(client, "intruder@example.com")
    agents.calls.clear()

    response = analyse(client, intruder, [policy_id])
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

    response = analyse(client, headers, [policy_id])

    body = response.json()
    assert response.status_code == status_code
    assert body["error"] == error and body["stage"] == "policy_evidence"
    assert body["request_id"] == response.headers["X-Request-ID"]
    assert "secret policy wording" not in response.text
    assert client.get("/api/v1/analyses", headers=headers).json() == []  # failed runs are not stored


def test_report_failure_is_a_partial_result(client, agents):
    headers = login(client)
    policy_id = upload(client, headers)
    agents.overrides[REPORT_PATH] = json_response(500, {})

    response = analyse(client, headers, [policy_id])

    body = response.json()
    assert response.status_code == 200 and body["status"] == "partial"
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

