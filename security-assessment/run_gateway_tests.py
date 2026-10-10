"""Functional test runner for the orchestration gateway (port 8000).

Covers TC-06 (cross-business policy access), TC-08 (citation grounding),
TC-13 (no token), TC-18 (another user's saved analysis) and TC-23 (transport).
Uses two ordinary test accounts created through the normal register endpoint.
Each test's raw responses are saved to security-assessment/evidence/TC-XX.json.

Run from the repo root, with the gateway and all four agents running:
    .venv\\Scripts\\python.exe security-assessment\\run_gateway_tests.py
"""

import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import fitz
import httpx

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from shared.config.settings import get_settings  # noqa: E402

GATEWAY = "http://127.0.0.1:8000"
EVIDENCE = Path(__file__).resolve().parent / "evidence"
CONSENT = "2026-10-04"
RUN = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")

client = httpx.Client(timeout=120)


def save(test_id, record):
    record["captured_at"] = datetime.now(timezone.utc).isoformat()
    (EVIDENCE / f"{test_id}.json").write_text(json.dumps(record, indent=2), encoding="utf-8")
    print(f"--- {test_id}")
    print(json.dumps(record, indent=2)[:1600])
    print()


def body_of(r):
    try:
        return r.json()
    except ValueError:
        return r.text


def make_account(label):
    email = f"tc-{label}-{RUN}@example.test"
    password = f"Assess-{label}-{RUN}!"
    reg = client.post(f"{GATEWAY}/api/v1/auth/register",
                      json={"email": email, "password": password, "consent_version": CONSENT})
    login = client.post(f"{GATEWAY}/api/v1/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get(f"{GATEWAY}/api/v1/auth/me", headers=headers).json()
    return {"email": email, "register_status": reg.status_code, "login_status": login.status_code,
            "business_id": me["business_id"], "user_id": me["user_id"], "headers": headers}


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


BUSINESS = {
    "business_name": "Assessment Test Bakery",
    "business_type": "bakery",
    "description": "A bakery producing bread and cakes with ovens and refrigerators.",
    "employee_count": 6,
    "equipment": ["Ovens", "Refrigerators"],
    "operations": {"accepts_card_payments": True, "handles_cash": True,
                   "operates_single_location": True},
    "location": {"city": "Colombo", "country": "Sri Lanka"},
}

POLICY_LINES = [
    "SECTION 1 - PROPERTY DAMAGE",
    "Damage to the premises caused by smoke, explosion or burning is covered.",
    "",
    "SECTION 2 - THEFT",
    "Theft of stock or cash following forcible and violent entry is covered.",
    "",
    "SECTION 3 - EXCLUSIONS",
    "Mechanical or electrical breakdown of machinery and refrigeration is excluded.",
]

# --- accounts and a policy for user A ------------------------------------------------------
user_a = make_account("a")
user_b = make_account("b")
upload_a = client.post(f"{GATEWAY}/api/v1/policies", headers=user_a["headers"],
                       files={"file": ("assessment_policy.pdf", make_pdf(POLICY_LINES), "application/pdf")})
policy_a = upload_a.json()["policy_id"]
print("setup:", {"user_a": user_a["business_id"], "user_b": user_b["business_id"],
                 "upload_a_status": upload_a.status_code, "policy_a": policy_a})
print()

# --- TC-13: no token --------------------------------------------------------------------------
checks = {
    "GET /api/v1/auth/me": client.get(f"{GATEWAY}/api/v1/auth/me"),
    "GET /api/v1/policies": client.get(f"{GATEWAY}/api/v1/policies"),
    "GET /api/v1/analyses": client.get(f"{GATEWAY}/api/v1/analyses"),
    "POST /api/v1/analyses": client.post(f"{GATEWAY}/api/v1/analyses",
                                         json={"business": BUSINESS, "policy_ids": [policy_a]}),
    "GET /api/v1/policies (Basic scheme instead of Bearer)":
        client.get(f"{GATEWAY}/api/v1/policies", headers={"Authorization": "Basic dGVzdDp0ZXN0"}),
}
save("TC-13", {name: {"status": r.status_code, "body": body_of(r),
                      "www_authenticate": r.headers.get("www-authenticate")}
               for name, r in checks.items()})

# --- TC-06: user B tries to use user A's policy ----------------------------------------------
b_list = client.get(f"{GATEWAY}/api/v1/policies", headers=user_b["headers"])
b_analysis = client.post(f"{GATEWAY}/api/v1/analyses", headers=user_b["headers"],
                         json={"business": BUSINESS, "policy_ids": [policy_a]})
b_scenario = client.post(f"{GATEWAY}/api/v1/scenario-analyses", headers=user_b["headers"],
                         json={"scenario": "Our bakery oven caught fire last week.", "policy_ids": [policy_a]})
b_smuggle = client.post(f"{GATEWAY}/api/v1/analyses", headers=user_b["headers"],
                        json={"business": BUSINESS, "policy_ids": [policy_a],
                              "business_id": user_a["business_id"]})
save("TC-06", {
    "policy_a": policy_a, "business_a": user_a["business_id"], "business_b": user_b["business_id"],
    "b_lists_own_policies": {"status": b_list.status_code,
                             "contains_policy_a": policy_a in json.dumps(body_of(b_list))},
    "b_starts_analysis_with_a_policy": {"status": b_analysis.status_code, "body": body_of(b_analysis)},
    "b_starts_scenario_with_a_policy": {"status": b_scenario.status_code, "body": body_of(b_scenario)},
    "b_sends_a_business_id_in_body": {"status": b_smuggle.status_code, "body": body_of(b_smuggle)},
})

# --- TC-08: full analysis for user A, check every citation is grounded ----------------------
start = client.post(f"{GATEWAY}/api/v1/analyses", headers=user_a["headers"],
                    json={"business": BUSINESS, "policy_ids": [policy_a]})
request_id_a = start.json().get("request_id")
state, deadline = "running", time.time() + 1500  # LLM-backed runs take several minutes
while state == "running" and time.time() < deadline:
    time.sleep(5)
    progress = client.get(f"{GATEWAY}/api/v1/analyses/{request_id_a}/status", headers=user_a["headers"]).json()
    state = progress.get("state")
result = client.get(f"{GATEWAY}/api/v1/analyses/{request_id_a}", headers=user_a["headers"])
analysis = body_of(result)

stored = ROOT / get_settings().processed_dir / user_a["business_id"] / f"{policy_a}.json"
real_chunks = {c["chunk_id"]: c["text"] for c in json.loads(stored.read_text(encoding="utf-8"))}

coverage_ids, coverage_text_mismatch, report_ids = [], [], []
for assessment in (analysis.get("coverage") or {}).get("assessments", []):
    for ev in assessment.get("evidence", []):
        coverage_ids.append(ev["chunk_id"])
        if real_chunks.get(ev["chunk_id"]) != ev["text"]:
            coverage_text_mismatch.append(ev["chunk_id"])
for finding in ((analysis.get("report") or {}).get("findings") or []):
    report_ids.extend(c["chunk_id"] for c in finding.get("evidence", []))

all_cited = set(coverage_ids) | set(report_ids)
save("TC-08", {
    "request_id": request_id_a, "final_state": state, "result_status": result.status_code,
    "real_chunk_ids_for_policy": sorted(real_chunks),
    "coverage_cited_ids": sorted(set(coverage_ids)), "report_cited_ids": sorted(set(report_ids)),
    "ungrounded_ids": sorted(all_cited - set(real_chunks)),
    "coverage_text_mismatch": coverage_text_mismatch,
    "assessments": [{"risk_id": a["risk_id"], "status": a["status"], "method": a.get("method"),
                     "evidence_ids": [e["chunk_id"] for e in a.get("evidence", [])]}
                    for a in (analysis.get("coverage") or {}).get("assessments", [])],
    "warnings": analysis.get("warnings") if isinstance(analysis, dict) else None,
})

# --- TC-18: user B tries to read user A's saved analysis ------------------------------------
b_get = client.get(f"{GATEWAY}/api/v1/analyses/{request_id_a}", headers=user_b["headers"])
b_status = client.get(f"{GATEWAY}/api/v1/analyses/{request_id_a}/status", headers=user_b["headers"])
b_question = client.post(f"{GATEWAY}/api/v1/analyses/{request_id_a}/questions", headers=user_b["headers"],
                         json={"question": "Which risks are not covered by this policy?"})
b_history = client.get(f"{GATEWAY}/api/v1/analyses", headers=user_b["headers"])
save("TC-18", {
    "analysis_owner": "user A", "request_id": request_id_a,
    "b_get_result": {"status": b_get.status_code, "body": body_of(b_get)},
    "b_get_status": {"status": b_status.status_code, "body": body_of(b_status)},
    "b_asks_question": {"status": b_question.status_code, "body": body_of(b_question)},
    "b_history_contains_a_analysis": request_id_a in json.dumps(body_of(b_history)),
})

# --- TC-23: transport ---------------------------------------------------------------------------
settings = get_settings()
agent_urls = {name: getattr(settings, name) for name in
              ("risk_agent_url", "policy_agent_url", "coverage_agent_url", "explanation_agent_url")}
try:
    httpx.get("https://127.0.0.1:8000/health", verify=False, timeout=5)
    https_result = "HTTPS handshake succeeded"
except httpx.HTTPError as exc:
    https_result = f"HTTPS not available ({type(exc).__name__})"
listening = subprocess.run("netstat -ano", shell=True, capture_output=True, text=True).stdout
bindings = sorted({line.split()[1] for line in listening.splitlines()
                   if "LISTENING" in line and any(f":{p} " in line + " " for p in range(8000, 8005))})
save("TC-23", {
    "client_to_gateway": "http://127.0.0.1:8000", "https_on_gateway": https_result,
    "gateway_to_agent_urls": agent_urls, "listening_addresses": bindings,
})

print("Gateway tests finished.")
