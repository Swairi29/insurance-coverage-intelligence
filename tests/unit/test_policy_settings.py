"""Unit tests for the Agent 2 (Policy Intelligence) settings fields.

Kept separate from `test_settings.py` so Agent 1's existing settings tests are
never touched by Agent 2 work.
"""

import pytest
from pydantic import ValidationError

from shared.config.settings import Settings

pytestmark = pytest.mark.unit


def test_defaults_when_nothing_is_set():
    settings = Settings()
    assert settings.upload_dir == "./data/uploads"
    assert settings.processed_dir == "./data/processed"
    assert settings.vector_store_dir == "./data/index"
    assert settings.chunk_size == 800
    assert settings.chunk_overlap == 120
    assert settings.retrieval_top_k == 8
    assert settings.max_upload_mb == 25
    assert settings.internal_api_key is None
    assert settings.document_encryption_key is None
    assert settings.ocr_enabled is True


def test_reads_document_and_retrieval_settings_from_environment(monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", "/tmp/uploads")
    monkeypatch.setenv("CHUNK_SIZE", "500")
    monkeypatch.setenv("CHUNK_OVERLAP", "50")
    monkeypatch.setenv("RETRIEVAL_TOP_K", "5")
    monkeypatch.setenv("MAX_UPLOAD_MB", "10")
    settings = Settings()
    assert settings.upload_dir == "/tmp/uploads"
    assert settings.chunk_size == 500
    assert settings.chunk_overlap == 50
    assert settings.retrieval_top_k == 5
    assert settings.max_upload_mb == 10


def test_internal_api_key_and_encryption_key_are_secret(monkeypatch):
    monkeypatch.setenv("INTERNAL_API_KEY", "shared-service-secret")
    monkeypatch.setenv("DOCUMENT_ENCRYPTION_KEY", "a-fernet-key")
    settings = Settings()
    assert settings.internal_api_key.get_secret_value() == "shared-service-secret"
    assert settings.document_encryption_key.get_secret_value() == "a-fernet-key"
    assert "shared-service-secret" not in repr(settings)
    assert "a-fernet-key" not in repr(settings)


def test_empty_internal_api_key_counts_as_missing(monkeypatch):
    monkeypatch.setenv("INTERNAL_API_KEY", "")
    settings = Settings()
    assert settings.internal_api_key is None


def test_ocr_can_be_disabled(monkeypatch):
    monkeypatch.setenv("OCR_ENABLED", "false")
    settings = Settings()
    assert settings.ocr_enabled is False


@pytest.mark.parametrize(
    "name, value",
    [
        ("CHUNK_SIZE", "0"),
        ("CHUNK_OVERLAP", "-1"),
        ("RETRIEVAL_TOP_K", "0"),
        ("MAX_UPLOAD_MB", "0"),
    ],
)
def test_invalid_numeric_values_are_rejected(monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    with pytest.raises(ValidationError):
        Settings()
