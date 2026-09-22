# Agent 1 risk identification and scoring logic (Member 1)
"""Risk identification: rules first, then (optionally) Google GenAI, then a merge.

The rule-based result is always computed. The LLM is an extra opinion: if it is not
configured, times out, fails, or returns something unusable, the caller still gets
the rule-based risks plus a warning. The service never raises because of the LLM.
"""

import logging
from dataclasses import dataclass
from typing import List, Optional

from agents.risk_agent.llm_enricher import LLMInvalidResponseError, LLMRiskEnricher, TextGenerator
from agents.risk_agent.risk_merger import merge_risks
from agents.risk_agent.rule_engine import as_business_type, candidate_risks, identify_risks
from shared.config.settings import Settings, get_settings
from shared.llm.gemini_client import (
    GeminiClient,
    LLMAPIError,
    LLMConfigError,
    LLMError,
    LLMTimeoutError,
)
from shared.models.business import BusinessProfile
from shared.models.risk import IdentifiedRisk
from shared.schemas.responses import ProfileWarning, WarningCode

logger = logging.getLogger(__name__)

# Fixed, safe wording. Exception text is never shown to the caller.
_FALLBACK = "only rule-based results are shown."
_WARNING_TEXT = {
    LLMConfigError: "The AI assistant is not configured, so " + _FALLBACK,
    LLMTimeoutError: "The AI assistant timed out, so " + _FALLBACK,
    LLMAPIError: "The AI assistant is temporarily unavailable, so " + _FALLBACK,
    LLMInvalidResponseError: "The AI assistant returned an unusable answer, so " + _FALLBACK,
}
_REJECTED_TEXT = "The AI assistant rejected the request, so " + _FALLBACK
_DEFAULT_WARNING_TEXT = "The AI assistant could not be used, so " + _FALLBACK
_REJECTED_STATUSES = {400, 401, 403, 404}  # bad request, bad key or wrong model name


def _warning_text(exc: LLMError) -> str:
    if isinstance(exc, LLMAPIError) and exc.status_code in _REJECTED_STATUSES:
        return _REJECTED_TEXT
    return _WARNING_TEXT.get(type(exc), _DEFAULT_WARNING_TEXT)


@dataclass(frozen=True)
class IdentificationResult:
    risks: List[IdentifiedRisk]
    warnings: List[ProfileWarning]
    llm_used: bool  # True only if the LLM answered with a usable response
    llm_model: Optional[str]


class RiskIdentificationService:
    def __init__(
        self,
        llm_client: Optional[TextGenerator] = None,
        *,
        use_llm: bool = True,
        settings: Optional[Settings] = None,
    ) -> None:
        """`llm_client` can be any object with `generate_text` (used in tests).

        Without one, a `GeminiClient` is created from the environment settings.
        """
        self._llm_client = llm_client
        self._use_llm = use_llm
        self._settings = settings

    def identify(self, profile: BusinessProfile) -> IdentificationResult:
        rule_result = identify_risks(profile)
        warnings = list(rule_result.warnings)

        if not self._use_llm:
            return IdentificationResult(rule_result.risks, warnings, False, None)

        candidates = candidate_risks(as_business_type(getattr(profile, "business_type", None)))
        try:
            client = self._get_client()
            suggestions = LLMRiskEnricher(client).suggest(profile, candidates)
        except LLMError as exc:
            # Log only the error type, never its text, the prompt or the response.
            logger.warning("LLM step failed (%s); using rule-based results", type(exc).__name__)
            message = _warning_text(exc)
            warnings.append(ProfileWarning(code=WarningCode.LLM_UNAVAILABLE, message=message))
            return IdentificationResult(rule_result.risks, warnings, False, None)

        risks = merge_risks(rule_result.risks, suggestions, candidates)
        model = (self._get_settings().llm_model or "").strip() or None
        return IdentificationResult(risks, warnings, True, model)

    def _get_settings(self) -> Settings:
        if self._settings is None:
            self._settings = get_settings()
        return self._settings

    def _get_client(self) -> TextGenerator:
        if self._llm_client is None:
            # Raises LLMConfigError if the API key or model is missing.
            self._llm_client = GeminiClient(self._get_settings())
        return self._llm_client
