# Individual Vulnerability Assessment — Scope

**Student specialization:** Information Retrieval and Security Assessment (Student 4)
**System evaluated:** Insurance Coverage Intelligence & Gap Detection System

## Components in scope

- **Orchestration gateway** (`services/orchestration/`, port 8000) — authentication
  (JWT, login/session handling), authorization, business-scoped access control, the
  API surface the frontend actually talks to.
- **Policy Intelligence Agent** (`agents/policy_agent/`, port 8002) — PDF ingestion,
  TF-IDF/semantic retrieval, service-to-service API key auth, encryption at rest,
  prompt-injection flagging at ingestion.
- The **communication path** between the gateway and the agents (internal API key
  usage, whether agent ports are reachable directly, bypassing the gateway).

## Explicitly out of scope

- The internal reasoning/prompt design of Agents 1, 3 and 4 (risk identification
  quality, coverage interpretation wording, explanation generation) — these belong
  to the other three specializations (Prompt Injection, Responsible AI/Bias).
- Redesigning or patching the system. Per the assignment brief, the objective is to
  assess robustness and document findings, not to fix them during this exercise.

## Testing environment

- Local machine, all five services run directly via `uvicorn` (gateway on 8000,
  Risk Profiling on 8001, Policy Intelligence on 8002, Coverage & Gap on 8003,
  Explanation on 8004).
- `.env` already configures `JWT_SECRET_KEY`, `INTERNAL_API_KEY`,
  `DOCUMENT_ENCRYPTION_KEY`, and all four agent URLs pointing at localhost.
- Tools: Swagger UI (`/docs` on each service) for standard requests; direct HTTP
  calls (Python `requests`/`curl`) for edge cases Swagger can't express (tampered
  JWTs, malformed headers, raw protocol-level probing).
