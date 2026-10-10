"""Round 2: tests for features added after the first assessment (commit 5ecfa87).

New attack surface: saved business profiles (CRUD by profile_id) and saved
scenario analyses. Uses ordinary test accounts created through the normal
register endpoint. Raw responses are saved to security-assessment/evidence/TC-XX.json.

    .venv\\Scripts\\python.exe security-assessment\\run_gateway_new_tests.py            # TC-24..28, 30, 31
    .venv\\Scripts\\python.exe security-assessment\\run_gateway_new_tests.py --scenario # TC-29 (LLM-backed, slow)
"""

import json
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

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
    print(json.dumps(record, indent=2)[:1500])
    print()


def body_of(r):
    if r.status_code == 204 or not r.content:
        return None
    try:
        return r.json()
    except ValueError:
        return r.text


def make_account(label):
    email = f"tc2-{label}-{RUN}@example.test"
    password = f"Assess2-{label}-{RUN}!"
    client.post(f"{GATEWAY}/api/v1/auth/register",
                json={"email": email, "password": password, "consent_version": CONSENT})
    token = client.post(f"{GATEWAY}/api/v1/auth/login",
                        json={"email": email, "password": password}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get(f"{GATEWAY}/api/v1/auth/me", headers=headers).json()
    return {"email": email, "user_id": me["user_id"], "business_id": me["business_id"], "headers": headers}


def profile(name, description="A bakery producing bread and cakes with ovens and refrigerators."):
    return {
        "business_name": name, "business_type": "bakery", "description": description,
        "employee_count": 6, "equipment": ["Ovens", "Refrigerators"],
        "operations": {"accepts_card_payments": True, "handles_cash": True, "operates_single_location": True},
        "location": {"city": "Colombo", "country": "Sri Lanka"},
    }


def run_profile_tests():
    user_a, user_b = make_account("a"), make_account("b")
    secret_name = f"Confidential Bakery {RUN}"
    created = client.post(f"{GATEWAY}/api/v1/business-profiles", headers=user_a["headers"],
                          json=profile(secret_name))
    profile_a = created.json()["profile_id"]
    url_a = f"{GATEWAY}/api/v1/business-profiles/{profile_a}"
    print("setup:", {"user_a": user_a["user_id"], "user_b": user_b["user_id"],
                     "create_status": created.status_code, "profile_a": profile_a})
    print()

    # TC-24: no token on every business-profile endpoint
    checks = {
        "GET list": client.get(f"{GATEWAY}/api/v1/business-profiles"),
        "POST create": client.post(f"{GATEWAY}/api/v1/business-profiles", json=profile("x")),
        "GET one": client.get(url_a),
        "PUT update": client.put(url_a, json=profile("x")),
        "DELETE": client.delete(url_a),
        "GET saved scenario list": client.get(f"{GATEWAY}/api/v1/scenario-analyses"),
    }
    save("TC-24", {name: {"status": r.status_code, "body": body_of(r)} for name, r in checks.items()})

    # TC-25: user B reads user A's profile
    b_get = client.get(url_a, headers=user_b["headers"])
    b_list = client.get(f"{GATEWAY}/api/v1/business-profiles", headers=user_b["headers"])
    save("TC-25", {
        "profile_owner": "user A", "profile_id": profile_a,
        "b_get": {"status": b_get.status_code, "body": body_of(b_get)},
        "b_list_contains_a_profile": profile_a in json.dumps(body_of(b_list)),
        "b_response_contains_a_business_name": secret_name in b_get.text + b_list.text,
    })

    # TC-26: user B overwrites user A's profile
    b_put = client.put(url_a, headers=user_b["headers"], json=profile("Overwritten by B"))
    a_after = client.get(url_a, headers=user_a["headers"]).json()
    save("TC-26", {
        "b_put": {"status": b_put.status_code, "body": body_of(b_put)},
        "a_profile_name_after": a_after["profile"]["business_name"],
        "a_profile_unchanged": a_after["profile"]["business_name"] == secret_name,
    })

    # TC-27: user B deletes user A's profile
    b_del = client.delete(url_a, headers=user_b["headers"])
    a_still = client.get(url_a, headers=user_a["headers"])
    save("TC-27", {
        "b_delete": {"status": b_del.status_code, "body": body_of(b_del)},
        "a_profile_still_exists": a_still.status_code == 200,
    })

    # TC-28: stored profile is encrypted at rest (read-only look at the database)
    db_path = ROOT / get_settings().database_path
    with sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True) as conn:
        blob = conn.execute("SELECT profile FROM business_profiles WHERE profile_id = ?",
                            (profile_a,)).fetchone()[0]
    raw = bytes(blob)
    save("TC-28", {
        "profile_id": profile_a, "stored_bytes": len(raw),
        "first_16_bytes": raw[:16].decode("ascii", "replace"),
        "looks_like_fernet_token": raw.startswith(b"gAAAAA"),
        "business_name_visible_in_raw_bytes": secret_name.encode() in raw,
        "description_visible_in_raw_bytes": b"ovens and refrigerators" in raw,
    })

    # TC-30: injection / malformed input on profile endpoints
    injected_id = "' OR '1'='1"
    r_inject = client.get(f"{GATEWAY}/api/v1/business-profiles/{quote(injected_id)}", headers=user_b["headers"])
    extra = profile("Extra field test")
    extra["user_id"] = user_a["user_id"]
    r_extra = client.post(f"{GATEWAY}/api/v1/business-profiles", headers=user_b["headers"], json=extra)
    long_name = client.post(f"{GATEWAY}/api/v1/business-profiles", headers=user_b["headers"],
                            json=profile("A" * 500))
    save("TC-30", {
        "sql_style_profile_id": {"status": r_inject.status_code, "body": body_of(r_inject)},
        "body_with_user_id_field": {"status": r_extra.status_code, "body": body_of(r_extra)},
        "business_name_500_chars": {"status": long_name.status_code, "body": body_of(long_name)},
        # An echoed value appears as an "input" key (FastAPI's default 422 format), not just the word.
        "echoes_input_values": any('"input":' in json.dumps(body_of(r) or {}) for r in (r_extra, long_name)),
        "long_name_value_in_response": ("A" * 500) in long_name.text,
    })

    # TC-31: per-user profile limit (20)
    user_c = make_account("c")
    statuses = [client.post(f"{GATEWAY}/api/v1/business-profiles", headers=user_c["headers"],
                            json=profile(f"Limit test {i}")).status_code for i in range(1, 22)]
    over = client.post(f"{GATEWAY}/api/v1/business-profiles", headers=user_c["headers"], json=profile("over"))
    save("TC-31", {
        "creates_1_to_21_statuses": statuses,
        "first_rejected_at": next((i + 1 for i, s in enumerate(statuses) if s != 201), None),
        "after_limit": {"status": over.status_code, "body": body_of(over)},
    })


def run_scenario_test():
    user_a, user_b = make_account("sa"), make_account("sb")
    doc = fitz.open()
    page = doc.new_page()
    for i, line in enumerate(["SECTION 1 - PROPERTY DAMAGE",
                              "Damage to the premises caused by smoke, explosion or burning is covered."]):
        page.insert_text((72, 72 + 16 * i), line, fontsize=11)
    pdf = doc.tobytes()
    doc.close()
    up = client.post(f"{GATEWAY}/api/v1/policies", headers=user_a["headers"],
                     files={"file": ("scenario_policy.pdf", pdf, "application/pdf")})
    policy_id = up.json()["policy_id"]
    start = client.post(f"{GATEWAY}/api/v1/scenario-analyses", headers=user_a["headers"],
                        json={"scenario": "Our bakery oven caught fire and smoke damaged the shop.",
                              "policy_ids": [policy_id]})
    request_id = start.json().get("request_id")
    state, deadline = "running", time.time() + 1500
    while state == "running" and time.time() < deadline:
        time.sleep(5)
        state = client.get(f"{GATEWAY}/api/v1/scenario-analyses/{request_id}/status",
                           headers=user_a["headers"]).json().get("state")
    a_list = client.get(f"{GATEWAY}/api/v1/scenario-analyses", headers=user_a["headers"])
    b_list = client.get(f"{GATEWAY}/api/v1/scenario-analyses", headers=user_b["headers"])
    b_get = client.get(f"{GATEWAY}/api/v1/scenario-analyses/{request_id}", headers=user_b["headers"])
    b_status = client.get(f"{GATEWAY}/api/v1/scenario-analyses/{request_id}/status", headers=user_b["headers"])
    save("TC-29", {
        "request_id": request_id, "final_state_for_owner": state,
        "a_history_contains_own_scenario": request_id in a_list.text,
        "b_history_contains_a_scenario": request_id in b_list.text,
        "b_get_result": {"status": b_get.status_code, "body": body_of(b_get)},
        "b_get_status": {"status": b_status.status_code, "body": body_of(b_status)},
    })


if __name__ == "__main__":
    if "--scenario" in sys.argv:
        run_scenario_test()
    else:
        run_profile_tests()
    print("Done.")
