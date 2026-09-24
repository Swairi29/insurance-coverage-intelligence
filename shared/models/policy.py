# Insurance policy and policy clause data models (shared)
"""Output-side models describing an uploaded policy and the evidence retrieved from it.

The Policy Intelligence Agent (Agent 2) produces these objects. Other agents
(Coverage & Gap, Explanation) read `EvidenceClause` / `RiskEvidenceResult`, so the
field names here are a contract: change them only after agreeing with the team.

These models say nothing about coverage status — they only describe *where a piece
of policy text came from* (which policy, section, page) so every later step stays
evidence-grounded and traceable back to the source document.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class PolicyStatus(str, Enum):
    """Where an uploaded policy document is in the ingestion pipeline."""

    PROCESSING = "processing"  # uploaded, text extraction/chunking not finished yet
    READY = "ready"  # chunked and indexed; can be used for retrieval
    FAILED = "failed"  # could not be processed (e.g. unreadable PDF)


class PolicyDocument(BaseModel):
    """One uploaded insurance policy PDF, after validation."""

    model_config = ConfigDict(str_strip_whitespace=True)

    policy_id: str = Field(min_length=1, max_length=64)
    business_id: str = Field(min_length=1, max_length=64)
    filename: str = Field(min_length=1, max_length=255)
    status: PolicyStatus
    page_count: int = Field(ge=0)
    chunk_count: int = Field(default=0, ge=0)
    flagged_chunk_count: int = Field(default=0, ge=0)
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PolicyChunk(BaseModel):
    """One retrievable piece of policy text, with its location in the source PDF."""

    model_config = ConfigDict(str_strip_whitespace=True)

    chunk_id: str = Field(min_length=1, max_length=80)
    policy_id: str = Field(min_length=1, max_length=64)
    business_id: str = Field(min_length=1, max_length=64)
    # Best-effort heading/clause label detected above this chunk; None if not found.
    section: Optional[str] = Field(default=None, max_length=200)
    page: int = Field(ge=1)
    text: str = Field(min_length=1, max_length=4000)
    # True when the chunk text looks like it is trying to give instructions
    # (e.g. "ignore previous instructions"). The chunk is still kept and
    # returned like any other piece of document text, never treated as a
    # command; this flag only records the observation for later review.
    flagged: bool = False
    flag_reason: Optional[str] = Field(default=None, max_length=200)


class EvidenceClause(BaseModel):
    """A policy chunk returned as evidence for a specific risk, with its relevance score."""

    model_config = ConfigDict(str_strip_whitespace=True)

    chunk_id: str = Field(min_length=1, max_length=80)
    policy_id: str = Field(min_length=1, max_length=64)
    section: Optional[str] = Field(default=None, max_length=200)
    page: int = Field(ge=1)
    text: str = Field(min_length=1, max_length=4000)
    # 0.0 - 1.0 relevance score (e.g. TF-IDF cosine similarity) to the risk query.
    score: float = Field(ge=0.0, le=1.0)


class RiskEvidenceResult(BaseModel):
    """All evidence found for one risk, across the requested policies."""

    model_config = ConfigDict(str_strip_whitespace=True)

    risk_id: str = Field(min_length=1, max_length=40)
    evidence: List[EvidenceClause] = Field(default_factory=list)
