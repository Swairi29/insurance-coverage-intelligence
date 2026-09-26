"""End-to-end smoke test against the running services (gateway on port 8000).

Start everything first, e.g. with no LLM:
    .\\scripts\\start_agents.ps1 -NoLlm        (PowerShell)
    bash scripts/start_agents.sh --no-llm       (Git Bash)

Then:
    python scripts/smoke_test_gateway.py
    python scripts/smoke_test_gateway.py --pdf path/to/policy.pdf

It registers (or logs in) a test user, uploads one policy PDF, runs one analysis
through Agents 1 -> 2 -> 3 -> 4 and prints a short summary. Without --pdf it
builds a small synthetic bakery policy PDF, so no real policy is needed.
Nothing here calls an LLM itself; whether the agents do depends on how they
were started. Exit code 0 = the whole chain worked.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import httpx

EMAIL = "smoke-test@sunrise.test"
PASSWORD = "smoke-test-password"

BUSINESS = {
    "business_name": "Sunrise Bakery",
    "business_type": "bakery",
    "description": "A bakery producing bread, cakes, and pastries.",
    "employee_count": 8,
    "equipment": ["Ovens", "Refrigerators"],
    "operations": {
        "sales_channels": [],
        "accepts_card_payments": True,
        "handles_cash": True,
        "stores_customer_data": False,
        "operates_single_location": True,
    },
    "location": {"city": "Colombo", "country": "Sri Lanka"},
}

# Synthetic wording written for this test; not taken from any real policy.
POLICY_SECTIONS = [
    ("Section 1 - Fire and Allied Perils",
     "We will pay for physical loss or damage to the buildings, stock and contents at the premises "
     "caused by fire, lightning or explosion. Damage caused by smoke from a sudden fire is included."),
    ("Section 2 - Burglary",
     "Theft of stock, contents and cash is covered only following forcible and violent entry into "
     "or exit from the premises. Cash in transit is not included under this section."),
    ("Section 3 - Machinery Breakdown",
     "Sudden and unforeseen mechanical or electrical breakdown of ovens, refrigerators and other "
     "machinery is excluded from this policy."),
    ("Section 4 - Public Liability",
     "We will indemnify the insured against legal liability for accidental bodily injury to members "
     "of the public occurring at the premises, up to the limit shown in the schedule."),
]


def build_policy_pdf() -> bytes:
    import pymupdf  # PyMuPDF, already required by Agent 2

    doc = pymupdf.open()
    for heading, body in POLICY_SECTIONS:
        page = doc.new_page()
        page.insert_textbox(pymupdf.Rect(50, 50, 545, 800), f"{heading}\n\n{body}", fontsize=11)
    return doc.tobytes()


def fail(message: str, response: httpx.Response | None = None) -> None:
    detail = f" (HTTP {response.status_code}: {response.text[:300]})" if response is not None else ""
    print(f"FAILED: {message}{detail}")
    sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--gateway", default="http://127.0.0.1:8000")
    parser.add_argument("--pdf", type=Path, help="policy PDF to upload (default: synthetic)")
    args = parser.parse_args()

    # Agent 4 on a local CPU model can take minutes, so allow a long read timeout.
    http = httpx.Client(base_url=args.gateway, timeout=httpx.Timeout(30, read=900))

    try:
        agents = http.get("/health/agents").json()
    except httpx.HTTPError:
        fail(f"the gateway is not reachable at {args.gateway}; start the services first.")
    print("Agents:", agents)
    if any(state != "up" for state in agents.get("agents", agents).values()):
        fail("not every agent is up; check logs/.")

    http.post("/api/v1/auth/register", json={"email": EMAIL, "password": PASSWORD})  # 409 if it exists
    login = http.post("/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if login.status_code != 200:
        fail("login failed - is JWT_SECRET_KEY set in .env?", login)
    http.headers["Authorization"] = f"Bearer {login.json()['access_token']}"

    pdf = args.pdf.read_bytes() if args.pdf else build_policy_pdf()
    name = args.pdf.name if args.pdf else "synthetic_bakery_policy.pdf"
    upload = http.post("/api/v1/policies", files={"file": (name, pdf, "application/pdf")})
    if upload.status_code != 200:
        fail("policy upload failed", upload)
    policy = upload.json()
    print(f"Uploaded {policy['policy_id']}: status={policy['status']}, "
          f"{policy['page_count']} pages, {policy['chunk_count']} chunks")

    run = http.post("/api/v1/analyses", json={"business": BUSINESS, "policy_ids": [policy["policy_id"]]})
    if run.status_code != 200:
        fail("analysis failed", run)
    body = run.json()

    print(f"\nAnalysis {body['request_id']}: {body['status']}  stage times (ms): {body['stage_ms']}")
    for warning in body["warnings"]:
        print("  warning:", warning)
    print(f"Risks identified (Agent 1): {len(body['risk_profile']['risks'])}")
    for assessment in body["coverage"]["assessments"]:
        gap = "  <- potential gap" if assessment["potential_gap"] else ""
        print(f"  {assessment['risk_id']:<22} {assessment['status']}{gap}")
    if body["report"]:
        summary = body["report"]["summary"]
        print(f"Report (Agent 4): {summary['total_findings']} findings, {summary['potential_gaps']} potential gaps")

    stored = http.get(f"/api/v1/analyses/{body['request_id']}")
    if stored.status_code != 200:
        fail("the stored analysis could not be read back", stored)
    print("\nOK - the full chain worked and the result was stored.")


if __name__ == "__main__":
    main()
