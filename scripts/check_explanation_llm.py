"""Manual check: can Agent 4 reach the configured LLM and get parsed JSON back?

Uses your real `.env` (LLM_PROVIDER, OLLAMA_MODEL / GEMINI_API_KEY ...).
This calls a real model, so it is NOT part of pytest.

    python scripts/check_explanation_llm.py
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents.explanation_agent.llm import ExplanationLLMError, generate_json, get_client  # noqa: E402

SYSTEM = "You answer with JSON only. No markdown, no other text."
PROMPT = (
    'Return exactly this JSON shape: {"findings": [{"risk_id": "TEST_RISK", '
    '"explanation": "<one short sentence explaining what an insurance excess is>", '
    '"recommendation": "<one short sentence>", "cited_chunk_ids": []}]}'
)


def main() -> int:
    client, provider, model = get_client()
    if client is None:
        print("No LLM client: EXPLANATION_USE_LLM is false or the provider is not configured.")
        return 1

    print(f"Provider: {provider}, model: {model}. Calling the model...")
    started = time.perf_counter()
    try:
        data = generate_json(client, PROMPT, SYSTEM)
    except ExplanationLLMError as exc:
        print(f"Failed: {exc} (cause: {type(exc.__cause__).__name__})")
        return 1

    print(f"OK in {time.perf_counter() - started:.1f}s. Parsed dict:")
    print(data)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
