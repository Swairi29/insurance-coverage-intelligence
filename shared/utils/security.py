# Input validation, PII redaction and API key helpers (shared)
"""Security building blocks shared by the agents.

- `require_internal_api_key`: a FastAPI dependency that checks the shared
  `X-API-Key` header on inter-agent calls.
- `encrypt_bytes` / `decrypt_bytes`: Fernet encryption for documents stored at rest.
- `is_pdf`: a magic-byte check, so a renamed file cannot pass as a PDF.
- `scan_for_prompt_injection`: flags text that reads like an instruction aimed at
  an LLM. It never blocks or alters anything - policy text is always data, never
  an instruction - it only records the observation for later review.
"""

import hmac
import logging
import re
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from fastapi import Header, HTTPException

from shared.config.settings import get_settings

logger = logging.getLogger(__name__)


class SecurityConfigError(Exception):
    """Required security configuration (a key) is missing."""


# --- inter-agent authentication -------------------------------------------------------


def require_internal_api_key(
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
) -> None:
    """FastAPI dependency: reject the request unless `X-API-Key` matches `INTERNAL_API_KEY`.

    The same generic error is returned whether the key is missing, wrong, or not
    configured on the server at all, so a caller cannot tell those cases apart.
    A misconfigured server is still logged, just not exposed to the caller.
    """
    settings = get_settings()
    expected = (
        settings.internal_api_key.get_secret_value().strip()
        if settings.internal_api_key
        else ""
    )
    if not expected:
        logger.error("INTERNAL_API_KEY is not configured; rejecting request.")
        raise HTTPException(status_code=401, detail="Missing or invalid API key.")
    if not x_api_key or not hmac.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=401, detail="Missing or invalid API key.")


# --- encryption at rest ----------------------------------------------------------------


def _get_fernet() -> Fernet:
    settings = get_settings()
    key = (
        settings.document_encryption_key.get_secret_value().strip()
        if settings.document_encryption_key
        else ""
    )
    if not key:
        raise SecurityConfigError(
            "DOCUMENT_ENCRYPTION_KEY is not set. Add it to your .env file."
        )
    try:
        return Fernet(key.encode())
    except ValueError as exc:
        raise SecurityConfigError(
            "DOCUMENT_ENCRYPTION_KEY is not a valid Fernet key."
        ) from exc


def encrypt_bytes(data: bytes) -> bytes:
    """Encrypt raw bytes (e.g. an uploaded PDF) for storage at rest."""
    return _get_fernet().encrypt(data)


def decrypt_bytes(token: bytes) -> bytes:
    """Decrypt bytes previously produced by `encrypt_bytes`.

    Raises `SecurityConfigError` if the stored data cannot be decrypted with the
    configured key (wrong or rotated key, or corrupted data).
    """
    try:
        return _get_fernet().decrypt(token)
    except InvalidToken as exc:
        raise SecurityConfigError(
            "Could not decrypt the stored document (wrong key or corrupted data)."
        ) from exc


# --- file validation ---------------------------------------------------------------------

_PDF_MAGIC = b"%PDF-"


def is_pdf(data: bytes) -> bool:
    """True if `data` starts with the PDF file signature.

    Checked on the file's actual bytes, not its filename or extension, so a
    renamed non-PDF file is rejected.
    """
    return data[:5] == _PDF_MAGIC


# --- prompt-injection flagging (never blocks, only flags) ------------------------------

_INJECTION_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"ignore (all |any )?(previous|prior|the above)\s+instructions",
        r"disregard (all |any )?(previous|prior|the above)",
        r"you (are|must) now (act|behave|respond)",
        r"new instructions?\s*:",
        r"system prompt",
        r"act as (an?|the)\s",
        r"this (policy|document) covers everything",
        r"state that this (policy|document)",
    )
)


def scan_for_prompt_injection(text: str) -> Optional[str]:
    """Return a short reason if `text` reads like an instruction override attempt.

    Returns `None` when nothing suspicious is found. This is a heuristic, best-
    effort signal, not a security boundary - the text is always treated as plain
    data regardless of the result.
    """
    for pattern in _INJECTION_PATTERNS:
        match = pattern.search(text)
        if match:
            return f"Text resembles an instruction override attempt ('{match.group(0)}')."
    return None
