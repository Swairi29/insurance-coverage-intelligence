"""Tests for batched LLM generation (FakeLLM only)."""

from __future__ import annotations

import json
import logging

import pytest

from agents.explanation_agent import rag
from agents.explanation_agent.context import FindingPair
from agents.explanation_agent.rag import SYSTEM_INSTRUCTION, generate_llm_items
from agents.explanation_agent.tests.fakes import FakeLLM, load_fixture, load_llm_response
from shared.schemas.requests import ExplanationRequest

ORDER = ["FIRE_COOKING", "EQP_BREAKDOWN", "PROP_THEFT", "CYB_PAYMENT_FRAUD", "PROP_WEATHER", "BI_PREMISES_CLOSURE"]


def _load(name: str) -> ExplanationRequest:
    return ExplanationRequest.model_validate(load_fixture(name))


def _pairs(request: ExplanationRequest) -> list:
    risks = {risk.risk_id: risk for risk in request.risks}
    return [FindingPair(a, risks.get(a.risk_id)) for a in request.assessments]


BAKERY = _load("bakery_mixed.json")
PAIRS = _pairs(BAKERY)
GOOD_ITEMS = {i["risk_id"]: i for i in json.loads(load_llm_response("bakery_mixed_good.json"))["findings"]}
BAD_ITEMS = {i["risk_id"]: i for i in json.loads(load_llm_response("bakery_mixed_bad.json"))["findings"]}


def _answer(risk_ids, items=GOOD_ITEMS) -> str:
    """A JSON answer containing only the given findings (one batch's worth)."""
    return json.dumps({"findings": [items[r] for r in risk_ids if r in items]})


# --- whole report in one batch -------------------------------------------------------------------


def test_good_response_accepts_every_item():
    fake = FakeLLM([load_llm_response("bakery_mixed_good.json")])
    items, problems = generate_llm_items(PAIRS, BAKERY.business_type, fake, batch_size=6)
    assert problems == []
    assert list(items) == ORDER
    assert items["PROP_THEFT"] == {
        "explanation": GOOD_ITEMS["PROP_THEFT"]["explanation"],
        "recommendation": GOOD_ITEMS["PROP_THEFT"]["recommendation"],
        "cited_chunk_ids": ["P001-p7-c2"],
    }
    call = fake.calls[0]
    assert call.system_instruction == SYSTEM_INSTRUCTION and call.json_output is True


def test_bad_response_keeps_only_prop_theft():
    fake = FakeLLM([load_llm_response("bakery_mixed_bad.json")])
    items, problems = generate_llm_items(PAIRS, BAKERY.business_type, fake, batch_size=6)
    assert list(items) == ["PROP_THEFT"]
    assert sorted(problems) == sorted([
        "CYB_PAYMENT_FRAUD: missing",
        "FIRE_COOKING: V5",
        "EQP_BREAKDOWN: V4",
        "PROP_WEATHER: V6",
        "BI_PREMISES_CLOSURE: V8",
    ])


def test_exception_gives_no_items():
    fake = FakeLLM([RuntimeError("model crashed")])
    items, problems = generate_llm_items(PAIRS, BAKERY.business_type, fake, batch_size=6)
    assert items == {}
    assert problems == ["batch 1: llm_error"]


def test_invalid_json_gives_no_items():
    items, problems = generate_llm_items(PAIRS, BAKERY.business_type, FakeLLM(["not json"]), batch_size=6)
    assert items == {} and problems == ["batch 1: llm_error"]


def test_wrong_envelope_gives_no_items():
    items, problems = generate_llm_items(PAIRS, BAKERY.business_type, FakeLLM(['{"answer": []}']), batch_size=6)
    assert items == {} and problems == ["envelope: V1"]


# --- batching ----------------------------------------------------------------------------------------


def test_default_batch_size_makes_two_calls():
    fake = FakeLLM([_answer(ORDER[:4]), _answer(ORDER[4:])])
    items, problems = generate_llm_items(PAIRS, BAKERY.business_type, fake)
    assert len(fake.calls) == 2
    assert set(items) == set(ORDER) and problems == []
    assert "risk_ids: FIRE_COOKING, EQP_BREAKDOWN, PROP_THEFT, CYB_PAYMENT_FRAUD\n" in fake.prompts[0]
    assert "risk_ids: PROP_WEATHER, BI_PREMISES_CLOSURE\n" in fake.prompts[1]


def test_failed_middle_batch_does_not_affect_others():
    fake = FakeLLM([_answer(ORDER[0:2]), TimeoutError(), _answer(ORDER[4:6])])
    items, problems = generate_llm_items(PAIRS, BAKERY.business_type, fake, batch_size=2)
    assert len(fake.calls) == 3
    assert set(items) == {"FIRE_COOKING", "EQP_BREAKDOWN", "PROP_WEATHER", "BI_PREMISES_CLOSURE"}
    assert problems == ["batch 2: llm_error"]


def test_item_answered_in_the_wrong_batch_is_rejected():
    # Batch 1 is about FIRE_COOKING / EQP_BREAKDOWN; an answer for PROP_THEFT there is unexpected.
    fake = FakeLLM([_answer(["FIRE_COOKING", "PROP_THEFT"]), _answer(ORDER[2:4]), _answer(ORDER[4:6])])
    items, problems = generate_llm_items(PAIRS, BAKERY.business_type, fake, batch_size=2)
    assert "EQP_BREAKDOWN" not in items
    assert problems == ["PROP_THEFT: V2", "EQP_BREAKDOWN: missing"]


def test_batch_size_below_one_is_treated_as_one():
    fake = FakeLLM([_answer([r]) for r in ORDER])
    items, _ = generate_llm_items(PAIRS, BAKERY.business_type, fake, batch_size=0)
    assert len(fake.calls) == 6 and len(items) == 6


def test_no_pairs_no_calls():
    fake = FakeLLM([])
    assert generate_llm_items([], BAKERY.business_type, fake) == ({}, [])
    assert fake.calls == []


# --- cleaning ------------------------------------------------------------------------------------------


def test_items_are_stripped_and_citations_deduplicated():
    item = {**GOOD_ITEMS["PROP_THEFT"], "explanation": "  Theft needs a forced break-in.  ",
            "cited_chunk_ids": ["P001-p7-c2", "P001-p7-c2"], "extra": "ignored"}
    fake = FakeLLM([json.dumps({"findings": [item]})])
    theft = [p for p in PAIRS if p.assessment.risk_id == "PROP_THEFT"]
    items, _ = generate_llm_items(theft, BAKERY.business_type, fake)
    assert items["PROP_THEFT"]["explanation"] == "Theft needs a forced break-in."
    assert items["PROP_THEFT"]["cited_chunk_ids"] == ["P001-p7-c2"]
    assert "extra" not in items["PROP_THEFT"]


# --- safety ----------------------------------------------------------------------------------------------


def test_injection_clause_never_sent_to_the_llm():
    request = _load("injection.json")
    fake = FakeLLM([_answer(["FIRE_COOKING"])])
    items, problems = generate_llm_items(_pairs(request), request.business_type, fake)
    assert all("Ignore all previous instructions" not in prompt for prompt in fake.prompts)
    assert all("covers everything" not in prompt for prompt in fake.prompts)
    assert set(items) == {"FIRE_COOKING"} and problems == ["PROP_WEATHER: missing"]


def test_citing_the_withheld_clause_is_rejected():
    request = _load("injection.json")
    weather = {**GOOD_ITEMS["PROP_WEATHER"], "cited_chunk_ids": ["P001-p5-c1"]}
    fake = FakeLLM([json.dumps({"findings": [GOOD_ITEMS["FIRE_COOKING"], weather]})])
    items, problems = generate_llm_items(_pairs(request), request.business_type, fake)
    assert "PROP_WEATHER" not in items and problems == ["PROP_WEATHER: V3"]


def test_unexpected_error_never_raises_and_logs_type_only(monkeypatch, caplog):
    def broken(*args, **kwargs):
        raise KeyError("secret clause text")

    monkeypatch.setattr(rag, "build_prompt", broken)
    with caplog.at_level(logging.DEBUG, logger=rag.__name__):
        items, problems = generate_llm_items(PAIRS, BAKERY.business_type, FakeLLM([]), batch_size=6)
    assert items == {} and problems == ["batch 1: error"]
    assert "KeyError" in caplog.text and "secret clause text" not in caplog.text


def test_problems_never_contain_llm_text():
    fake = FakeLLM([load_llm_response("bakery_mixed_bad.json")])
    _, problems = generate_llm_items(PAIRS, BAKERY.business_type, fake, batch_size=6)
    for problem in problems:
        risk_id, code = problem.split(": ")
        assert risk_id in ORDER and (code in {"missing"} or code.startswith("V"))


@pytest.mark.parametrize("name", ["bakery_mixed.json", "all_covered.json", "injection.json"])
def test_never_raises_even_if_every_call_fails(name):
    request = _load(name)
    fake = FakeLLM([RuntimeError("down")] * 5)
    items, problems = generate_llm_items(_pairs(request), request.business_type, fake)
    assert items == {} and all(p.endswith("llm_error") for p in problems)
