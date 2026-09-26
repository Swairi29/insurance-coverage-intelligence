"""Generate the frontend's mock-API fixtures (frontend/src/mocks/fixtures/).

The fixtures come from a real run of the gateway and all four agents, in-process and in
rule/template mode, the same way tests/integration/test_orchestration_real_agents.py runs them:
no servers and no network. Re-run this after a backend contract change.

    python scripts/make_frontend_fixtures.py             # rules and templates only, no LLM
    python scripts/make_frontend_fixtures.py --use-llm   # the LLM settings from .env

`--use-llm` keeps the LLM settings from .env (Gemini for Agent 1, Ollama or Gemini for
Agents 3 and 4), so the fixtures contain real LLM wording. Run it on a machine that can run
the LLM; it calls the LLM provider and can take several minutes per analysis.

Output:
- user.json, policies.json, analyses.json   (GET /auth/me, /policies, /analyses)
- analysis-bakery.json, analysis-restaurant.json, analysis-retail_shop.json   (complete runs)
- analysis-partial.json                     (Agent 4 down -> status "partial")
- analysis-all-statuses.json                (hand-edited: real Agent 3 only returns
                                             unclear/not_found, so this one shows all five)
All names and emails are made up. Needs PyMuPDF.
"""

from __future__ import annotations

import copy
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))
OUT = REPO / "frontend" / "src" / "mocks" / "fixtures"
TMP = Path(tempfile.mkdtemp())
USE_LLM = "--use-llm" in sys.argv[1:]

from cryptography.fernet import Fernet  # noqa: E402

# Real settings are read from .env; these override them so nothing is written outside the
# temp folder and, without --use-llm, nothing calls an LLM.
if not USE_LLM:
    os.environ.update({
        "EXPLANATION_USE_LLM": "false",
        "GEMINI_API_KEY": "",
        "LLM_PROVIDER": "gemini",
    })
os.environ.update({
    "INTERNAL_API_KEY": "real-agents-key",  # the key RealAgents' pipeline sends
    "JWT_SECRET_KEY": "j" * 40,
    "DOCUMENT_ENCRYPTION_KEY": Fernet.generate_key().decode(),
    "UPLOAD_DIR": str(TMP / "uploads"),
    "PROCESSED_DIR": str(TMP / "processed"),
    "OCR_ENABLED": "false",
})

import httpx  # noqa: E402
import pymupdf  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from services.orchestration.api import app as gateway_app  # noqa: E402
from services.orchestration.api import get_pipeline  # noqa: E402
from services.orchestration.database import Database, get_database  # noqa: E402
from shared.config.settings import get_settings  # noqa: E402
from shared.schemas.responses import AnalysisResponse  # noqa: E402
from tests.integration.test_orchestration_real_agents import RealAgents  # noqa: E402

# Synthetic policy wording.
BUSINESS_PACK = [
    "Section 1 - Fire. We will pay for loss or damage to buildings, stock and contents caused by "
    "fire, lightning or explosion at the premises.",
    "Section 2 - Burglary. Theft of stock and cash is covered only following forcible and violent "
    "entry into the premises.",
    "Section 3 - Machinery. Breakdown of ovens, refrigerators and other machinery is excluded.",
    "Section 4 - Public Liability. We will indemnify you against legal liability for accidental "
    "bodily injury to customers or members of the public occurring at the premises.",
]
# Contains an instruction-like sentence, so Agent 2 flags it.
FLOOD_EXTENSION = [
    (REPO / "data/sample_policies/adversarial/injected_exclusion.txt").read_text(encoding="utf-8"),
]

BUSINESSES = {
    "bakery": {
        "business_name": "Sunrise Bakery",
        "business_type": "bakery",
        "description": "A bakery producing bread, cakes and pastries, with a small cafe area.",
        "employee_count": 8,
        "equipment": ["Ovens", "Refrigerators", "Mixers"],
        "operations": {
            "sales_channels": ["in_store", "delivery"],
            "accepts_card_payments": True,
            "handles_cash": True,
            "stores_customer_data": False,
            "operates_single_location": True,
        },
        "location": {"city": "Colombo", "country": "Sri Lanka", "flood_prone_area": True},
    },
    "restaurant": {
        "business_name": "Lagoon Kitchen",
        "business_type": "restaurant",
        "description": "A seafood restaurant with 40 seats, deep fryers and online orders.",
        "employee_count": 22,
        "equipment": ["Deep fryers", "Gas stoves", "Walk-in freezer", "POS system"],
        "operations": {
            "sales_channels": ["in_store", "online", "delivery"],
            "accepts_card_payments": True,
            "handles_cash": True,
            "stores_customer_data": True,
            "operates_single_location": True,
        },
        "location": {"city": "Negombo", "country": "Sri Lanka", "flood_prone_area": None},
    },
    "retail_shop": {
        "business_name": "Hilltop Hardware",
        "business_type": "retail_shop",
        "description": "A hardware and household goods shop with an online store.",
        "employee_count": 5,
        "equipment": ["POS system", "CCTV"],
        "operations": {
            "sales_channels": ["in_store", "online"],
            "accepts_card_payments": True,
            "handles_cash": True,
            "stores_customer_data": True,
            "operates_single_location": True,
        },
        "location": {"city": "Kandy", "country": "Sri Lanka"},
    },
}


def _pdf(pages: list[str]) -> bytes:
    doc = pymupdf.open()
    for text in pages:
        doc.new_page().insert_textbox(pymupdf.Rect(50, 50, 545, 800), text, fontsize=11)
    return doc.tobytes()


class Agent4Down(RealAgents):
    def __call__(self, request: httpx.Request) -> httpx.Response:
        if request.url.host == "explanation.test":
            raise httpx.ConnectError("Agent 4 is down", request=request)
        return super().__call__(request)


def _write(name: str, data) -> None:
    text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    (OUT / name).write_text(text, encoding="utf-8", newline="\n")


def _all_statuses(complete: dict, policy_id: str) -> dict:
    """The bakery run with three findings edited to covered / conditional / excluded,
    and one marked as LLM-written, so the UI can be tested with every status."""
    b = copy.deepcopy(complete)
    b["request_id"] = "5a7e5a7e5a7e4a7e9a7e5a7e5a7e5a7e"
    b["created_at"] = "2026-09-25T08:30:00Z"
    for part in (b["risk_profile"], b["coverage"], b["report"]):
        part["request_id"] = b["request_id"]

    def clause(page: int, section: str, text: str, score: float) -> dict:
        return {"chunk_id": f"{policy_id}-p{page}-c0", "policy_id": policy_id, "section": section,
                "page": page, "text": text, "score": score}

    edits = {
        "FIRE_COOKING": dict(
            status="covered", gap=False, priority="low", title="Covered: Fire from cooking equipment",
            explanation="Section 1 of your business pack covers loss or damage to buildings, stock and "
                        "contents caused by fire at the premises, which includes fires that start in the "
                        "kitchen.",
            recommendation="Keep the fire section in place at renewal and check that the sum insured "
                           "matches the value of your ovens and stock.",
            evidence=[clause(1, "Section 1 - Fire", BUSINESS_PACK[0], 0.61)]),
        "PROP_THEFT": dict(
            status="conditional", gap=True, priority="medium",
            title="Covered with conditions: Theft of stock or cash",
            explanation="Theft is covered only after forcible and violent entry into the premises. Theft "
                        "without a break-in, for example by a customer during opening hours, would not be "
                        "covered.",
            recommendation="Ask your broker whether theft without forced entry can be added, and keep "
                           "records of how cash is stored overnight.",
            evidence=[clause(2, "Section 2 - Burglary", BUSINESS_PACK[1], 0.58)]),
        "EQP_BREAKDOWN": dict(
            status="excluded", gap=True, priority="high", title="Excluded: Equipment breakdown",
            explanation="Section 3 of your business pack says that breakdown of ovens, refrigerators and "
                        "other machinery is excluded. A breakdown would not be paid for under this policy.",
            recommendation="Ask your broker about separate machinery breakdown cover for your ovens, "
                           "refrigerators and mixers.",
            evidence=[clause(3, "Section 3 - Machinery", BUSINESS_PACK[2], 0.72)]),
    }
    for assessment in b["coverage"]["assessments"]:
        e = edits.get(assessment["risk_id"])
        if e:
            assessment.update(status=e["status"], potential_gap=e["gap"], evidence=e["evidence"],
                              confidence=0.8, reason=e["explanation"], matched_signals=["hand-edited"])
    for finding in b["report"]["findings"]:
        e = edits.get(finding["risk_id"])
        if e:
            finding.update(
                status=e["status"], potential_gap=e["gap"], priority=e["priority"], title=e["title"],
                explanation=e["explanation"], recommendation=e["recommendation"], coverage_confidence=0.8,
                verification_required=e["status"] != "covered",
                generated_by="template",  # hand-written here, so never labelled AI-written
                evidence=[{"chunk_id": c["chunk_id"], "policy_id": c["policy_id"], "section": c["section"],
                           "page": c["page"], "excerpt": c["text"][:400], "flagged": False}
                          for c in e["evidence"]])
        if not USE_LLM and finding["risk_id"] == "LIA_FOOD_SAFETY":
            finding["generated_by"] = "llm"  # so the "AI-written" label can be tested without an LLM

    order = {"high": 0, "medium": 1, "low": 2}
    findings = sorted(b["report"]["findings"], key=lambda f: order[f["priority"]])
    b["report"]["findings"] = findings
    counts = {s: sum(f["status"] == s for f in findings)
              for s in ["covered", "excluded", "conditional", "unclear", "not_found"]}
    gaps = sum(f["potential_gap"] for f in findings)
    b["report"]["summary"].update(
        total_findings=len(findings), potential_gaps=gaps, counts_by_status=counts,
        headline=f"{len(findings)} risks checked, {gaps} potential gaps: {counts['not_found']} had no "
                 f"policy wording found, {counts['excluded']} excluded and "
                 f"{counts['unclear'] + counts['conditional']} need checking.")
    if not USE_LLM:
        b["report"]["metadata"].update(llm_used=True, llm_provider="ollama", llm_model="qwen3:4b")
    llm = sum(f["generated_by"] == "llm" for f in findings)
    b["report"]["metadata"].update(llm_findings=llm, template_findings=len(findings) - llm)
    return b


def main() -> None:
    get_settings.cache_clear()
    db = Database(TMP / "app.db")
    db.init_schema()
    gateway_app.dependency_overrides[get_database] = lambda: db
    gateway_app.dependency_overrides[get_pipeline] = RealAgents().pipeline
    gateway = TestClient(gateway_app)

    creds = {"email": "demo@insureintel.test", "password": "demo-password-1"}
    user = gateway.post("/api/v1/auth/register", json=creds).json()
    token = gateway.post("/api/v1/auth/login", json=creds).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    policies = []
    for name, pages in [("sunrise-business-pack.pdf", BUSINESS_PACK), ("flood-extension.pdf", FLOOD_EXTENSION)]:
        r = gateway.post("/api/v1/policies", headers=headers,
                         files={"file": (name, _pdf(pages), "application/pdf")})
        assert r.status_code == 200, r.text
        policies.append({k: v for k, v in r.json().items() if k != "warnings"})
    policy_ids = [p["policy_id"] for p in policies]

    analyses = {}
    for kind, business in BUSINESSES.items():
        r = gateway.post("/api/v1/analyses", headers=headers,
                         json={"business": business, "policy_ids": policy_ids})
        assert r.status_code == 200 and r.json()["status"] == "complete", r.text
        analyses[kind] = r.json()

    gateway_app.dependency_overrides[get_pipeline] = Agent4Down().pipeline
    r = gateway.post("/api/v1/analyses", headers=headers,
                     json={"business": BUSINESSES["bakery"], "policy_ids": policy_ids})
    assert r.status_code == 200 and r.json()["status"] == "partial", r.text
    partial = r.json()
    summaries = gateway.get("/api/v1/analyses", headers=headers).json()
    gateway_app.dependency_overrides.clear()
    get_settings.cache_clear()

    all_statuses = _all_statuses(analyses["bakery"], policy_ids[0])
    summaries.append({"request_id": all_statuses["request_id"], "status": "complete",
                      "created_at": all_statuses["created_at"],
                      "total_findings": all_statuses["report"]["summary"]["total_findings"],
                      "potential_gaps": all_statuses["report"]["summary"]["potential_gaps"]})

    outputs = {f"analysis-{kind}.json": a for kind, a in analyses.items()}
    outputs["analysis-partial.json"] = partial
    outputs["analysis-all-statuses.json"] = all_statuses
    for data in outputs.values():
        AnalysisResponse.model_validate(data)  # the hand-edited one must still match the contract

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    _write("user.json", user)
    _write("policies.json", policies)
    _write("analyses.json", summaries)
    for name, data in outputs.items():
        _write(name, data)
    shutil.rmtree(TMP, ignore_errors=True)
    report = analyses["bakery"]["report"]["metadata"]
    print(f"Wrote {len(outputs) + 3} fixtures to {OUT.relative_to(REPO)} "
          f"(report: {report['llm_findings']} LLM / {report['template_findings']} template findings, "
          f"model {report['llm_model'] or 'none'})")


if __name__ == "__main__":
    main()
