"""Unit tests for the risk identification service (rules + Google GenAI + merge).

No test here calls a real API. Fakes replace the LLM client, or the Google SDK
underneath the real GeminiClient wrapper.
"""

import json
import logging
from types import SimpleNamespace

import httpx
import pytest
from google.genai import errors

from agents.risk_agent.llm_enricher import LLMInvalidResponseError
from agents.risk_agent.rule_engine import identify_risks
from agents.risk_agent.service import IdentificationResult, RiskIdentificationService
from shared.config.settings import Settings
from shared.llm.gemini_client import (
    GeminiClient,
    LLMAPIError,
    LLMConfigError,
    LLMResponseError,
    LLMTimeoutError,
)
from shared.models.business import BusinessProfile
from shared.models.risk import RiskSource
from shared.schemas.responses import RiskProfileResponse, WarningCode

pytestmark = pytest.mark.unit

SETTINGS = Settings(llm_model="test-model")
FALLBACK_ENDING = "only rule-based results are shown."


class FakeClient:
    def __init__(self, response="", error=None):
        self.response, self.error, self.calls = response, error, 0

    def generate_text(self, prompt, *, system_instruction=None, json_output=False):
        self.calls += 1
        if self.error:
            raise self.error
        return self.response


def llm_answer(*items):
    return json.dumps({"risks": list(items)})


def suggestion(risk_id, reason="This is likely because of how the business operates.", confidence=0.8):
    return {"risk_id": risk_id, "reason": reason, "confidence": confidence}


@pytest.fixture
def bakery():
    return BusinessProfile(
        business_name="Sunrise Bakery", business_type="bakery",
        description="Family bakery. We also deliver wedding cakes by courier.",
        equipment=["deck oven"],
    )


def service_with(client, **kwargs):
    return RiskIdentificationService(client, settings=SETTINGS, **kwargs)


def by_id(result):
    return {r.risk_id: r for r in result.risks}


# --- happy path -----------------------------------------------------------------------------------

def test_llm_and_rules_are_combined(bakery):
    client = FakeClient(llm_answer(
        suggestion("FIRE_COOKING", "The deck oven runs for hours each morning."),   # rules found it too
        suggestion("BI_SUPPLIER", "Wedding cakes depend on a few specialist suppliers.", 0.7),  # new
    ))
    result = service_with(client).identify(bakery)
    risks = by_id(result)

    assert isinstance(result, IdentificationResult)
    assert result.llm_used is True and result.llm_model == "test-model"
    assert result.warnings == []
    assert risks["FIRE_COOKING"].source is RiskSource.RULE_AND_LLM
    assert risks["BI_SUPPLIER"].source is RiskSource.LLM
    assert risks["PROP_THEFT"].source is RiskSource.RULE  # untouched rule result
    assert len(risks) == len(result.risks)  # no duplicates


def test_every_rule_risk_is_still_present_after_the_merge(bakery):
    rule_ids = {r.risk_id for r in identify_risks(bakery).risks}
    result = service_with(FakeClient(llm_answer(suggestion("BI_SUPPLIER")))).identify(bakery)
    assert rule_ids <= set(by_id(result))


def test_invented_risks_never_reach_the_result(bakery):
    client = FakeClient(llm_answer(
        suggestion("COV_POLICY_GAP", "The current plan leaves equipment breakdown unprotected."),
        suggestion("FIRE_COOKING", "Buy insurance to cover the oven fire risk."),
        suggestion("LIA_PRODUCT", "Sold goods may be faulty."),          # retail-only
    ))
    result = service_with(client).identify(bakery)
    assert result.llm_used is True
    assert result.risks == identify_risks(bakery).risks  # nothing usable was added


def test_no_suggestions_still_counts_as_llm_used(bakery):
    result = service_with(FakeClient('{"risks": []}')).identify(bakery)
    assert result.llm_used is True and result.warnings == []
    assert result.risks == identify_risks(bakery).risks


def test_llm_use_can_be_switched_off(bakery):
    client = FakeClient(llm_answer(suggestion("BI_SUPPLIER")))
    result = service_with(client, use_llm=False).identify(bakery)
    assert client.calls == 0
    assert result.llm_used is False and result.llm_model is None and result.warnings == []
    assert result.risks == identify_risks(bakery).risks


# --- failures fall back to rule-based results ---------------------------------------------------------

@pytest.mark.parametrize(
    "error, expected_words",
    [
        (LLMTimeoutError("SECRET-DETAIL"), "timed out"),
        (LLMAPIError("SECRET-DETAIL", status_code=503), "temporarily unavailable"),
        (LLMAPIError("SECRET-DETAIL", status_code=403), "rejected the request"),
        (LLMResponseError("SECRET-DETAIL"), "AI assistant"),
        (LLMConfigError("SECRET-DETAIL"), "not configured"),
        (LLMInvalidResponseError("SECRET-DETAIL"), "unusable answer"),
    ],
)
def test_llm_errors_fall_back_to_rules_with_a_safe_warning(bakery, error, expected_words):
    result = service_with(FakeClient(error=error)).identify(bakery)

    assert result.risks == identify_risks(bakery).risks
    assert result.llm_used is False and result.llm_model is None
    (warning,) = result.warnings
    assert warning.code is WarningCode.LLM_UNAVAILABLE
    assert expected_words in warning.message
    assert warning.message.endswith(FALLBACK_ENDING)
    assert "SECRET-DETAIL" not in warning.message  # exception text is never exposed


@pytest.mark.parametrize(
    "bad_answer",
    ["not json", "", "[]", "null", '{"other": 1}', '{"risks": "PROP_THEFT"}', '{"risks": [', "```json\n{oops}\n```"],
)
def test_unusable_llm_answers_fall_back_to_rules(bakery, bad_answer):
    result = service_with(FakeClient(bad_answer)).identify(bakery)
    assert result.risks == identify_risks(bakery).risks
    assert result.llm_used is False
    assert [w.code for w in result.warnings] == [WarningCode.LLM_UNAVAILABLE]


def test_missing_api_key_falls_back_without_any_network_call(bakery):
    service = RiskIdentificationService(settings=Settings(llm_model="test-model"))  # no key
    result = service.identify(bakery)
    assert result.llm_used is False
    assert "not configured" in result.warnings[0].message
    assert result.risks == identify_risks(bakery).risks


def test_missing_model_name_falls_back_too(bakery):
    result = RiskIdentificationService(settings=Settings(gemini_api_key="k")).identify(bakery)
    assert result.llm_used is False and "not configured" in result.warnings[0].message


def test_unexpected_programming_errors_are_not_hidden(bakery):
    with pytest.raises(RuntimeError):
        service_with(FakeClient(error=RuntimeError("bug"))).identify(bakery)


def test_rule_warnings_are_kept_next_to_llm_warnings():
    odd = BusinessProfile.model_construct(business_name="X", business_type="pharmacy", equipment=["freezer"])
    result = service_with(FakeClient(error=LLMTimeoutError("t"))).identify(odd)
    assert [w.code for w in result.warnings] == [
        WarningCode.UNSUPPORTED_BUSINESS_TYPE, WarningCode.LLM_UNAVAILABLE,
    ]


def test_unknown_business_type_only_accepts_general_risks_from_the_llm():
    odd = BusinessProfile.model_construct(business_name="X", business_type="pharmacy")
    client = FakeClient(llm_answer(
        suggestion("FIRE_COOKING", "Cooking equipment is used on site."),      # not a general risk
        suggestion("EMP_INJURY", "Staff may be hurt while lifting stock."),    # general risk
    ))
    result = service_with(client).identify(odd)
    assert [r.risk_id for r in result.risks] == ["EMP_INJURY"]
    assert result.llm_used is True


# --- through the real GeminiClient wrapper, with the Google SDK mocked ---------------------------------------

class FakeModels:
    def __init__(self, outcomes):
        self.outcomes, self.calls = list(outcomes), []

    def generate_content(self, *, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return SimpleNamespace(text=outcome)


API_KEY = "TEST-API-KEY-must-never-leak"


def real_wrapper(outcomes, retries=1):
    settings = Settings(gemini_api_key=API_KEY, llm_model="test-model", llm_max_retries=retries)
    models = FakeModels(outcomes)
    client = GeminiClient(settings, client=SimpleNamespace(models=models), sleep=lambda _s: None)
    return RiskIdentificationService(client, settings=settings), models


def test_full_pipeline_with_a_mocked_google_sdk(bakery):
    service, models = real_wrapper([llm_answer(suggestion("BI_SUPPLIER"))])
    result = service.identify(bakery)

    assert result.llm_used is True and "BI_SUPPLIER" in by_id(result)
    (call,) = models.calls
    assert call["model"] == "test-model"
    assert call["config"].response_mime_type == "application/json"  # JSON output is required
    assert call["config"].system_instruction
    assert "Sunrise Bakery" not in call["contents"]                # business name is not sent


@pytest.mark.parametrize(
    "outcomes, expected",
    [
        ([httpx.ReadTimeout("t"), httpx.ReadTimeout("t")], "timed out"),
        ([errors.ServerError(503, {"error": {"message": "x"}})] * 2, "temporarily unavailable"),
        ([errors.ClientError(403, {"error": {"message": f"key {API_KEY} rejected"}})], "rejected the request"),
        ([httpx.ConnectError("no route")] * 2, "temporarily unavailable"),
        (["   "], "AI assistant"),
    ],
)
def test_timeouts_and_api_errors_end_in_rule_based_results(bakery, outcomes, expected):
    service, _ = real_wrapper(outcomes)
    result = service.identify(bakery)
    assert result.risks == identify_risks(bakery).risks
    assert result.llm_used is False
    assert expected in result.warnings[0].message


def test_temporary_error_is_retried_and_the_llm_is_then_used(bakery):
    service, models = real_wrapper([httpx.ReadTimeout("t"), llm_answer(suggestion("BI_SUPPLIER"))])
    assert service.identify(bakery).llm_used is True
    assert len(models.calls) == 2


# --- security -------------------------------------------------------------------------------------------------

@pytest.mark.security
def test_no_key_or_business_details_appear_in_logs_or_warnings(bakery, caplog):
    caplog.set_level(logging.DEBUG)
    profile = BusinessProfile(
        business_name="Hidden Name Bakery", business_type="bakery",
        description="TOPSECRET-DESCRIPTION reach me at owner@example.com",
    )
    outcomes_list = [
        [llm_answer(suggestion("BI_SUPPLIER", "TOPSECRET-REASON is in this answer."))],
        [errors.ClientError(403, {"error": {"message": f"key {API_KEY} rejected"}})],
        ["TOPSECRET-BAD-OUTPUT {"],
        [httpx.ReadTimeout("t"), httpx.ReadTimeout("t")],
    ]
    warnings_text = ""
    for outcomes in outcomes_list:
        service, _ = real_wrapper(outcomes)
        result = service.identify(profile)
        warnings_text += " ".join(w.message for w in result.warnings)

    everything = caplog.text + warnings_text
    for secret in (API_KEY, "TOPSECRET", "owner@example.com", "Hidden Name"):
        assert secret not in everything


# --- compatibility --------------------------------------------------------------------------------------------------

@pytest.mark.contract
def test_result_fits_the_response_schema(bakery):
    result = service_with(FakeClient(llm_answer(suggestion("BI_SUPPLIER")))).identify(bakery)
    response = RiskProfileResponse(
        request_id="req-1", status="complete", business_name=bakery.business_name,
        business_type=bakery.business_type, risks=result.risks, warnings=result.warnings,
        metadata={"taxonomy_version": "1.0", "llm_used": result.llm_used, "llm_model": result.llm_model},
    )
    assert RiskProfileResponse.model_validate_json(response.model_dump_json()) == response
