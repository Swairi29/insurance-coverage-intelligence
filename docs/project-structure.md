# Project Folder Structure

Current layout of the **AI-Driven Insurance Coverage Intelligence & Gap Detection System**
repository.

_Snapshot taken: 2026-09-21 (branch `main`)._

---

## Top-level layout

```text
insurance-coverage-intelligence/
├── .env.example
├── .gitignore
├── README.md
├── pytest.ini
├── requirements.txt
│
├── agents/              # The four specialised AI agents
├── data/                # Corpora, taxonomies, indexes, uploads
├── docs/                # Design and specification documents
├── frontend/            # Streamlit UI
├── scripts/             # Developer/run scripts
├── services/            # Orchestration gateway and supporting services
├── shared/              # Cross-agent models, schemas, config, LLM client, utilities
└── tests/               # Integration, evaluation and security tests
```

---

## `shared/` — cross-cutting code

```text
shared/
├── __init__.py
├── config/
│   ├── __init__.py
│   └── settings.py                 # environment configuration
├── llm/
│   ├── __init__.py
│   └── gemini_client.py            # single Gemini wrapper for all agents
├── models/
│   ├── __init__.py
│   ├── analysis.py
│   ├── business.py
│   ├── coverage.py
│   ├── policy.py
│   └── risk.py
├── schemas/
│   ├── __init__.py
│   ├── requests.py
│   └── responses.py
└── utils/
    ├── __init__.py
    ├── logging.py
    └── security.py                 # validation, PII redaction, key helpers
```

---

## `agents/` — the agent pipeline

Each agent follows the same internal shape: `main.py` (entrypoint), `api.py` (HTTP
layer), `service.py` (agent logic), plus agent-specific modules and a `tests/` folder.

```text
agents/
├── __init__.py
│
├── risk_agent/                     # 1. Risk Profiling Agent (port 8001)
│   ├── __init__.py
│   ├── main.py
│   ├── api.py
│   ├── service.py
│   ├── nlp.py                      # spaCy extraction from the business profile
│   ├── prompts/
│   ├── rules/
│   └── tests/
│       └── test_risk_api.py
│
├── policy_agent/                   # 2. Policy Intelligence Agent
│   ├── __init__.py
│   ├── main.py
│   ├── api.py
│   ├── service.py
│   ├── document_processor.py       # PyMuPDF / OCR
│   ├── retriever.py                # TF-IDF, BM25, ChromaDB
│   └── tests/
│       └── test_policy_api.py
│
├── coverage_agent/                 # 3. Coverage & Gap Analysis Agent
│   ├── __init__.py
│   ├── main.py
│   ├── api.py
│   ├── service.py
│   ├── rules.py                    # deterministic coverage decisions
│   ├── interpreter.py              # LLM-assisted clause interpretation
│   └── tests/
│       └── test_coverage_api.py
│
└── explanation_agent/              # 4. Explanation & Recommendation Agent
    ├── __init__.py
    ├── main.py
    ├── api.py
    ├── service.py
    ├── rag.py                      # RAG over cited policy clauses
    ├── validator.py                # citation grounding and output checks
    ├── prompts/
    └── tests/
        └── test_explanation_api.py
```

---

## `services/` — orchestration and supporting services

```text
services/
├── __init__.py
├── orchestration/
│   ├── __init__.py
│   ├── pipeline.py                 # end-to-end agent orchestration
│   ├── api.py                      # gateway API consumed by the frontend
│   ├── auth.py                     # register / login / JWT sessions
│   └── database.py                 # SQLite access layer
├── document_service/
└── retrieval_service/
```

---

## `data/` — corpora and artefacts

```text
data/
├── index/                          # ChromaDB files            (gitignored)
├── knowledge_base/
├── processed/                      # contents                  (gitignored)
├── risk_taxonomy/
├── sample_policies/
│   ├── real/                       # real policy documents     (gitignored)
│   ├── synthetic/                  # committed
│   └── adversarial/                # committed
├── test_cases/
│   └── scenario_bakery.json
├── uploads/                        # encrypted PDFs            (gitignored)
└── sources.csv                     # provenance of sourced documents
```

`data/app.db` (SQLite) is created at runtime and is gitignored.

---

## `frontend/` — Streamlit UI

```text
frontend/
├── app.py                          # entry point and page config
├── api_client.py                   # HTTP client for the gateway API
├── components/
│   ├── evidence_viewer.py          # renders cited policy clauses
│   └── status_badge.py             # covered / excluded / gap badges
└── pages/
    ├── 0_Login.py
    ├── 1_Business_Profile.py
    ├── 2_Upload_Policies.py
    ├── 3_Coverage_Results.py
    └── 4_Report.py
```

---

## `tests/` — cross-cutting test suites

```text
tests/
├── evaluation/
├── integration/
│   └── test_pipeline_contracts.py
└── security/
```

Agent-level unit tests live beside each agent under `agents/<agent>/tests/`.

---

## `docs/` and `scripts/`

```text
docs/
├── api-specification.md
├── architecture.md
├── input-specification.md
├── project-structure.md            # this file
├── responsible-ai.md
└── risk-taxonomy.md

scripts/
└── start_agents.sh
```

---

## Notes

- `.gitkeep` files hold otherwise-empty directories in git; they are omitted from the
  trees above.
- `data/sample_policies/` is deny-by-default in `.gitignore`, with `synthetic/` and
  `adversarial/` explicitly re-included. Real policy documents under `real/` are never
  committed.
- `data/index/`, `data/uploads/` and `data/app.db` are runtime artefacts and gitignored.
- Secrets live in `.env` (gitignored); `.env.example` documents the expected variables.
