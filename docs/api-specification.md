# API Specification

## Agent 4 - Explanation & Recommendation (port 8004)

Turns Agent 1's risks and Agent 3's coverage assessments into a plain-English report for the
business owner. Agent 4 **explains** Agent 3's decisions; it never changes a coverage status or
gap flag, and it never invents policy wording, sections or pages.

Run: `uvicorn agents.explanation_agent.main:app --port 8004 --reload`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/generate-report` | `X-API-Key` | Build the report |
| `POST` | `/api/v1/answer-question` | `X-API-Key` | Answer one question about a saved analysis (see [Questions](#questions---post-apiv1answer-question)) |
| `GET` | `/health` | none | `{"status": "healthy", "agent": "explanation-recommendation"}` |

### Request - `ExplanationRequest` (`shared/schemas/requests.py`)

| Field | Type | Notes |
|---|---|---|
| `request_id` | string, optional | Letters, digits, `-`, `_`; max 64. Generated if missing or `null`. |
| `business_id` | string | Required, max 64. |
| `business_type` | `bakery` \| `restaurant` \| `cafe` \| `retail_shop` \| `grocery_store` \| `pharmacy` \| `clothing_store` \| `hardware_store` \| `salon` \| `repair_workshop` \| `professional_services` \| `other` \| `null` | The business **name** is deliberately not sent. |
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
| `EXPLANATION_LLM_BUDGET_SECONDS` | `280` | Time for LLM wording per report. No batch starts after it and each Ollama call is limited to it; the remaining findings get template wording and the warning "...took too long to generate." Keep it under half of `EXPLANATION_TIMEOUT_SECONDS` |
| `LLM_PROVIDER` | `gemini` | `gemini` or `ollama`. With `gemini`, the first Gemini failure (e.g. HTTP 429) switches the rest of that report or answer to the local `OLLAMA_MODEL`, and Gemini is not retried; `metadata.llm_provider` / `llm_model` name the model that answered |
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
    timeout=600,  # a local model on CPU can take minutes for a large report
).json()
```

Pass the same `request_id` to every agent so one run can be traced through the logs.
`tests/integration/test_agent3_to_agent4.py` runs this chain end to end.
`services/orchestration/pipeline.py` does exactly this; see the gateway section below.

### Questions - `POST /api/v1/answer-question`

Answers one question from the business owner about **one saved analysis**, using only what
that analysis contains: Agent 3's assessments and the clauses behind them. Nothing is retrieved
again. Code: `agents/explanation_agent/qa.py` (choosing the context, no LLM) and `qa_answer.py`
(prompt `prompts/qa_v1.txt`, validation, rule-based answer).

**Request - `QuestionRequest`**

```json
{
  "request_id": "a1b2c3",
  "business_id": "B-3f2a9c81b0d4e5f6",
  "business_type": "bakery",
  "question": "If someone steals my stock, am I covered?",
  "assessments": [ { "risk_id": "PROP_THEFT", "status": "conditional", "evidence": [ "..." ], "...": "CoverageAssessment" } ]
}
```

- `question`: 3-500 characters, must contain words; all whitespace (including line breaks) is
  collapsed to single spaces, so a question cannot add its own lines or blocks to the prompt.
- `assessments`: 0-50, unique `risk_id`. The business name is not accepted.

**Response 200 - `QuestionAnswerResponse`**

```json
{
  "schema_version": "1.0",
  "request_id": "a1b2c3",
  "answerable": true,
  "answer": "Theft cover applies only after forcible and violent entry (Section 3, page 7). ...",
  "citations": [ { "chunk_id": "P001-p7-c2", "policy_id": "P001", "section": "Section 3 - Burglary", "page": 7, "excerpt": "...", "flagged": false } ],
  "related_risk_ids": ["PROP_THEFT"],
  "generated_by": "llm",
  "disclaimer": "This answer only uses this analysis and the policy wording it found. ...",
  "metadata": { "llm_used": true, "llm_provider": "gemini", "llm_model": "gemini-3.5-flash", "processing_ms": 6531 }
}
```

| Field | Notes |
|---|---|
| `answerable` | `false`: the analysis does not answer the question, and `answer` says so. Then `citations` is always empty |
| `answer` | Plain text, at most 1200 characters. Rule-based answers are a heading line followed by `- ` list lines - keep the line breaks when rendering |
| `citations` | 0-6 clauses the answer is based on, unique, only clauses that were shown to the LLM |
| `related_risk_ids` | Risks of this analysis the answer is about, best match first |
| `generated_by` | `llm`, or `template` for the rule-based answer |
| `metadata.llm_provider` / `llm_model` | Set when the LLM was **tried**; `llm_used` says whether its answer was kept |

How an answer is made:

1. The question is sanitised and scanned for prompt injection. A suspicious question, or an
   analysis with no risks, gets a fixed answer and never reaches the LLM.
2. Clauses are pooled from all assessments (flagged ones withheld everywhere) and ranked against
   the question by keyword overlap (IDF-weighted, everyday words such as "oven" mapped to risk
   words such as "equipment"). At most 6 are shown. A one-line overview of every risk and its
   status is always included.
3. The LLM answers in JSON. The answer is rejected if its shape is wrong (V1), it names a risk
   that is not in the analysis (V2), cites a clause it was not shown (V3), uses a blocked phrase
   (V5), claims cover for a risk that is not `covered` / `conditional` (V6), echoes injected
   instructions (V7), contains markup or links (V8), or is empty or over 130 words (V9).
4. If the LLM is off, fails, is rate-limited or its answer is rejected, a rule-based answer is
   returned: the related risks with the plain meaning of their status and their best clause, a
   glossary definition for "what does X mean?", or "This analysis does not seem to answer that".

**Errors:** 401 (API key), 422 (`ErrorResponse`, the question is never echoed), 500
`{"detail": "The question could not be answered."}`. An LLM failure is not an error.

**Configuration:** `QA_LLM_TIMEOUT_SECONDS` (default `60`) limits one Ollama call. Gemini calls
use `LLM_TIMEOUT_SECONDS` and `LLM_MAX_RETRIES`. `EXPLANATION_USE_LLM=false` gives rule-based
answers only.

## Orchestration Gateway (port 8000)

The only API the frontend calls. It logs users in, forwards policy uploads to Agent 2, runs
Agents 1 → 2 → 3 → 4 in order, and keeps each user's policies and analysis history in SQLite.
Only the gateway knows `INTERNAL_API_KEY` and the agents' URLs.

Run: `uvicorn services.orchestration.api:app --port 8000 --reload`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | none | Gateway only |
| `GET` | `/health/agents` | none | `up` / `down` for each agent's `/health`; `status` is `degraded` if any is down |
| `POST` | `/api/v1/auth/register` | none | `{"email", "password", "consent_version"}` → 201 `UserResponse`; 409 if the email is taken; 422 without consent to the current notice |
| `POST` | `/api/v1/auth/login` | none | `{"email", "password"}` → `TokenResponse` (`access_token`, `expires_in` seconds) |
| `GET` | `/api/v1/auth/me` | Bearer | `UserResponse` (`user_id`, `email`, `business_id`, `created_at`, `consent_version`, `consented_at`) |
| `GET` | `/api/v1/policies` | Bearer | The user's uploaded policies, newest first |
| `POST` | `/api/v1/policies` | Bearer | Multipart `file` (PDF) → Agent 2 → `PolicyUploadResponse` |
| `GET` | `/api/v1/business-profiles` | Bearer | The user's saved profiles (`SavedBusinessProfile[]`, most recently changed first) |
| `POST` | `/api/v1/business-profiles` | Bearer | `BusinessProfile` → **201** `SavedBusinessProfile`; 409 `profile_limit` at 20 profiles |
| `GET` | `/api/v1/business-profiles/{profile_id}` | Bearer | One `SavedBusinessProfile`; 404 if missing or another user's |
| `PUT` | `/api/v1/business-profiles/{profile_id}` | Bearer | `BusinessProfile` → `SavedBusinessProfile` (replaces the whole profile); 404 if missing or another user's |
| `DELETE` | `/api/v1/business-profiles/{profile_id}` | Bearer | **204**; 404 if missing or another user's |
| `POST` | `/api/v1/analyses` | Bearer | `AnalysisRequest` → **202** `AnalysisProgress`; the four agents then run in the background |
| `GET` | `/api/v1/analyses/{request_id}/status` | Bearer | `AnalysisProgress`: which agent is running, what each was sent and returned (counts only); 404 if missing or another user's |
| `GET` | `/api/v1/analyses` | Bearer | The user's past runs (`AnalysisSummary[]`, newest first, max 50) |
| `GET` | `/api/v1/analyses/{request_id}` | Bearer | One stored `AnalysisResponse`; 409 `analysis_running` while it runs; 404 if missing, failed or another user's |
| `POST` | `/api/v1/analyses/{request_id}/questions` | Bearer | `{"question": "..."}` → Agent 4 → `QuestionAnswerResponse`; 404 if missing or another user's |
| `POST` | `/api/v1/scenario-analyses` | Bearer | `ScenarioAnalysisRequest` → **202** `AnalysisProgress`; the same four agents run, starting from a free-text scenario |
| `GET` | `/api/v1/scenario-analyses/{request_id}/status` | Bearer | `AnalysisProgress` for a scenario run; 404 if missing or another user's |
| `GET` | `/api/v1/scenario-analyses` | Bearer | The user's saved scenario runs (`AnalysisSummary[]`, newest first, max 50) |
| `GET` | `/api/v1/scenario-analyses/{request_id}` | Bearer | One `ScenarioAnalysisResponse`; 409 `scenario_analysis_running` while it runs; 502 with the stage if it failed; 404 if missing or another user's |

"Bearer" means the header `Authorization: Bearer <access_token>`. The token expires after
`JWT_EXPIRY_MINUTES`; then log in again.

**Rules**

- Passwords: 8 characters minimum, 72 bytes maximum (bcrypt's limit). Emails are lower-cased.
- Consent: registration needs `consent_version` equal to `CURRENT_CONSENT_VERSION`
  (`shared/schemas/requests.py`; the same value as `CONSENT_VERSION` in
  `frontend/src/lib/consent.ts`, shown on `/privacy`). Sending it is the user's agreement to the
  privacy and data-processing notice; anything else is a 422 on `consent_version` and no account
  is created. The version and the time of agreement are stored with the user (columns
  `consent_version`, `consented_at`, added automatically to an existing database) and returned by
  `/auth/me`. Accounts created before this have `null` for both.
- After 5 failed logins for one email within 15 minutes, login for that email returns 429 until
  the oldest failure is 15 minutes old. A successful login clears the count. Unknown emails are
  counted the same way, so the limit does not reveal which emails exist. The count is in memory,
  so it resets when the gateway restarts.
- Each user owns one `business_id` (`B-` + 16 hex characters), created at registration. It is
  **never** taken from a request body: Agent 2 uses it as a folder name, and it is what keeps
  one business's policies away from another's.
- An analysis may only use the user's own `policy_ids`; otherwise it returns 404 and no agent is
  called.
- Business profiles are saved to the account so they survive logout and restarts, and can be
  picked again for a new analysis. The body is a `BusinessProfile` (the same object as
  `AnalysisRequest.business`, so 422 fields are named without the `business.` prefix). The
  response is `{"profile_id": "BP-…", "created_at", "updated_at", "profile": BusinessProfile}`.
  An analysis still sends the profile itself in `business`; it does not take a `profile_id`.
  Policies belong to the account, not to a profile, so any saved profile can be checked against
  any of the user's policies.
- Questions: the body is only `{"question": "..."}` (3-500 characters). The gateway loads the
  analysis with the same ownership check as `GET /analyses/{request_id}` and sends Agent 4 only
  the business type, the question and that analysis's assessments. Each user may ask 10
  questions per minute (429 `too_many_questions` with `Retry-After`); questions about an
  analysis the user does not own are not counted. Questions and answers are not stored, and the
  question text is never logged.
- The gateway creates a new `request_id` for every upload, analysis and question. It is sent to every agent
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

### Running an analysis: 202, then status

`POST /api/v1/analyses` checks the body and the policy ownership, then answers **202** at once
with an `AnalysisProgress` (every stage `queued`), an `X-Request-ID` header and a `Location`
header pointing at the status endpoint. The pipeline runs in a background task. The frontend
polls `GET /api/v1/analyses/{request_id}/status` every 1.5 s until `state` is no longer
`running`, then fetches the result. `scripts/gateway_client.py` does the same for the scripts.

`AnalysisProgress` (`shared/schemas/responses.py`):

| Field | Notes |
|---|---|
| `state` | `running`, `complete`, `partial` (no written report) or `failed` |
| `stages[]` | One per agent call, in order: `stage`, `agent` ("Risk Profiling Agent"), `endpoint` ("POST /api/v1/risk-profile"), `state` (`queued` / `running` / `done` / `failed` / `skipped`), `sent` ("14 risks, 2 policies"), `received` ("22 clauses found", or the failure reason), `started_at`, `finished_at`, `duration_ms` |
| `error` | `GatewayError` when `state` is `failed` (same codes as before, e.g. `agent_timeout` at `coverage`) |

The gateway is the hub: it calls each agent in turn and passes the result on; agents never call
each other, so every stage is one gateway → agent call. `sent` and `received` are counts only,
never business or policy content. Running jobs are kept in memory per gateway process; after a
restart the status of a saved analysis is rebuilt from its stored result.

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

### Scenario analysis

The second way to start an analysis: instead of a business profile, the user describes the
business or situation in their own words. Agent 1 identifies the risks from that text
(`POST /api/v1/scenario-risk-profile`), and the gateway maps them onto Agent 2's contract;
Agents 2, 3 and 4 then run exactly as for a profile analysis. It uses the same 202-then-status
pattern and the same `AnalysisProgress`; the first stage's `endpoint` is the scenario one.

`ScenarioAnalysisRequest` (`shared/schemas/requests.py`):

```json
{ "scenario": "We run a small bakery in Kandy with two commercial ovens ...", "policy_ids": ["POL-3f2a9c81b0d4"] }
```

`scenario`: 10-4000 characters, must contain words. `policy_ids`: as for an analysis, 1-5,
unique, and only the user's own (404 otherwise, before any agent is called).

`ScenarioAnalysisResponse` (`shared/schemas/responses.py`) has the same `request_id`,
`business_id`, `status`, `created_at`, `coverage`, `report`, `warnings` and `stage_ms` as an
`AnalysisResponse`; instead of `risk_profile` it has `risks` (each with `name`, `category`,
`description`, `reason`, `confidence` and the `evidence` quoted from the scenario) and
`llm_used`.

A finished scenario run is saved like a profile analysis (encrypted, table
`scenario_analyses`), so it stays in History; failed runs are not saved. The scenario text
itself is not stored, but a saved result can quote short parts of it as risk evidence.

### Errors

| Code | When | Body |
|---|---|---|
| 401 | No, invalid or expired token; wrong email or password | `{"detail": ...}` |
| 404 | A `policy_id`, `request_id` or `profile_id` that is not the user's | `GatewayError` |
| 409 | Email already registered; 20 business profiles already saved (`profile_limit`) | `GatewayError` |
| 429 | 5 failed logins for one email within 15 minutes (`too_many_attempts`), or more than 10 questions in a minute (`too_many_questions`); both with `Retry-After` seconds | `GatewayError` |
| 413 | Upload over `MAX_UPLOAD_MB` (checked before Agent 2 is called) | `GatewayError` |
| 400 | Agent 2 says the file is not a valid PDF | `GatewayError` |
| 422 | Invalid body | `ErrorResponse`, without the input values |
| 409 | The result of an analysis that is still running (`analysis_running`, `scenario_analysis_running`) | `GatewayError` |
| 502 | An agent refused the call (4xx), failed (5xx) or broke the contract (uploads and questions) | `GatewayError` |
| 503 | An agent could not be reached (uploads and questions), login is not configured (`JWT_SECRET_KEY`), or business profiles cannot be encrypted or read (`profiles_unavailable`, `DOCUMENT_ENCRYPTION_KEY` missing or changed) | `GatewayError` |
| 504 | An agent timed out (uploads and questions) | `GatewayError` |

An analysis that fails in the background is reported by the status endpoint (`state: "failed"`
with its `GatewayError`), not by an HTTP error, because the 202 has already been sent.

`GatewayError`: `{"error": "agent_timeout", "message": "...", "stage": "coverage", "request_id": "..."}`.
`stage` is `risk_profile`, `policy_evidence`, `coverage`, `report`, `policy_upload` or `question`. Agent
error bodies are never passed on, because they can contain policy text or the caller's input.
An Agent 4 failure is **not** an error: the run returns 200 with `status: "partial"`.

### Storage

SQLite file at `DATABASE_PATH` (default `./data/app.db`, gitignored), created on first use.
Tables: `users` (bcrypt hash only), `policies` (which `policy_id` belongs to which business),
`analyses`, `scenario_analyses` and `business_profiles`. The full results contain policy excerpts, so they are stored
encrypted with `DOCUMENT_ENCRYPTION_KEY`, the same key Agent 2 uses for the PDFs; the summary
columns (status, date, counts) are plain text for the History list. If the key is missing, the
run is still returned, with a warning that it was not saved. Business profiles are stored
encrypted with the same key (only the ids and dates are plain text); without the key, the
profile endpoints return 503 and nothing is saved. Tables are added to an existing database file
on startup, so no data is lost.

### Configuration

| Variable | Default | Effect |
|---|---|---|
| `RISK_AGENT_URL` … `EXPLANATION_AGENT_URL` | `http://127.0.0.1:8001` … `8004` | Agent base URLs |
| `REQUEST_TIMEOUT_SECONDS` | `60` | Per-call timeout for Agents 1-2 and uploads |
| `COVERAGE_TIMEOUT_SECONDS` | `300` | Agent 3, which asks the LLM once per risk. It stops asking after `COVERAGE_LLM_BUDGET_SECONDS` (default 90; each Ollama call is limited to it too), reads the remaining risks with the wording rules and adds the warning "The AI took too long, so N risks were read with the coverage rules instead.", so it answers in time. When no LLM answers at all, it stops asking for the rest of the request |
| `EXPLANATION_TIMEOUT_SECONDS` | `600` | Agent 4 (a local model can take minutes; Agent 4 stops using the LLM after `EXPLANATION_LLM_BUDGET_SECONDS`, so it answers in time) |
| `QUESTION_TIMEOUT_SECONDS` | `150` | Agent 4 for one question; longer than Gemini's retries, so Agent 4 can still fall back to the rule-based answer |
| `INTERNAL_API_KEY` | - | Sent as `X-API-Key` to every agent; must match theirs |
| `JWT_SECRET_KEY` | - | Signs login tokens; at least 32 characters, or login returns 503 |
| `JWT_EXPIRY_MINUTES` | `60` | Token lifetime |
| `DATABASE_PATH` | `./data/app.db` | SQLite file |
| `DOCUMENT_ENCRYPTION_KEY` | - | Encrypts stored analysis results |

### Known limits

- Agent 3's HTTP API has no interpreter yet (issue I7), so a live run only produces `unclear`
  and `not_found`. The pipeline passes Agent 3's decisions through unchanged either way.
- Agent 2 does not log the `X-Request-ID` header yet, so its log lines cannot be matched to a run.
- Registration says when an email is already taken (409), which reveals that the account exists.
- The failed-login and question counts are per gateway process; running several gateway
  processes would need a shared store.
