# Agent 2 retriever tests (Member 2)
"""Unit tests for agents.policy_agent.retriever."""

import pytest

from agents.policy_agent.retriever import TfidfRetriever, build_query
from shared.models.policy import PolicyChunk
from shared.models.risk import IdentifiedRisk

pytestmark = pytest.mark.unit


def risk(**overrides):
    data = {
        "risk_id": "FIRE_COOKING",
        "name": "Fire from cooking and baking equipment",
        "category": "fire",
        "reason": "The business uses ovens, which create sustained high heat.",
        "source": "rule",
        "confidence": 0.9,
    }
    data.update(overrides)
    return IdentifiedRisk(**data)


def chunk(text, chunk_id="POL001-p1-1", **overrides):
    data = {
        "chunk_id": chunk_id,
        "policy_id": "POL001",
        "business_id": "B001",
        "page": 1,
        "text": text,
    }
    data.update(overrides)
    return PolicyChunk(**data)


# --- build_query --------------------------------------------------------------------------

def test_query_includes_the_risk_name():
    query = build_query(risk())
    assert "Fire from cooking and baking equipment" in query


def test_query_includes_category_synonyms():
    query = build_query(risk(category="fire"))
    assert "burning" in query or "smoke damage" in query


def test_query_for_a_different_category_uses_different_synonyms():
    fire_query = build_query(risk(category="fire"))
    cyber_query = build_query(
        risk(risk_id="CYB_DATA_BREACH", name="Customer data breach", category="cyber")
    )
    assert fire_query != cyber_query
    assert "data breach" in cyber_query or "ransomware" in cyber_query


# --- TfidfRetriever -----------------------------------------------------------------------

def test_relevant_chunk_ranks_above_irrelevant_chunk():
    retriever = TfidfRetriever(min_score=0.0)
    relevant = chunk(
        "This policy covers fire, burning and smoke damage to the kitchen.",
        chunk_id="relevant",
    )
    irrelevant = chunk(
        "This policy covers water damage caused by burst pipes only.",
        chunk_id="irrelevant",
    )
    results = retriever.retrieve(build_query(risk()), [irrelevant, relevant], top_k=2)

    assert [c.chunk_id for c, _ in results][0] == "relevant"
    assert results[0][1] >= results[1][1]


def test_top_k_limits_the_number_of_results():
    retriever = TfidfRetriever(min_score=0.0)
    chunks = [
        chunk(f"Fire and burning damage clause number {i}.", chunk_id=f"c{i}")
        for i in range(5)
    ]
    results = retriever.retrieve(build_query(risk()), chunks, top_k=2)
    assert len(results) <= 2


def test_empty_chunk_list_returns_no_results():
    retriever = TfidfRetriever()
    assert retriever.retrieve(build_query(risk()), [], top_k=8) == []


def test_empty_query_returns_no_results():
    retriever = TfidfRetriever()
    chunks = [chunk("Some policy text about fire damage.")]
    assert retriever.retrieve("   ", chunks, top_k=8) == []


def test_completely_unrelated_content_is_filtered_out_by_min_score():
    retriever = TfidfRetriever(min_score=0.1)
    unrelated = chunk("The quick brown fox jumps over the lazy dog repeatedly.")
    results = retriever.retrieve(build_query(risk()), [unrelated], top_k=8)
    assert results == []


def test_scores_are_always_within_zero_and_one():
    retriever = TfidfRetriever(min_score=0.0)
    chunks = [
        chunk("This policy covers fire and burning damage.", chunk_id="a"),
        chunk("This policy covers theft and burglary only.", chunk_id="b"),
    ]
    results = retriever.retrieve(build_query(risk()), chunks, top_k=8)
    assert all(0.0 <= score <= 1.0 for _, score in results)


def test_retriever_does_not_mutate_the_input_chunk_list():
    retriever = TfidfRetriever(min_score=0.0)
    chunks = [chunk("Fire damage cover.", chunk_id="a"), chunk("Theft cover.", chunk_id="b")]
    original_order = list(chunks)
    retriever.retrieve(build_query(risk()), chunks, top_k=8)
    assert chunks == original_order
