"""Provider-agnostic LLM access for the Explanation & Recommendation Agent.

- `get_client` builds an Ollama client, or for Gemini a `FallbackClient`
  (Gemini first, the local Ollama model once Gemini fails), from settings, or
  returns `None` when the LLM is switched off or not configured (the agent then
  uses template wording only).
- `generate_json` calls the client and returns the parsed JSON object. Every
  failure becomes an `ExplanationLLMError`, so callers need one `except`.

Prompts, responses and error details are never logged; only exception types.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, Optional, Protocol, Tuple

from shared.config.settings import Settings, get_settings
from shared.llm.gemini_client import GeminiClient
from shared.llm.ollama_client import OllamaClient

logger = logging.getLogger(__name__)

MAX_RESPONSE_CHARS = 30_000

# qwen3 and similar models may "think out loud" before answering.
_THINK_BLOCK = re.compile(r"<think>.*?</think>", re.IGNORECASE | re.DOTALL)
_FENCE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.IGNORECASE | re.DOTALL)


class TextGenerator(Protocol):
    """What we need from an LLM client (`GeminiClient` and `OllamaClient` fit this)."""

    def generate_text(
        self,
        prompt: str,
        *,
        system_instruction: Optional[str] = None,
        json_output: bool = False,
    ) -> str: ...


class ExplanationLLMError(Exception):
    """The LLM could not produce a usable JSON answer. Messages are safe to log."""


class FallbackClient:
    """Gemini first; once it fails (often its free-tier rate limit, HTTP 429), the local
    Ollama model answers this call and every later one.

    A new client is built for every report and every question, so a failed Gemini is only
    skipped for the rest of that request. `provider` and `model` name the one that last
    answered, for the response metadata.
    """

    def __init__(self, primary: TextGenerator, fallback: TextGenerator, *,
                 primary_name: str, primary_model: str,
                 fallback_name: str, fallback_model: str) -> None:
        self._primary = primary
        self._fallback = fallback
        self._names = {primary: (primary_name, primary_model),
                       fallback: (fallback_name, fallback_model)}
        self.primary_failed = False
        self.provider, self.model = primary_name, primary_model

    def generate_text(
        self,
        prompt: str,
        *,
        system_instruction: Optional[str] = None,
        json_output: bool = False,
    ) -> str:
        if not self.primary_failed:
            try:
                return self._answer(self._primary, prompt, system_instruction, json_output)
            except Exception as exc:
                self.primary_failed = True
                logger.warning("%s failed (%s); using %s for the rest of this request.",
                               self._names[self._primary][0], type(exc).__name__,
                               self._names[self._fallback][0])
        return self._answer(self._fallback, prompt, system_instruction, json_output)

    def _answer(self, client: TextGenerator, prompt: str, system_instruction: Optional[str],
                json_output: bool) -> str:
        text = client.generate_text(prompt, system_instruction=system_instruction,
                                    json_output=json_output)
        self.provider, self.model = self._names[client]
        return text


def active_model(client: Optional[TextGenerator], provider: Optional[str],
                 model: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """The provider and model that actually answered: the fallback's, once it took over."""
    if isinstance(client, FallbackClient):
        return client.provider, client.model
    return provider, model


def get_client(
    settings: Optional[Settings] = None,
    *,
    ollama_timeout: Optional[float] = None,
) -> Tuple[Optional[TextGenerator], Optional[str], Optional[str]]:
    """Return `(client, provider, model)`, or `(None, None, None)` if no LLM should be used.

    `ollama_timeout` limits one Ollama call; by default it is the report budget.
    """
    settings = settings or get_settings()

    if not settings.explanation_use_llm:
        return None, None, None
    if not settings.llm_is_configured:
        logger.info("LLM provider %s is not configured; using template wording.", settings.llm_provider)
        return None, None, None

    try:
        # One call may not outlast the whole report budget (see ExplanationService).
        ollama_limit = ollama_timeout or settings.explanation_llm_budget_seconds
        if settings.llm_provider == "ollama":
            client: TextGenerator = OllamaClient(model=settings.ollama_model, host=settings.ollama_host,
                                                 timeout=ollama_limit)
            return client, "ollama", settings.ollama_model.strip()

        gemini_model = (settings.llm_model or "").strip()
        ollama_model = settings.ollama_model.strip()
        if not ollama_model:
            return GeminiClient(settings=settings), "gemini", gemini_model
        # With a fallback, a 429 is not retried: the local model answers straight away
        # instead of waiting out Gemini's rate limit on every batch.
        gemini = GeminiClient(settings=settings.model_copy(update={"llm_max_retries": 0}))
        ollama = OllamaClient(model=settings.ollama_model, host=settings.ollama_host, timeout=ollama_limit)
        client = FallbackClient(gemini, ollama, primary_name="gemini", primary_model=gemini_model,
                                fallback_name="ollama", fallback_model=ollama_model)
        return client, "gemini", gemini_model
    except Exception as exc:  # config errors from either client, or anything unexpected
        logger.warning("Could not create the LLM client (%s); using template wording.", type(exc).__name__)
        return None, None, None


def generate_json(client: TextGenerator, prompt: str, system: str) -> Dict[str, Any]:
    """Ask the LLM for JSON and return the parsed object."""
    try:
        raw = client.generate_text(prompt, system_instruction=system, json_output=True)
    except Exception as exc:  # LLMError, OllamaError, network errors, ...
        logger.warning("LLM call failed (%s).", type(exc).__name__)
        raise ExplanationLLMError("The LLM call failed.") from exc

    if not isinstance(raw, str) or not raw.strip():
        raise ExplanationLLMError("The LLM returned an empty response.")
    if len(raw) > MAX_RESPONSE_CHARS:
        raise ExplanationLLMError("The LLM response was too long.")

    text = _extract_json_text(raw)
    try:
        data = json.loads(text)
    except ValueError as exc:
        raise ExplanationLLMError("The LLM response was not valid JSON.") from exc

    if not isinstance(data, dict):
        raise ExplanationLLMError("The LLM response was not a JSON object.")
    return data


def _extract_json_text(raw: str) -> str:
    """Remove reasoning blocks, code fences and any text around the JSON object."""
    text = _THINK_BLOCK.sub("", raw).strip()

    fenced = _FENCE.match(text)
    if fenced:
        text = fenced.group(1).strip()

    # Small local models sometimes add a sentence before or after the object.
    if not text.startswith("{"):
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            text = text[start : end + 1]
    return text
