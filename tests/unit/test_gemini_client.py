"""Unit tests for shared.llm.gemini_client.

A fake SDK client is used everywhere, so these tests need no API key, no
network and no real waiting.
"""

from types import SimpleNamespace

import httpx
import pytest
from google.genai import errors

from shared.config.settings import Settings
from shared.llm import gemini_client
from shared.llm.gemini_client import (
    GeminiClient,
    LLMAPIError,
    LLMConfigError,
    LLMError,
    LLMResponseError,
    LLMTimeoutError,
)

pytestmark = pytest.mark.unit

SECRET = "test-secret-key-do-not-leak"


class FakeModels:
    """Returns (or raises) the given outcomes one by one and records calls."""

    def __init__(self, outcomes):
        self._outcomes = list(outcomes)
        self.calls = []

    def generate_content(self, *, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        outcome = self._outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def make_client(outcomes, **settings_overrides):
    settings = Settings(
        gemini_api_key=SECRET, llm_model="test-model", **settings_overrides
    )
    models = FakeModels(outcomes)
    sleeps = []
    client = GeminiClient(
        settings, client=SimpleNamespace(models=models), sleep=sleeps.append
    )
    return client, models, sleeps


def ok(text="hello"):
    return SimpleNamespace(text=text)


def api_error(cls, code):
    return cls(code, {"error": {"message": "problem", "status": "X"}})


# --- configuration -----------------------------------------------------------

def test_missing_api_key_raises_config_error():
    settings = Settings(llm_model="test-model")
    with pytest.raises(LLMConfigError, match="GEMINI_API_KEY"):
        GeminiClient(settings)


def test_missing_model_raises_config_error():
    settings = Settings(gemini_api_key=SECRET)
    with pytest.raises(LLMConfigError, match="LLM_MODEL"):
        GeminiClient(settings)


def test_config_error_never_contains_the_key():
    settings = Settings(gemini_api_key=SECRET)  # model missing -> error
    with pytest.raises(LLMConfigError) as excinfo:
        GeminiClient(settings)
    assert SECRET not in str(excinfo.value)


def test_real_sdk_client_gets_key_and_timeout_in_milliseconds(monkeypatch):
    captured = {}

    def fake_sdk_client(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(models=FakeModels([]))

    monkeypatch.setattr(gemini_client.genai, "Client", fake_sdk_client)
    settings = Settings(
        gemini_api_key=SECRET, llm_model="test-model", llm_timeout_seconds=12
    )
    GeminiClient(settings)
    assert captured["api_key"] == SECRET
    assert captured["http_options"].timeout == 12000


# --- successful calls --------------------------------------------------------

def test_returns_text_and_sends_model_and_settings():
    client, models, _ = make_client([ok("answer")], llm_temperature=0.3, llm_max_tokens=100)
    assert client.generate_text("hi", system_instruction="be brief") == "answer"
    call = models.calls[0]
    assert call["model"] == "test-model"
    assert call["contents"] == "hi"
    assert call["config"].temperature == 0.3
    assert call["config"].max_output_tokens == 100
    assert call["config"].system_instruction == "be brief"
    assert call["config"].response_mime_type is None


def test_json_output_requests_json_mime_type():
    client, models, _ = make_client([ok("{}")])
    client.generate_text("hi", json_output=True)
    assert models.calls[0]["config"].response_mime_type == "application/json"


# --- retries -----------------------------------------------------------------

@pytest.mark.parametrize(
    "error",
    [
        api_error(errors.ServerError, 503),
        api_error(errors.ClientError, 429),
        httpx.ReadTimeout("timed out"),
        httpx.ConnectError("no route"),
    ],
)
def test_temporary_failure_is_retried_then_succeeds(error):
    client, models, sleeps = make_client([error, ok("recovered")])
    assert client.generate_text("hi") == "recovered"
    assert len(models.calls) == 2
    assert sleeps == [1]


def test_backoff_grows_between_retries():
    client, _, sleeps = make_client(
        [api_error(errors.ServerError, 500)] * 2 + [ok()], llm_max_retries=2
    )
    client.generate_text("hi")
    assert sleeps == [1, 2]


# --- failures ----------------------------------------------------------------

def test_client_error_is_not_retried():
    client, models, sleeps = make_client([api_error(errors.ClientError, 400)])
    with pytest.raises(LLMAPIError) as excinfo:
        client.generate_text("hi")
    assert excinfo.value.status_code == 400
    assert len(models.calls) == 1
    assert sleeps == []


def test_error_messages_never_contain_the_key():
    client, _, _ = make_client([api_error(errors.ClientError, 403)])
    with pytest.raises(LLMAPIError) as excinfo:
        client.generate_text("hi")
    assert SECRET not in str(excinfo.value)


def test_server_error_gives_up_after_max_retries():
    client, models, _ = make_client(
        [api_error(errors.ServerError, 503)] * 3, llm_max_retries=2
    )
    with pytest.raises(LLMAPIError) as excinfo:
        client.generate_text("hi")
    assert excinfo.value.status_code == 503
    assert len(models.calls) == 3  # 1 try + 2 retries


def test_timeout_raises_timeout_error_after_retries():
    client, models, _ = make_client(
        [httpx.ReadTimeout("timed out")] * 2, llm_max_retries=1
    )
    with pytest.raises(LLMTimeoutError):
        client.generate_text("hi")
    assert len(models.calls) == 2


def test_no_retries_when_max_retries_is_zero():
    client, models, _ = make_client([httpx.ReadTimeout("timed out")], llm_max_retries=0)
    with pytest.raises(LLMTimeoutError):
        client.generate_text("hi")
    assert len(models.calls) == 1


@pytest.mark.parametrize("text", [None, "", "   "])
def test_empty_response_raises_response_error(text):
    client, _, _ = make_client([ok(text)])
    with pytest.raises(LLMResponseError):
        client.generate_text("hi")


def test_all_failures_share_one_base_class():
    for exc in (LLMConfigError, LLMTimeoutError, LLMAPIError, LLMResponseError):
        assert issubclass(exc, LLMError)
