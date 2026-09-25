# API Specification

## Agent 4 - Explanation & Recommendation (port 8004)

Turns Agent 1's risks and Agent 3's coverage assessments into a plain-English report for the
business owner. Agent 4 **explains** Agent 3's decisions; it never changes a coverage status or
gap flag, and it never invents policy wording, sections or pages.

Run: `uvicorn agents.explanation_agent.main:app --port 8004 --reload`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/generate-report` | `X-API-Key` | Build the report |
| `GET` | `/health` | none | `{"status": "healthy", "agent": "explanation-recommendation"}` |

### Request - `ExplanationRequest` (`shared/schemas/requests.py`)

| Field | Type | Notes |
|---|---|---|
| `request_id` | string, optional | Letters, digits, `-`, `_`; max 64. Generated if missing or `null`. |
| `business_id` | string | Required, max 64. |
| `business_type` | `bakery` \| `restaurant` \| `retail_shop` \| `null` | The business **name** is deliberately not sent. |
| `risks` | `IdentifiedRisk[]` | From Agent 1, max 50, unique `risk_id`. |
| `assessments` | `CoverageAssessment[]` | From Agent 3, max 50, unique `risk_id`. |

Unknown fields are rejected. One finding is produced per **assessment**; `risks` only add the
category and Agent 1's reason. A risk with no assessment produces a warning, not a finding.

```json
{
  "request_id": "run-2026-001",
  "business_id": "B001",
  "business_type": "bakery",
  "risks": [
    {
      "risk_id": "PROP_THEFT",
      "name": "Theft, burglary and vandalism",
      "category": "property",
      "reason": "The shop keeps cash, stock and equipment on the premises overnight.",
      "source": "rule",
      "confidence": 0.7,
      "evidence": [{"field": "assets", "value": "cash register"}]
    },
    {
      "risk_id": "EQP_BREAKDOWN",
      "name": "Equipment breakdown",
      "category": "equipment",
      "reason": "Production depends on ovens and mixers; a breakdown stops baking.",
      "source": "rule",
      "confidence": 0.85,
      "evidence": [{"field": "equipment", "value": "gas oven"}]
    }
  ],
  "assessments": [
    {
      "risk_id": "EQP_BREAKDOWN",
      "risk_name": "Equipment breakdown",
      "status": "not_found",
      "potential_gap": true,
      "reason": "No policy wording about equipment or machinery breakdown was retrieved.",
      "evidence": [],
      "confidence": 0.6,
      "method": "rules",
      "matched_signals": []
    },
    {
      "risk_id": "PROP_THEFT",
      "risk_name": "Theft, burglary and vandalism",
      "status": "conditional",
      "potential_gap": false,
      "reason": "Theft is covered only when it follows forcible and violent entry into the premises.",
      "evidence": [
        {
          "chunk_id": "P001-p7-c2",
          "policy_id": "P001",
          "section": "Section 3 - Burglary",
          "page": 7,
          "text": "The insurer will indemnify the insured for loss of contents by theft only where the theft follows forcible and violent entry into or exit from the premises. ...",
          "score": 0.77
        }
      ],
      "confidence": 0.79,
      "method": "rules",
      "matched_signals": ["theft", "forcible and violent entry"]
    }
  ]
}
```

### Response 200 - `ExplanationResponse` (`shared/schemas/responses.py`)

Findings are ordered by priority (`high` → `low`), then Agent 1 risk confidence, then name.

| Finding field | Comes from | Notes |
|---|---|---|
| `status`, `potential_gap`, `coverage_confidence` | Agent 3, copied | Never changed. |
| `title`, `priority`, `verification_required` | Code | See status table below. |
| `explanation`, `recommendation` | LLM if it passed every check, else template | `generated_by` says which. |
| `evidence[]` | Agent 3's clauses | `excerpt` ≤ 400 chars. `flagged: true` = clause looked like a prompt-injection attempt; its text is replaced by a note and it was not sent to the AI model. |

| `status` | Title prefix | `priority` | `verification_required` |
|---|---|---|---|
| `not_found` | Potential coverage gap: | high | true |
| `excluded` | Excluded: | high | true |
| `unclear` | Needs checking: | medium | true |
| `conditional` | Covered with conditions: | medium | true |
| `covered` | Covered: | low | false |

```json
{
  "schema_version": "1.0",
  "request_id": "run-2026-001",
  "business_id": "B001",
  "generated_at": "2026-09-26T10:15:00Z",
  "summary": {
    "total_findings": 2,
    "potential_gaps": 1,
    "counts_by_status": {"covered": 0, "excluded": 0, "conditional": 1, "unclear": 0, "not_found": 1},
    "headline": "2 risks checked, 1 potential gap: 1 had no policy wording found and 1 is covered with conditions."
  },
  "findings": [
    {
      "risk_id": "EQP_BREAKDOWN",
      "risk_name": "Equipment breakdown",
      "category": "equipment",
      "status": "not_found",
      "potential_gap": true,
      "priority": "high",
      "title": "Potential coverage gap: Equipment breakdown",
      "explanation": "This is a relevant risk for a bakery. Why it matters: Production depends on ovens and mixers; a breakdown stops baking. No policy wording about this risk was found in the documents analysed, so this is a potential gap. Check this with your insurer or broker before making decisions.",
      "recommendation": "Ask your broker about equipment or machinery breakdown cover, because no policy wording for this risk was found.",
      "evidence": [],
      "verification_required": true,
      "coverage_confidence": 0.6,
      "generated_by": "template"
    },
    {
      "risk_id": "PROP_THEFT",
      "risk_name": "Theft, burglary and vandalism",
      "category": "property",
      "status": "conditional",
      "potential_gap": false,
      "priority": "medium",
      "title": "Covered with conditions: Theft, burglary and vandalism",
      "explanation": "The policy appears to cover this risk only if certain conditions are met (Section 3 - Burglary, page 7 of policy P001). Condition noted: Theft is covered only when it follows forcible and violent entry into the premises. Check this with your insurer or broker before making decisions.",
      "recommendation": "Check that you can meet the policy conditions for this risk, and ask your broker about property and contents cover if you cannot.",
      "evidence": [
        {
          "chunk_id": "P001-p7-c2",
          "policy_id": "P001",
          "section": "Section 3 - Burglary",
          "page": 7,
          "excerpt": "The insurer will indemnify the insured for loss of contents by theft only where ...",
          "flagged": false
        }
      ],
      "verification_required": true,
      "coverage_confidence": 0.79,
      "generated_by": "template"
    }
  ],
  "disclaimer": "This report is decision support only. It is based on the policy text that was analysed and identifies potential coverage gaps; it is not a legal or binding coverage decision. Confirm every finding with your insurer or insurance broker.",
  "warnings": [],
  "metadata": {
    "llm_used": false,
    "llm_provider": null,
    "llm_model": null,
    "llm_findings": 0,
    "template_findings": 2,
    "processing_ms": 4
  }
}
```

`metadata.llm_used` is true only when at least one finding uses AI wording; `llm_provider` and
`llm_model` are set whenever the AI was tried (even if it failed).

Possible `warnings`: a risk not assessed; an assessment missing from the risk profile; a clause
withheld as instruction-like text; AI wording unavailable (all findings use standard wording);
some findings use standard wording because AI wording failed the safety checks.

**Frontend:** `excerpt` is plain policy text and may contain `<`, `>` or HTML-like text - always
escape it when rendering.

### Errors

| Code | When | Body |
|---|---|---|
| 401 | `X-API-Key` missing or wrong, or `INTERNAL_API_KEY` not set on the server | `{"detail": "Missing or invalid API key."}` |
| 422 | Invalid body | `ErrorResponse`: `{"error": "validation_error", "message": ..., "details": [{"field": "assessments.0.status", "message": ...}]}` - input values are never echoed |
| 500 | Unexpected failure | `{"detail": "Report generation could not be completed."}` |

An LLM failure is **not** an error: the report is still returned with template wording and a warning.

### Configuration

| Variable | Default | Effect |
|---|---|---|
| `EXPLANATION_USE_LLM` | `true` | `false` = template wording only, no LLM calls |
| `LLM_PROVIDER` | `gemini` | `gemini` or `ollama` |
| `OLLAMA_MODEL` / `OLLAMA_HOST` | `qwen3:8b` / `http://localhost:11434` | Local model |
| `GEMINI_API_KEY` / `LLM_MODEL` | - | Cloud model |
| `INTERNAL_API_KEY` | - | Required by every agent endpoint |

If the selected provider is not configured, Agent 4 uses templates.

### Orchestrator mapping (for `services/orchestration/`)

```text
Agent 1  RiskProfileResponse       -> risks, business_type   (business_name is dropped)
Agent 3  CoverageAnalysisResponse  -> assessments, request_id, business_id
                                   => ExplanationRequest  -> POST :8004/api/v1/generate-report
```

Use the ready-made helper:

```python
from agents.explanation_agent.mapping import build_explanation_request

request = build_explanation_request(risk_profile=agent1_response, coverage=agent3_response)
report = httpx.post(
    f"{EXPLANATION_AGENT_URL}/api/v1/generate-report",
    json=request.model_dump(mode="json"),
    headers={"X-API-Key": INTERNAL_API_KEY},
    timeout=300,  # a local model on CPU can take minutes for a large report
).json()
```

Pass the same `request_id` to every agent so one run can be traced through the logs.
`tests/integration/test_agent3_to_agent4.py` runs this chain end to end.
