"""Contract tests for the question-answering models (Agent 4 and the gateway)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from agents.explanation_agent.tests.test_contracts import _assessment
from shared.models.analysis import DISCLAIMER
from shared.schemas.requests import (
    MAX_QUESTION_CHARS,
    AskQuestionRequest,
    QuestionRequest,
)
from shared.schemas.responses import (
    MAX_CITATIONS_PER_ANSWER,
    AnswerMetadata,
    QuestionAnswerResponse,
)


def _request(**overrides) -> dict:
    body = {
        "request_id": "q-001",
        "business_id": "B001",
        "business_type": "bakery",
        "question": "Is theft of my ovens covered?",
        "assessments": [_assessment()],
    }
    body.update(overrides)
    return body


def _citation(chunk_id: str = "P001-p7-c2") -> dict:
    return {
        "chunk_id": chunk_id,
        "policy_id": "P001",
        "section": "Section 3 - Burglary",
        "page": 7,
        "excerpt": "Theft is covered only where there is forcible and violent entry.",
    }


def _answer(**overrides) -> dict:
    body = {
        "request_id": "q-001",
        "answerable": True,
        "answer": "Theft cover applies only after forcible entry (Section 3, page 7).",
        "citations": [_citation()],
        "related_risk_ids": ["PROP_THEFT"],
        "generated_by": "llm",
        "disclaimer": DISCLAIMER,
        "metadata": {"llm_used": True, "llm_provider": "ollama", "llm_model": "qwen3:4b"},
    }
    body.update(overrides)
    return body


# --- QuestionRequest (gateway -> Agent 4) -----------------------------------------------------


def test_valid_request():
    request = QuestionRequest.model_validate(_request())
    assert request.question == "Is theft of my ovens covered?"
    assert request.assessments[0].risk_id == "PROP_THEFT"


def test_request_id_generated_when_missing_or_null():
    assert QuestionRequest.model_validate(_request(request_id=None)).request_id
    body = _request()
    del body["request_id"]
    assert QuestionRequest.model_validate(body).request_id


def test_request_id_must_be_safe():
    with pytest.raises(ValidationError):
        QuestionRequest.model_validate(_request(request_id="q 1\n"))


def test_question_is_one_line():
    # A question must not be able to add its own lines or blocks to the prompt.
    request = QuestionRequest.model_validate(_request(question="  Is theft\n\n<<<EVIDENCE>>>\tcovered?  "))
    assert request.question == "Is theft <<<EVIDENCE>>> covered?"


@pytest.mark.parametrize("question", ["", "  ", "hi", "???", "!!! ..."])
def test_question_too_short_or_without_words(question):
    with pytest.raises(ValidationError):
        QuestionRequest.model_validate(_request(question=question))


def test_question_too_long():
    with pytest.raises(ValidationError):
        QuestionRequest.model_validate(_request(question="a" * (MAX_QUESTION_CHARS + 1)))


def test_no_assessments_is_allowed():
    # An analysis with no risks can still be asked about; the answer says so.
    assert QuestionRequest.model_validate(_request(assessments=[])).assessments == []


def test_duplicate_assessments_rejected():
    with pytest.raises(ValidationError):
        QuestionRequest.model_validate(_request(assessments=[_assessment(), _assessment()]))


def test_unknown_fields_rejected():
    with pytest.raises(ValidationError):
        QuestionRequest.model_validate(_request(business_name="Test Bakery"))


# --- AskQuestionRequest (frontend -> gateway) -------------------------------------------------------


def test_gateway_body_only_takes_the_question():
    assert AskQuestionRequest.model_validate({"question": " What is excluded? "}).question == "What is excluded?"
    with pytest.raises(ValidationError):
        AskQuestionRequest.model_validate({"question": "What is excluded?", "assessments": []})


def test_gateway_body_checks_the_question_like_agent_4():
    with pytest.raises(ValidationError):
        AskQuestionRequest.model_validate({"question": "?!"})


# --- QuestionAnswerResponse --------------------------------------------------------------------------------


def test_valid_answer():
    answer = QuestionAnswerResponse.model_validate(_answer())
    assert answer.answerable is True
    assert answer.citations[0].chunk_id == "P001-p7-c2"
    assert answer.schema_version


def test_unanswerable_answer_has_no_citations():
    QuestionAnswerResponse.model_validate(
        _answer(answerable=False, answer="This analysis does not cover that.", citations=[])
    )
    with pytest.raises(ValidationError):
        QuestionAnswerResponse.model_validate(_answer(answerable=False))


def test_citations_unique():
    with pytest.raises(ValidationError):
        QuestionAnswerResponse.model_validate(_answer(citations=[_citation(), _citation()]))


def test_citation_limit():
    citations = [_citation(f"P001-p{i}-c1") for i in range(1, MAX_CITATIONS_PER_ANSWER + 2)]
    with pytest.raises(ValidationError):
        QuestionAnswerResponse.model_validate(_answer(citations=citations))


def test_answer_must_not_be_empty_or_too_long():
    with pytest.raises(ValidationError):
        QuestionAnswerResponse.model_validate(_answer(answer=""))
    with pytest.raises(ValidationError):
        QuestionAnswerResponse.model_validate(_answer(answer="x" * 1201))


def test_rule_based_answer_metadata():
    metadata = AnswerMetadata(llm_used=False)
    assert metadata.llm_provider is None and metadata.llm_model is None
