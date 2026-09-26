"""Try Agent 4 from the command line and read the report in plain text.

Uses your real `.env` (LLM_PROVIDER, OLLAMA_MODEL, ...). No server needed.

    python scripts/try_explanation_agent.py                       # bakery_mixed, with the LLM
    python scripts/try_explanation_agent.py --no-llm              # instant, template wording only
    python scripts/try_explanation_agent.py injection             # any fixture name ...
    python scripts/try_explanation_agent.py path/to/request.json  # ... or your own request file
    python scripts/try_explanation_agent.py --prompt-version report_v2
    python scripts/try_explanation_agent.py --json                # raw API response
"""

from __future__ import annotations

import argparse
import logging
import sys
import textwrap
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from agents.explanation_agent import rag  # noqa: E402
from agents.explanation_agent.llm import get_client  # noqa: E402
from agents.explanation_agent.service import ExplanationService  # noqa: E402
from shared.schemas.requests import ExplanationRequest  # noqa: E402

FIXTURES = ROOT / "agents" / "explanation_agent" / "tests" / "fixtures"
MARK = {"llm": "AI", "template": "template"}


def _load(name: str) -> ExplanationRequest:
    path = Path(name)
    if not path.is_file():
        path = FIXTURES / (name if name.endswith(".json") else f"{name}.json")
    if not path.is_file():
        available = ", ".join(sorted(p.stem for p in FIXTURES.glob("*.json") if p.stem != "edge_cases"))
        raise SystemExit(f"No request file '{name}'. Fixtures: {available}")
    return ExplanationRequest.model_validate_json(path.read_text(encoding="utf-8"))


def _wrap(label: str, text: str) -> str:
    return textwrap.fill(text, width=100, initial_indent=f"   {label:<16}", subsequent_indent=" " * 19)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("request", nargs="?", default="bakery_mixed", help="fixture name or JSON file")
    parser.add_argument("--no-llm", action="store_true", help="template wording only (no model call)")
    parser.add_argument("--prompt-version", default=rag.PROMPT_VERSION)
    parser.add_argument("--json", action="store_true", help="print the raw response JSON")
    args = parser.parse_args()

    # Show Agent 4's own log lines (batch timings, validator codes) - never any text.
    logging.basicConfig(level=logging.WARNING, format="   log: %(message)s")
    logging.getLogger("agents.explanation_agent").setLevel(logging.INFO)

    rag.PROMPT_VERSION = args.prompt_version
    request = _load(args.request)

    client, provider, model = (None, None, None) if args.no_llm else get_client()
    if not args.no_llm and client is None:
        print("No LLM configured (check LLM_PROVIDER / OLLAMA_MODEL / EXPLANATION_USE_LLM in .env); "
              "using templates only.")
    mode = f"{provider} ({model}), prompt {args.prompt_version}" if client else "templates only"
    print(f"Request: {args.request} - {len(request.assessments)} findings - {mode}")
    if client:
        print("Calling the model; on a CPU this takes about 1-4 minutes per 4 findings...\n")

    started = time.perf_counter()
    report = ExplanationService(client=client, provider=provider, model=model).generate(request)
    seconds = time.perf_counter() - started

    if args.json:
        print(report.model_dump_json(indent=2))
        return 0

    print(f"\n{report.summary.headline}\n")
    for number, finding in enumerate(report.findings, start=1):
        gap = ", potential gap" if finding.potential_gap else ""
        print(f"{number}. {finding.title}")
        print(f"   [{finding.status.value}{gap} | priority {finding.priority.value} | "
              f"wording: {MARK[finding.generated_by.value]}]")
        print(_wrap("Explanation:", finding.explanation))
        print(_wrap("Recommendation:", finding.recommendation))
        for citation in finding.evidence:
            where = f"{citation.section}, " if citation.section else ""
            flag = "  ** FLAGGED: withheld from the AI **" if citation.flagged else ""
            print(f"   {'Evidence:':<16}{citation.policy_id} {where}page {citation.page}{flag}")
        print()

    for warning in report.warnings:
        print(f"WARNING: {warning}")
    meta = report.metadata
    print(f"\nAI wording: {meta.llm_findings}/{len(report.findings)} findings "
          f"(template: {meta.template_findings}) - {seconds:.1f} s")

    # The golden rule, checked on every run.
    expected = {a.risk_id: (a.status, a.potential_gap) for a in request.assessments}
    actual = {f.risk_id: (f.status, f.potential_gap) for f in report.findings}
    print("Statuses unchanged from Agent 3: " + ("YES" if expected == actual else "NO - this is a bug"))
    return 0 if expected == actual else 1


if __name__ == "__main__":
    raise SystemExit(main())
