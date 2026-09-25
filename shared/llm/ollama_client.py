"""Local Ollama LLM client.

Provides the same generate_text() interface used by GeminiClient,
so agents can use a local model without changing their extraction logic.
"""

from __future__ import annotations

import logging
from typing import Optional

import ollama

logger = logging.getLogger(__name__)


class OllamaError(Exception):
    """Base error for Ollama failures."""


class OllamaConfigError(OllamaError):
    """Ollama model configuration is missing."""


class OllamaResponseError(OllamaError):
    """Ollama returned an empty or unusable response."""


class OllamaClient:
    """Small wrapper around the local Ollama server."""

    def __init__(
        self,
        model: str = "qwen3:8b",
        host: str = "http://localhost:11434",
    ) -> None:
        self._model = model.strip()

        if not self._model:
            raise OllamaConfigError("OLLAMA_MODEL is not set.")

        self._client = ollama.Client(host=host)

    def generate_text(
        self,
        prompt: str,
        *,
        system_instruction: Optional[str] = None,
        json_output: bool = False,
    ) -> str:
        """Send a prompt to the local Ollama model and return text."""

        try:
            messages = []

            if system_instruction:
                messages.append(
                    {
                        "role": "system",
                        "content": system_instruction,
                    }
                )

            messages.append(
                {
                    "role": "user",
                    "content": prompt,
                }
            )

            options = {
                "temperature": 0.0,
            }

            response = self._client.chat(
                model=self._model,
                messages=messages,
                options=options,
                # JSON mode is a top-level chat() argument; inside `options`
                # Ollama ignores it.
                format="json" if json_output else None,
                # Reasoning models (e.g. qwen3) otherwise "think" first, which
                # is much slower on CPU and not needed for these tasks.
                think=False,
            )

            text = response["message"]["content"]

            if not text or not text.strip():
                raise OllamaResponseError(
                    "Ollama returned an empty response."
                )

            return text

        except OllamaError:
            raise

        except Exception as exc:
            logger.exception("Ollama request failed")
            raise OllamaError(
                "Could not generate a response from the local Ollama model."
            ) from exc