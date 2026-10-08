# SQLite access layer for users, uploads and analysis runs
"""SQLite storage for the gateway, using only the standard library.

- `users`: login accounts. Each user owns one business_id, generated here and
  never taken from the client, because Agent 2 uses it as a folder name.
- `policies`: which uploaded policy_ids belong to which business.
- `analyses`: finished runs. The full result holds policy excerpts, so it is
  stored Fernet-encrypted (the same key as the policy PDFs); the summary
  columns are kept in plain text for the history list.
- `scenario_analyses`: finished free-text scenario runs, stored the same way.
  A separate table, because the result has a different shape.
- `business_profiles`: the business profiles a user saved to their account, so they
  can be picked again for a new analysis. The profile is stored Fernet-encrypted.

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
    created_at    TEXT NOT NULL,
    consent_version TEXT,
    consented_at  TEXT
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
CREATE TABLE IF NOT EXISTS scenario_analyses (
    request_id     TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users (user_id),
    status         TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    total_findings INTEGER NOT NULL,
    potential_gaps INTEGER NOT NULL,
    result         BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS business_profiles (
    profile_id     TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users (user_id),
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    profile        BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analyses_user ON analyses (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_scenario_analyses_user ON scenario_analyses (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_business_profiles_user ON business_profiles (user_id, updated_at);
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
    # The privacy notice agreed to at sign-up, and when (None for older accounts).
    consent_version: Optional[str] = None
    consented_at: Optional[datetime] = None


@dataclass(frozen=True)
class StoredBusinessProfile:
    """One saved business profile; `encrypted_profile` is the Fernet-encrypted BusinessProfile JSON."""

    profile_id: str
    created_at: datetime
    updated_at: datetime
    encrypted_profile: bytes


# Columns added after the first release, with their type. init_schema adds any that an
# existing database file does not have yet, so no data is lost.
_ADDED_COLUMNS = {"users": {"consent_version": "TEXT", "consented_at": "TEXT"}}


class Database:
    def __init__(self, path: str | Path):
        self._path = str(path)

    def init_schema(self) -> None:
        Path(self._path).parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as conn:
            conn.executescript(_SCHEMA)
            for table, columns in _ADDED_COLUMNS.items():
                existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
                for name, kind in columns.items():
                    if name not in existing:
                        conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {kind}")

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

    def create_user(self, email: str, password_hash: str,
                    consent_version: Optional[str] = None) -> UserRecord:
        now = datetime.now(timezone.utc)
        user = UserRecord(
            user_id=str(uuid.uuid4()),
            email=email,
            password_hash=password_hash,
            business_id=f"B-{uuid.uuid4().hex[:16]}",
            created_at=now,
            consent_version=consent_version,
            consented_at=now if consent_version else None,
        )
        try:
            with self._connection() as conn:
                conn.execute(
                    "INSERT INTO users (user_id, email, password_hash, business_id, created_at, "
                    "consent_version, consented_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (user.user_id, user.email, user.password_hash, user.business_id,
                     user.created_at.isoformat(), user.consent_version,
                     user.consented_at.isoformat() if user.consented_at else None),
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
            consent_version=row["consent_version"],
            consented_at=datetime.fromisoformat(row["consented_at"]) if row["consented_at"] else None,
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

    # --- analyses and scenario analyses -----------------------------------------------
    # Both tables have the same columns. `table` is always one of the two constants below,
    # never user input, so formatting it into the SQL is safe.

    def save_analysis(self, *, user_id: str, summary: AnalysisSummary, encrypted_result: bytes) -> None:
        self._save_run(_ANALYSES, user_id, summary, encrypted_result)

    def get_analysis(self, *, user_id: str, request_id: str) -> Optional[bytes]:
        """The encrypted result, or None if it does not exist or belongs to another user."""
        return self._get_run(_ANALYSES, user_id, request_id)

    def list_analyses(self, user_id: str, limit: int = 50) -> List[AnalysisSummary]:
        return self._list_runs(_ANALYSES, user_id, limit)

    def save_scenario_analysis(self, *, user_id: str, summary: AnalysisSummary,
                               encrypted_result: bytes) -> None:
        self._save_run(_SCENARIO_ANALYSES, user_id, summary, encrypted_result)

    def get_scenario_analysis(self, *, user_id: str, request_id: str) -> Optional[bytes]:
        """The encrypted result, or None if it does not exist or belongs to another user."""
        return self._get_run(_SCENARIO_ANALYSES, user_id, request_id)

    def list_scenario_analyses(self, user_id: str, limit: int = 50) -> List[AnalysisSummary]:
        return self._list_runs(_SCENARIO_ANALYSES, user_id, limit)

    def _save_run(self, table: str, user_id: str, summary: AnalysisSummary, encrypted_result: bytes) -> None:
        with self._connection() as conn:
            conn.execute(
                f"INSERT INTO {table} (request_id, user_id, status, created_at, total_findings, "
                "potential_gaps, result) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (summary.request_id, user_id, summary.status.value, summary.created_at.isoformat(),
                 summary.total_findings, summary.potential_gaps, encrypted_result),
            )

    def _get_run(self, table: str, user_id: str, request_id: str) -> Optional[bytes]:
        with self._connection() as conn:
            row = conn.execute(
                f"SELECT result FROM {table} WHERE request_id = ? AND user_id = ?", (request_id, user_id)
            ).fetchone()
        return None if row is None else bytes(row["result"])

    def _list_runs(self, table: str, user_id: str, limit: int) -> List[AnalysisSummary]:
        with self._connection() as conn:
            rows = conn.execute(
                f"SELECT request_id, status, created_at, total_findings, potential_gaps FROM {table} "
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


    # --- business profiles ------------------------------------------------------------

    def add_business_profile(self, *, user_id: str, encrypted_profile: bytes) -> StoredBusinessProfile:
        now = datetime.now(timezone.utc)
        stored = StoredBusinessProfile(profile_id=f"BP-{uuid.uuid4().hex[:16]}", created_at=now,
                                       updated_at=now, encrypted_profile=encrypted_profile)
        with self._connection() as conn:
            conn.execute(
                "INSERT INTO business_profiles (profile_id, user_id, created_at, updated_at, profile) "
                "VALUES (?, ?, ?, ?, ?)",
                (stored.profile_id, user_id, now.isoformat(), now.isoformat(), encrypted_profile),
            )
        return stored

    def list_business_profiles(self, user_id: str) -> List[StoredBusinessProfile]:
        """The user's profiles, most recently changed first."""
        with self._connection() as conn:
            rows = conn.execute(
                "SELECT * FROM business_profiles WHERE user_id = ? ORDER BY updated_at DESC", (user_id,)
            ).fetchall()
        return [_stored_profile(row) for row in rows]

    def count_business_profiles(self, user_id: str) -> int:
        with self._connection() as conn:
            row = conn.execute("SELECT COUNT(*) FROM business_profiles WHERE user_id = ?", (user_id,)).fetchone()
        return row[0]

    def get_business_profile(self, *, user_id: str, profile_id: str) -> Optional[StoredBusinessProfile]:
        """The profile, or None if it does not exist or belongs to another user."""
        with self._connection() as conn:
            row = conn.execute(
                "SELECT * FROM business_profiles WHERE profile_id = ? AND user_id = ?", (profile_id, user_id)
            ).fetchone()
        return None if row is None else _stored_profile(row)

    def update_business_profile(self, *, user_id: str, profile_id: str,
                                encrypted_profile: bytes) -> Optional[StoredBusinessProfile]:
        """Replace the profile; None if it does not exist or belongs to another user."""
        with self._connection() as conn:
            updated = conn.execute(
                "UPDATE business_profiles SET profile = ?, updated_at = ? WHERE profile_id = ? AND user_id = ?",
                (encrypted_profile, datetime.now(timezone.utc).isoformat(), profile_id, user_id),
            ).rowcount
        return self.get_business_profile(user_id=user_id, profile_id=profile_id) if updated else None

    def delete_business_profile(self, *, user_id: str, profile_id: str) -> bool:
        """True if the user's profile was deleted, False if there was none to delete."""
        with self._connection() as conn:
            deleted = conn.execute(
                "DELETE FROM business_profiles WHERE profile_id = ? AND user_id = ?", (profile_id, user_id)
            ).rowcount
        return deleted > 0


def _stored_profile(row: sqlite3.Row) -> StoredBusinessProfile:
    return StoredBusinessProfile(
        profile_id=row["profile_id"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
        encrypted_profile=bytes(row["profile"]),
    )


_ANALYSES = "analyses"
_SCENARIO_ANALYSES = "scenario_analyses"


@lru_cache
def get_database() -> Database:
    """FastAPI dependency: the configured database, created on first use (replaced in tests)."""
    db = Database(get_settings().database_path)
    db.init_schema()
    return db
