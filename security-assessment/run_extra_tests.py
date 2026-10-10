"""Tests 21-23: items from the team's security notes not covered by tests 1-20.

21  Paraphrased-clause recall (Retrieval Accuracy)
22  business_id input validation on Agent 2 uploads (API Security)
23  Upload size cap through the gateway (Source Reliability)

Run from the repo root with the gateway and Agent 2 running:
    .venv\\Scripts\\python.exe security-assessment\\run_extra_tests.py
"""

import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import fitz
import httpx

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from agents.policy_agent.document_processor import build_chunks  # noqa: E402
from agents.policy_agent.retriever import SemanticRetriever, TfidfRetriever, build_query  # noqa: E402
from shared.config.settings import get_settings  # noqa: E402
from shared.models.risk import IdentifiedRisk  # noqa: E402

AGENT2 = "http://127.0.0.1:8002"
GATEWAY = "http://127.0.0.1:8000"
EVIDENCE = Path(__file__).resolve().parent / "evidence"
SETTINGS = get_settings()
HEADERS = {"X-API-Key": SETTINGS.internal_api_key.get_secret_value()}
RUN = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
FIRE_RISK = {"risk_id": "FIRE_COOKING", "name": "Fire from cooking and baking equipment",
             "category": "fire", "reason": "test", "source": "rule", "confidence": 0.9}

client = httpx.Client(timeout=120)


def make_pdf(pages):
    doc = fitz.open()
    for lines in pages:
        page = doc.new_page()
        for i, line in enumerate(lines):
            page.insert_text((72, 72 + 16 * i), line, fontsize=11)
    data = doc.tobytes()
    doc.close()
    return data


def save(name, record):
    record["captured_at"] = datetime.now(timezone.utc).isoformat()
    (EVIDENCE / f"{name}.json").write_text(json.dumps(record, indent=2), encoding="utf-8")
    print(f"--- {name}")
    print(json.dumps(record, indent=2)[:1800])
    print()


def body_of(r):
    try:
        return r.json()
    except ValueError:
        return r.text


# --- Test 21: paraphrased-clause recall ----------------------------------------------------
clauses = {
    "paraphrase_1": "Loss arising from conflagration or combustion at the insured premises is indemnified.",
    "paraphrase_2": "The insurer will pay for harm to the bakery caused by a blaze or scorching from ovens.",
    "control": "Damage to the premises caused by smoke, flame or explosion is covered.",
}
pages = [["SECTION %d - COVER" % (i + 1), text] for i, text in enumerate(clauses.values())]
pdf = make_pdf(pages)
up = client.post(f"{AGENT2}/api/v1/policies", data={"business_id": "T21"},
                 files={"file": ("t21_paraphrase.pdf", pdf, "application/pdf")}, headers=HEADERS)
policy_id = up.json()["policy_id"]
live = client.post(f"{AGENT2}/api/v1/retrieve-policy-evidence", headers=HEADERS,
                   json={"business_id": "T21", "policy_ids": [policy_id], "risks": [FIRE_RISK], "top_k": 10})
label_of = {text: label for label, text in clauses.items()}
live_hits = [{"clause": label_of.get(e["text"].replace("\n", " ").strip(), e["text"][:40]),
              "score": round(e["score"], 4)} for e in live.json()["results"][0]["evidence"]]

query = build_query(IdentifiedRisk(**FIRE_RISK))
chunks, _ = build_chunks(pdf, "T21", "T21")
in_process = {}
for name, retriever in (("tfidf", TfidfRetriever(min_score=0.0)), ("semantic", SemanticRetriever(min_score=0.0))):
    scores = {label_of.get(c.text.replace("\n", " ").strip(), c.text[:40]): round(s, 4)
              for c, s in retriever.retrieve(query, chunks, top_k=10)}
    in_process[name] = {label: scores.get(label, 0.0) for label in clauses}
save("T21-paraphrase-recall", {
    "query": query, "clauses": clauses, "chunk_count": up.json()["chunk_count"],
    "live_tfidf_returned": live_hits,
    "scores_no_threshold": in_process,
    "thresholds": {"tfidf": 0.1, "semantic": 0.2},
})

# --- Test 22: business_id validation on Agent 2 uploads -----------------------------------
upload_root = ROOT / SETTINGS.upload_dir
processed_root = ROOT / SETTINGS.processed_dir


def listing():
    return {str(p.relative_to(ROOT)) for root in (upload_root, processed_root) for p in root.iterdir()}


before = listing()
values = {
    "empty": "",
    "whitespace_only": "   ",
    "300_characters": "T22" + "x" * 297,
    "spaces_and_symbols": f"T22 has spaces & symbols {RUN}",
    "non_ascii": f"T22-ünïcødé-{RUN}",
    "forward_slash_nested": f"T22-parent-{RUN}/child",
}
small_pdf = make_pdf([["SECTION 1 - COVER", "Smoke and explosion damage is covered."]])
results = {}
for label, value in values.items():
    r = client.post(f"{AGENT2}/api/v1/policies", data={"business_id": value},
                    files={"file": ("t22.pdf", small_pdf, "application/pdf")}, headers=HEADERS)
    b = body_of(r)
    results[label] = {"business_id_sent": value if len(value) < 60 else value[:20] + f"...({len(value)} chars)",
                      "status": r.status_code,
                      "stored_business_id": b.get("business_id") if isinstance(b, dict) else None,
                      "detail": b.get("detail") if isinstance(b, dict) else str(b)[:200]}
after = listing()
created = sorted(after - before)
outside_data = [p for p in created if not (p.startswith(str(upload_root.relative_to(ROOT)))
                                           or p.startswith(str(processed_root.relative_to(ROOT))))]
save("T22-business-id-validation", {
    "results_by_value": results,
    "new_entries_in_upload_and_processed_dirs": created,
    "entries_outside_data_dirs": outside_data,
})

# Clean up only what this test created.
for rel in created:
    path = ROOT / rel
    if path.is_dir():
        shutil.rmtree(path)
    elif path.exists():
        path.unlink()
print("cleaned up:", len(created), "entries; remaining new entries:", sorted(listing() - before))
print()

# --- Test 23: size cap through the gateway ------------------------------------------------
email, password = f"t23-{RUN}@example.test", f"Assess23-{RUN}!"
client.post(f"{GATEWAY}/api/v1/auth/register", json={"email": email, "password": password,
                                                    "consent_version": "2026-10-04"})
token = client.post(f"{GATEWAY}/api/v1/auth/login", json={"email": email, "password": password}).json()["access_token"]
agent_log = ROOT / "logs" / "policy_agent.log"


def agent_uploads():
    return agent_log.read_text(encoding="utf-8", errors="replace").count('"POST /api/v1/policies')


before_uploads = agent_uploads()
oversized = b"%PDF-1.4\n" + b"0" * ((SETTINGS.max_upload_mb + 1) * 1024 * 1024)
r = client.post(f"{GATEWAY}/api/v1/policies", headers={"Authorization": f"Bearer {token}"},
                files={"file": ("oversized.pdf", oversized, "application/pdf")})
after_uploads = agent_uploads()
save("T23-gateway-size-cap", {
    "limit_mb": SETTINGS.max_upload_mb, "upload_mb": round(len(oversized) / 1024 / 1024, 2),
    "gateway_status": r.status_code, "gateway_body": body_of(r),
    "agent2_upload_requests_during_test": after_uploads - before_uploads,
})

print("Done.")
