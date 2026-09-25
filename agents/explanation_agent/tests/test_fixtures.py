"""Checks that Agent 4's fixtures match the real shared contracts and each other."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from agents.explanation_agent.tests.fakes import (
    FakeLLM,
    edge_case,
    load_fixture,
    load_llm_response,
)
from shared.models.coverage import CoverageStatus
from shared.schemas.requests import ExplanationRequest
from shared.utils.security import scan_for_prompt_injection

REQUEST_FIXTURES = ["bakery_mixed.json", "all_covered.json", "injection.json"]
EDGE_CASE_NAMES = [
    "assessment_without_risk",
    "risk_without_assessment",
    "html_in_clause",
    "long_clause",
    "section_missing",
    "empty",
]
ADVERSARIAL_FILE = (
    Path(__file__).resolve().parents[3] / "data/sample_policies/adversarial/injected_exclusion.txt"
)


def _request(name: str) -> ExplanationRequest:
    return ExplanationRequest.model_validate(load_fixture(name))


def _items(name: str) -> dict:
    return {item["risk_id"]: item for item in json.loads(load_llm_response(name))["findings"]}


# --- request fixtures validate against the real models ----------------------------------


@pytest.mark.parametrize("name", REQUEST_FIXTURES)
def test_request_fixture_validates(name):
    request = _request(name)
    assert request.business_type is not None
    assert request.assessments


def test_edge_cases_file_has_every_case():
    assert [case["name"] for case in load_fixture("edge_cases.json")] == EDGE_CASE_NAMES


@pytest.mark.parametrize("name", EDGE_CASE_NAMES)
def test_edge_case_validates(name):
    ExplanationRequest.model_validate(edge_case(name))


def test_bakery_mixed_covers_every_status():
    request = _request("bakery_mixed.json")
    expected = {
        "FIRE_COOKING": (CoverageStatus.COVERED, False, 1),
        "EQP_BREAKDOWN": (CoverageStatus.NOT_FOUND, True, 0),
        "PROP_THEFT": (CoverageStatus.CONDITIONAL, False, 1),
        "CYB_PAYMENT_FRAUD": (CoverageStatus.NOT_FOUND, True, 0),
        "PROP_WEATHER": (CoverageStatus.EXCLUDED, True, 1),
        "BI_PREMISES_CLOSURE": (CoverageStatus.UNCLEAR, True, 1),
    }
    actual = {a.risk_id: (a.status, a.potential_gap, len(a.evidence)) for a in request.assessments}
    assert actual == expected
    assert {r.risk_id for r in request.risks} == set(expected)


def test_bakery_mixed_contains_glossary_words():
    # Step 6 expects the glossary lookup to find these terms in the clause text.
    text = " ".join(c.text for a in _request("bakery_mixed.json").assessments for c in a.evidence).lower()
    assert "indemnify" in text and "schedule" in text


# --- edge case details ---------------------------------------------------------------


def test_edge_case_shapes():
    orphan = ExplanationRequest.model_validate(edge_case("assessment_without_risk"))
    assert {a.risk_id for a in orphan.assessments} - {r.risk_id for r in orphan.risks} == {"EQP_BREAKDOWN"}

    unassessed = ExplanationRequest.model_validate(edge_case("risk_without_assessment"))
    assert {r.risk_id for r in unassessed.risks} - {a.risk_id for a in unassessed.assessments} == {"EQP_BREAKDOWN"}

    html = ExplanationRequest.model_validate(edge_case("html_in_clause"))
    assert "<script>alert(1)</script>" in html.assessments[0].evidence[0].text

    long_text = ExplanationRequest.model_validate(edge_case("long_clause")).assessments[0].evidence[0].text
    assert 3800 <= len(long_text) <= 4000

    no_section = ExplanationRequest.model_validate(edge_case("section_missing"))
    assert no_section.assessments[0].evidence[0].section is None

    empty = ExplanationRequest.model_validate(edge_case("empty"))
    assert empty.risks == [] and empty.assessments == []


# --- injection fixture ---------------------------------------------------------------


def test_injection_clause_is_flagged_and_status_unchanged():
    request = _request("injection.json")
    weather = next(a for a in request.assessments if a.risk_id == "PROP_WEATHER")
    assert weather.status is CoverageStatus.EXCLUDED
    assert scan_for_prompt_injection(weather.evidence[0].text) is not None

    fire = next(a for a in request.assessments if a.risk_id == "FIRE_COOKING")
    assert scan_for_prompt_injection(fire.evidence[0].text) is None


def test_adversarial_policy_file_matches_fixture():
    text = ADVERSARIAL_FILE.read_text(encoding="utf-8")
    assert "Ignore all previous instructions" in text
    assert scan_for_prompt_injection(text) is not None


# --- canned LLM responses --------------------------------------------------------------


def test_good_llm_response_matches_bakery_mixed():
    request = _request("bakery_mixed.json")
    items = _items("bakery_mixed_good.json")
    assert set(items) == {a.risk_id for a in request.assessments}
    for assessment in request.assessments:
        item = items[assessment.risk_id]
        assert set(item) == {"risk_id", "explanation", "recommendation", "cited_chunk_ids"}
        assert set(item["cited_chunk_ids"]) <= {c.chunk_id for c in assessment.evidence}
        assert len(item["explanation"].split()) <= 80
        assert len(item["recommendation"].split()) <= 40


def test_bad_llm_response_has_planted_mistakes():
    items = _items("bakery_mixed_bad.json")
    assert "CYB_PAYMENT_FRAUD" not in items
    assert items["EQP_BREAKDOWN"]["cited_chunk_ids"] == ["P001-p99-c9"]
    assert "is covered" in items["PROP_WEATHER"]["explanation"]
    assert "definitely" in items["FIRE_COOKING"]["explanation"]
    assert "<b>" in items["BI_PREMISES_CLOSURE"]["explanation"]
    assert items["PROP_THEFT"] == _items("bakery_mixed_good.json")["PROP_THEFT"]


# --- FakeLLM -------------------------------------------------------------------------------


def test_fake_llm_returns_in_order_and_records_calls():
    fake = FakeLLM(["first", RuntimeError("boom"), "third"])
    assert fake.generate_text("p1", system_instruction="sys", json_output=True) == "first"
    with pytest.raises(RuntimeError, match="boom"):
        fake.generate_text("p2")
    assert fake.generate_text("p3") == "third"
    assert fake.prompts == ["p1", "p2", "p3"]
    assert fake.calls[0].system_instruction == "sys" and fake.calls[0].json_output is True


def test_fake_llm_fails_on_unexpected_call():
    with pytest.raises(AssertionError):
        FakeLLM([]).generate_text("unexpected")
