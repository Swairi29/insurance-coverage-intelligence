"""Unit tests for shared.config.settings (no API key or network needed)."""

import pytest
from pydantic import ValidationError

from shared.config.settings import Settings, get_settings

pytestmark = pytest.mark.unit


def test_defaults_when_nothing_is_set():
    settings = Settings()
    assert settings.gemini_api_key is None
    assert settings.llm_model is None
    assert settings.llm_timeout_seconds == 30
    assert settings.llm_max_retries == 2
    assert settings.llm_is_configured is False


def test_reads_key_and_model_from_environment(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-123")
    monkeypatch.setenv("LLM_MODEL", "some-gemini-model")
    settings = Settings()
    assert settings.gemini_api_key.get_secret_value() == "test-key-123"
    assert settings.llm_model == "some-gemini-model"
    assert settings.llm_is_configured is True


def test_empty_key_counts_as_missing(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("LLM_MODEL", "some-gemini-model")
    settings = Settings()
    assert settings.gemini_api_key is None
    assert settings.llm_is_configured is False


def test_key_is_hidden_in_repr_and_str(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "super-secret-key")
    settings = Settings()
    assert "super-secret-key" not in repr(settings)
    assert "super-secret-key" not in str(settings)


@pytest.mark.parametrize(
    "name, value",
    [
        ("LLM_TEMPERATURE", "5"),
        ("LLM_MAX_TOKENS", "0"),
        ("LLM_TIMEOUT_SECONDS", "-1"),
        ("LLM_MAX_RETRIES", "99"),
    ],
)
def test_invalid_numeric_values_are_rejected(monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    with pytest.raises(ValidationError):
        Settings()


def test_get_settings_is_cached():
    assert get_settings() is get_settings()
