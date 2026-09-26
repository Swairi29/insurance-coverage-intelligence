# User registration, login and JWT session handling
"""Accounts and login tokens for the gateway.

- Passwords are hashed with bcrypt (called directly: passlib 1.7 breaks with
  bcrypt >= 4.1). Only the hash is stored.
- A successful login returns a short-lived JWT (HS256, signed with
  `JWT_SECRET_KEY`), sent back as `Authorization: Bearer <token>`.
- A wrong email and a wrong password give the same error, and an unknown
  email still costs one bcrypt check, so a caller cannot tell them apart.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Optional, Tuple

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from services.orchestration.database import Database, UserRecord, get_database
from shared.config.settings import Settings, get_settings

logger = logging.getLogger(__name__)

_ALGORITHM = "HS256"
_MIN_SECRET_LENGTH = 32  # HS256 needs a key of at least 256 bits
_INVALID_TOKEN = "Not logged in or session expired."

_bearer = HTTPBearer(auto_error=False)


class AuthConfigError(Exception):
    """JWT_SECRET_KEY is missing or too short."""


# --- passwords ------------------------------------------------------------------------


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except ValueError:  # malformed hash, or a password over bcrypt's 72-byte limit
        return False


@lru_cache
def _dummy_hash() -> str:
    return hash_password("not-a-real-password")


def register_user(db: Database, email: str, password: str) -> UserRecord:
    """Raises `DuplicateEmailError` if the email is taken."""
    return db.create_user(email, hash_password(password))


def authenticate(db: Database, email: str, password: str) -> Optional[UserRecord]:
    user = db.get_user_by_email(email)
    if user is None:
        verify_password(password, _dummy_hash())  # same cost as a real check
        return None
    return user if verify_password(password, user.password_hash) else None


# --- tokens ---------------------------------------------------------------------------


def _secret(settings: Settings) -> str:
    secret = settings.jwt_secret_key.get_secret_value().strip() if settings.jwt_secret_key else ""
    if len(secret) < _MIN_SECRET_LENGTH:
        raise AuthConfigError(f"JWT_SECRET_KEY must be set and at least {_MIN_SECRET_LENGTH} characters.")
    return secret


def create_access_token(user_id: str, settings: Settings) -> Tuple[str, int]:
    """Returns the token and its lifetime in seconds."""
    lifetime = timedelta(minutes=settings.jwt_expiry_minutes)
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {"sub": user_id, "iat": now, "exp": now + lifetime},
        _secret(settings),
        algorithm=_ALGORITHM,
    )
    return token, int(lifetime.total_seconds())


def decode_access_token(token: str, settings: Settings) -> Optional[str]:
    """The user_id in a valid, unexpired token, else None."""
    try:
        claims = jwt.decode(token, _secret(settings), algorithms=[_ALGORITHM],
                            options={"require": ["sub", "exp", "iat"]})
    except jwt.PyJWTError:
        return None
    subject = claims.get("sub")
    return subject if isinstance(subject, str) else None


# --- FastAPI dependency ----------------------------------------------------------------


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Database = Depends(get_database),
) -> UserRecord:
    """Rejects the request with 401 unless it carries a valid token for an existing user."""
    unauthorized = HTTPException(status_code=401, detail=_INVALID_TOKEN,
                                 headers={"WWW-Authenticate": "Bearer"})
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized
    try:
        user_id = decode_access_token(credentials.credentials, get_settings())
    except AuthConfigError:
        logger.error("JWT_SECRET_KEY is not configured; rejecting request.")
        raise unauthorized from None
    user = db.get_user(user_id) if user_id else None
    if user is None:  # also covers a token for a deleted account
        raise unauthorized
    return user
