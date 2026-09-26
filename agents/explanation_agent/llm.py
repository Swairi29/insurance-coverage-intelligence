"""Provider-agnostic LLM access for the Explanation & Recommendation Agent.

- `get_client` builds an Ollama or Gemini client from settings, or returns
  `None` when the LLM is switched off or not configured (the agent then uses
  template wording only).
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


def get_client(
    settings: Optional[Settings] = None,
) -> Tuple[Optional[TextGenerator], Optional[str], Optional[str]]:
    """Return `(client, provider, model)`, or `(None, None, None)` if no LLM should be used."""
    settings = settings or get_settings()

    if not settings.explanation_use_llm:
        return None, None, None
    if not settings.llm_is_configured:
        logger.info("LLM provider %s is not configured; using template wording.", settings.llm_provider)
        return None, None, None

    try:
        if settings.llm_provider == "ollama":
            # One call may not outlast the whole report budget (see ExplanationService).
            client: TextGenerator = OllamaClient(model=settings.ollama_model, host=settings.ollama_host,
                                                 timeout=settings.explanation_llm_budget_seconds)
            return client, "ollama", settings.ollama_model.strip()

        client = GeminiClient(settings=settings)
        return client, "gemini", (settings.llm_model or "").strip()
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
