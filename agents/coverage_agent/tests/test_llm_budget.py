# Agent 3: the LLM time budget and giving up on an unavailable LLM (Member 3)

"""A long list of risks once took Agent 3 past the gateway's 60 s limit (2026-10-08):
the LLM is asked once per risk, one after another. These tests use fake LLMs only."""

import json

from agents.coverage_agent.interpreter import (
    CoverageInterpreter,
    LLMUnavailableError,
)
from agents.coverage_agent.llm_provider import CoverageLLMProvider
from agents.coverage_agent.service import CoverageAnalysisService
from shared.models.coverage import AnalysisMethod
from shared.models.policy import EvidenceClause, RiskEvidenceResult
from shared.models.risk import IdentifiedRisk


def _answer(chunk_id: str) -> str:
    return json.dumps({
        "status": "covered",
        "reason": "The policy covers this risk.",
        "confidence": 0.9,
        "evidence_chunk_ids": [chunk_id],
    })


class ScriptedLLM:
    """Answers each call from `script`: a string is returned, an exception is raised."""

    def __init__(self, *script):
        self.script = list(script)
        self.calls = 0

    def generate_text(self, prompt, *, system_instruction=None, json_output=False):
        self.calls += 1
        step = self.script[min(self.calls, len(self.script)) - 1]
        if isinstance(step, Exception):
            raise step
        return step


class FakeClock:
    """Moves on `step` seconds every time it is read."""

    def __init__(self, step: float):
        self.now = 0.0
        self.step = step

    def __call__(self) -> float:
        value = self.now
        self.now += self.step
        return value


def _inputs(count: int):
    risks, evidence = [], []
    for i in range(count):
        risks.append(IdentifiedRisk(
            risk_id=f"RISK_{chr(65 + i)}", name=f"Fire damage {i}", category="property",
            reason="The business uses ovens.", source="rule", confidence=0.9, evidence=[],
        ))
        evidence.append(RiskEvidenceResult(risk_id=f"RISK_{chr(65 + i)}", evidence=[EvidenceClause(
            chunk_id=f"CHUNK-{i}", policy_id="POL-1", section="Cover", page=1,
            text="We cover loss or damage to your property caused by fire.", score=0.9,
        )]))
    return risks, evidence


def test_risks_after_the_budget_use_the_wording_rules():
    llm = ScriptedLLM(*[_answer(f"CHUNK-{i}") for i in range(5)])
    # Each clock read moves 10 s on; with a 25 s budget the LLM is asked twice.
    service = CoverageAnalysisService(
        interpreter=CoverageInterpreter(llm), use_llm=True,
        llm_budget_seconds=25, clock=FakeClock(step=10),
    )
    risks, evidence = _inputs(5)

    result = service.analyse(risks=risks, evidence_results=evidence)

    methods = [a.method for a in result.assessments]
    assert methods[:2] == [AnalysisMethod.RULES_AND_LLM] * 2
    assert methods[2:] == [AnalysisMethod.RULES] * 3
    assert llm.calls == 2
    assert len(result.assessments) == 5
    assert "The AI took too long, so 3 risks were read with the coverage rules instead." in result.warnings


def test_without_a_budget_every_risk_asks_the_llm():
    llm = ScriptedLLM(*[_answer(f"CHUNK-{i}") for i in range(3)])
    service = CoverageAnalysisService(interpreter=CoverageInterpreter(llm), use_llm=True)
    risks, evidence = _inputs(3)

    result = service.analyse(risks=risks, evidence_results=evidence)

    assert llm.calls == 3 and result.warnings == []


def test_an_unavailable_llm_is_not_asked_again():
    llm = ScriptedLLM(LLMUnavailableError("down"))
    service = CoverageAnalysisService(interpreter=CoverageInterpreter(llm), use_llm=True)
    risks, evidence = _inputs(4)

    result = service.analyse(risks=risks, evidence_results=evidence)

    assert llm.calls == 1
    assert all(a.method is AnalysisMethod.RULES for a in result.assessments)
    assert "The AI was not available, so 3 risks were read with the coverage rules instead." in result.warnings


def test_a_bad_answer_only_affects_its_own_risk():
    llm = ScriptedLLM("not json", _answer("CHUNK-1"))
    service = CoverageAnalysisService(interpreter=CoverageInterpreter(llm), use_llm=True)
    risks, evidence = _inputs(2)

    result = service.analyse(risks=risks, evidence_results=evidence)

    assert llm.calls == 2
    assert [a.method for a in result.assessments] == [AnalysisMethod.RULES, AnalysisMethod.RULES_AND_LLM]


def test_provider_stops_trying_gemini_after_it_fails():
    gemini = ScriptedLLM(RuntimeError("429 rate limit"))
    ollama = ScriptedLLM("first", "second")
    provider = CoverageLLMProvider(
        primary=gemini, primary_name="gemini", primary_model="g",
        fallback=ollama, fallback_name="ollama", fallback_model="o",
    )

    assert provider.generate_text("a") == "first"
    assert provider.generate_text("b") == "second"

    assert gemini.calls == 1  # not waited on again for the second risk
    assert provider.active_provider == "ollama"


def test_provider_reports_unavailable_when_nothing_answers():
    provider = CoverageLLMProvider(
        primary=ScriptedLLM(RuntimeError("down")), primary_name="gemini", primary_model="g",
        fallback=None, fallback_name=None, fallback_model=None,
    )

    try:
        provider.generate_text("a")
    except LLMUnavailableError:
        pass
    else:
        raise AssertionError("expected LLMUnavailableError")
