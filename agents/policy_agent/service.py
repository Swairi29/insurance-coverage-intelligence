# Agent 2 policy analysis and clause classification logic (Member 2)
"""Ties the document processor and retriever together into two services.

`PolicyIngestionService` validates and stores an uploaded PDF, then chunks it.
`PolicyRetrievalService` answers "what evidence is there for this risk?",
scoped so a request can never see another business's chunks - even if it
guesses a real `policy_id` that belongs to someone else, chunks are only ever
looked up inside that business's own entry in the index.

The chunk index lives in memory for this process (matching the MVP-first
approach the project plan describes); chunks are also written to disk under
`processed_dir` for a durable record, but are not automatically reloaded from
disk on startup yet.
"""

import json
import logging
import uuid
from pathlib import Path
from typing import Dict, List, Optional

from pydantic import ValidationError

from agents.policy_agent.document_processor import build_chunks
from agents.policy_agent.retriever import Retriever, TfidfRetriever, build_query
from shared.config.settings import Settings, get_settings
from shared.models.policy import (
    EvidenceClause,
    PolicyChunk,
    PolicyDocument,
    PolicyStatus,
    RiskEvidenceResult,
)
from shared.models.risk import IdentifiedRisk
from shared.utils.security import encrypt_bytes, is_pdf

logger = logging.getLogger(__name__)


class PolicyServiceError(Exception):
    """Base class for expected, caller-facing ingestion errors."""


class InvalidPdfError(PolicyServiceError):
    """The uploaded file is not a valid PDF."""


class FileTooLargeError(PolicyServiceError):
    """The uploaded file exceeds the configured size limit."""


# {business_id: {policy_id: [PolicyChunk, ...]}} - shared by every service
# instance in this process. A business_id that was never ingested into simply
# has no entry, so a lookup for it safely returns nothing.
_CHUNK_INDEX: Dict[str, Dict[str, List[PolicyChunk]]] = {}


def _new_policy_id() -> str:
    return f"POL-{uuid.uuid4().hex[:12]}"


def load_index_from_disk(settings: Optional[Settings] = None) -> int:
    """Reload previously persisted chunks from `processed_dir` into `_CHUNK_INDEX`.

    Intended to run once at process startup, so a restart does not silently
    make previously uploaded policies unavailable for retrieval - the chunk
    JSON files written by `_persist_chunks` are the durable record this reads
    back. A missing or corrupted file is skipped with a warning, not a
    startup failure.

    Returns the number of policies loaded.
    """
    settings = settings or get_settings()
    root = Path(settings.processed_dir)
    if not root.is_dir():
        return 0

    loaded = 0
    for business_dir in root.iterdir():
        if not business_dir.is_dir():
            continue
        business_id = business_dir.name
        for policy_file in business_dir.glob("*.json"):
            policy_id = policy_file.stem
            try:
                payload = json.loads(policy_file.read_text(encoding="utf-8"))
                chunks = [PolicyChunk.model_validate(item) for item in payload]
            except (json.JSONDecodeError, ValidationError, OSError):
                logger.warning("Skipping unreadable processed chunk file: %s", policy_file)
                continue
            _CHUNK_INDEX.setdefault(business_id, {})[policy_id] = chunks
            loaded += 1

    logger.info("Reloaded %d policy/policies from disk into the chunk index", loaded)
    return loaded


class PolicyIngestionService:
    """Validates, encrypts, stores and chunks one uploaded policy PDF."""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self._settings = settings or get_settings()

    def ingest(self, business_id: str, filename: str, pdf_bytes: bytes) -> PolicyDocument:
        self._validate(pdf_bytes)
        policy_id = _new_policy_id()

        self._store_encrypted_pdf(business_id, policy_id, pdf_bytes)

        try:
            chunks, page_count = build_chunks(pdf_bytes, policy_id, business_id)
        except Exception:
            # Never leak internal parsing errors; record failure and move on.
            logger.exception(
                "Failed to process policy %s for business %s", policy_id, business_id
            )
            return PolicyDocument(
                policy_id=policy_id,
                business_id=business_id,
                filename=filename,
                status=PolicyStatus.FAILED,
                page_count=0,
                chunk_count=0,
            )

        _CHUNK_INDEX.setdefault(business_id, {})[policy_id] = chunks
        self._persist_chunks(business_id, policy_id, chunks)

        return PolicyDocument(
            policy_id=policy_id,
            business_id=business_id,
            filename=filename,
            status=PolicyStatus.READY,
            page_count=page_count,
            chunk_count=len(chunks),
            flagged_chunk_count=sum(1 for chunk in chunks if chunk.flagged),
        )

    def _validate(self, pdf_bytes: bytes) -> None:
        if not is_pdf(pdf_bytes):
            raise InvalidPdfError("The uploaded file is not a valid PDF.")
        max_bytes = self._settings.max_upload_mb * 1024 * 1024
        if len(pdf_bytes) > max_bytes:
            raise FileTooLargeError(
                f"The uploaded file exceeds the {self._settings.max_upload_mb} MB limit."
            )

    def _store_encrypted_pdf(self, business_id: str, policy_id: str, pdf_bytes: bytes) -> None:
        directory = Path(self._settings.upload_dir) / business_id
        directory.mkdir(parents=True, exist_ok=True)
        (directory / f"{policy_id}.pdf.enc").write_bytes(encrypt_bytes(pdf_bytes))

    def _persist_chunks(
        self, business_id: str, policy_id: str, chunks: List[PolicyChunk]
    ) -> None:
        directory = Path(self._settings.processed_dir) / business_id
        directory.mkdir(parents=True, exist_ok=True)
        payload = [chunk.model_dump(mode="json") for chunk in chunks]
        (directory / f"{policy_id}.json").write_text(json.dumps(payload), encoding="utf-8")


class PolicyRetrievalService:
    """Finds evidence for a set of risks, scoped to one business's own policies."""

    def __init__(
        self, retriever: Optional[Retriever] = None, settings: Optional[Settings] = None
    ) -> None:
        self._retriever = retriever or TfidfRetriever()
        self._settings = settings or get_settings()

    def retrieve(
        self,
        business_id: str,
        policy_ids: List[str],
        risks: List[IdentifiedRisk],
        top_k: Optional[int] = None,
    ) -> List[RiskEvidenceResult]:
        effective_top_k = top_k or self._settings.retrieval_top_k
        candidates = self._candidate_chunks(business_id, policy_ids)

        results: List[RiskEvidenceResult] = []
        for risk in risks:
            query = build_query(risk)
            matches = self._retriever.retrieve(query, candidates, effective_top_k)
            evidence = [
                EvidenceClause(
                    chunk_id=chunk.chunk_id,
                    policy_id=chunk.policy_id,
                    section=chunk.section,
                    page=chunk.page,
                    text=chunk.text,
                    score=score,
                )
                for chunk, score in matches
            ]
            results.append(RiskEvidenceResult(risk_id=risk.risk_id, evidence=evidence))
        return results

    def _candidate_chunks(self, business_id: str, policy_ids: List[str]) -> List[PolicyChunk]:
        # Looking inside this business's own entry only - a policy_id that
        # belongs to a different business simply is not found here, even if
        # the caller supplies it explicitly.
        business_policies = _CHUNK_INDEX.get(business_id, {})
        candidates: List[PolicyChunk] = []
        for policy_id in policy_ids:
            candidates.extend(business_policies.get(policy_id, []))
        return candidates
