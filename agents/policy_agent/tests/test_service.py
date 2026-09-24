# Agent 2 service tests (Member 2)
"""Unit tests for agents.policy_agent.service."""

import json
from pathlib import Path

import fitz
import pytest
from cryptography.fernet import Fernet

import agents.policy_agent.service as service_module
from agents.policy_agent.service import (
    FileTooLargeError,
    InvalidPdfError,
    PolicyIngestionService,
    PolicyRetrievalService,
    load_index_from_disk,
)
from shared.config.settings import get_settings
from shared.models.policy import PolicyStatus
from shared.models.risk import IdentifiedRisk
from shared.utils.security import decrypt_bytes

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _isolated_storage(tmp_path, monkeypatch):
    """Route all reads/writes to a temp directory and reset the in-memory index."""
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("PROCESSED_DIR", str(tmp_path / "processed"))
    monkeypatch.setenv("DOCUMENT_ENCRYPTION_KEY", Fernet.generate_key().decode())
    get_settings.cache_clear()
    service_module._CHUNK_INDEX.clear()
    yield
    service_module._CHUNK_INDEX.clear()
    get_settings.cache_clear()


def make_pdf(lines):
    doc = fitz.open()
    page = doc.new_page()
    y = 72
    for line in lines:
        page.insert_text((72, y), line, fontsize=11)
        y += 16
    data = doc.tobytes()
    doc.close()
    return data


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


# --- PolicyIngestionService --------------------------------------------------------------

def test_ingest_a_valid_pdf_returns_ready_status():
    pdf_bytes = make_pdf(["This policy covers fire and burning damage."])
    document = PolicyIngestionService().ingest("B001", "fire_policy.pdf", pdf_bytes)

    assert document.status is PolicyStatus.READY
    assert document.business_id == "B001"
    assert document.filename == "fire_policy.pdf"
    assert document.page_count == 1
    assert document.chunk_count > 0


def test_ingest_rejects_non_pdf_bytes():
    with pytest.raises(InvalidPdfError):
        PolicyIngestionService().ingest("B001", "not_a_pdf.pdf", b"this is not a pdf file")


def test_ingest_rejects_oversized_files(monkeypatch):
    monkeypatch.setenv("MAX_UPLOAD_MB", "1")
    get_settings.cache_clear()
    fake_but_pdf_shaped = b"%PDF-1.4" + b"0" * (2 * 1024 * 1024)  # 2 MB, over the 1 MB limit

    with pytest.raises(FileTooLargeError):
        PolicyIngestionService().ingest("B001", "huge.pdf", fake_but_pdf_shaped)


def test_ingest_indexes_chunks_in_memory_by_business():
    pdf_bytes = make_pdf(["This policy covers fire and burning damage."])
    document = PolicyIngestionService().ingest("B001", "fire_policy.pdf", pdf_bytes)

    indexed = service_module._CHUNK_INDEX["B001"][document.policy_id]
    assert len(indexed) == document.chunk_count
    assert all(chunk.business_id == "B001" for chunk in indexed)


def test_ingest_stores_the_pdf_encrypted_on_disk(tmp_path):
    pdf_bytes = make_pdf(["This policy covers fire and burning damage."])
    document = PolicyIngestionService().ingest("B001", "fire_policy.pdf", pdf_bytes)

    stored_path = Path(get_settings().upload_dir) / "B001" / f"{document.policy_id}.pdf.enc"
    assert stored_path.exists()
    stored_bytes = stored_path.read_bytes()
    assert stored_bytes != pdf_bytes  # not stored as plaintext
    assert decrypt_bytes(stored_bytes) == pdf_bytes  # but recoverable with the right key


def test_ingest_persists_chunks_as_json_on_disk():
    pdf_bytes = make_pdf(["This policy covers fire and burning damage."])
    document = PolicyIngestionService().ingest("B001", "fire_policy.pdf", pdf_bytes)

    stored_path = Path(get_settings().processed_dir) / "B001" / f"{document.policy_id}.json"
    assert stored_path.exists()
    payload = json.loads(stored_path.read_text(encoding="utf-8"))
    assert len(payload) == document.chunk_count
    assert payload[0]["policy_id"] == document.policy_id


# --- PolicyRetrievalService ----------------------------------------------------------------

def test_retrieve_finds_relevant_evidence_for_a_risk():
    pdf_bytes = make_pdf(["This policy covers fire, burning and smoke damage to the kitchen."])
    document = PolicyIngestionService().ingest("B001", "fire_policy.pdf", pdf_bytes)

    results = PolicyRetrievalService().retrieve(
        business_id="B001", policy_ids=[document.policy_id], risks=[risk()]
    )

    assert len(results) == 1
    assert results[0].risk_id == "FIRE_COOKING"
    assert len(results[0].evidence) > 0
    assert results[0].evidence[0].policy_id == document.policy_id


def test_retrieve_returns_empty_evidence_when_nothing_matches():
    pdf_bytes = make_pdf(["This policy only covers water damage from burst pipes."])
    document = PolicyIngestionService().ingest("B001", "water_policy.pdf", pdf_bytes)

    unrelated_risk = risk(
        risk_id="CYB_DATA_BREACH", name="Customer data breach", category="cyber"
    )
    results = PolicyRetrievalService().retrieve(
        business_id="B001", policy_ids=[document.policy_id], risks=[unrelated_risk]
    )

    assert results[0].evidence == []


def test_retrieve_only_uses_the_requested_policy_ids():
    fire_pdf = make_pdf(["This policy covers fire and burning damage."])
    water_pdf = make_pdf(["This policy covers water damage from burst pipes."])
    fire_doc = PolicyIngestionService().ingest("B001", "fire_policy.pdf", fire_pdf)
    water_doc = PolicyIngestionService().ingest("B001", "water_policy.pdf", water_pdf)

    # Only ask about the water policy, even though the business also has a fire policy.
    results = PolicyRetrievalService().retrieve(
        business_id="B001", policy_ids=[water_doc.policy_id], risks=[risk()]
    )

    for evidence in results[0].evidence:
        assert evidence.policy_id == water_doc.policy_id
        assert evidence.policy_id != fire_doc.policy_id


def test_retrieve_never_crosses_a_business_boundary():
    pdf_bytes = make_pdf(["Fire fire fire burning burning damage burning fire cover."])
    document = PolicyIngestionService().ingest("business-A", "fire_policy.pdf", pdf_bytes)

    # business-B asks for evidence, but supplies business-A's real policy_id.
    results = PolicyRetrievalService().retrieve(
        business_id="business-B", policy_ids=[document.policy_id], risks=[risk()]
    )

    assert results[0].evidence == []


# --- load_index_from_disk ----------------------------------------------------------------

def test_load_index_from_disk_restores_a_previously_ingested_policy():
    pdf_bytes = make_pdf(["This policy covers fire and burning damage."])
    document = PolicyIngestionService().ingest("B001", "fire_policy.pdf", pdf_bytes)

    # Simulate a restart: wipe the in-memory index, but leave the files on disk.
    service_module._CHUNK_INDEX.clear()
    assert service_module._CHUNK_INDEX == {}

    loaded = load_index_from_disk()

    assert loaded == 1
    restored = service_module._CHUNK_INDEX["B001"][document.policy_id]
    assert len(restored) == document.chunk_count
    assert restored[0].text  # the actual chunk content came back, not just an empty shell


def test_load_index_from_disk_with_nothing_persisted_yet_returns_zero():
    assert load_index_from_disk() == 0
    assert service_module._CHUNK_INDEX == {}


def test_load_index_from_disk_skips_a_corrupted_file(tmp_path):
    business_dir = Path(get_settings().processed_dir) / "B001"
    business_dir.mkdir(parents=True, exist_ok=True)
    (business_dir / "POL-broken.json").write_text("{ not valid json", encoding="utf-8")

    loaded = load_index_from_disk()

    assert loaded == 0
    assert "B001" not in service_module._CHUNK_INDEX


def test_retrieval_works_after_a_simulated_restart():
    pdf_bytes = make_pdf(["This policy covers fire, burning and smoke damage."])
    document = PolicyIngestionService().ingest("B001", "fire_policy.pdf", pdf_bytes)

    service_module._CHUNK_INDEX.clear()  # simulate the process restarting
    load_index_from_disk()

    results = PolicyRetrievalService().retrieve(
        business_id="B001", policy_ids=[document.policy_id], risks=[risk()]
    )
    assert len(results[0].evidence) > 0
