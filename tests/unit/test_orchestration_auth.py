"""Unit tests for the gateway's auth.py, database.py and request schemas."""

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from pydantic import ValidationError

from services.orchestration.auth import (
    AuthConfigError,
    authenticate,
    create_access_token,
    decode_access_token,
    hash_password,
    register_user,
    verify_password,
)
from services.orchestration.database import Database, DuplicateEmailError
from shared.config.settings import Settings
from shared.models.policy import PolicyDocument, PolicyStatus
from shared.schemas.requests import AnalysisRequest, LoginRequest, RegisterRequest
from shared.schemas.responses import AnalysisStatus, AnalysisSummary
from tests.orchestration_fakes import BUSINESS

SECRET = "s" * 40


@pytest.fixture
def settings():
    return Settings(jwt_secret_key=SECRET)


@pytest.fixture
def db(tmp_path):
    database = Database(tmp_path / "nested" / "app.db")
    database.init_schema()
    return database


# --- passwords ----------------------------------------------------------------------------


def test_password_hash_round_trip():
    hashed = hash_password("correct horse")

    assert hashed != "correct horse" and hashed.startswith("$2")
    assert verify_password("correct horse", hashed)
    assert not verify_password("wrong horse", hashed)


def test_malformed_hash_is_a_failed_check_not_a_crash():
    assert not verify_password("anything", "not-a-bcrypt-hash")


def test_authenticate(db):
    register_user(db, "owner@example.com", "correct horse")

    assert authenticate(db, "owner@example.com", "correct horse").email == "owner@example.com"
    assert authenticate(db, "owner@example.com", "wrong horse") is None
    assert authenticate(db, "nobody@example.com", "correct horse") is None


# --- tokens -------------------------------------------------------------------------------


def test_token_round_trip(settings):
    token, expires_in = create_access_token("user-1", settings)

    assert decode_access_token(token, settings) == "user-1"
    assert expires_in == 60 * 60


def test_expired_token_is_rejected(settings):
    past = datetime.now(timezone.utc) - timedelta(hours=2)
    token = jwt.encode({"sub": "user-1", "iat": past, "exp": past + timedelta(hours=1)}, SECRET, algorithm="HS256")

    assert decode_access_token(token, settings) is None


@pytest.mark.parametrize("token", [
    jwt.encode({"sub": "user-1", "iat": datetime.now(timezone.utc),
                "exp": datetime.now(timezone.utc) + timedelta(hours=1)}, "x" * 40, algorithm="HS256"),
    jwt.encode({"sub": "user-1"}, SECRET, algorithm="HS256"),  # no expiry
    "not.a.token",
])
def test_invalid_tokens_are_rejected(settings, token):
    assert decode_access_token(token, settings) is None


def test_unsigned_token_is_rejected(settings):
    now = datetime.now(timezone.utc)
    token = jwt.encode({"sub": "user-1", "iat": now, "exp": now + timedelta(hours=1)}, None, algorithm="none")

    assert decode_access_token(token, settings) is None


@pytest.mark.parametrize("secret", [None, "too-short"])
def test_missing_or_short_secret_is_a_config_error(secret):
    with pytest.raises(AuthConfigError):
        create_access_token("user-1", Settings(jwt_secret_key=secret))


# --- database -----------------------------------------------------------------------------


def test_duplicate_email_is_refused(db):
    register_user(db, "owner@example.com", "correct horse")

    with pytest.raises(DuplicateEmailError):
        register_user(db, "owner@example.com", "another password")


def test_each_user_gets_their_own_business_id(db):
    first = register_user(db, "a@example.com", "password1")
    second = register_user(db, "b@example.com", "password2")

    assert first.business_id != second.business_id
    assert first.business_id.startswith("B-") and len(first.business_id) <= 64
    assert db.get_user(first.user_id) == first
    assert db.get_user("missing") is None


def _policy(policy_id, business_id):
    return PolicyDocument(policy_id=policy_id, business_id=business_id, filename="p.pdf",
                          status=PolicyStatus.READY, page_count=3, chunk_count=5)


def test_policies_are_scoped_to_their_business(db):
    a = register_user(db, "a@example.com", "password1")
    b = register_user(db, "b@example.com", "password2")
    db.add_policy(_policy("POL-A", a.business_id))
    db.add_policy(_policy("POL-B", b.business_id))

    assert db.owned_policy_ids(a.business_id, ["POL-A", "POL-B", "POL-X"]) == {"POL-A"}
    assert [p.policy_id for p in db.list_policies(b.business_id)] == ["POL-B"]


def test_analyses_are_scoped_to_their_user(db):
    a = register_user(db, "a@example.com", "password1")
    b = register_user(db, "b@example.com", "password2")
    for i, day in enumerate((1, 2)):
        summary = AnalysisSummary(request_id=f"run-{i}", status=AnalysisStatus.COMPLETE,
                                  created_at=datetime(2026, 9, day, tzinfo=timezone.utc),
                                  total_findings=3, potential_gaps=1)
        db.save_analysis(user_id=a.user_id, summary=summary, encrypted_result=b"blob-%d" % i)

    assert [s.request_id for s in db.list_analyses(a.user_id)] == ["run-1", "run-0"]  # newest first
    assert db.get_analysis(user_id=a.user_id, request_id="run-0") == b"blob-0"
    assert db.get_analysis(user_id=b.user_id, request_id="run-0") is None
    assert db.list_analyses(b.user_id) == []


# --- request schemas ----------------------------------------------------------------------


def test_register_email_is_normalised():
    assert RegisterRequest(email="  Owner@Example.COM ", password="password1").email == "owner@example.com"
    assert LoginRequest(email="Owner@Example.com", password="x").email == "owner@example.com"


@pytest.mark.parametrize("email, password", [
    ("not-an-email", "password1"),
    ("owner@example.com", "short"),
    ("owner@example.com", "é" * 40),  # 40 characters, but 80 bytes: over bcrypt's limit
])
def test_register_rejects_bad_input(email, password):
    with pytest.raises(ValidationError):
        RegisterRequest(email=email, password=password)


@pytest.mark.parametrize("extra", [
    {"policy_ids": []},
    {"policy_ids": ["P1", "P1"]},
    {"policy_ids": [f"P{i}" for i in range(6)]},
    {"policy_ids": ["P1"], "business_id": "someone-else"},
    {"policy_ids": ["P1"], "request_id": "chosen-by-client"},
])
def test_analysis_request_rejects_bad_input(extra):
    with pytest.raises(ValidationError):
        AnalysisRequest.model_validate({"business": BUSINESS} | extra)


# --- LoginLimiter -----------------------------------------------------------------------


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def test_limiter_blocks_after_max_failures_and_expires():
    from services.orchestration.auth import LoginLimiter

    clock = FakeClock()
    limiter = LoginLimiter(max_failures=3, window_seconds=60, clock=clock)
    for _ in range(2):
        limiter.record_failure("a@x.lk")
    assert limiter.retry_after("a@x.lk") == 0
    limiter.record_failure("a@x.lk")
    assert 0 < limiter.retry_after("a@x.lk") <= 61

    clock.now += 61  # the oldest failures leave the window
    assert limiter.retry_after("a@x.lk") == 0


def test_limiter_success_clears_the_count():
    from services.orchestration.auth import LoginLimiter

    limiter = LoginLimiter(max_failures=2, window_seconds=60, clock=FakeClock())
    limiter.record_failure("a@x.lk")
    limiter.reset("a@x.lk")
    limiter.record_failure("a@x.lk")
    assert limiter.retry_after("a@x.lk") == 0
