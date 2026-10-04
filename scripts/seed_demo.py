"""Create a demo account with policies and a finished analysis, for local demos only.

Start the backend first, then:
    python scripts/seed_demo.py                         # gateway on http://127.0.0.1:8000
    python scripts/seed_demo.py --password my-secret    # choose the demo password

It goes through the running gateway exactly like a user: registers the demo account (or logs in
if it exists), uploads two synthetic policy PDFs unless they are already there, and runs one
analysis for "Sunrise Bakery". Running it again adds another analysis and uploads nothing new.

Whether the report is AI-written depends on how the agents were started: with
`start_agents.ps1 -NoLlm` it uses template wording (seconds); without it, Agent 4 uses the LLM in
.env (about 5-6 minutes with qwen3:4b).

The default login is the same as the frontend's mock mode. It is a known password, so use this
only on your own machine, never on a server other people can reach.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts.demo_data import BUSINESSES, demo_policy_files  # noqa: E402
from scripts.gateway_client import AnalysisError, run_analysis  # noqa: E402

DEFAULT_GATEWAY = "http://127.0.0.1:8000"
DEFAULT_EMAIL = "demo@insureintel.test"
DEFAULT_PASSWORD = "demo-password-1"
# The gateway waits up to 600 s for Agent 4, so allow a little more than that.
ANALYSIS_TIMEOUT_SECONDS = 700


class SeedError(Exception):
    """A problem the user can fix; the message says how."""


@dataclass
class SeedResult:
    email: str
    created_account: bool
    uploaded: list[str]
    reused: list[str]
    request_id: str
    status: str
    headline: str
    llm_findings: int
    total_findings: int


def _detail(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text[:200]
    return body.get("message") or body.get("detail") or str(body)[:200]


def seed(client: httpx.Client, email: str = DEFAULT_EMAIL, password: str = DEFAULT_PASSWORD,
         business: dict | None = None) -> SeedResult:
    """Seed the demo account through `client` (an httpx client whose base URL is the gateway)."""
    business = business or BUSINESSES["bakery"]

    health = client.get("/health/agents", timeout=15)
    if health.status_code != 200:
        raise SeedError("The gateway is not answering. Start the backend first (scripts/start_agents).")
    down = [name for name, state in health.json().get("agents", {}).items() if state != "up"]
    if down:
        raise SeedError(f"These agents are not running: {', '.join(down)}. Start all services first.")

    registered = client.post("/api/v1/auth/register", json={"email": email, "password": password})
    if registered.status_code not in (201, 409):
        raise SeedError(f"Could not create the demo account: {_detail(registered)}")

    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    if login.status_code == 401:
        raise SeedError(f"{email} already exists with a different password. "
                        "Use --password with the right one, or --email for a new account.")
    if login.status_code != 200:
        raise SeedError(f"Could not log in: {_detail(login)}")
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    existing = {p["filename"]: p for p in client.get("/api/v1/policies", headers=headers).json()}
    policy_ids, uploaded, reused = [], [], []
    for filename, content in demo_policy_files():
        if filename in existing and existing[filename]["status"] == "ready":
            policy_ids.append(existing[filename]["policy_id"])
            reused.append(filename)
            continue
        response = client.post("/api/v1/policies", headers=headers, timeout=120,
                               files={"file": (filename, content, "application/pdf")})
        if response.status_code != 200:
            raise SeedError(f"Could not upload {filename}: {_detail(response)}")
        policy_ids.append(response.json()["policy_id"])
        uploaded.append(filename)

    try:
        analysis = run_analysis(client, headers, {"business": business, "policy_ids": policy_ids},
                                timeout_seconds=ANALYSIS_TIMEOUT_SECONDS)
    except AnalysisError as exc:
        detail = exc.progress.get("error") if exc.progress else _detail(exc.response) if exc.response else ""
        raise SeedError(f"The analysis failed: {exc} {detail}") from None
    report = analysis.get("report")
    meta = report["metadata"] if report else {"llm_findings": 0}
    total = report["summary"]["total_findings"] if report else len(analysis["coverage"]["assessments"])
    return SeedResult(
        email=email,
        created_account=registered.status_code == 201,
        uploaded=uploaded,
        reused=reused,
        request_id=analysis["request_id"],
        status=analysis["status"],
        headline=report["summary"]["headline"] if report else "(no written report)",
        llm_findings=meta["llm_findings"],
        total_findings=total,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--gateway", default=DEFAULT_GATEWAY, help=f"default {DEFAULT_GATEWAY}")
    parser.add_argument("--email", default=DEFAULT_EMAIL, help=f"default {DEFAULT_EMAIL}")
    parser.add_argument("--password", default=DEFAULT_PASSWORD,
                        help="default: the frontend's mock-mode demo password")
    args = parser.parse_args()

    print(f"Seeding the demo account through {args.gateway} ...")
    print("(If the agents use an LLM, the analysis takes a few minutes.)")
    try:
        with httpx.Client(base_url=args.gateway, timeout=30) as client:
            result = seed(client, args.email, args.password)
    except SeedError as err:
        print(f"Error: {err}")
        return 1
    except httpx.HTTPError as err:
        print(f"Error: could not reach the gateway at {args.gateway} ({type(err).__name__}).")
        return 1

    print()
    print("Account:   " + ("created" if result.created_account else "already existed, logged in"))
    if result.uploaded:
        print("Uploaded:  " + ", ".join(result.uploaded))
    if result.reused:
        print("Reused:    " + ", ".join(result.reused))
    print(f"Analysis:  {result.status}, {result.headline}")
    print(f"AI text:   {result.llm_findings} of {result.total_findings} findings "
          + ("(template only: the agents run without an LLM)" if result.llm_findings == 0 else ""))
    print()
    print("Open http://127.0.0.1:5173 and log in with")
    print(f"  email:    {result.email}")
    print(f"  password: {args.password}")
    print(f"The analysis is in History (/app/analyses/{result.request_id}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
