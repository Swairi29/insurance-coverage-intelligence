# Architecture

## Components

```text
 Frontend (not built yet)
          │  HTTP, Authorization: Bearer <JWT>
          ▼
 Orchestration gateway  :8000   services/orchestration/
   api.py       login, policy upload, analysis endpoints
   auth.py      bcrypt passwords, JWT sessions
   database.py  SQLite: users, policies, analyses (results Fernet-encrypted)
   pipeline.py  calls the agents in order over HTTP
          │  X-API-Key + X-Request-ID on every call
          ├──────────────► Agent 1  Risk Profiling            :8001  agents/risk_agent/
          ├──────────────► Agent 2  Policy Intelligence       :8002  agents/policy_agent/
          ├──────────────► Agent 3  Coverage & Gap Analysis   :8003  agents/coverage_agent/
          └──────────────► Agent 4  Explanation & Recommendation :8004  agents/explanation_agent/
```

Each agent is its own FastAPI service. The agents never call each other. Only the gateway calls
them, and only the gateway is meant to be reachable by the frontend. Shared request and response
models live in `shared/schemas/` and `shared/models/`, so every hop is validated on both sides.

## Flow of one analysis

1. **Upload** (once per policy): `POST /api/v1/policies` on the gateway forwards the PDF to
   Agent 2. Agent 2 checks it is a real PDF within the size limit, stores it encrypted, splits it
   into clauses (with OCR for scanned pages) and indexes them for that business only. The gateway
   records the policy against the user's `business_id`.
2. **Analyse**: `POST /api/v1/analyses` with a business profile and up to 5 of the user's
   `policy_ids`. The gateway creates a `request_id` and runs:

   | Stage | Agent | Input | Output |
   |---|---|---|---|
   | `risk_profile` | 1 | business profile | identified risks (rules + optional LLM) |
   | `policy_evidence` | 2 | risks, business_id, policy_ids | top clauses per risk |
   | `coverage` | 3 | risks + clauses | status per risk (covered, excluded, conditional, unclear, not found) and gap flag |
   | `report` | 4 | risks + assessments | plain-English findings, citations, recommendations |

3. The result is encrypted, saved in SQLite and returned. `GET /api/v1/analyses/{request_id}`
   reads it back later.

## Design rules

- **Agent 3 decides, Agent 4 explains.** Agent 4 never changes a status or gap flag. Its LLM text
  goes through a validator (citations must exist, no wording that contradicts the status, no
  injection echo), and anything rejected is replaced with template text.
- **The LLM is optional everywhere.** With no model configured (or `--no-llm` / `-NoLlm` on the
  start scripts), Agent 1 uses its rules and Agent 4 uses templates, so a full analysis still runs.
- **Least data per hop.** The business name and profile go only to Agent 1. The later agents get
  risks, IDs and clauses.
- **Traceability.** One `request_id` goes in the header of every call and in the body where the
  agent accepts it. Each agent must echo it back, or the gateway treats the response as broken.
  Logs contain only IDs, stages, HTTP codes and timings, never profile or policy text.

## Failure handling

| What fails | Gateway answer |
|---|---|
| Agent 1, 2 or 3 unreachable | `503 agent_unavailable` with the `stage` |
| Agent 1, 2 or 3 too slow | `504 agent_timeout` |
| Agent error, wrong API key or a body that breaks the contract | `502` |
| Agent 4 fails in any way | `200` with `status: "partial"`: coverage results without the report, plus a warning |
| No risks identified | Agents 2 and 3 are skipped, and the result carries a warning |

Agent 4 gets a longer timeout (`EXPLANATION_TIMEOUT_SECONDS`, default 600 s) because a local
model on CPU can take minutes. Agent 4 itself stops asking the LLM after
`EXPLANATION_LLM_BUDGET_SECONDS` (default 280 s) and uses template wording for the rest, so a
complete report always reaches the gateway before that timeout.

## Security

- **Users → gateway**: bcrypt-hashed passwords and short-lived HS256 JWTs (`JWT_SECRET_KEY`). A
  user can only see their own policies and analyses. Another user's IDs give `404`.
- **Gateway → agents**: shared `X-API-Key` (`INTERNAL_API_KEY`). Every agent endpoint rejects a
  missing or wrong key.
- **At rest**: uploaded PDFs (Agent 2) and stored analysis results (gateway) are encrypted with
  Fernet (`DOCUMENT_ENCRYPTION_KEY`).
- **Prompt injection**: Agent 2 flags instruction-like clauses, and Agent 4 never sends flagged
  clauses to the LLM. See [responsible-ai.md](responsible-ai.md).

## Running it

See the README, "Running the system": `scripts/start_agents.ps1` / `scripts/start_agents.sh`
start all five services, and `scripts/smoke_test_gateway.py` checks the full chain.
