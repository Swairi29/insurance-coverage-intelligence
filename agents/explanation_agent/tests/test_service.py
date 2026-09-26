"""Tests for report assembly (ExplanationService). FakeLLM only."""

from __future__ import annotations

import json
import time

import pytest

from agents.explanation_agent.service import (
    LLM_PARTIAL_WARNING,
    LLM_TIME_BUDGET_WARNING,
    LLM_UNAVAILABLE_WARNING,
    ExplanationService,
)
from agents.explanation_agent.tests.fakes import FakeLLM, edge_case, load_fixture, load_llm_response
from shared.models.analysis import DISCLAIMER, FindingPriority, GeneratedBy
from shared.schemas.requests import ExplanationRequest
from shared.schemas.responses import ExplanationResponse

EXPECTED_ORDER = [
    ("EQP_BREAKDOWN", FindingPriority.HIGH),
    ("PROP_WEATHER", FindingPriority.HIGH),
    ("CYB_PAYMENT_FRAUD", FindingPriority.HIGH),
    ("BI_PREMISES_CLOSURE", FindingPriority.MEDIUM),
    ("PROP_THEFT", FindingPriority.MEDIUM),
    ("FIRE_COOKING", FindingPriority.LOW),
]
ALL_FIXTURES = ["bakery_mixed.json", "all_covered.json", "injection.json"]


def _load(name: str) -> ExplanationRequest:
    return ExplanationRequest.model_validate(load_fixture(name))


def _answer(name: str, risk_ids) -> str:
    items = {i["risk_id"]: i for i in json.loads(load_llm_response(name))["findings"]}
    return json.dumps({"findings": [items[r] for r in risk_ids if r in items]})


def _batched(name: str) -> list:
    """Fake answers for the service's two batches (priority order, 4 then 2)."""
    ids = [risk_id for risk_id, _ in EXPECTED_ORDER]
    return [_answer(name, ids[:4]), _answer(name, ids[4:])]


def _service(responses, **kwargs) -> tuple:
    fake = FakeLLM(responses)
    return ExplanationService(client=fake, provider="ollama", model="qwen3:8b", **kwargs), fake


BAKERY = _load("bakery_mixed.json")


# --- LLM paths -------------------------------------------------------------------------------------


def test_good_llm_report():
    service, fake = _service(_batched("bakery_mixed_good.json"))
    report = service.generate(BAKERY)

    assert [(f.risk_id, f.priority) for f in report.findings] == EXPECTED_ORDER
    assert all(f.generated_by is GeneratedBy.LLM for f in report.findings)
    assert len(fake.calls) == 2
    assert report.warnings == []
    assert report.metadata.model_dump(exclude={"processing_ms"}) == {
        "llm_used": True, "llm_provider": "ollama", "llm_model": "qwen3:8b",
        "llm_findings": 6, "template_findings": 0,
    }
    theft = next(f for f in report.findings if f.risk_id == "PROP_THEFT")
    assert theft.explanation.startswith("Your policy pays for stolen contents")


def test_bad_llm_report_uses_templates_for_rejected_items():
    service, _ = _service(_batched("bakery_mixed_bad.json"))
    report = service.generate(BAKERY)
    generated = {f.risk_id: f.generated_by for f in report.findings}
    assert generated.pop("PROP_THEFT") is GeneratedBy.LLM
    assert set(generated.values()) == {GeneratedBy.TEMPLATE}
    assert LLM_PARTIAL_WARNING in report.warnings
    assert (report.metadata.llm_findings, report.metadata.template_findings) == (1, 5)
    # Rejected wording never reaches the report.
    text = " ".join(f.explanation for f in report.findings)
    assert "definitely" not in text and "<b>" not in text and "is covered by your policy" not in text


def test_use_llm_false_makes_no_calls():
    service, fake = _service([], use_llm=False)
    report = service.generate(BAKERY)
    assert fake.calls == []
    assert all(f.generated_by is GeneratedBy.TEMPLATE for f in report.findings)
    assert report.metadata.llm_used is False and report.metadata.llm_provider is None
    assert report.warnings == []


def test_no_client_uses_templates_without_warning():
    report = ExplanationService().generate(BAKERY)
    assert report.metadata.llm_used is False and report.warnings == []


def test_llm_failing_every_call_still_returns_full_report():
    service, fake = _service([RuntimeError("down"), TimeoutError()])
    report = service.generate(BAKERY)
    assert len(fake.calls) == 2
    assert len(report.findings) == 6
    assert all(f.generated_by is GeneratedBy.TEMPLATE for f in report.findings)
    assert LLM_UNAVAILABLE_WARNING in report.warnings
    assert report.metadata.llm_used is False and report.metadata.llm_provider == "ollama"


class SlowLLM(FakeLLM):
    def generate_text(self, prompt, **kwargs):
        time.sleep(0.2)
        return super().generate_text(prompt, **kwargs)


def test_no_new_batch_starts_after_the_time_budget():
    fake = SlowLLM(_batched("bakery_mixed_good.json"))
    service = ExplanationService(client=fake, provider="ollama", model="qwen3:8b", llm_budget_seconds=0.1)
    report = service.generate(BAKERY)

    assert len(fake.calls) == 1  # batch 1 started in time; batch 2 was skipped
    assert [f.generated_by for f in report.findings] == [GeneratedBy.LLM] * 4 + [GeneratedBy.TEMPLATE] * 2
    assert report.warnings == [LLM_TIME_BUDGET_WARNING]


def test_a_generous_budget_changes_nothing():
    service, fake = _service(_batched("bakery_mixed_good.json"), llm_budget_seconds=600)
    report = service.generate(BAKERY)
    assert len(fake.calls) == 2 and report.metadata.llm_findings == 6 and report.warnings == []


# --- fields decided by code ----------------------------------------------------------------------


def test_code_decided_fields():
    service, _ = _service(_batched("bakery_mixed_good.json"))
    findings = {f.risk_id: f for f in service.generate(BAKERY).findings}
    fire, gap = findings["FIRE_COOKING"], findings["EQP_BREAKDOWN"]
    assert fire.title == "Covered: Fire from cooking and baking equipment"
    assert fire.verification_required is False and fire.coverage_confidence == 0.88
    assert gap.title == "Potential coverage gap: Equipment breakdown"
    assert gap.verification_required is True and gap.evidence == []


def test_citations_come_from_agent3_evidence_only():
    # The LLM cites nothing for PROP_THEFT, but the report still lists Agent 3's evidence.
    items = json.loads(_answer("bakery_mixed_good.json", ["PROP_THEFT"]))
    items["findings"][0]["cited_chunk_ids"] = []
    request = BAKERY.model_copy(update={"assessments": [a for a in BAKERY.assessments if a.risk_id == "PROP_THEFT"]})
    service, _ = _service([json.dumps(items)])
    theft = service.generate(request).findings[0]
    assert theft.generated_by is GeneratedBy.LLM
    assert [(c.chunk_id, c.section, c.page, c.flagged) for c in theft.evidence] == [
        ("P001-p7-c2", "Section 3 - Burglary", 7, False)
    ]


def test_summary():
    summary = ExplanationService(use_llm=False).generate(BAKERY).summary
    assert summary.total_findings == 6 and summary.potential_gaps == 4
    assert summary.counts_by_status == {
        "covered": 1, "excluded": 1, "conditional": 1, "unclear": 1, "not_found": 2,
    }
    assert summary.headline.startswith("6 risks checked, 4 potential gaps")


def test_response_basics():
    report = ExplanationService(use_llm=False).generate(BAKERY)
    assert report.request_id == "fixture-bakery-mixed" and report.business_id == "B001"
    assert report.disclaimer == DISCLAIMER
    assert report.generated_at.tzinfo is not None
    assert report.metadata.processing_ms >= 0
    ExplanationResponse.model_validate_json(report.model_dump_json())  # round-trips


# --- injection ------------------------------------------------------------------------------------


def test_injection_report():
    request = _load("injection.json")
    weather_answer = json.loads(_answer("bakery_mixed_good.json", ["PROP_WEATHER", "FIRE_COOKING"]))
    for item in weather_answer["findings"]:
        if item["risk_id"] == "PROP_WEATHER":
            item["cited_chunk_ids"] = []  # the clause was withheld, so nothing to cite
    service, fake = _service([json.dumps(weather_answer)])
    report = service.generate(request)

    weather = next(f for f in report.findings if f.risk_id == "PROP_WEATHER")
    assert weather.status.value == "excluded" and weather.potential_gap is True
    assert weather.evidence[0].flagged is True
    assert "Read page 5 of the policy document directly." in weather.evidence[0].excerpt
    assert any("policy P001, page 5 contained instruction-like text" in w for w in report.warnings)

    dumped = report.model_dump_json()
    assert "covers everything" not in dumped
    assert "Ignore all previous instructions" not in dumped
    assert all("Ignore all previous instructions" not in p for p in fake.prompts)


def test_injection_report_without_llm_still_warns():
    report = ExplanationService(use_llm=False).generate(_load("injection.json"))
    assert any("instruction-like text" in w for w in report.warnings)


# --- edge cases ------------------------------------------------------------------------------------


def test_edge_assessment_without_risk():
    report = ExplanationService(use_llm=False).generate(
        ExplanationRequest.model_validate(edge_case("assessment_without_risk"))
    )
    equipment = next(f for f in report.findings if f.risk_id == "EQP_BREAKDOWN")
    assert equipment.category is None
    assert report.warnings == [
        "Risk EQP_BREAKDOWN was assessed for coverage but is missing from the risk profile, "
        "so its category is unknown."
    ]
    assert [f.risk_id for f in report.findings] == ["EQP_BREAKDOWN", "FIRE_COOKING"]


def test_missing_risk_sorts_last_within_its_priority():
    # CYB_PAYMENT_FRAUD (not_found) loses its Agent 1 risk, so its confidence is unknown.
    request = BAKERY.model_copy(update={"risks": [r for r in BAKERY.risks if r.risk_id != "CYB_PAYMENT_FRAUD"]})
    report = ExplanationService(use_llm=False).generate(request)
    high = [f.risk_id for f in report.findings if f.priority is FindingPriority.HIGH]
    assert high == ["EQP_BREAKDOWN", "PROP_WEATHER", "CYB_PAYMENT_FRAUD"]


def test_edge_risk_without_assessment():
    report = ExplanationService(use_llm=False).generate(
        ExplanationRequest.model_validate(edge_case("risk_without_assessment"))
    )
    assert [f.risk_id for f in report.findings] == ["FIRE_COOKING"]
    assert report.warnings == [
        "Risk EQP_BREAKDOWN was not assessed for coverage and is not included in this report."
    ]


def test_edge_html_in_clause():
    report = ExplanationService(use_llm=False).generate(ExplanationRequest.model_validate(edge_case("html_in_clause")))
    finding = report.findings[0]
    assert "<" not in finding.explanation and "<" not in finding.recommendation
    assert "<script>" in finding.evidence[0].excerpt  # shown as text; the frontend must escape it
    assert report.warnings == []


def test_edge_long_clause():
    report = ExplanationService(use_llm=False).generate(ExplanationRequest.model_validate(edge_case("long_clause")))
    excerpt = report.findings[0].evidence[0].excerpt
    assert len(excerpt) <= 400 and excerpt.endswith("…")


def test_edge_section_missing():
    report = ExplanationService(use_llm=False).generate(ExplanationRequest.model_validate(edge_case("section_missing")))
    finding = report.findings[0]
    assert finding.evidence[0].section is None
    assert "(page 7 of policy P001)" in finding.explanation


def test_edge_empty():
    service, fake = _service([])
    report = service.generate(ExplanationRequest.model_validate(edge_case("empty")))
    assert report.findings == [] and fake.calls == []
    assert report.summary.total_findings == 0
    assert report.summary.headline == "No risks were analysed for coverage, so this report has no findings."
    assert report.warnings == [] and report.metadata.llm_used is False


# --- golden rule: statuses and gap flags never change ----------------------------------------------


def _all_requests():
    requests = [_load(name) for name in ALL_FIXTURES]
    requests += [ExplanationRequest.model_validate(c["request"]) for c in load_fixture("edge_cases.json")]
    return requests


@pytest.mark.parametrize(
    "responses",
    [
        pytest.param(lambda: [], id="templates"),
        pytest.param(lambda: [load_llm_response("bakery_mixed_good.json")] * 5, id="good-llm"),
        pytest.param(lambda: [load_llm_response("bakery_mixed_bad.json")] * 5, id="bad-llm"),
        pytest.param(lambda: [RuntimeError("down")] * 5, id="failing-llm"),
    ],
)
def test_status_and_gap_always_equal_input(responses):
    for request in _all_requests():
        use_llm = bool(responses())
        service = ExplanationService(client=FakeLLM(responses()), provider="ollama", use_llm=use_llm)
        report = service.generate(request)
        expected = {a.risk_id: (a.status, a.potential_gap, a.confidence) for a in request.assessments}
        actual = {f.risk_id: (f.status, f.potential_gap, f.coverage_confidence) for f in report.findings}
        assert actual == expected
        assert [f.verification_required for f in report.findings] == [
            f.status.value != "covered" for f in report.findings
        ]
