# Agent 2 clause retrieval for a given risk (Member 2)
"""Find and rank the policy chunks relevant to a given risk.

No LLM is involved here - this is classic information retrieval:
1. `build_query` turns a risk into a short search query: its name plus a few
   category-specific keywords from `synonyms.json`, so a search for "Employee
   injury at work" also matches text mentioning "workplace accident". Keywords
   are keyed by risk *category* (fire, cyber, ...), not by Agent 1's specific
   risk IDs, so this agent does not silently break if Agent 1's taxonomy changes.
2. `TfidfRetriever` fits a TF-IDF vectorizer on the candidate chunks and ranks
   them by cosine similarity to the query.

Only matches at or above `MIN_RELEVANCE_SCORE` are returned - "no evidence
found" is a valid, honest result, not something papered over by forcing back
`top_k` chunks regardless of relevance.
"""

import json
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Protocol, Sequence, Tuple

import chromadb
from chromadb.api.types import EmbeddingFunction
from chromadb.utils import embedding_functions
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from shared.models.policy import PolicyChunk
from shared.models.risk import IdentifiedRisk

SYNONYMS_PATH = Path(__file__).parent / "synonyms.json"
MIN_RELEVANCE_SCORE = 0.1
MIN_SEMANTIC_RELEVANCE_SCORE = 0.2


def _load_synonyms(path: Path = SYNONYMS_PATH) -> Dict[str, List[str]]:
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


_SYNONYMS = _load_synonyms()


def build_query(risk: IdentifiedRisk) -> str:
    """Turn a risk into a short search query: its name plus category keywords."""
    terms = [risk.name, *_SYNONYMS.get(risk.category.value, [])]
    return " ".join(terms)


class Retriever(Protocol):
    """What Agent 2's service layer needs from a retrieval backend.

    A semantic (embedding-based) retriever can implement the same interface
    later without changing anything that calls it.
    """

    def retrieve(
        self, query: str, chunks: Sequence[PolicyChunk], top_k: int
    ) -> List[Tuple[PolicyChunk, float]]: ...


class TfidfRetriever:
    """TF-IDF + cosine similarity retrieval, fit fresh on every call.

    The candidate set (`chunks`) is expected to already be scoped to one
    business's own policies - this class does no scoping of its own.
    """

    def __init__(self, min_score: float = MIN_RELEVANCE_SCORE) -> None:
        self._min_score = min_score

    def retrieve(
        self, query: str, chunks: Sequence[PolicyChunk], top_k: int = 8
    ) -> List[Tuple[PolicyChunk, float]]:
        if not query.strip() or not chunks:
            return []

        documents = [chunk.text for chunk in chunks]
        vectorizer = TfidfVectorizer(stop_words="english")
        try:
            matrix = vectorizer.fit_transform([*documents, query])
        except ValueError:
            # every document (or the query) had an empty vocabulary after
            # removing stop words: there is nothing meaningful to rank.
            return []

        query_vector = matrix[-1]
        chunk_vectors = matrix[:-1]
        scores = cosine_similarity(query_vector, chunk_vectors)[0]

        ranked = sorted(zip(chunks, scores), key=lambda pair: pair[1], reverse=True)
        results = [
            (chunk, min(1.0, max(0.0, float(score))))
            for chunk, score in ranked
            if score >= self._min_score
        ]
        return results[:top_k]


class SemanticRetriever:
    """Embedding-based retrieval using ChromaDB's vector similarity search.

    Works statelessly per call, the same way `TfidfRetriever` does: the query
    and the already business/policy-scoped candidate chunks are embedded and
    compared fresh on every call, in a temporary collection that is deleted
    afterwards. This means there is no persistent vector index to keep in
    sync with `service._CHUNK_INDEX`.

    By default this uses ChromaDB's built-in embedding function (a small
    ONNX-based MiniLM model, downloaded once on first use) - not the
    `sentence-transformers` package, which would pull in PyTorch as a much
    heavier dependency for a very similar result. A different embedding
    function can be injected, which tests use to avoid any model download.
    """

    def __init__(
        self,
        embedding_function: Optional[EmbeddingFunction] = None,
        min_score: float = MIN_SEMANTIC_RELEVANCE_SCORE,
    ) -> None:
        self._embedding_function = (
            embedding_function or embedding_functions.DefaultEmbeddingFunction()
        )
        self._min_score = min_score
        self._client = chromadb.EphemeralClient()

    def retrieve(
        self, query: str, chunks: Sequence[PolicyChunk], top_k: int = 8
    ) -> List[Tuple[PolicyChunk, float]]:
        if not query.strip() or not chunks:
            return []

        # Defensive: Chroma requires unique ids within a collection.
        by_id: Dict[str, PolicyChunk] = {}
        for chunk in chunks:
            by_id.setdefault(chunk.chunk_id, chunk)
        unique_chunks = list(by_id.values())

        collection_name = f"retrieval-{uuid.uuid4().hex}"
        collection = self._client.create_collection(
            name=collection_name,
            embedding_function=self._embedding_function,
            metadata={"hnsw:space": "cosine"},
        )
        try:
            collection.add(
                ids=[chunk.chunk_id for chunk in unique_chunks],
                documents=[chunk.text for chunk in unique_chunks],
            )
            results = collection.query(
                query_texts=[query], n_results=min(top_k, len(unique_chunks))
            )
        finally:
            self._client.delete_collection(collection_name)

        matched_ids = results["ids"][0]
        distances = results["distances"][0]

        ranked: List[Tuple[PolicyChunk, float]] = []
        for chunk_id, distance in zip(matched_ids, distances):
            # Cosine distance is in [0, 2]; a similarity score is 1 - distance.
            score = min(1.0, max(0.0, 1.0 - float(distance)))
            if score >= self._min_score:
                ranked.append((by_id[chunk_id], score))
        return ranked
