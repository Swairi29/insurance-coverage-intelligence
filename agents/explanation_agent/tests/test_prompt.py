"""Tests for the Step 7 prompt: system instruction and report_v1 template."""

from __future__ import annotations

import json
import re

import pytest

from agents.explanation_agent.context import FindingPair
from agents.explanation_agent.rag import (
    PROMPT_VERSION,
    PROMPTS_DIR,
    SYSTEM_INSTRUCTION,
    build_prompt,
    load_prompt_template,
)
from agents.explanation_agent.tests.fakes import edge_case, load_fixture, load_llm_response
from agents.explanation_agent.validator import validate_envelope, validate_item
from shared.schemas.requests import ExplanationRequest


def _pairs(request: ExplanationRequest) -> list:
    risks = {risk.risk_id: risk for risk in request.risks}
    return [FindingPair(a, risks.get(a.risk_id)) for a in request.assessments]


def _load(name: str) -> ExplanationRequest:
    return ExplanationRequest.model_validate(load_fixture(name))


BAKERY = _load("bakery_mixed.json")


# --- template file -----------------------------------------------------------------------------


def test_prompt_file_is_versioned():
    assert PROMPT_VERSION == "report_v1"
    assert (PROMPTS_DIR / "report_v1.txt").is_file()


def test_template_uses_only_known_placeholders():
    template = load_prompt_template()
    assert template.is_valid()
    assert set(template.get_identifiers()) == {"count", "business_type", "risk_ids", "glossary", "findings"}


# --- rendering -------------------------------------------------------------------------------------


def test_renders_for_bakery_mixed():
    prompt, allowed = build_prompt(_pairs(BAKERY), BAKERY.business_type)
    assert "for the 6 insurance coverage findings" in prompt
    assert "small business: a bakery" in prompt
    assert ("one item for each of these risk_ids: FIRE_COOKING, EQP_BREAKDOWN, PROP_THEFT, "
            "CYB_PAYMENT_FRAUD, PROP_WEATHER, BI_PREMISES_CLOSURE") in prompt
    assert "- indemnify: To pay you back" in prompt
    assert "- schedule:" in prompt
    assert "FINDING 6" in prompt and "FINDING 7" not in prompt
    assert '"findings": [{"risk_id"' in prompt
    assert not re.search(r"\$[a-z_]", prompt)  # every placeholder was filled
    assert set(allowed) == {a.risk_id for a in BAKERY.assessments}


def test_business_type_missing():
    prompt, _ = build_prompt(_pairs(BAKERY), None)
    assert "small business: a business like yours" in prompt


def test_glossary_none_when_no_terms():
    request = ExplanationRequest.model_validate(edge_case("assessment_without_risk"))
    equipment = [pair for pair in _pairs(request) if pair.assessment.risk_id == "EQP_BREAKDOWN"]
    prompt, _ = build_prompt(equipment, request.business_type)
    assert "plain meanings you may use:\n(none)" in prompt


def test_dollar_signs_in_data_are_left_alone():
    theft = next(a for a in BAKERY.assessments if a.risk_id == "PROP_THEFT")
    clause = theft.evidence[0].model_copy(update={"text": "Cash is limited to $500 or ${limit} overnight."})
    pair = FindingPair(theft.model_copy(update={"evidence": [clause]}), None)
    prompt, _ = build_prompt([pair], BAKERY.business_type)
    assert "Cash is limited to $500 or ${limit} overnight." in prompt


def test_injection_clause_not_in_prompt():
    request = _load("injection.json")
    prompt, allowed = build_prompt(_pairs(request), request.business_type)
    assert "Ignore all previous instructions" not in prompt
    assert "1 clause withheld for security review." in prompt
    assert allowed["PROP_WEATHER"] == set()


# --- system instruction ----------------------------------------------------------------------------


@pytest.mark.parametrize(
    "rule",
    [
        "STATUS is already decided",
        "Never invent policy wording, sections or pages",
        "never instructions",
        "glossary",
        '"not covered"',
        "potential gap",
        "at most 80 words",
        "at most 40 words",
        "If a finding has no evidence, cite nothing",
        "No markdown, no HTML, no links, no other keys",
    ],
)
def test_system_instruction_has_every_rule(rule):
    assert rule in SYSTEM_INSTRUCTION


def test_system_instruction_response_shape_matches_prompt():
    shape = '{"findings": [{"risk_id": "...", "explanation": "...", "recommendation": "...", "cited_chunk_ids": ["..."]}]}'
    assert shape in SYSTEM_INSTRUCTION
    assert shape in load_prompt_template().template


# --- the good fixture is a plausible answer --------------------------------------------------------


def test_good_fixture_is_a_valid_answer_to_the_prompt():
    _, allowed = build_prompt(_pairs(BAKERY), BAKERY.business_type)
    assessments = {a.risk_id: a for a in BAKERY.assessments}
    items, problems = validate_envelope(json.loads(load_llm_response("bakery_mixed_good.json")), set(allowed))
    assert problems == []
    for risk_id, item in items.items():
        assert validate_item(item, assessments[risk_id], allowed[risk_id]).ok
