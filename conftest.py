"""Shared pytest setup.

Makes sure no test can pick up a real API key from the developer's shell or
`.env` file, so the whole suite runs without any credentials or network.
"""

import pytest

from shared.config.settings import Settings, get_settings

_LLM_ENV_VARS = (
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "LLM_MODEL",
    "LLM_MAX_TOKENS",
    "LLM_TEMPERATURE",
    "LLM_TIMEOUT_SECONDS",
    "LLM_MAX_RETRIES",
)


@pytest.fixture(autouse=True)
def _isolate_llm_environment(monkeypatch):
    for name in _LLM_ENV_VARS:
        monkeypatch.delenv(name, raising=False)
    # Do not read the developer's local .env file during tests.
    monkeypatch.setitem(Settings.model_config, "env_file", None)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
