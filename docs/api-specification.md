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
`services/orchestration/pipeline.py` does exactly this; see the gateway section below.

## Orchestration Gateway (port 8000)

The only API the frontend calls. It logs users in, forwards policy uploads to Agent 2, runs
Agents 1 → 2 → 3 → 4 in order, and keeps each user's policies and analysis history in SQLite.
Only the gateway knows `INTERNAL_API_KEY` and the agents' URLs.

Run: `uvicorn services.orchestration.api:app --port 8000 --reload`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | none | Gateway only |
| `GET` | `/health/agents` | none | `up` / `down` for each agent's `/health`; `status` is `degraded` if any is down |
| `POST` | `/api/v1/auth/register` | none | `{"email", "password"}` → 201 `UserResponse`; 409 if the email is taken |
| `POST` | `/api/v1/auth/login` | none | `{"email", "password"}` → `TokenResponse` (`access_token`, `expires_in` seconds) |
| `GET` | `/api/v1/auth/me` | Bearer | `UserResponse` (`user_id`, `email`, `business_id`, `created_at`) |
| `GET` | `/api/v1/policies` | Bearer | The user's uploaded policies, newest first |
| `POST` | `/api/v1/policies` | Bearer | Multipart `file` (PDF) → Agent 2 → `PolicyUploadResponse` |
| `POST` | `/api/v1/analyses` | Bearer | `AnalysisRequest` → runs the four agents → `AnalysisResponse` |
| `GET` | `/api/v1/analyses` | Bearer | The user's past runs (`AnalysisSummary[]`, newest first, max 50) |
| `GET` | `/api/v1/analyses/{request_id}` | Bearer | One stored `AnalysisResponse`; 404 if missing or another user's |

"Bearer" means the header `Authorization: Bearer <access_token>`. The token expires after
`JWT_EXPIRY_MINUTES`; then log in again.

**Rules**

- Passwords: 8 characters minimum, 72 bytes maximum (bcrypt's limit). Emails are lower-cased.
- Each user owns one `business_id` (`B-` + 16 hex characters), created at registration. It is
  **never** taken from a request body: Agent 2 uses it as a folder name, and it is what keeps
  one business's policies away from another's.
- An analysis may only use the user's own `policy_ids`; otherwise it returns 404 and no agent is
  called.
- The gateway creates a new `request_id` for every upload and analysis. It is sent to every agent
  as the `X-Request-ID` header, and in the body to Agents 1, 3 and 4 (Agent 2's schema has no
  such field). It comes back in the response's `X-Request-ID` header and in the body.

### `AnalysisRequest` (`shared/schemas/requests.py`)

```json
{
  "business": { "business_name": "Sunrise Bakery", "business_type": "bakery", "...": "BusinessProfile" },
  "policy_ids": ["POL-3f2a9c81b0d4"]
}
```

`policy_ids`: 1-5, unique. `business_id` and `request_id` are rejected (422).

### `AnalysisResponse` (`shared/schemas/responses.py`)

| Field | Notes |
|---|---|
| `request_id`, `business_id`, `created_at` | |
| `status` | `complete`, or `partial` when Agent 4 failed |
| `risk_profile` | Agent 1's `RiskProfileResponse` |
| `coverage` | Agent 3's `CoverageAnalysisResponse` (Coverage Results page) |
| `report` | Agent 4's `ExplanationResponse` (Report page); `null` when `partial` |
| `warnings` | e.g. no risks found, report unavailable, run could not be saved |
| `stage_ms` | Time spent per stage: `risk_profile`, `policy_evidence`, `coverage`, `report` |

If Agent 1 finds no risks, Agents 2 and 3 are skipped (they need at least one risk) and the
report has no findings.

### Errors

| Code | When | Body |
|---|---|---|
| 401 | No, invalid or expired token; wrong email or password | `{"detail": ...}` |
| 404 | A `policy_id` or `request_id` that is not the user's | `GatewayError` |
| 409 | Email already registered | `GatewayError` |
| 413 | Upload over `MAX_UPLOAD_MB` (checked before Agent 2 is called) | `GatewayError` |
| 400 | Agent 2 says the file is not a valid PDF | `GatewayError` |
| 422 | Invalid body | `ErrorResponse`, without the input values |
| 502 | An agent refused the call (4xx), failed (5xx) or broke the contract | `GatewayError` |
| 503 | An agent could not be reached, or login is not configured (`JWT_SECRET_KEY`) | `GatewayError` |
| 504 | An agent timed out | `GatewayError` |

`GatewayError`: `{"error": "agent_timeout", "message": "...", "stage": "coverage", "request_id": "..."}`.
`stage` is `risk_profile`, `policy_evidence`, `coverage`, `report` or `policy_upload`. Agent
error bodies are never passed on, because they can contain policy text or the caller's input.
An Agent 4 failure is **not** an error: the run returns 200 with `status: "partial"`.

### Storage

SQLite file at `DATABASE_PATH` (default `./data/app.db`, gitignored), created on first use.
Tables: `users` (bcrypt hash only), `policies` (which `policy_id` belongs to which business) and
`analyses`. The full `AnalysisResponse` contains policy excerpts, so it is stored encrypted
with `DOCUMENT_ENCRYPTION_KEY`, the same key Agent 2 uses for the PDFs. If the key is missing,
the run is still returned, with a warning that it was not saved.

### Configuration

| Variable | Default | Effect |
|---|---|---|
| `RISK_AGENT_URL` … `EXPLANATION_AGENT_URL` | `http://localhost:8001` … `8004` | Agent base URLs |
| `REQUEST_TIMEOUT_SECONDS` | `60` | Per-call timeout for Agents 1-3 and uploads |
| `EXPLANATION_TIMEOUT_SECONDS` | `300` | Agent 4 (a local model can take minutes) |
| `INTERNAL_API_KEY` | - | Sent as `X-API-Key` to every agent; must match theirs |
| `JWT_SECRET_KEY` | - | Signs login tokens; at least 32 characters, or login returns 503 |
| `JWT_EXPIRY_MINUTES` | `60` | Token lifetime |
| `DATABASE_PATH` | `./data/app.db` | SQLite file |
| `DOCUMENT_ENCRYPTION_KEY` | - | Encrypts stored analysis results |

### Known limits

- Agent 3's HTTP API has no interpreter yet (issue I7), so a live run only produces `unclear`
  and `not_found`. The pipeline passes Agent 3's decisions through unchanged either way.
- Agent 2 does not log the `X-Request-ID` header yet, so its log lines cannot be matched to a run.
- No login rate limiting yet, and registration says when an email is already taken.
