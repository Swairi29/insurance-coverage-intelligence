"""Shared Gemini API wrapper used by all agents.

Responsibilities:
- read the API key and model name from settings (environment variables);
- fail with a clear, safe error when they are missing;
- apply a timeout and retry temporary failures (rate limits, server errors);
- turn every failure into one of our own `LLMError` types, so agents can catch
  `LLMError` and fall back to their non-LLM logic.

The API key is never logged or included in error messages.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Callable, Optional

import httpx
from google import genai
from google.genai import errors, types

from shared.config.settings import Settings, get_settings

logger = logging.getLogger(__name__)

# HTTP statuses worth retrying: rate limit and temporary server problems.
_RETRYABLE_STATUS = {429, 500, 502, 503, 504}


class LLMError(Exception):
    """Base class for every error raised by this module."""


class LLMConfigError(LLMError):
    """The API key or model name is missing."""


class LLMTimeoutError(LLMError):
    """Gemini did not answer within the configured timeout."""


class LLMAPIError(LLMError):
    """Gemini (or the network) returned an error."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


class LLMResponseError(LLMError):
    """Gemini answered, but with no usable text (e.g. blocked or empty)."""


def _describe_status(status: Optional[int]) -> str:
    if status in (400, 401, 403):
        return f"Gemini rejected the request (HTTP {status}). Check GEMINI_API_KEY."
    if status == 404:
        return "Gemini model not found (HTTP 404). Check LLM_MODEL."
    if status == 429:
        return "Gemini rate limit or quota exceeded (HTTP 429)."
    return f"Gemini API error (HTTP {status})."


class GeminiClient:
    """Small wrapper around `google.genai.Client` for text generation."""

    def __init__(
        self,
        settings: Optional[Settings] = None,
        *,
        client: Any = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        # `client` and `sleep` can be replaced in unit tests, so tests need
        # neither a real API key nor real waiting.
        self._settings = settings or get_settings()

        self._model = (self._settings.llm_model or "").strip()
        if not self._model:
            raise LLMConfigError("LLM_MODEL is not set. Add it to your .env file.")

        if client is None:
            api_key = (
                self._settings.gemini_api_key.get_secret_value().strip()
                if self._settings.gemini_api_key
                else ""
            )
            if not api_key:
                raise LLMConfigError(
                    "GEMINI_API_KEY is not set. Add it to your .env file."
                )
            client = genai.Client(
                api_key=api_key,
                # The SDK expects milliseconds.
                http_options=types.HttpOptions(
                    timeout=int(self._settings.llm_timeout_seconds * 1000)
                ),
            )

        self._client = client
        self._sleep = sleep

    def generate_text(
        self,
        prompt: str,
        *,
        system_instruction: Optional[str] = None,
        json_output: bool = False,
    ) -> str:
        """Send `prompt` to Gemini and return the response text.

        Set `json_output=True` to ask Gemini for JSON. Parsing and validating
        that JSON is the caller's job.

        Raises an `LLMError` subclass on any failure.
        """
        config = types.GenerateContentConfig(
            temperature=self._settings.llm_temperature,
            max_output_tokens=self._settings.llm_max_tokens,
            system_instruction=system_instruction,
            response_mime_type="application/json" if json_output else None,
            # We use no tools; this also silences an SDK warning about tool calling.
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )

        attempts = self._settings.llm_max_retries + 1
        for attempt in range(1, attempts + 1):
            try:
                response = self._client.models.generate_content(
                    model=self._model, contents=prompt, config=config
                )
                return self._extract_text(response)
            except errors.APIError as exc:
                status = getattr(exc, "code", None)
                if status in _RETRYABLE_STATUS and attempt < attempts:
                    self._wait_before_retry(attempt, attempts, f"HTTP {status}")
                    continue
                raise LLMAPIError(_describe_status(status), status_code=status) from exc
            except httpx.TimeoutException as exc:
                if attempt < attempts:
                    self._wait_before_retry(attempt, attempts, "timeout")
                    continue
                raise LLMTimeoutError(
                    f"Gemini did not respond within {self._settings.llm_timeout_seconds:g}s."
                ) from exc
            except httpx.TransportError as exc:
                if attempt < attempts:
                    self._wait_before_retry(attempt, attempts, "network error")
                    continue
                raise LLMAPIError("Could not reach the Gemini API (network error).") from exc

        # Unreachable (the loop always returns or raises), kept for type checkers.
        raise LLMAPIError("Gemini call failed.")

    @staticmethod
    def _extract_text(response: Any) -> str:
        text = getattr(response, "text", None)
        if not text or not text.strip():
            raise LLMResponseError("Gemini returned an empty response (it may have been blocked).")
        return text

    def _wait_before_retry(self, attempt: int, attempts: int, reason: str) -> None:
        delay = min(2 ** (attempt - 1), 8)  # 1s, 2s, 4s ... capped at 8s
        logger.warning(
            "Gemini call failed (%s), retrying in %ss (attempt %d of %d)",
            reason, delay, attempt, attempts,
        )
        self._sleep(delay)
