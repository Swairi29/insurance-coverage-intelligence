"""Tests for Agent 4's LLM access layer. Only FakeLLM is used; no model is called."""

from __future__ import annotations

import logging

import pytest

from agents.explanation_agent import llm
from agents.explanation_agent.llm import (
    MAX_RESPONSE_CHARS,
    ExplanationLLMError,
    FallbackClient,
    active_model,
    generate_json,
    get_client,
)
from agents.explanation_agent.tests.fakes import FakeLLM, load_llm_response
from shared.config.settings import Settings
from shared.llm.gemini_client import LLMAPIError
from shared.llm.ollama_client import OllamaClient, OllamaError

SYSTEM = "system rules"


def _settings(**overrides) -> Settings:
    values = {
        "llm_provider": "ollama",
        "ollama_model": "qwen3:8b",
        "ollama_host": "http://localhost:11434",
        "gemini_api_key": None,
        "llm_model": None,
        "explanation_use_llm": True,
    }
    values.update(overrides)
    return Settings(**values)


# --- generate_json: parsing -----------------------------------------------------------


def test_plain_json():
    fake = FakeLLM(['{"findings": []}'])
    assert generate_json(fake, "prompt", SYSTEM) == {"findings": []}
    call = fake.calls[0]
    assert call.prompt == "prompt" and call.system_instruction == SYSTEM and call.json_output is True


def test_fixture_response_parses():
    data = generate_json(FakeLLM([load_llm_response("bakery_mixed_good.json")]), "p", SYSTEM)
    assert len(data["findings"]) == 6


@pytest.mark.parametrize(
    "raw",
    [
        '```json\n{"findings": []}\n```',
        '```\n{"findings": []}\n```',
        '```JSON {"findings": []} ```',
    ],
)
def test_fenced_json(raw):
    assert generate_json(FakeLLM([raw]), "p", SYSTEM) == {"findings": []}


def test_think_block_then_json():
    raw = '<think>\nThe user wants {"not": "this"} ...\n</think>\n\n{"findings": [{"risk_id": "X"}]}'
    assert generate_json(FakeLLM([raw]), "p", SYSTEM) == {"findings": [{"risk_id": "X"}]}


def test_think_block_then_fenced_json():
    raw = '<think>reasoning</think>\n```json\n{"findings": []}\n```'
    assert generate_json(FakeLLM([raw]), "p", SYSTEM) == {"findings": []}


def test_text_around_json_is_ignored():
    raw = 'Here is the answer:\n{"findings": []}\nHope this helps.'
    assert generate_json(FakeLLM([raw]), "p", SYSTEM) == {"findings": []}


# --- generate_json: failures ------------------------------------------------------------


@pytest.mark.parametrize("raw", ["not json at all", '{"findings": [', "{'single': 'quotes'}"])
def test_invalid_json(raw):
    with pytest.raises(ExplanationLLMError, match="not valid JSON"):
        generate_json(FakeLLM([raw]), "p", SYSTEM)


@pytest.mark.parametrize("raw", ['["a", "b"]', '"just a string"', "42"])
def test_json_that_is_not_an_object(raw):
    with pytest.raises(ExplanationLLMError):
        generate_json(FakeLLM([raw]), "p", SYSTEM)


@pytest.mark.parametrize("raw", ["", "   \n "])
def test_empty_response(raw):
    with pytest.raises(ExplanationLLMError, match="empty"):
        generate_json(FakeLLM([raw]), "p", SYSTEM)


def test_oversized_response():
    raw = '{"findings": [], "pad": "' + "x" * MAX_RESPONSE_CHARS + '"}'
    with pytest.raises(ExplanationLLMError, match="too long"):
        generate_json(FakeLLM([raw]), "p", SYSTEM)


@pytest.mark.parametrize(
    "error",
    [RuntimeError("boom"), OllamaError("down"), LLMAPIError("quota", status_code=429), TimeoutError()],
)
def test_client_exception_is_wrapped(error):
    with pytest.raises(ExplanationLLMError, match="The LLM call failed.") as info:
        generate_json(FakeLLM([error]), "p", SYSTEM)
    assert info.value.__cause__ is error


def test_failure_logs_only_exception_type(caplog):
    secret = "clause text that must never be logged"
    with caplog.at_level(logging.DEBUG, logger=llm.__name__):
        with pytest.raises(ExplanationLLMError):
            generate_json(FakeLLM([RuntimeError(secret)]), secret, SYSTEM)
    assert "RuntimeError" in caplog.text
    assert secret not in caplog.text


# --- get_client ---------------------------------------------------------------------------


def test_get_client_none_when_llm_disabled():
    assert get_client(_settings(explanation_use_llm=False)) == (None, None, None)


def test_get_client_builds_ollama_client():
    # Creating the client does not contact the Ollama server.
    client, provider, model = get_client(_settings())
    assert isinstance(client, OllamaClient)
    assert (provider, model) == ("ollama", "qwen3:8b")


def test_ollama_calls_are_limited_to_the_report_budget():
    client, _, _ = get_client(_settings(explanation_llm_budget_seconds=123))
    assert client._client._client.timeout.read == 123


def test_get_client_none_when_ollama_not_configured():
    assert get_client(_settings(ollama_model="   ")) == (None, None, None)


def test_get_client_none_when_gemini_not_configured():
    assert get_client(_settings(llm_provider="gemini")) == (None, None, None)


class StubGemini:
    created = []

    def __init__(self, settings):
        StubGemini.created.append(settings)


def test_get_client_builds_gemini_with_an_ollama_fallback(monkeypatch):
    StubGemini.created = []
    monkeypatch.setattr(llm, "GeminiClient", StubGemini)
    settings = _settings(llm_provider="gemini", gemini_api_key="test-key", llm_model="gemini-test",
                         llm_max_retries=2)

    client, provider, model = get_client(settings)

    assert isinstance(client, FallbackClient)
    assert (provider, model) == ("gemini", "gemini-test")
    # The fallback replaces Gemini's retries: a 429 goes straight to the local model.
    assert StubGemini.created[0].llm_max_retries == 0
    assert settings.llm_max_retries == 2  # the shared settings are untouched
    assert isinstance(client._fallback, OllamaClient)


def test_get_client_gemini_alone_without_an_ollama_model(monkeypatch):
    StubGemini.created = []
    monkeypatch.setattr(llm, "GeminiClient", StubGemini)
    settings = _settings(llm_provider="gemini", gemini_api_key="test-key", llm_model="gemini-test",
                         ollama_model=" ")

    client, provider, _ = get_client(settings)

    assert isinstance(client, StubGemini) and StubGemini.created[0] is settings
    assert provider == "gemini"


# --- FallbackClient ---------------------------------------------------------------------


def _fallback(gemini, ollama) -> FallbackClient:
    return FallbackClient(gemini, ollama, primary_name="gemini", primary_model="gemini-test",
                          fallback_name="ollama", fallback_model="qwen3:4b")


def test_fallback_client_uses_gemini_while_it_works():
    client = _fallback(FakeLLM(["a", "b"]), FakeLLM([]))

    assert [client.generate_text("p1"), client.generate_text("p2")] == ["a", "b"]
    assert active_model(client, "gemini", "gemini-test") == ("gemini", "gemini-test")


def test_fallback_client_switches_to_ollama_after_a_gemini_failure():
    gemini = FakeLLM([LLMAPIError("rate limited", status_code=429)])
    ollama = FakeLLM(["first", "second"])
    client = _fallback(gemini, ollama)

    assert client.generate_text("p1", system_instruction="s", json_output=True) == "first"
    assert client.generate_text("p2") == "second"

    assert len(gemini.calls) == 1  # not asked again for the second batch
    assert ollama.calls[0].system_instruction == "s" and ollama.calls[0].json_output is True
    assert active_model(client, "gemini", "gemini-test") == ("ollama", "qwen3:4b")


def test_fallback_client_raises_when_both_fail():
    client = _fallback(FakeLLM([LLMAPIError("429", status_code=429)]), FakeLLM([OllamaError("down")]))

    with pytest.raises(OllamaError):
        client.generate_text("p")


def test_active_model_of_a_plain_client_is_what_was_configured():
    assert active_model(FakeLLM([]), "ollama", "qwen3:8b") == ("ollama", "qwen3:8b")


def test_get_client_none_when_client_construction_fails(monkeypatch):
    def broken(**kwargs):
        raise OllamaError("bad config")

    monkeypatch.setattr(llm, "OllamaClient", broken)
    assert get_client(_settings()) == (None, None, None)


def test_explanation_use_llm_defaults_to_true():
    assert Settings().explanation_use_llm is True
