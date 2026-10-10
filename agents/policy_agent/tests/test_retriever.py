# Agent 2 retriever tests (Member 2)
"""Unit tests for agents.policy_agent.retriever.

`SemanticRetriever` tests use a small deterministic fake embedding function,
never ChromaDB's real default one - that downloads a model from the internet
on first use, which automated tests must not depend on.
"""

from typing import List

import pytest
from chromadb.api.types import Documents, EmbeddingFunction, Embeddings

from agents.policy_agent.retriever import (
    STOP_WORDS,
    HybridRetriever,
    SemanticRetriever,
    TfidfRetriever,
    _SYNONYMS,
    build_query,
)
from shared.models.policy import PolicyChunk
from shared.models.risk import IdentifiedRisk

pytestmark = pytest.mark.unit


class FakeEmbeddingFunction(EmbeddingFunction):
    """Deterministic, network-free stand-in: counts a few keywords per text."""

    _KEYWORDS = ("fire", "burning", "water", "theft", "flood")

    def __init__(self) -> None:
        pass

    def __call__(self, input: Documents) -> Embeddings:
        vectors: List[List[float]] = []
        for text in input:
            lowered = text.lower()
            vectors.append([float(lowered.count(word)) for word in self._KEYWORDS])
        return vectors

    @staticmethod
    def name() -> str:
        return "fake-keyword-embedding"

    def get_config(self) -> dict:
        return {}

    @staticmethod
    def build_from_config(config: dict) -> "FakeEmbeddingFunction":
        return FakeEmbeddingFunction()


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


def test_plain_fire_clause_is_retrieved_for_a_fire_risk():
    # Regression for SA-03: "fire" used to be dropped as an English stop word,
    # so this clause scored 0 and no evidence was returned.
    retriever = TfidfRetriever()
    fire_clause = chunk("Loss caused by fire is covered.", chunk_id="fire")

    results = retriever.retrieve(build_query(risk()), [fire_clause], top_k=8)

    assert [c.chunk_id for c, _ in results] == ["fire"]


def test_third_party_wording_is_searchable():
    retriever = TfidfRetriever()
    clause = chunk("Claims by a third party for injury are covered.", chunk_id="tp")

    results = retriever.retrieve("third party liability", [clause], top_k=8)

    assert [c.chunk_id for c, _ in results] == ["tp"]


def test_no_synonym_keyword_is_discarded_as_a_stop_word():
    # Short grammar words inside phrases ("by", "of", "to") may still be dropped.
    words = {
        word
        for terms in _SYNONYMS.values()
        for term in terms
        for word in term.lower().replace("-", " ").split()
        if len(word) > 3
    }
    assert not words & set(STOP_WORDS)


def test_ordinary_stop_words_are_still_removed():
    assert {"the", "is", "and", "of"} <= set(STOP_WORDS)


def test_retriever_does_not_mutate_the_input_chunk_list():
    retriever = TfidfRetriever(min_score=0.0)
    chunks = [chunk("Fire damage cover.", chunk_id="a"), chunk("Theft cover.", chunk_id="b")]
    original_order = list(chunks)
    retriever.retrieve(build_query(risk()), chunks, top_k=8)
    assert chunks == original_order


# --- SemanticRetriever --------------------------------------------------------------------

def test_semantic_relevant_chunk_ranks_above_irrelevant_chunk():
    retriever = SemanticRetriever(embedding_function=FakeEmbeddingFunction(), min_score=0.0)
    relevant = chunk("Fire and burning damage to the kitchen is covered.", chunk_id="relevant")
    irrelevant = chunk("Water damage from burst pipes only is covered.", chunk_id="irrelevant")

    results = retriever.retrieve("fire burning cover", [irrelevant, relevant], top_k=2)

    assert [c.chunk_id for c, _ in results][0] == "relevant"
    assert results[0][1] >= results[1][1]


def test_semantic_top_k_limits_the_number_of_results():
    retriever = SemanticRetriever(embedding_function=FakeEmbeddingFunction(), min_score=0.0)
    chunks = [chunk(f"Fire and burning damage clause {i}.", chunk_id=f"c{i}") for i in range(5)]

    results = retriever.retrieve("fire burning cover", chunks, top_k=2)

    assert len(results) <= 2


def test_semantic_empty_chunk_list_returns_no_results():
    retriever = SemanticRetriever(embedding_function=FakeEmbeddingFunction())
    assert retriever.retrieve("fire cover", [], top_k=8) == []


def test_semantic_empty_query_returns_no_results():
    retriever = SemanticRetriever(embedding_function=FakeEmbeddingFunction())
    chunks = [chunk("Fire damage is covered under this policy.")]
    assert retriever.retrieve("   ", chunks, top_k=8) == []


def test_semantic_unrelated_content_is_filtered_out_by_min_score():
    retriever = SemanticRetriever(embedding_function=FakeEmbeddingFunction(), min_score=0.5)
    # Shares no keywords at all with the query -> orthogonal vectors -> similarity 0.
    unrelated = chunk("Theft and flood are excluded from this policy.")
    results = retriever.retrieve("fire burning cover", [unrelated], top_k=8)
    assert results == []


def test_semantic_scores_are_always_within_zero_and_one():
    retriever = SemanticRetriever(embedding_function=FakeEmbeddingFunction(), min_score=0.0)
    chunks = [
        chunk("Fire and burning damage cover.", chunk_id="a"),
        chunk("Theft and flood cover only.", chunk_id="b"),
    ]
    results = retriever.retrieve("fire burning cover", chunks, top_k=8)
    assert all(0.0 <= score <= 1.0 for _, score in results)


def test_semantic_retriever_cleans_up_its_temporary_collection():
    retriever = SemanticRetriever(embedding_function=FakeEmbeddingFunction())
    chunks = [chunk("Fire and burning damage cover.")]

    retriever.retrieve("fire cover", chunks, top_k=8)

    assert retriever._client.list_collections() == []


def test_semantic_retriever_handles_duplicate_chunk_ids_gracefully():
    retriever = SemanticRetriever(embedding_function=FakeEmbeddingFunction(), min_score=0.0)
    chunks = [
        chunk("Fire and burning damage cover.", chunk_id="dup"),
        chunk("Fire and burning damage cover, duplicated id.", chunk_id="dup"),
    ]
    # Must not raise (Chroma requires unique ids within a collection) and
    # must return at most one result for the duplicated id.
    results = retriever.retrieve("fire burning cover", chunks, top_k=8)
    assert len({c.chunk_id for c, _ in results}) == len(results)


# --- HybridRetriever ----------------------------------------------------------------------

class StubRetriever:
    """Returns fixed results, so the merging logic can be tested on its own."""

    def __init__(self, results):
        self._results = results

    def retrieve(self, query, chunks, top_k=8):
        return self._results[:top_k]


def test_hybrid_returns_a_chunk_found_by_only_one_backend():
    a, b = chunk("Clause A.", chunk_id="a"), chunk("Clause B.", chunk_id="b")
    retriever = HybridRetriever(StubRetriever([(a, 0.4)]), StubRetriever([(b, 0.3)]))

    results = retriever.retrieve("fire", [a, b], top_k=8)

    assert {c.chunk_id for c, _ in results} == {"a", "b"}


def test_hybrid_keeps_one_result_per_chunk_with_the_higher_score():
    a = chunk("Clause A.", chunk_id="a")
    retriever = HybridRetriever(StubRetriever([(a, 0.2)]), StubRetriever([(a, 0.6)]))

    results = retriever.retrieve("fire", [a], top_k=8)

    assert len(results) == 1
    assert results[0][1] == 0.6


def test_hybrid_ranks_best_first_and_respects_top_k():
    a, b, c = (chunk(f"Clause {x}.", chunk_id=x) for x in "abc")
    retriever = HybridRetriever(
        StubRetriever([(a, 0.3), (b, 0.1)]), StubRetriever([(c, 0.5)])
    )

    results = retriever.retrieve("fire", [a, b, c], top_k=2)

    assert [ch.chunk_id for ch, _ in results] == ["c", "a"]


def test_hybrid_empty_query_or_chunks_returns_no_results():
    a = chunk("Clause A.", chunk_id="a")
    retriever = HybridRetriever(StubRetriever([(a, 0.9)]), StubRetriever([(a, 0.9)]))

    assert retriever.retrieve("   ", [a], top_k=8) == []
    assert retriever.retrieve("fire", [], top_k=8) == []


class SynonymAwareEmbeddingFunction(FakeEmbeddingFunction):
    """Fake embedding that knows a "blaze" is a fire, as a real model would."""

    def __call__(self, input: Documents) -> Embeddings:
        return super().__call__([text.lower().replace("blaze", "fire") for text in input])


def test_hybrid_finds_a_paraphrased_clause_the_keyword_retriever_misses():
    # "blaze" shares no words with the fire query, so TF-IDF alone scores it 0.
    blaze_clause = chunk("Loss from a blaze at the premises is indemnified.", chunk_id="blaze")
    query = build_query(risk())
    keyword = TfidfRetriever()
    semantic = SemanticRetriever(embedding_function=SynonymAwareEmbeddingFunction())

    assert keyword.retrieve(query, [blaze_clause], top_k=8) == []
    results = HybridRetriever(keyword, semantic).retrieve(query, [blaze_clause], top_k=8)

    assert [c.chunk_id for c, _ in results] == ["blaze"]
