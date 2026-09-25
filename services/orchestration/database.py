# SQLite access layer for users, uploads and analysis runs
"""SQLite storage for the gateway, using only the standard library.

- `users`: login accounts. Each user owns one business_id, generated here and
  never taken from the client, because Agent 2 uses it as a folder name.
- `policies`: which uploaded policy_ids belong to which business.
- `analyses`: finished runs. The full result holds policy excerpts, so it is
  stored Fernet-encrypted (the same key as the policy PDFs); the summary
  columns are kept in plain text for the history list.

A new connection is opened per operation, because FastAPI runs sync endpoints
in a thread pool and a sqlite3 connection must stay on one thread.
"""

from __future__ import annotations

import sqlite3
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Iterable, Iterator, List, Optional, Set

from shared.config.settings import get_settings
from shared.models.policy import PolicyDocument
from shared.schemas.responses import AnalysisStatus, AnalysisSummary

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    user_id       TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    business_id   TEXT NOT NULL UNIQUE,
    created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS policies (
    policy_id     TEXT PRIMARY KEY,
    business_id   TEXT NOT NULL REFERENCES users (business_id),
    filename      TEXT NOT NULL,
    status        TEXT NOT NULL,
    page_count    INTEGER NOT NULL,
    chunk_count   INTEGER NOT NULL,
    flagged_chunk_count INTEGER NOT NULL,
    uploaded_at   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS analyses (
    request_id     TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users (user_id),
    status         TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    total_findings INTEGER NOT NULL,
    potential_gaps INTEGER NOT NULL,
    result         BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_policies_business ON policies (business_id);
CREATE INDEX IF NOT EXISTS idx_analyses_user ON analyses (user_id, created_at);
"""


class DuplicateEmailError(Exception):
    """An account with this email already exists."""


@dataclass(frozen=True)
class UserRecord:
    user_id: str
    email: str
    password_hash: str
    business_id: str
    created_at: datetime


class Database:
    def __init__(self, path: str | Path):
        self._path = str(path)

    def init_schema(self) -> None:
        Path(self._path).parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as conn:
            conn.executescript(_SCHEMA)

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self._path)
        try:
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON")
            with conn:  # commit on success, roll back on error
                yield conn
        finally:
            conn.close()

    # --- users --------------------------------------------------------------------------

    def create_user(self, email: str, password_hash: str) -> UserRecord:
        user = UserRecord(
            user_id=str(uuid.uuid4()),
            email=email,
            password_hash=password_hash,
            business_id=f"B-{uuid.uuid4().hex[:16]}",
            created_at=datetime.now(timezone.utc),
        )
        try:
            with self._connection() as conn:
                conn.execute(
                    "INSERT INTO users (user_id, email, password_hash, business_id, created_at) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (user.user_id, user.email, user.password_hash, user.business_id,
                     user.created_at.isoformat()),
                )
        except sqlite3.IntegrityError:
            raise DuplicateEmailError() from None
        return user

    def get_user_by_email(self, email: str) -> Optional[UserRecord]:
        return self._one_user("SELECT * FROM users WHERE email = ?", email)

    def get_user(self, user_id: str) -> Optional[UserRecord]:
        return self._one_user("SELECT * FROM users WHERE user_id = ?", user_id)

    def _one_user(self, sql: str, value: str) -> Optional[UserRecord]:
        with self._connection() as conn:
            row = conn.execute(sql, (value,)).fetchone()
        if row is None:
            return None
        return UserRecord(
            user_id=row["user_id"],
            email=row["email"],
            password_hash=row["password_hash"],
            business_id=row["business_id"],
            created_at=datetime.fromisoformat(row["created_at"]),
        )

    # --- policies -----------------------------------------------------------------------

    def add_policy(self, document: PolicyDocument) -> None:
        with self._connection() as conn:
            conn.execute(
                "INSERT INTO policies (policy_id, business_id, filename, status, page_count, "
                "chunk_count, flagged_chunk_count, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (document.policy_id, document.business_id, document.filename, document.status.value,
                 document.page_count, document.chunk_count, document.flagged_chunk_count,
                 document.uploaded_at.isoformat()),
            )

    def list_policies(self, business_id: str) -> List[PolicyDocument]:
        with self._connection() as conn:
            rows = conn.execute(
                "SELECT * FROM policies WHERE business_id = ? ORDER BY uploaded_at DESC", (business_id,)
            ).fetchall()
        return [PolicyDocument.model_validate(dict(row)) for row in rows]

    def owned_policy_ids(self, business_id: str, policy_ids: Iterable[str]) -> Set[str]:
        """The subset of `policy_ids` that belongs to this business."""
        ids = list(policy_ids)
        if not ids:
            return set()
        placeholders = ", ".join("?" for _ in ids)
        with self._connection() as conn:
            rows = conn.execute(
                f"SELECT policy_id FROM policies WHERE business_id = ? AND policy_id IN ({placeholders})",
                (business_id, *ids),
            ).fetchall()
        return {row["policy_id"] for row in rows}

    # --- analyses -----------------------------------------------------------------------

    def save_analysis(self, *, user_id: str, summary: AnalysisSummary, encrypted_result: bytes) -> None:
        with self._connection() as conn:
            conn.execute(
                "INSERT INTO analyses (request_id, user_id, status, created_at, total_findings, "
                "potential_gaps, result) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (summary.request_id, user_id, summary.status.value, summary.created_at.isoformat(),
                 summary.total_findings, summary.potential_gaps, encrypted_result),
            )

    def get_analysis(self, *, user_id: str, request_id: str) -> Optional[bytes]:
        """The encrypted result, or None if it does not exist or belongs to another user."""
        with self._connection() as conn:
            row = conn.execute(
                "SELECT result FROM analyses WHERE request_id = ? AND user_id = ?", (request_id, user_id)
            ).fetchone()
        return None if row is None else bytes(row["result"])

    def list_analyses(self, user_id: str, limit: int = 50) -> List[AnalysisSummary]:
        with self._connection() as conn:
            rows = conn.execute(
                "SELECT request_id, status, created_at, total_findings, potential_gaps FROM analyses "
                "WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", (user_id, limit)
            ).fetchall()
        return [
            AnalysisSummary(
                request_id=row["request_id"],
                status=AnalysisStatus(row["status"]),
                created_at=datetime.fromisoformat(row["created_at"]),
                total_findings=row["total_findings"],
                potential_gaps=row["potential_gaps"],
            )
            for row in rows
        ]


@lru_cache
def get_database() -> Database:
    """FastAPI dependency: the configured database, created on first use (replaced in tests)."""
    db = Database(get_settings().database_path)
    db.init_schema()
    return db
