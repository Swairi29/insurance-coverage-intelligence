"""Independent LLM provider fallback for Agent 3.

Provider order:
    1. Gemini (preferred when LLM_PROVIDER=gemini)
    2. Ollama (local fallback)

If both providers fail, this provider raises an exception.
CoverageAnalysisService then uses its deterministic wording fallback.

This module is independent from Agent 4's LLM factory.
"""

from __future__ import annotations

import logging
from typing import Optional

from agents.coverage_agent.interpreter import TextGenerator
from shared.config.settings import Settings, get_settings
from shared.llm.gemini_client import GeminiClient
from shared.llm.ollama_client import OllamaClient

logger = logging.getLogger(__name__)


class CoverageLLMProvider:
    """Gemini-first, Ollama-second LLM provider for Agent 3."""

    def __init__(
        self,
        *,
        primary: TextGenerator | None,
        primary_name: str | None,
        primary_model: str | None,
        fallback: TextGenerator | None,
        fallback_name: str | None,
        fallback_model: str | None,
    ) -> None:
        self.primary = primary
        self.primary_name = primary_name
        self.primary_model = primary_model

        self.fallback = fallback
        self.fallback_name = fallback_name
        self.fallback_model = fallback_model

        self.active_provider: str | None = None
        self.active_model: str | None = None

    def generate_text(
        self,
        prompt: str,
        *,
        system_instruction: str | None = None,
        json_output: bool = False,
    ) -> str:
        """Try Gemini first, then Ollama if Gemini fails."""

        # ---------------------------------------------------------
        # 1. Try primary provider: Gemini
        # ---------------------------------------------------------

        if self.primary is not None:
            try:
                response = self.primary.generate_text(
                    prompt,
                    system_instruction=system_instruction,
                    json_output=json_output,
                )

                self.active_provider = self.primary_name
                self.active_model = self.primary_model

                logger.info(
                    "Coverage Agent LLM provider used: %s (%s)",
                    self.primary_name,
                    self.primary_model,
                )

                return response

            except Exception as exc:
                logger.warning(
                    "Coverage Agent primary LLM failed (%s): %s. "
                    "Trying Ollama fallback.",
                    type(exc).__name__,
                    str(exc),
                )

        # ---------------------------------------------------------
        # 2. Try fallback provider: Ollama
        # ---------------------------------------------------------

        if self.fallback is not None:
            try:
                response = self.fallback.generate_text(
                    prompt,
                    system_instruction=system_instruction,
                    json_output=json_output,
                )

                self.active_provider = self.fallback_name
                self.active_model = self.fallback_model

                logger.info(
                    "Coverage Agent LLM provider used: %s (%s)",
                    self.fallback_name,
                    self.fallback_model,
                )

                return response

            except Exception as exc:
                logger.warning(
                    "Coverage Agent Ollama fallback failed (%s).",
                    type(exc).__name__,
                )

        # ---------------------------------------------------------
        # 3. Both providers failed.
        #
        # CoverageAnalysisService catches this and uses
        # wording.py as the deterministic fallback.
        # ---------------------------------------------------------

        raise RuntimeError(
            "No Coverage Agent LLM provider was available."
        )


def _build_gemini_client(
    settings: Settings,
) -> tuple[TextGenerator | None, str | None]:
    """Create the Gemini client if Gemini is configured."""

    if not getattr(settings, "gemini_api_key", None):
        logger.info(
            "Gemini API key is not configured for Coverage Agent."
        )
        return None, None

    try:
        client = GeminiClient(
            settings=settings,
        )

        return (
            client,
            (settings.llm_model or "").strip(),
        )

    except Exception as exc:
        logger.warning(
            "Could not initialize Gemini for Coverage Agent (%s).",
            type(exc).__name__,
        )
        return None, None


def _build_ollama_client(
    settings: Settings,
) -> tuple[TextGenerator | None, str | None]:
    """Create the local Ollama fallback client."""

    try:
        client = OllamaClient(
            model=settings.ollama_model,
            host=settings.ollama_host,
            timeout=settings.explanation_llm_budget_seconds,
        )

        return (
            client,
            settings.ollama_model.strip(),
        )

    except Exception as exc:
        logger.warning(
            "Could not initialize Ollama for Coverage Agent (%s).",
            type(exc).__name__,
        )
        return None, None


def create_coverage_llm_provider(
    settings: Optional[Settings] = None,
) -> CoverageLLMProvider | None:
    """Create Agent 3's independent Gemini-first/Ollama-second provider."""

    settings = settings or get_settings()

    # LLM completely disabled.
    if not settings.explanation_use_llm:
        return None

    provider = settings.llm_provider.strip().lower()

    # -------------------------------------------------------------
    # Gemini preferred.
    #
    # .env:
    #
    # LLM_PROVIDER=gemini
    #
    # Gemini is tried first.
    # Ollama is automatically prepared as the fallback.
    # -------------------------------------------------------------

    if provider == "gemini":
        gemini, gemini_model = _build_gemini_client(
            settings
        )

        ollama, ollama_model = _build_ollama_client(
            settings
        )

        return CoverageLLMProvider(
            primary=gemini,
            primary_name="gemini" if gemini is not None else None,
            primary_model=gemini_model,
            fallback=ollama,
            fallback_name="ollama" if ollama is not None else None,
            fallback_model=ollama_model,
        )

    # -------------------------------------------------------------
    # Explicit Ollama mode.
    #
    # Useful when we want to test Agent 3 locally without Gemini.
    # -------------------------------------------------------------

    if provider == "ollama":
        ollama, ollama_model = _build_ollama_client(
            settings
        )

        return CoverageLLMProvider(
            primary=ollama,
            primary_name="ollama" if ollama is not None else None,
            primary_model=ollama_model,
            fallback=None,
            fallback_name=None,
            fallback_model=None,
        )

    # -------------------------------------------------------------
    # Unknown provider.
    #
    # Returning None causes Agent 3 to use its deterministic
    # rules/wording fallback.
    # -------------------------------------------------------------

    logger.warning(
        "Unsupported LLM_PROVIDER=%r for Coverage Agent. "
        "Using deterministic fallback.",
        provider,
    )

    return None