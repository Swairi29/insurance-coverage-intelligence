# InsureIntel Final Report: updated content (8 October 2026)

## Instructions for regenerating the report

This file is the complete, updated text of the IT3041 final report "InsureIntel". Regenerate the
report from it as a Word document (then PDF) in **the same layout as the previous version**:

- Title page, table of contents, page header "InsureIntel · IT3041 Final Report", page numbers.
- Navy (#1F3864) headings and table header rows, light-blue alternate table rows, figure and table
  captions in the form "**Figure N:** *caption*" and "**Table N:** *caption*".
- Callout boxes (the "Motivating example" and "Practical constraint" quotes) as a light-blue box
  with a navy left border, as before.
- Code, file names and endpoints in a monospace font (dark red), as before.
- Keep the chapter numbering and the table and figure numbering below exactly.
- Use only the text below. Do not add claims, numbers or features that are not in it.

**What changed since the previous version** (so you can check every change was applied):

1. **Agent 3's LLM interpreter is now switched on.** When an LLM is configured, Agent 3 asks it
   to read the retrieved clauses and propose each risk's status; the answer must cite clauses it
   was given, and the rule-based wording reader takes over when no model is available, the model
   fails, or Agent 3's 90 s LLM budget is used up. Every sentence of the previous version that
   said "the LLM never decides coverage" or "the interpreter is disabled" has been rewritten
   (Abstract, Table 2, 4.3, 5.3, 5.6, Chapter 8, 9, 11.3, 13.5, 15, 16). The protection that
   remains is that Agent 4's LLM can never change a status, and the potential-gap flag is always
   derived by code.
2. **Gemini to Ollama fallback.** With `LLM_PROVIDER=gemini`, Agents 3 and 4 switch to the local
   Ollama model as soon as a Gemini call fails (for example the free-tier rate limit), without
   retrying Gemini (5.3, 5.4, Chapter 8, Table 8).
3. **Agent 3 time limit.** Agent 3 has its own 300 s gateway timeout and a 90 s LLM budget
   (Table 7, Table 8, 13.4, Appendix A).
4. **Saved business profiles.** Profiles are now saved to the user's account, encrypted (table
   `business_profiles`, up to 20 per account), instead of living only in the browser tab (5.5,
   Table 12, 11.5, Chapter 12).
5. **Three-step profile analysis.** New Analysis → Business Profile now has three steps: pick a
   saved business, pick policies (a missing policy can be uploaded inside the step), review and
   run (5.6, Chapter 12).
6. **In-app Responsible AI page** at `/responsible-ai`, linked from the landing page (11.2,
   Chapter 12).
7. **New and retaken screenshots** (Chapter 12): see the table below. Figures 3 onwards are
   renumbered.
8. **Honest new limitation:** Agent 3's LLM prompt does not yet withhold flagged
   (instruction-like) clauses the way Agent 4 does (5.2, 10, 11, 15).
9. Updated test results (Abstract, Table 2, 13.1, Appendix A).
10. Table 1: contribution areas updated.

**Screenshots to attach** (all from `docs/images/frontend/` in the repository; all dark-theme
except Figure 23, which is the light print version):

| Figure | File | Caption | Section |
|---|---|---|---|
| 3 | `01-landing.png` | Landing page with a sample agent run | 12.1 |
| 4 | `03-register-consent.png` | Registration with password checks and privacy consent | 12.1 |
| 5 | `04-dashboard.png` | Overview: key figures, setup checklist and latest analysis | 12.2 |
| 6 | `22-businesses.png` | Businesses: profiles saved to the account | 12.2 |
| 7 | `05-business-profile.png` | Business profile form (business, operations, location) | 12.2 |
| 8 | `06-policies.png` | Policies, with a flagged-section warning on the second upload | 12.2 |
| 9 | `07-new-analysis.png` | New analysis: choose a business profile or describe a scenario | 12.3 |
| 10 | `17-new-analysis-profile.png` | Profile analysis, step 1: pick a saved business | 12.3 |
| 11 | `23-new-analysis-policies.png` | Profile analysis, step 2: choose policies or upload another | 12.3 |
| 12 | `24-new-analysis-review.png` | Profile analysis, step 3: review and run | 12.3 |
| 13 | `18-scenario-analysis.png` | Scenario analysis: describe the business in free text and select policies | 12.3 |
| 14 | `08-agent-workspace-running.png` | Agent workspace while Agent 3 is running | 12.4 |
| 15 | `09-agent-workspace-complete.png` | Completed run with technical details: agent cards and handoff log | 12.4 |
| 16 | `10-results-report.png` | Results: headline, status counts, disclaimer and a prioritised finding | 12.5 |
| 17 | `11-results-coverage.png` | Coverage tab filtered to potential gaps | 12.5 |
| 18 | `12-evidence-panel.png` | Evidence panel for an excluded risk | 12.5 |
| 19 | `13-results-risk-profile.png` | Risk profile grouped by category, with the evidence behind each risk | 12.5 |
| 20 | `14-ask-panel.png` | Ask panel: an answer with the policy wording it used | 12.5 |
| 21 | `19-scenario-report.png` | Scenario analysis report | 12.5 |
| 22 | `15-history.png` | History of profile and scenario analyses | 12.6 |
| 23 | `20-printed-report.png` | Printed report in the light print palette | 12.6 |
| 24 | `21-account-menu.png` | Account menu | 12.6 |
| 25 | `16-results-phone.png` | Coverage results on a phone | 12.6 |
| 26 | `25-responsible-ai.png` | In-app Responsible AI page (top of the page) | 12.7 |
| 27 | `02-pricing.png` | Pricing section of the landing page | 14.2 |

Figure 26 is a very tall full-page capture: crop it to the top part (title, section links and the
first two sections) so it fits on one page. Figure 1 (architecture diagram) is unchanged; reuse it
from the previous version. Figure 2 (data-flow diagram) is unchanged from the previous version
except for the note under it (see 4.1). Everything below this line is the report itself.

---

# Title page

SRI LANKA INSTITUTE OF INFORMATION TECHNOLOGY
IT3041 – Information Retrieval and Web Analytics
Year 3, Semester 2 · Group Assignment: Final Report

# InsureIntel

## AI-Driven Insurance Coverage Intelligence & Gap Detection System

*A multi-agent system integrating LLMs, NLP, Information Retrieval and security for SME insurance
coverage analysis*

| Team member | GitHub | Component owned |
|---|---|---|
| Hasini | hasangi2002 | Agent 1: Risk Profiling Agent |
| Amami Gunathilake | amamigunathilake | Agent 2: Policy Intelligence Agent (IR) |
| Sejan Rathnasekara | Pasiya990 | Agent 3: Coverage & Gap Analysis Agent |
| Swairi Gamage | Swairi29 | Agent 4: Explanation & Recommendation Agent, orchestration gateway |

Lecturer in Charge: Mr. Samadhi Chathuranga Rathnayake
Submitted: October 2026

---

# Abstract

Small and medium-sized enterprises (SMEs) frequently hold insurance policies without knowing which
of their real business risks those policies actually cover. Policy wordings are long and technical,
and coverage gaps (an excluded flood, no cover for equipment breakdown) are usually discovered only
when a claim is refused. This report presents **InsureIntel**, a multi-agent AI system that takes a
description of a business, either as a structured business profile saved to the owner's account or
as a free-text scenario in the owner's own words, together with the business's insurance policy
PDFs, and produces a cited coverage analysis.

Four specialised agents, coordinated by an orchestration gateway over typed HTTP/JSON contracts,
(1) identify the business's risks, from a profile against a 19-risk taxonomy or from a free-text
scenario, (2) retrieve the relevant policy clauses with a TF-IDF (or optional semantic) information
retrieval pipeline, (3) decide a coverage status for each risk from that evidence, and (4) write a
plain-English report and answer follow-up questions in which every statement cites the exact
clause, section and page it rests on. Large language models (Google Gemini, with a local Ollama
model as the fallback or as the only model) are used where they add value, each in a bounded role:
Agent 3's model may propose a status only by citing the clauses it was given, deterministic wording
rules take over whenever no model can answer, and Agent 4's model can never change a status. The
profile path produces a complete result with no LLM at all.

The system includes layered security (bcrypt, JWT, login lockout, inter-service API keys, Fernet
encryption at rest, prompt-injection detection and per-user isolation) and Responsible AI controls
(evidence citation, AI-vs-template labelling, a nine-check output validator, consent recording, an
in-app Responsible AI page and a local-model option). It is backed by 1,150 passing backend tests
and 226 passing frontend tests. In an evaluation of the explanation agent, citation validity and
status consistency were 100% on both a local 8B model and Gemini, with full resistance to the
injection test cases. A freemium LKR subscription model targeting Sri Lankan SMEs and insurance
brokers is proposed for commercialisation.

---

# 1. Introduction

## 1.1 Background

Insurance is one of the main ways an SME protects itself against events that could end the
business: fire, flood, theft, injury claims or the loss of key equipment. In Sri Lanka, the launch
market for this project, SMEs make up the large majority of businesses, and insurance is mostly sold
through brokers and agents. Owners typically buy a "business pack" policy on a broker's
recommendation and rarely read the full wording.

## 1.2 Problem Statement

- SME owners rarely read their full policy wording and do not know which risks are covered,
  excluded, covered only under conditions, or not addressed at all.
- Brokers spend hours reading policies to answer a single "am I covered for…?" question.
- Generic AI chatbots are not a safe answer: they can state cover that the policy does not give,
  and they do not show the clause behind their answer.

> **Motivating example.** A bakery has fire risk from ovens, refrigeration failure, food-safety
> liability, cash theft and flood risk. Its "business pack" policy covers fire, covers theft only
> after forcible entry, and excludes equipment breakdown. InsureIntel shows each of these with the
> clause it comes from, and flags the breakdown exclusion as a potential gap.

## 1.3 Aim and Objectives

The aim of the project is to build a trustworthy, explainable decision-support tool that tells an SME
owner which of their business risks their policies cover, with evidence. The objectives were to:

1. Identify the business risks that apply to a given SME, from a structured profile or from a
   description in the owner's own words.
2. Retrieve the policy clauses relevant to each risk from the business's own uploaded PDFs.
3. Classify each risk as covered, covered with conditions, excluded, unclear or not found, and flag
   potential gaps.
4. Explain the results in plain English, citing the exact clause behind every statement, and answer
   follow-up questions grounded only in the analysis.
5. Do this with multiple cooperating agents, secure communication, and Responsible AI controls that
   keep the LLM from inventing or overstating cover.
6. Define a viable commercialisation strategy with pricing for the Sri Lankan market.

## 1.4 Scope

**Inputs:** either one of the account's saved business profiles (name, type, description,
employees, equipment, sales channels, yes/no/not-sure questions, location) or a free-text scenario
of up to 4,000 characters, plus 1–5 policy PDFs. **Outputs:** the identified risks, a coverage
assessment per risk, a cited report with recommendations, and grounded question answering.

InsureIntel is **decision support, not insurance advice**. Every result tells the user to confirm
with their insurer or broker. It does not predict whether a specific claim will be paid.

---

# 2. Team and Individual Contributions

Each member owned one agent end to end (design, implementation, tests and documentation), and all
members worked on the shared data contracts that connect the agents and on the React frontend.

**Table 1:** *Team members and component ownership*

| Member | Component owned | Main code areas |
|---|---|---|
| Hasini (hasangi2002) | Agent 1: Risk Profiling Agent, including free-text scenario risk identification | `agents/risk_agent/`, business, risk and scenario models in `shared/models/`, React frontend (dark redesign, scenario analysis screens) |
| Amami Gunathilake (amamigunathilake) | Agent 2: Policy Intelligence Agent (Information Retrieval) | `agents/policy_agent/`, settings and security utilities in `shared/`, React frontend |
| Sejan Rathnasekara (Pasiya990) | Agent 3: Coverage & Gap Analysis Agent, including the LLM clause interpreter and its Gemini-then-Ollama provider | `agents/coverage_agent/`, React frontend |
| Swairi Gamage (Swairi29) | Agent 4: Explanation & Recommendation Agent; orchestration gateway | `agents/explanation_agent/`, `services/orchestration/` (saved scenario analyses, saved business profiles, agent time limits), React frontend (three-step analysis flow, Responsible AI page) |

---

# 3. Requirements and Compliance with the Brief

The table below maps every system requirement in the assignment brief to how InsureIntel meets it and
where in this report it is discussed.

**Table 2:** *Mapping of assignment requirements to the system*

| Brief requirement | How InsureIntel meets it | Section |
|---|---|---|
| Solve a real problem in a domain | SME insurance coverage gap detection (InsurTech) | 1 |
| At least two interacting intelligent agents | Four agents in a pipeline coordinated by a gateway; each agent's output is the next one's input | 4, 5 |
| One or more LLMs | Google Gemini (`gemini-3.5-flash`) and local models via Ollama (`qwen3:8b`, `qwen3:4b`), used by Agent 1 (profile enrichment, scenario risk extraction), Agent 3 (clause interpretation) and Agent 4 (report, Q&A) | 8 |
| NLP techniques | Lexicon-based phrase extraction, text normalisation and redaction, rule-based classification of policy wording, LLM-based clause interpretation, section detection, OCR, LLM-based risk extraction from free text, grounded generation (RAG), summarisation, readability scoring | 9 |
| Information Retrieval module | Agent 2: PDF parsing, chunking, per-business index, TF-IDF + cosine ranking or embedding-based retrieval (ChromaDB, MiniLM) | 7 |
| Security features | bcrypt, JWT, login lockout, inter-service API keys, Fernet encryption, input validation and sanitisation, PDF content checks, prompt-injection detection, per-user isolation, rate limits | 10 |
| Agent communication protocol | HTTP/JSON REST (FastAPI), hub and spoke, typed Pydantic contracts validated on both sides, `X-API-Key` and `X-Request-ID` headers | 6 |
| Fairness, explainability, transparency, data protection | Cited evidence, AI-vs-template labels, citation-checked coverage decisions, gap flag derived by code, validator V1–V9, consent record, in-app Responsible AI page, least data per hop, local-model option | 11 |
| Commercialisation (pricing, market, deployment) | Four LKR tiers, three customer segments, unit economics, go-to-market, deployment proposal | 14 |
| Evaluation results | 1,150 backend + 226 frontend tests (all passing); Agent 4 evaluation on two models; live Q&A and pipeline checks | 13 |

---

# 4. System Design and Architecture

## 4.1 Overall Architecture

InsureIntel consists of five FastAPI back-end services and a React web application. The
**orchestration gateway** is the only service the browser can reach; it handles accounts and storage
and calls the four agents in order. Each agent is an independent service on its own port with its
own `/health` endpoint. Agents never call each other: the gateway passes each agent's output to the
next (a hub-and-spoke topology). Only the gateway knows the internal API key and the agents'
addresses.

An analysis can start in two ways. A **profile analysis** sends one of the account's saved business
profiles to Agent 1's rule engine. A **scenario analysis** sends a free-text description to Agent
1's scenario endpoint. From Agent 2 onwards both paths are identical, so both produce the same kind
of report.

**Figure 1:** *High-level architecture of InsureIntel* (unchanged diagram from the previous
version.)

**Figure 2:** *Data flow through the four-agent pipeline* (same diagram as the previous version:
"Inputs" box "Business profile or free-text scenario + 1–5 policy PDFs" → Agent 1 "Risks with
reasons, confidence, evidence" → Agent 2 "Top-8 clauses per risk (policy, section, page)" → Agent 3
"Status per risk + potential-gap flag" → Agent 4 "Cited report, recommendations, Q&A". Replace the
note under the diagram with: "Profile path: with no LLM, rules and templates still produce a
complete, safe result. Scenario path: Agent 1 needs an LLM to read the text. Agents 2–4 are the
same for both.")

## 4.2 Technology Stack

**Table 3:** *Technology stack*

| Layer | Technology |
|---|---|
| Backend services | Python 3.13, FastAPI, Uvicorn, Pydantic v2 (+ pydantic-settings), httpx |
| LLMs | Google Gemini API (`google-genai`), Ollama (local `qwen3:8b` / `qwen3:4b`), used as Gemini's fallback or on its own |
| Documents and IR | PyMuPDF (PDF text and page rendering), pytesseract + Tesseract (OCR), scikit-learn (TF-IDF, cosine similarity), ChromaDB with the MiniLM ONNX embedding model (optional semantic retrieval) |
| Security | bcrypt, PyJWT (HS256), cryptography (Fernet) |
| Storage | SQLite (gateway: users, policies, business_profiles, analyses, scenario_analyses), encrypted files on disk (policies, processed chunks) |
| Frontend | React 18, TypeScript, Vite, React Router, TanStack Query, React Hook Form, Tailwind CSS with CSS-variable colour tokens (dark theme on screen, light palette for printing) |
| Testing | pytest (backend); Vitest, React Testing Library, MSW mock API and axe-core accessibility checks (frontend); ESLint, Prettier |
| Tooling | Start scripts for PowerShell and Bash, smoke test, demo-data seeding script |

## 4.3 Design Principles

1. **Agent 3 decides, Agent 4 explains.** The coverage status is decided from the retrieved
   evidence by Agent 3. Agent 4's LLM only writes the explanation and can never change a status,
   gap flag or citation.
2. **Every decision is tied to evidence.** Agent 3's LLM may propose a status only by citing
   clauses it was given; otherwise its answer is discarded and deterministic wording rules decide.
   Whether a status is a potential gap is always derived by code.
3. **The LLM is optional on the profile path.** Rules and templates produce a complete result with
   no model; the LLM improves wording and interpretation. (The scenario path needs an LLM to read
   free text, see 5.1.)
4. **Least data per hop.** The business name and full profile, or the scenario text, go only to
   Agent 1. Later agents receive only risks, IDs and clauses. Agent 4 receives the business type,
   never the name.
5. **Traceability.** One `request_id` per run, carried in every call and every log line. Logs hold
   IDs, stages, HTTP codes and timings, never profile, scenario or policy text.
6. **Fail safe.** If Agent 4 fails, the user still receives the coverage results, marked as
   partial. If the LLM is slow or unavailable, Agents 3 and 4 finish with rules and templates within
   their time budgets. Scenario risks that cannot be mapped safely stop the run instead of being
   guessed.

## 4.4 Repository Structure

The repository is organised as `agents/` (one folder per agent, each with its own tests),
`services/orchestration/` (gateway), `shared/` (models, schemas, LLM clients, security, settings),
`frontend/`, `scripts/` (start, seed, smoke test, fixtures), `tests/` (integration and evaluation),
`docs/` (architecture, API specification, input specification, risk taxonomy, Responsible AI,
commercialisation, demo script, screenshots) and `data/` (synthetic and adversarial sample
policies, glossary).

---

# 5. Methodology: The Agents

This chapter describes how each agent works. Each agent is a separate FastAPI service with a typed
request and response contract.

## 5.1 Agent 1: Risk Profiling Agent

**Endpoints:** `POST /api/v1/risk-profile` (business profile) and
`POST /api/v1/scenario-risk-profile` (free-text scenario). **Role:** turns a description of the
business into a list of business risks, each with a reason, a confidence value and the evidence
behind it.

### Risk taxonomy

Risks are chosen from a fixed taxonomy of 19 business risks in seven categories. The taxonomy
describes what can go wrong for the business, not insurance products; whether a policy covers a risk
is decided later. Each risk lists the business types it applies to, the types for which it is
assumed by default, and its indicators.

**Table 4:** *The 19-risk taxonomy by category*

| Category | Risks | Examples |
|---|---|---|
| Property | 3 | Theft, burglary and vandalism; flood, storm and water damage; goods damaged in delivery |
| Fire | 3 | Fire from cooking equipment; electrical fire; fire or explosion from combustibles |
| Equipment | 2 | Equipment breakdown; refrigeration failure and stock spoilage |
| Employee | 2 | Employee injury at work; employee theft or fraud |
| Business interruption | 3 | Closure after premises damage; utility outage; supplier disruption |
| Liability | 3 | Customer injury on premises; food-borne illness; harm caused by products sold |
| Cyber | 3 | Customer data breach; payment fraud; ransomware or system outage |

### Rule engine (profile path, always runs)

1. **Feature extraction.** The profile is converted into 30 indicator tags (e.g. `cash_handling`,
   `refrigeration`, `flood_prone_area`), each with evidence. Three sources are used in priority
   order: structured answers, the equipment list, and keywords in the free-text description.
   Keywords come from a lexicon file (`feature_lexicon.json`), matched as whole words or phrases
   with plurals after normalising case, hyphens and underscores.
2. **Explicit "No" wins.** Answering No (or 0 employees) removes a tag even if the description
   mentions it. "Not sure" is treated as unknown and adds or removes nothing.
3. **Matching.** A risk is identified if any of its indicators is present. Confidence = 0.6 + 0.1
   per matching indicator (maximum 0.9). The reason quotes the evidence, e.g. "(based on: ovens and
   refrigerators)".
4. **Baseline risks.** Some risks are assumed for a business type even without details (9 for food
   businesses, 6 for shops, 5 for services and "Other") at confidence 0.3, with a reason stating
   they were assumed.

### Optional LLM step (profile path)

When Gemini is configured, the profile (with personal details masked) and the list of allowed risks
are sent to the model, which suggests which risks apply, with reasons. Strict merge rules keep the
LLM in check: rule results are never removed; when rules and LLM agree the risk is marked `rule+llm`
(+0.1 confidence, maximum 0.95); an LLM-only risk is capped at 0.6 so it never outranks a rule
match; unknown risk IDs or confidence below 0.4 are discarded; and names and categories always come
from the taxonomy. If Gemini fails, rule results are returned with a warning.

The agent supports 11 business types in three groups (food and drink, shops, services) plus
"Other", where the owner describes the business in their own words and that text is also searched
for indicators.

### Scenario risk identification (scenario path)

For owners who would rather describe their situation than fill in a form, the scenario endpoint
reads up to 4,000 characters of free text, for example "We run a small bakery in Kandy with two
commercial ovens, a walk-in fridge and eight staff; we deliver cakes by van and the shop is close to
the river".

1. **Redaction.** E-mail addresses and long numbers are removed and prompt markers are stripped
   before the text reaches the model.
2. **Bounded extraction.** The configured LLM (Gemini or Ollama) is asked for insurance-relevant
   risks only, as JSON with a name, an approved category, a description, a reason, a confidence and
   evidence quoted from the scenario. The system instruction treats the scenario as untrusted data,
   forbids following instructions inside it, forbids inventing facts, and requires an empty list
   when there is no real exposure (e.g. "I enjoy cooking pasta" is not a risk).
3. **Validation.** The reply is parsed and validated against the `ScenarioRisk` model; duplicates
   and malformed items are dropped and at most 30 risks are read.
4. **Safe mapping (gateway).** An adapter in the gateway (`scenario_adapter.py`) maps each scenario
   risk onto the contract Agent 2 expects. Only categories with the same meaning in both
   vocabularies are mapped (property, liability, cyber). If the model returns any other category,
   the run stops with a clear error rather than assigning an invented category ("fail closed").

Unlike the profile path, the scenario path has no rule-based fallback: without an LLM it finds no
risks, the gateway skips Agents 2 and 3, and the user is told so.

## 5.2 Agent 2: Policy Intelligence Agent

**Endpoints:** `POST /api/v1/policies` (ingestion) and `POST /api/v1/retrieve-policy-evidence`
(retrieval). **Role:** ingests policy PDFs and retrieves the clauses most relevant to each risk. Its
information retrieval design is detailed in Chapter 7; the ingestion steps are summarised here.

1. **Validation:** the file content must start with the PDF signature `%PDF-` (not just the file
   name) and be at most 25 MB.
2. **Encryption:** the original PDF is stored encrypted with Fernet.
3. **Text extraction:** PyMuPDF reads each page; a page with fewer than 20 non-space characters is
   treated as scanned, rendered to an image and read with Tesseract OCR.
4. **Cleaning:** control characters removed, whitespace tidied, line breaks kept.
5. **Section detection:** heading-like lines are detected so each chunk carries its section name.
6. **Chunking:** overlapping windows of 800 characters with 120 characters of overlap, preferring
   paragraph breaks; chunks never cross a page, so page numbers are exact.
7. **Prompt-injection scan:** each chunk is scanned for instruction-like text. Suspicious chunks
   are flagged, not deleted, and the flag travels with the chunk. Agent 4 never sends a flagged
   chunk to its LLM; Agent 3 does not yet filter them (see 10 and 15.1).
8. **Indexing:** chunks are stored per business, so retrieval can only search that business's own
   policies.

## 5.3 Agent 3: Coverage & Gap Analysis Agent

**Endpoint:** `POST /api/v1/analyse-coverage`. **Role:** decides the coverage status of every risk
from the clauses Agent 2 retrieved. The five statuses are `covered`, `conditional` (covered with
conditions), `excluded`, `unclear` and `not_found`. The **potential gap** flag is always derived by
code from the final status, and is true for excluded, unclear and not found.

For each risk, Agent 3 follows these steps:

1. **No evidence:** the risk is `not_found` by rule (confidence 0.55), a potential gap. The LLM is
   not asked: missing wording is not proof of an exclusion, so the confidence is deliberately
   modest.
2. **Evidence, LLM configured:** the clauses are sent to the LLM interpreter (`interpreter.py`)
   inside `<EVIDENCE_DATA>` blocks that the prompt declares to be data, not instructions. The model
   must return JSON with a status, a reason, a confidence and the IDs of the clauses it relied on.
   The answer is rejected if it is not valid JSON, fails the schema, cites no clause, or cites a
   clause that was not supplied. A `not_found` answer when evidence exists is turned into
   `unclear`. Accepted answers are recorded with method `rules+llm`, and only the cited clauses are
   kept as the evidence for that risk.
3. **Evidence, no usable LLM:** if no LLM is configured, or the model's answer is rejected, a
   rule-based reading decides instead. The wording reader (`wording.py`) examines the sentences
   that mention the risk and matches insurance phrases: exclusion phrases ("not covered", "is
   excluded", "will not pay") → excluded; condition phrases ("only if", "subject to", "up to",
   "provided that") → conditional; cover phrases ("we will pay", "we will indemnify", "is covered")
   → covered; nothing recognisable → unclear. The matched phrases are returned with the
   assessment, and the method is recorded as `rules`.
4. **Provider fallback and time budget.** With `LLM_PROVIDER=gemini`, Agent 3 tries Gemini first;
   once Gemini fails (for example its free-tier rate limit), the rest of that request goes straight
   to the local Ollama model, without retrying Gemini. Agent 3 asks the LLM once per risk, one after
   another, so it stops starting new LLM calls after 90 s (`COVERAGE_LLM_BUDGET_SECONDS`), and as
   soon as no model can be reached at all; the remaining risks are read with the wording rules and a
   warning such as "The AI took too long, so 6 risks were read with the coverage rules instead." is
   added. This keeps Agent 3 well within the gateway's 300 s limit.

The rule-based reader is deliberately cautious: a risk is marked covered only if no relevant
sentence carries a condition or exclusion, and a mix becomes conditional. The reason quotes what it
relied on, so every rule-based decision can be checked by a human. An LLM decision is checkable in
the same way, because it must cite clauses the user can open in the evidence panel. Each
assessment records its method, confidence and reason, and the results show which method was used.

## 5.4 Agent 4: Explanation & Recommendation Agent

**Endpoints:** `POST /api/v1/generate-report` and `POST /api/v1/answer-question`. **Role:** turns
Agent 3's assessments into a plain-English report the owner can act on, and answers follow-up
questions. It explains decisions; it never makes them.

### Report generation: retrieval-augmented generation with validation

1. **Deterministic skeleton first.** For each risk, code builds the finding (title, status, gap
   flag, priority, "verify with your insurer" flag, confidence and cited evidence), all copied from
   Agent 3. Priority is high for not found and excluded, medium for unclear and conditional, and low
   for covered. Template wording alone gives a complete, safe report.
2. **Context building.** Flagged clauses are withheld from the model (the report still cites them,
   with a note to read the page directly). The remaining text is sanitised and wrapped in
   `<<<EVIDENCE…>>>` blocks that the system prompt declares to be data, not instructions.
3. **LLM call in batches of four findings.** The model returns JSON with only two fields per
   finding, `explanation` and `recommendation`, plus the chunk IDs it cites. Prompts are versioned
   files (`report_v1.txt`, `report_v2.txt`).
4. **Validation (checks V1–V9).** Every LLM item must pass all nine checks listed below; a failing
   item is dropped and that finding keeps its template text.
5. **Provider fallback and time budget.** As in Agent 3, a Gemini failure switches the rest of the
   report (or answer) to the local Ollama model without retrying Gemini, and the report records the
   model that actually answered. Agent 4 stops calling the LLM after 280 s and uses templates for
   the rest, so a complete report always arrives before the gateway's 600 s timeout.
6. **Transparency metadata.** Each finding records `generated_by` (llm or template); the report
   records the provider, model and how many findings used each kind of wording; a disclaimer is
   always included.

**Table 5:** *LLM output validation checks in Agent 4*

| Check | Rule enforced |
|---|---|
| V1 | JSON shape is correct |
| V2 | Known, non-duplicate risk |
| V3 | Every citation belongs to that finding's evidence |
| V4 | No citation without evidence |
| V5 | No blocked over-certain phrases ("definitely", "guaranteed", "fully covered", "you are protected", "100%"…) |
| V6 | Wording consistent with the status (an excluded risk may not be called "covered") |
| V7 | No echo of injected instructions |
| V8 | No markup or links |
| V9 | Length within limits |

### Question answering ("Ask about this analysis")

- The context is only the saved analysis: an overview of every risk with its final status, plus up
  to six of its clauses chosen for the question by keyword matching. Generic words such as "damage"
  and "loss" are ignored, and a glossary maps everyday words to insurance terms. Nothing is
  retrieved again.
- The question is scanned for prompt injection; a suspicious question never reaches the model and
  receives a fixed reply.
- The LLM answer is validated with V1, V2, V3, V5, V6, V7, V8 and V9 (at most 130 words; "is
  covered" only for covered or conditional risks). On failure, a rule-based answer is used: the
  related risks with their status and best clause, a glossary definition, or "this analysis does
  not answer that".
- If the analysis does not answer the question, the reply says so (`answerable: false`) with no
  citations. The model is told never to predict whether a claim will be paid.

## 5.5 Orchestration Gateway

- **Accounts:** registration with recorded consent, login, JWT sessions, one `business_id` per
  user.
- **Business profiles:** `GET`/`POST /api/v1/business-profiles` and
  `GET`/`PUT`/`DELETE /api/v1/business-profiles/{profile_id}` keep the user's businesses, up to 20
  per account, encrypted with Fernet in the `business_profiles` table. Another user's profile
  returns 404. A profile analysis picks one of them and sends its contents to the pipeline.
- **Policies:** forwards uploads to Agent 2 and records ownership.
- **Analyses:** `POST /api/v1/analyses` (profile) and `POST /api/v1/scenario-analyses` (scenario,
  10–4,000 characters) validate the input and the user's own policy IDs (1–5), respond
  **202 Accepted** immediately and run Agents 1 → 2 → 3 → 4 in a background task. Each stage's
  progress (counts only, with timings) is exposed at a status endpoint, which drives the agent
  workspace screen. For a scenario run only the first stage differs: the gateway calls Agent 1's
  scenario endpoint and maps the risks (5.1) before Agents 2–4 run unchanged.
- **Storage:** the final result of either kind is encrypted with Fernet and saved in SQLite (tables
  `analyses` and `scenario_analyses`); only summary columns (status, date, counts) are plain text
  for the History list, which shows both kinds together, newest first. After a gateway restart the
  status and result of a saved run are rebuilt from the stored copy. The scenario text itself is
  not stored, although a saved result can quote short parts of it as risk evidence. Failed runs are
  not saved.
- **Questions:** forwarded to Agent 4 with the saved analysis, after an ownership check.

## 5.6 Two Ways to Start an Analysis

The **New Analysis** screen asks how the business should be described. Both options use the selected
policies and produce the same coverage and report sections.

**Table 6:** *Profile and scenario analysis compared*

| | Business Profile (recommended) | Describe a Scenario |
|---|---|---|
| Input | A saved business profile: type, equipment, sales channels, yes/no/not-sure questions, location | Free text, 10–4,000 characters: activities, equipment, staff, customers, concerns |
| Steps in the app | 1. pick a saved business (or add one), 2. choose policies (or upload one), 3. review and run | Write the scenario, choose policies, review and run |
| Agent 1 method | Rule engine over the 19-risk taxonomy, optional Gemini enrichment | LLM extraction (Gemini or Ollama) with quotes from the text as evidence |
| Works without an LLM | Yes (rules and templates throughout) | No: no risks are found, and the user is told so |
| Agents 2–4 | Same pipeline | Same pipeline, after the gateway maps the risks |
| Results view | Report, Coverage and Risk profile tabs, Ask panel | Overview, Coverage, Risks and Evidence sections |
| Stored | Profile: encrypted (`business_profiles`); result: encrypted (`analyses`) | Result: encrypted (`scenario_analyses`); scenario text not stored |

The scenario mode lets owners whose business does not fit the form, or who have a specific concern,
describe it naturally. The cost is that risk identification is less deterministic than the rule
engine, so the profile mode remains the default recommendation.

---

# 6. Agent Communication Protocol

Agents communicate through RESTful HTTP/JSON APIs in a hub-and-spoke topology. The table below
summarises the protocol design.

**Table 7:** *Agent communication protocol*

| Aspect | Design |
|---|---|
| Transport | HTTP/1.1 with JSON bodies (REST); each agent is a FastAPI service on its own port |
| Topology | Hub and spoke: the gateway calls each agent and passes its result to the next; agents never call each other |
| Contracts | Typed request/response models in `shared/schemas/` and `shared/models/` (Pydantic v2), validated on both the sending and receiving side; unknown fields are rejected |
| Service authentication | Shared secret in the `X-API-Key` header; every agent endpoint rejects a missing or wrong key |
| Tracing | The gateway creates a `request_id` per upload, analysis or question, sent in the `X-Request-ID` header; agents must echo it back or the reply is treated as broken |
| Timeouts | 60 s per call for Agents 1–2 and uploads; 300 s for Agent 3 (it asks the LLM once per risk); 600 s for Agent 4; 150 s for questions |
| Errors | Agent unreachable → 503 `agent_unavailable`; too slow → 504 `agent_timeout`; agent error, wrong key or contract violation → 502; Agent 4 failure → 200 with status `partial` |
| Health | `GET /health` on every agent; `GET /health/agents` on the gateway reports each agent's state |
| Frontend ↔ gateway | REST with `Authorization: Bearer <JWT>`; status polling for long runs; consistent error body `{error, message, stage, request_id}` |

## 6.1 Message Sequence of One Analysis

The following sequence is shown to the user in the application's handoff log (timings are from the
mock API used for screenshots, not a measurement):

```
Gateway -> Agent 1  POST /api/v1/risk-profile                 business profile
Agent 1 -> Gateway  14 risks identified                       1.2 s
Gateway -> Agent 2  POST /api/v1/retrieve-policy-evidence     14 risks, 2 policies
Agent 2 -> Gateway  4 clauses found                           1.5 s
Gateway -> Agent 3  POST /api/v1/analyse-coverage             14 risks + 4 clauses
Agent 3 -> Gateway  14 risks assessed, 14 potential gaps      1.8 s
Gateway -> Agent 4  POST /api/v1/generate-report              14 assessments
Agent 4 -> Gateway  14 findings written (5 by AI)             3.5 s
```

A scenario analysis differs only in the first call: the gateway sends the scenario text to
`POST /api/v1/scenario-risk-profile`, and the log shows "scenario text" instead of "business
profile".

## 6.2 Why REST Rather Than MCP or A2A

The pipeline is a fixed, ordered sequence with typed inputs and outputs, so plain REST contracts are
simpler to secure, test and trace than a dynamic tool-discovery protocol such as MCP or a
peer-to-peer protocol such as A2A. Each agent can be developed, tested and deployed independently by
a different team member, and the gateway's hub role means one place enforces authentication,
ownership and logging. Contract tests on both sides catch any drift in the shared schemas.

## 6.3 Failure Handling

**Table 8:** *Failure handling*

| What fails | Result seen by the user |
|---|---|
| Agent 1, 2 or 3 down or too slow | The workspace names the failed step and offers "Retry analysis" (for profile and scenario runs) |
| Agent 4 down | Result marked Partial: coverage results complete, written report missing |
| Gemini fails (e.g. free-tier rate limit) | Agents 3 and 4 switch to the local Ollama model for the rest of that request; the results name the model that actually answered |
| LLM unavailable, slow or invalid | Agent 3 reads the remaining risks with its wording rules and Agent 4 uses template wording, each with a note; labels show which findings are AI-written |
| Scenario risk in a category with no safe mapping | The run stops with "Scenario risk identification could not be completed"; nothing is guessed |
| No risks identified (including a scenario run with no LLM) | Agents 2 and 3 skipped, with a warning |

---

# 7. Information Retrieval Module

Agent 2 implements the information retrieval (IR) component. Its corpus is strictly the current
business's own uploaded policies, and its unit of retrieval is a page-bounded chunk carrying policy,
section and page metadata so that every downstream statement can be cited precisely.

**Table 9:** *Information retrieval design*

| Aspect | Implementation |
|---|---|
| Corpus | The business's own uploaded policy PDFs only (per-business index) |
| Document processing | PDF text extraction (PyMuPDF), OCR fallback (Tesseract), cleaning, section detection |
| Indexing unit | Chunk of ~800 characters with 120 overlap, within one page; metadata: policy, section, page, flagged |
| Query formulation | Risk name + category synonyms from `synonyms.json` (e.g. fire → fire, flames, smoke, explosion…) |
| Ranking (default) | TF-IDF vectors + cosine similarity (scikit-learn, English stop words), fitted on candidate chunks of the selected policies; minimum score 0.1; top 8 per risk |
| Ranking (optional) | Dense embeddings (MiniLM ONNX via ChromaDB) in a temporary collection per call; cosine similarity; minimum 0.2 |
| Output | Ranked clauses with `chunk_id`, `policy_id`, section, page, text, score and the flagged marker |
| Downstream reuse | Q&A re-ranks an analysis's stored clauses by keyword overlap (no new retrieval) |
| Security | Retrieval is scoped by the `business_id` from the login, never from the request body; flagged chunks are carried with their flag so later agents can withhold them |

## 7.1 Ranking Method

In the default lexical mode, each risk query q and candidate chunk d are represented as TF-IDF
vectors, where the weight of term t is its frequency in the document multiplied by its inverse
document frequency across the candidate chunks. Relevance is the cosine of the angle between the two
vectors, sim(q, d) = (q · d) / (‖q‖ ‖d‖). Fitting the vectoriser on only the selected policies means
rare, policy-specific terms such as "refrigeration" or "burglary" carry more weight than words common
to every clause. Query expansion with category synonyms compensates for differences in wording
between the taxonomy and policy text.

The optional semantic mode replaces the sparse vectors with MiniLM sentence embeddings, which can
match clauses that express the same idea in different words (for example "escape of water" for a
flood-related query). It runs as an ONNX model with no PyTorch dependency and can be enabled with
`RETRIEVAL_BACKEND=semantic`.

## 7.2 Known Limitations

Retrieval precision and recall were not measured against a labelled clause set. A PDF with no
extractable text is currently stored as "ready" with 0 sections and then yields no evidence; the web
application shows "0 sections" to warn the user. Because Agents 3 and 4 can only use clauses Agent 2
retrieves, retrieval quality bounds the accuracy of the whole system.

---

# 8. Use of Large Language Models

LLMs are used in Agents 1, 3 and 4, each with a narrow, bounded task. The table below summarises
what each LLM may and may not do.

**Table 10:** *Bounded roles of the LLMs*

| Where | Model | LLM role | Not allowed | Without LLM |
|---|---|---|---|---|
| Agent 1 profile | Gemini | Suggests which taxonomy risks apply, with business-specific reasons | Add risks outside the taxonomy, remove rule results, outrank rule matches | Rules only |
| Agent 1 scenario | Gemini or Ollama | Extracts insurance-relevant risks from free text, quoting the words behind each | Follow instructions in the text, invent facts, use categories outside the approved list; unmappable categories stop the run | No risks (the user is told) |
| Agent 3 | Gemini, falling back to Ollama (or Ollama alone) | Reads the retrieved clauses for a risk and proposes its status, with a reason and the clauses relied on | Decide a risk with no evidence (that is `not_found` by rule); cite no clause or a clause it was not given; set the gap flag | Wording reader (`wording.py`) |
| Agent 4 report | Gemini, falling back to Ollama (or Ollama alone) | Writes explanation and recommendation per finding | Change status, gap flag, priority or citations; use blocked phrases; cite unknown clauses | Templates |
| Agent 4 Q&A | Gemini, falling back to Ollama (or Ollama alone) | Answers a question from the saved analysis | Use general knowledge, predict claim payment, cite clauses not shown | Rule-based answers |

The provider is configured with `LLM_PROVIDER=gemini|ollama`, `LLM_MODEL` and `OLLAMA_MODEL`; the
start scripts offer a `--no-llm` switch. With Gemini as the provider and an Ollama model available,
Agents 3 and 4 do not retry a failed Gemini call: the local model answers straight away for the
rest of that report or question. Prompts are versioned files or fixed in code, JSON output is
requested and validated, and Ollama's "thinking" mode is disabled for speed.

> **Practical constraint.** Gemini's free tier allows 20 requests per day for `gemini-3.5-flash`.
> One analysis uses one request for Agent 1, one per risk with evidence for Agent 3, and up to four
> Agent 4 batches, so a single analysis can use most of a day's free quota. After that, Agents 3 and
> 4 continue on the local Ollama model if one is running, and otherwise on rules and templates.

---

# 9. Natural Language Processing Techniques

The system combines classical, transparent NLP techniques with LLM-based interpretation and
generation. Rule-based techniques are always available wherever a decision affects the coverage
outcome, because they are deterministic and auditable.

**Table 11:** *NLP techniques used*

| Technique | Where | Detail |
|---|---|---|
| Text normalisation and cleaning | All agents | Control-character removal, whitespace collapsing, case and hyphen normalisation, alias mapping ("coffee shop" → cafe) |
| Lexicon-based keyword and phrase extraction | Agent 1 | 30 indicator tags, multi-word phrases, whole-word regex with plural handling, evidence kept per match |
| Text redaction | Agent 1 scenario | E-mail addresses and long numbers removed before the text reaches the LLM |
| LLM-based information extraction | Agent 1 | Structured JSON risks from a profile (validated against the taxonomy) or from free text (validated against the scenario risk model, with quoted evidence) |
| LLM-based clause interpretation | Agent 3 | Status, reason and cited clause IDs as validated JSON, grounded in the supplied clauses only |
| Rule-based text classification | Agent 3 | Phrase patterns classify clause sentences as exclusion, condition or cover; sentence selection by risk terms with a generic-word stop list |
| Document structure analysis | Agent 2 | Section-heading detection, paragraph-aware chunking with overlap |
| Optical character recognition | Agent 2 | Tesseract on pages without a text layer |
| Prompt-injection detection | Shared | Regex patterns for instruction-override phrasing, applied to clauses and questions |
| Query expansion | Agent 2, Agent 4 Q&A | Category synonyms; everyday-word map; insurance glossary |
| Grounded text generation (RAG) | Agent 4 | Generation only from cited evidence, with structured JSON output |
| Summarisation | Agent 4 | Report headline and plain-English summaries of clauses per finding |
| Readability measurement | Agent 4 evaluation | Flesch reading ease of AI-written text |

---

# 10. Security Features

Security was designed as a set of layered controls, each addressing a specific threat. The table
below maps threats to controls.

**Table 12:** *Threats and security controls*

| Threat | Control |
|---|---|
| Stolen passwords | bcrypt hashing; minimum 8 characters; 72-byte bcrypt limit enforced |
| Session hijacking | Short-lived HS256 JWTs (60 min) kept in `sessionStorage` (closing the tab ends the session); every 401 logs the user out |
| Password guessing | 5 failed logins per email in 15 minutes → locked for 15 minutes (429 with Retry-After); unknown emails counted the same way so the limit does not reveal which accounts exist |
| Access to another user's data | Every policy, business profile, analysis and scenario analysis checked against the logged-in user; another user's IDs return 404 before any agent is called; `business_id` never accepted from a request body |
| Direct calls to agents | Shared `X-API-Key` on every agent endpoint, including the scenario endpoint; only the gateway knows it |
| Data theft at rest | Policy PDFs, saved business profiles and all analysis results (profile and scenario) encrypted with Fernet |
| Malicious uploads | PDF signature check on file content; 25 MB limit |
| Malformed or oversized input | Pydantic validation with length limits on every field (scenario 10–4,000 characters); unknown fields rejected; text sanitised; 422 errors never echo submitted values |
| Prompt injection via policies | Chunks scanned and flagged at upload; Agent 4 withholds flagged clauses from its LLM, sanitises and fences the rest as data, and checks outputs for echoes (V7); Agent 3 fences clauses as data and accepts only answers that cite supplied clauses (it does not yet withhold flagged clauses, see 15.1) |
| Prompt injection via scenarios and questions | Scenario text fenced and declared untrusted, prompt markers stripped; questions scanned, and suspicious questions never reach the model |
| Abuse of the AI | 10 questions per user per minute; up to 20 saved business profiles per account; per-tier analysis limits in the commercial plan |
| Data leakage in logs | Logs contain IDs, stages, codes and timings only; never profile text, scenario text, policy text, prompts, questions or keys |
| Secret management | Secrets read from `.env` (not committed); login refused if `JWT_SECRET_KEY` is missing |

---

# 11. Responsible AI Implementation

Responsible AI was treated as a design constraint rather than an afterthought. Because the system
talks about insurance cover, an overstated answer could lead an owner to skip insurance they need,
so the most important principle is that the AI must never claim more than the policy says.

## 11.1 Explainability

- Every coverage status shows the exact clause it is based on (policy file, section and page).
- Every risk shows why it was identified (the profile answers, or the words of the scenario, behind
  it) and whether rules or AI found it.
- Every coverage assessment records whether it came from the rules or from the LLM interpreter, and
  an LLM decision must cite the clauses it relied on.
- The evidence panel shows which agent produced each part of a result.
- Agent 3's rule-based reader quotes what it relied on and the phrases it matched.

## 11.2 Transparency

- Each finding and answer is labelled **AI-written** or **Template**; the results header names the
  model used (e.g. "AI used: qwen3:4b via Ollama, report: 8 of 13 findings"). When Gemini fails and
  Ollama takes over, the model that actually answered is the one named.
- The agent workspace shows each analysis stage, and its technical details show every message
  between the gateway and the agents, with counts only.
- Confidence is shown in words (High, Medium, Low) rather than a falsely precise percentage.
- Warnings state when AI wording was unavailable, when Agent 3 read risks with its rules because the
  AI was slow or unavailable, or when a clause was withheld; a disclaimer is always visible: decision
  support, not a legal or binding coverage decision.
- A public **Responsible AI page** in the app (`/responsible-ai`, linked from the landing page)
  explains to owners in plain language where AI is used, what keeps it to the evidence, how it was
  tested and its known limits.

## 11.3 Human Oversight and Safety by Design

- Coverage decisions are bounded: a risk with no evidence is `not_found` by rule; an LLM status is
  accepted only when it cites clauses it was given; otherwise the deterministic wording rules
  decide. The potential-gap flag is always computed by code from the status.
- Agent 4's LLM can never change a status, gap flag or citation: deterministic code copies Agent 3's
  results into the report.
- Every Agent 4 LLM output passes validation (V1–V9); failures fall back to safe template text.
- Over-confident language is blocked, and non-covered findings always tell the user to verify with
  the insurer.
- The Q&A refuses to predict claim outcomes and says when a question is out of scope.
- Scenario risks whose category cannot be mapped safely stop the run instead of being forced into
  the wrong category.

## 11.4 Fairness

- Risks are assigned by transparent, documented rules from business attributes (type, equipment,
  operations, location), not from personal or demographic data.
- "Not sure" is never treated as "No", so missing knowledge does not silently remove a risk.
- Businesses that do not fit a listed type can choose "Other", or describe a scenario in their own
  words, and receive general risks plus whatever their description indicates.
- The same profile always yields the same rule-based risks; LLM suggestions cannot remove or
  outrank them.

A formal fairness evaluation across business types has not yet been carried out and is listed as
future work. Scenario risks and Agent 3's LLM statuses come from a model and can vary between runs;
their consistency has not been evaluated.

## 11.5 Privacy and Data Protection

- **Consent:** an account cannot be created without agreeing to the privacy and data-processing
  notice, which explains when clauses and questions are sent to an AI provider. The notice version
  and time of agreement are stored with the account.
- **Data minimisation:** the business name never reaches Agents 2–4; later agents receive only risks
  and clauses; the scenario text itself is not stored (a saved scenario result can quote short parts
  of it as evidence).
- **Saved profiles:** business profiles are saved to the user's account only, encrypted, and can
  be edited or deleted on the Businesses page; nothing about the profile is kept in the browser.
- **Redaction:** e-mail addresses and long numbers are removed from scenario text before it reaches
  an LLM, and personal details in a profile are masked before Agent 1's LLM step.
- **Protection:** encryption at rest of PDFs, profiles and all results, and per-user isolation.
- **Local-model option:** with `LLM_PROVIDER=ollama`, no policy, scenario or question text leaves the
  machine. With Gemini, clauses and questions go to Google's API, falling back to the local model
  when Gemini fails.
- Questions and answers are not stored, and question text is never logged.

## 11.6 Accessibility and Inclusive Design

Status is shown with both colour and text, and "Not found" uses an outlined badge so it can be told
apart from "Excluded" without relying on colour. The interface uses a dark theme on screen and
switches to a light, high-contrast palette when printed, so a printed or PDF report is dark text on
white paper. It supports keyboard navigation (the closed mobile menu is removed from the tab order),
focus management in dialogs and menus, a step indicator that marks the current step for screen
readers, and screen-reader announcements for progress; navigation landmarks have unique names;
automated axe-core accessibility tests run in the test suite; and the layout works down to a 360 px
phone width.

---

# 12. User Interface

Users interact with InsureIntel through a React web application with a dark theme, a sidebar
(Overview, Businesses, Policies, History, Settings and a New Analysis button) and a header showing
live agent status ("All services up") and an account menu. Colours are CSS variables, so the same
pages print in a light palette. A mock API (`npm run dev:mocks`) built from real agent outputs lets
the profile flow run and be tested without the back end; scenario runs need the back end.

**Table 13:** *Application screens and routes*

| Screen | Route | Purpose |
|---|---|---|
| Landing | `/` | Value proposition, how the four agents work, an example finding, Responsible AI and pricing |
| Responsible AI | `/responsible-ai` | Plain-language notes on where AI is used, its checks and its limits |
| Register / Log in | `/register`, `/login` | Account creation with password guidance and the privacy consent checkbox |
| Overview | `/app` | Greeting, key figures, setup checklist (business, policies, first analysis) and latest analysis |
| Businesses | `/app/businesses` | The businesses saved to the account: analyse, edit or delete each |
| Business profile | `/app/businesses/new`, `/app/businesses/:profileId` | The three-part profile form (business, operations, location) |
| Policies | `/app/policies` | Drag-and-drop PDF upload; sections and flagged-section warnings per policy |
| New analysis | `/app/analyses/new` | Choose Business Profile or Describe a Scenario |
| Profile analysis | `/app/analyses/new/profile` | Three steps: pick a business, choose policies (or upload one), review and run |
| Scenario analysis | `/app/analyses/new/scenario` | Write the scenario, choose policies, review and run |
| Agent workspace | `/app/analyses/:id/progress` | Four analysis stages; technical details with agent cards and the handoff log; retry |
| Results | `/app/analyses/:id` | Report, Coverage and Risk profile tabs, evidence panel, Ask panel; scenario runs show Overview, Coverage, Risks and Evidence |
| History | `/app/analyses` | Profile and scenario runs together, newest first |
| Settings | `/app/settings` | Account details, responsible-use notes and log out |

## 12.1 Public Pages and Registration

The landing page explains the product with a sample agent run and links to the example finding, the
Responsible AI page and pricing. Registration enforces password rules in the form and cannot be
completed without agreeing to the privacy and data-processing notice.

**Figure 3:** *Landing page with a sample agent run* — `01-landing.png`

**Figure 4:** *Registration with password checks and privacy consent* — `03-register-consent.png`

## 12.2 Workspace Overview, Businesses and Policies

After logging in, the Overview shows the state of the workspace at a glance and a three-step setup
checklist (business, policies, first analysis), with the latest analysis summarised on the right.
The Businesses page lists the businesses saved to the account; each can be analysed, edited or
deleted, and they stay available after logging out. A business profile is entered in three parts
(business, operations, location); "Not sure" answers are allowed throughout. On the Policies page,
each upload shows its pages, sections and status, and any section containing instruction-like text
is flagged with a warning that it is kept as policy wording.

**Figure 5:** *Overview: key figures, setup checklist and latest analysis* — `04-dashboard.png`

**Figure 6:** *Businesses: profiles saved to the account* — `22-businesses.png`

**Figure 7:** *Business profile form (business, operations, location)* — `05-business-profile.png`

**Figure 8:** *Policies, with a flagged-section warning on the second upload* — `06-policies.png`

## 12.3 Starting an Analysis

New Analysis first asks how to describe the business. The profile route then runs in three steps:
pick one of the saved businesses (or add a new one), choose up to five ready policies (a missing
policy can be uploaded inside this step and is ticked automatically), and review the business and
policies before starting. Each step is kept in the page address, so the browser's Back button
returns to the previous step and a reload keeps the choices. The scenario route provides a text box
(with a 4,000-character counter) and the policy selection, followed by a review step.

**Figure 9:** *New analysis: choose a business profile or describe a scenario* —
`07-new-analysis.png`

**Figure 10:** *Profile analysis, step 1: pick a saved business* — `17-new-analysis-profile.png`

**Figure 11:** *Profile analysis, step 2: choose policies or upload another* —
`23-new-analysis-policies.png`

**Figure 12:** *Profile analysis, step 3: review and run* — `24-new-analysis-review.png`

**Figure 13:** *Scenario analysis: describe the business in free text and select policies* —
`18-scenario-analysis.png`

## 12.4 Agent Workspace

Once started, the analysis runs on the server and the agent workspace polls its status. The main view
shows the four stages in plain language ("Identifying your risks", "Checking your policies",
"Assessing coverage", "Preparing your report") with each result. **Show technical details** reveals
each agent's card and the handoff log of every gateway–agent message, with counts and timings only.
The user can leave the page; the result is saved to History.

**Figure 14:** *Agent workspace while Agent 3 is running* — `08-agent-workspace-running.png`

**Figure 15:** *Completed run with technical details: agent cards and handoff log* —
`09-agent-workspace-complete.png`

## 12.5 Results

The results header gives the headline ("14 risks checked, 13 potential gaps…"), a status bar with
counts, the model used and how many findings it wrote, and the decision-support disclaimer. The
Report tab groups findings by priority, each labelled AI-written or Template. The Coverage tab lists
every risk with its status, gap flag, confidence, reason and method (rules, or rules and AI), and
can be filtered; clicking a risk opens the evidence panel with the reason, the recommendation, the
quoted policy wording (policy, section, page) and which agent did what. The Risk profile tab shows
why each risk was identified. Below the tabs, the **Ask about this analysis** panel answers
questions using only this analysis and the policy wording it found, citing the clauses used.
Scenario runs have their own report page with Overview, Coverage, Risks and Evidence sections, built
from the same Agent 3 and Agent 4 outputs.

**Figure 16:** *Results: headline, status counts, disclaimer and a prioritised finding* —
`10-results-report.png`

**Figure 17:** *Coverage tab filtered to potential gaps* — `11-results-coverage.png`

**Figure 18:** *Evidence panel for an excluded risk* — `12-evidence-panel.png`

**Figure 19:** *Risk profile grouped by category, with the evidence behind each risk* —
`13-results-risk-profile.png`

**Figure 20:** *Ask panel: an answer with the policy wording it used* — `14-ask-panel.png`

**Figure 21:** *Scenario analysis report* — `19-scenario-report.png`

## 12.6 History, Printing, Account and Mobile

History lists profile and scenario runs together, newest first, with status (including Partial
runs) and gap counts. **Print report** produces the whole report on white pages without the app's
navigation, so it can be saved as a PDF and shared with a broker. The account menu opens from the
avatar, and the layout adapts to phone widths.

**Figure 22:** *History of profile and scenario analyses* — `15-history.png`

**Figure 23:** *Printed report in the light print palette* — `20-printed-report.png`

**Figure 24:** *Account menu* — `21-account-menu.png`

**Figure 25:** *Coverage results on a phone* — `16-results-phone.png`

## 12.7 Responsible AI Page

The public Responsible AI page explains, for business owners rather than developers, where each
agent uses AI, how coverage decisions are kept to the evidence, the checks against made-up or
over-confident text, how hidden instructions in documents are handled, how each result can be
traced, fairness, privacy, how the system was tested, its known limits, and that the owner stays in
charge. Every statement on it describes what the code actually does; the technical version is
`docs/responsible-ai.md` in the repository.

**Figure 26:** *In-app Responsible AI page (top of the page)* — `25-responsible-ai.png`

---

# 13. Evaluation and Results

The system was evaluated at four levels: automated tests of every component, an offline evaluation
of the explanation agent on two models, a live check of question answering, and live end-to-end runs
of the whole pipeline. All policy wording used is synthetic, written by the team.

## 13.1 Automated Tests

**Table 14:** *Automated test results*

| Suite | Result (8 October 2026) |
|---|---|
| Backend (pytest): unit, API, contract, integration and end-to-end tests across all agents and the gateway, including a test that runs the gateway with all four real agents in-process; tests that saved scenario analyses and business profiles are encrypted, survive a gateway restart and stay private to their owner; and tests of Agent 3's LLM budget and of the Gemini-to-Ollama fallback in Agents 3 and 4 | **1,150 passed, 0 failed** |
| Frontend (Vitest, React Testing Library, MSW, axe-core accessibility checks), including the three-step profile analysis, the Businesses page, the Responsible AI page and the scenario flow (review, start, report, retry) | **226 passed, 0 failed** (24 test files) |

The tests need no network, API keys or LLM. LLMs are replaced by fakes, including deliberately
misbehaving ones (invalid JSON, uncited or invented clause IDs, rate-limit errors, slow answers),
so that every fallback path is exercised.

## 13.2 Explanation Agent Evaluation

The script `tests/evaluation/eval_explanation.py` ran nine cases: three main fixtures (mixed
statuses, all covered, prompt injection), five edge cases (assessment without risk, risk without
assessment, HTML in a clause, a very long clause, a missing section) and one request produced by the
real Agent 1 → 3 pipeline (13 risks), giving 29 findings in total, one run per case.

**Table 15:** *Agent 4 evaluation results (qwen3:8b on 25 Sep 2026; Gemini on 5 Oct 2026)*

| Metric | qwen3:8b (local CPU), prompt v1 | gemini-3.5-flash, prompt v1 |
|---|---|---|
| LLM acceptance rate (AI wording kept) | 62.1% (18 of 29) | **100% (29 of 29)** |
| Citation validity before validation | 100% (21 of 21) | 100% (21 of 21) |
| Status consistency (output = Agent 3) | 100% | 100% |
| Injection resistance | 2 / 2 | 2 / 2 |
| Rejections | V6 contradicts status: 6; V5 blocked phrase: 4; V1 shape: 1; missing: 1 | None |
| Mean latency per report | 3.8 min (max 15.2 min for 13 findings) | 24.5 s (max 70.9 s) |
| Mean words per AI explanation | 28.8 | 47.8 |
| Flesch reading ease (AI text) | 50.0 | 42.3 |

### Interpretation

- The safety design held on both models: no invented citations, no status changes and no injected
  wording. Every rejected item was replaced by template text, so every report was complete.
- With the small local model, the weak point was wording (phrasing that contradicts the status, or
  blocked phrases), which the validator caught. Gemini produced no rejections but longer,
  harder-to-read text: a Flesch score of 42.3 is below the 60–70 range typical of plain English.
- A local model on CPU takes minutes per report, which justifies Agent 4's 280 s LLM budget.

A second prompt version (`report_v2`) tells the model exactly how to word each status and lists
phrases to avoid. Its evaluation on Gemini was started but stopped by the free-tier daily quota, so a
v1 versus v2 comparison is reported as future work.

## 13.3 Question Answering Live Check

On 4 October 2026, 12 different questions were asked 16 times against the synthetic bakery and
injection fixtures using `gemini-3.5-flash` and prompt `qa_v1`. Questions covered named risks,
everyday wording, gaps, conditions, a claim question, a term definition, an off-topic question, an
injection attempt and "Am I fully protected against everything?".

**Table 16:** *Question answering live check*

| Aspect | Result |
|---|---|
| LLM answers accepted | 11 of 15 attempts; the other 4 hit Gemini's rate limit and received rule-based answers; none rejected by the checks |
| Grounding | Every statement matched the clause text; sections and pages correct |
| Status wording | Excluded and not-found risks described as potential gaps, never "covered" |
| Claim question | Answered that only the insurer can confirm whether a specific claim will be paid |
| Off-topic question | `answerable: false`, no citations |
| Injection | Suspicious question answered without the model in 0 ms; flagged clause never reached the model |
| Latency | 3–12 s per answer |

Two improvements were made from these findings: generic words ("damage", "loss") were excluded from
clause matching after a flood question also pulled in the fire clause, and glossary answers were
added for definition questions. The rate-limit failures also led to the Gemini-to-Ollama fallback
described in 5.4: with a local model running, a rate-limited question is now answered by that model
instead of the rule-based answer.

## 13.4 Live System Checks

- Full pipeline with all five services and no LLM: complete result; the sixth wrong login returned
  429; stopping Agent 4 gave a `partial` result with complete coverage results.
- Full pipeline with `qwen3:4b` on a 16 GB laptop (CPU only): complete report in 356–378 s, with 8
  of 13 findings AI-written and the rest using templates after the 280 s budget.
- With too little free memory, Ollama could not load the model; Agent 4 fell back to 13 template
  findings and the interface correctly stated that no AI model was used.
- A 570 s Agent 4 response passed through the web application without timeouts.
- After Agent 3's LLM interpreter was switched on, an 18-risk analysis on Gemini's free tier ran past
  the gateway's flat 60 s limit and failed at the coverage stage. This led to Agent 3's own 300 s
  timeout and 90 s LLM budget, and to the Gemini-to-Ollama fallback; both are covered by automated
  tests (13.1).
- The redesigned interface was checked in a browser against the mock API: every screen in Chapter
  12, the three-step analysis flow, the account menu and log out, and the printed report (generated
  as a PDF: every section on white pages, without the sidebar or header).

## 13.5 Not Yet Evaluated

The following were not measured and are acknowledged honestly: retrieval precision and recall of
Agent 2 against labelled clauses; the accuracy of Agent 3's statuses against expert labels, for both
the LLM interpreter and the wording rules, and the consistency of its LLM statuses across repeated
runs; Agent 1's risk identification against expert judgement, for both profiles and scenarios; the
consistency of scenario risk identification across repeated runs; and studies with real SME users.

---

# 14. Commercialisation Plan

## 14.1 Target Users and Market

The launch market is Sri Lanka, with prices in Sri Lankan rupees (LKR). Three customer segments were
identified:

**Table 17:** *Customer segments*

| Segment | Pain point | Who pays |
|---|---|---|
| Owner-run shops, cafés, salons | No time or expertise to read policies | The owner, monthly |
| Growing SMEs (10–50 staff, several policies) | Overlapping policies, renewals | The business, monthly or yearly |
| Insurance brokers and agents | Reviewing many clients' policies by hand | The broker, by volume |

## 14.2 Pricing Model

InsureIntel uses a **freemium subscription** model with four tiers. Yearly plans give two months
free.

**Table 18:** *Pricing tiers*

| Tier | Monthly (LKR) | Yearly (LKR) | Includes |
|---|---|---|---|
| Free | 0 | 0 | 2 policy PDFs, 2 analyses/month, coverage status and cited clauses, template explanations |
| Starter | 2,490 | 24,900 | 10 PDFs, 10 analyses/month, AI-written explanations and next steps, full history |
| Business (most popular) | 6,990 | 69,900 | 30 PDFs, 40 analyses/month, questions about each analysis, print-ready reports |
| Broker | 19,990 | 199,900 | 200 analyses/month, up to 25 client businesses (planned), priority processing, support within one working day |

**Figure 27:** *Pricing section of the landing page* — `02-pricing.png`

**Rationale.** The Free tier uses rules and templates only and therefore has no AI cost, so it costs
almost nothing to offer while still showing a real cited finding. The question feature sits in
Business because it makes the most LLM calls. A broker serving 25 SMEs pays under LKR 800 per client
per month. Saved business profiles already let one account keep several businesses, a first step
towards the planned broker workspace. The prototype takes no payments; prices are shown on the
landing page only.

## 14.3 Unit Economics

The following figures are planning assumptions, not measurements:

**Table 19:** *Unit economics (assumptions)*

| Item | Assumption | Monthly cost (LKR) |
|---|---|---|
| Hosting (gateway, four agents, database) | One small cloud VM | ~15,000 |
| LLM calls | Gemini Flash on a paid tier; a 14-risk analysis (Agent 3 per risk, Agent 4 report) plus a few questions | Well under 30 per analysis |
| Storage | Encrypted PDFs, profiles and results | < 1,000 |

About ten paying Starter accounts cover the fixed hosting cost. Running the agents on a local model
removes per-call LLM cost at the expense of slower reports, an option for brokers with
data-residency concerns.

## 14.4 Go-to-Market Strategy

1. **Free tier first:** owners try one policy and see a real cited finding.
2. **Brokers as a channel:** brokers use InsureIntel with their SME clients and upgrade them.
3. **Partnerships:** chambers of commerce and SME associations (newsletters, workshops).

## 14.5 Deployment Proposal

The following deployment design is proposed and has not yet been built:

- **Containers:** the gateway and each agent are already separate services, so each can become a
  container (Docker Compose on one VM at launch; Kubernetes or a managed container service later),
  scaled independently, with Agents 3 and 4 (the LLM-heavy ones) the slowest.
- **Network:** only the gateway exposed, behind HTTPS (reverse proxy with TLS); agents on a private
  network; secrets from a secrets manager instead of `.env`.
- **Frontend:** the React production build served as static files from a CDN.
- **Data:** SQLite replaced by managed PostgreSQL; encrypted object storage for PDFs; rotation of
  the Fernet key.
- **Scaling state:** analysis progress, login lockout and the question rate limit are currently in
  memory in one gateway process; several gateway instances would need a shared store (e.g. Redis)
  and a job queue.
- **LLM options:** Gemini on a paid tier for speed, with the existing automatic fallback to a local
  model; a GPU server running Ollama for brokers who need data to stay in-country.
- **Operations:** existing health endpoints support monitoring, and logs are already free of
  personal data.

## 14.6 Commercial Risks

- The product is decision support, not advice; selling it as advice would require a regulated
  insurance partner.
- Policies are sensitive data; encryption, consent and the local-model option address this.
- Usage limits per tier keep LLM costs below revenue as usage grows.

---

# 15. Limitations and Future Work

## 15.1 Limitations

- **Accuracy depends on retrieval:** a clause Agent 2 does not retrieve cannot be used by Agents 3
  and 4, and TF-IDF retrieval can miss clauses worded differently.
- **Agent 3's LLM statuses are checked for grounding, not for correctness:** the model must cite
  clauses it was given, but a cited clause can still be misread. The status is shown with its
  clause and the "verify with your insurer" message is the backstop. These statuses have not been
  evaluated against expert labels.
- **Agent 3 does not yet withhold flagged clauses** from its LLM prompt the way Agent 4 does; they
  are fenced as data and the answer must cite supplied clauses, but an instruction-like clause can
  still reach the model.
- **Agent 4's validators check form, not meaning:** a fluent sentence that slightly overstates a
  clause can pass; the disclaimer and "verify with your insurer" message are the backstop.
- **The rule-based wording reader** handles common phrasing only; anything else becomes "unclear".
- **Keyword matching in Agent 1** has no grammatical understanding ("we do not deliver" still
  matches delivery).
- **The scenario path depends on an LLM:** without one it finds no risks, and its results can vary
  between runs.
- **Scenario category mapping is narrow:** only property, liability and cyber risks can be passed to
  Agent 2, so a scenario whose risks fall in other categories (e.g. business interruption or health)
  stops with an error instead of being analysed.
- **LLM constraints:** local LLMs on CPU are slow, and Gemini's free tier is limited to 20 requests
  per day per model, which one analysis can largely use up now that Agent 3 asks once per risk.
- **Text-less PDFs:** scanned PDFs where OCR yields no text produce 0 sections and no evidence, yet
  are marked "ready".
- **In-memory state** (progress of running analyses, rate limits) is lost on restart and not shared
  between instances; finished analyses and saved profiles are kept.
- **Synthetic data only;** no real-user or expert evaluation yet.

## 15.2 Future Work

- Agent 3: withhold flagged clauses from the LLM prompt (as Agent 4 does), evaluate the LLM
  interpreter and the wording rules against expert-labelled clauses.
- Evaluate prompt `report_v2` against v1 and choose the production prompt (Agent 4).
- Agent 2: mark text-less PDFs as failed or warn the user; validate `business_id`; log the request
  ID.
- Agent 1: support Ollama as well as Gemini on the profile path; add proper linguistic processing
  (e.g. spaCy for negation handling) or remove it from the requirements.
- Scenario path: map scenario risks onto all seven taxonomy categories (or onto the 19 taxonomy
  risks themselves), add a rule-based fallback, and evaluate it against expert judgement.
- Evaluate retrieval with a labelled clause set and explore hybrid TF-IDF + semantic ranking.
- Expert-labelled evaluation of coverage statuses, a fairness evaluation across business types, and
  a user study with SME owners.
- Multi-client broker workspace (building on saved business profiles), payments and password
  reset.

---

# 16. Conclusion

InsureIntel shows that a multi-agent system can make insurance policies understandable to SME owners
while keeping every AI step tied to evidence. By separating responsibilities across four agents
(risk profiling, retrieval, coverage decision and explanation) and connecting them through a
secured, traceable REST protocol, the system makes sure that every coverage status cites a specific
clause, section and page, that the potential-gap flag is always computed by code, and that the
model writing the report can never change what was decided. Owners can start from a business saved
to their account or simply describe their business in their own words, and both routes lead to the
same evidence-based report. When an LLM is slow, rate-limited or missing, the system falls back
from Gemini to a local model, and from there to deterministic rules and templates, so a complete
result is always produced.

The evaluation supports the central design choice: on both a small local model and Gemini, the
validator and deterministic skeleton produced reports with 100% citation validity and status
consistency and resisted every injection test case, even when the model's own wording was rejected.
The main open questions concern accuracy rather than safety: retrieval quality, the accuracy of
Agent 3's coverage statuses against experts, the breadth and consistency of scenario risk
identification, and validation with real users, all identified as next steps. With a freemium
pricing model and brokers as a channel, the system has a clear path towards the Sri Lankan SME
market.

---

# References

[1] Google (2026) *Gemini API documentation*. Available at: https://ai.google.dev/ (Accessed:
October 2026).

[2] Ollama (2026) *Ollama documentation*. Available at: https://ollama.com/ (Accessed: October
2026).

[3] FastAPI (2026) *FastAPI documentation*. Available at: https://fastapi.tiangolo.com/ (Accessed:
October 2026).

[4] Pydantic (2026) *Pydantic v2 documentation*. Available at: https://docs.pydantic.dev/
(Accessed: October 2026).

[5] Pedregosa, F. et al. (2011) 'Scikit-learn: Machine learning in Python', *Journal of Machine
Learning Research*, 12, pp. 2825–2830.

[6] Salton, G. and Buckley, C. (1988) 'Term-weighting approaches in automatic text retrieval',
*Information Processing & Management*, 24(5), pp. 513–523.

[7] Manning, C.D., Raghavan, P. and Schütze, H. (2008) *Introduction to Information Retrieval*.
Cambridge: Cambridge University Press.

[8] Lewis, P. et al. (2020) 'Retrieval-augmented generation for knowledge-intensive NLP tasks',
*Advances in Neural Information Processing Systems*, 33, pp. 9459–9474.

[9] Reimers, N. and Gurevych, I. (2019) 'Sentence-BERT: Sentence embeddings using Siamese
BERT-networks', *Proceedings of EMNLP-IJCNLP 2019*, pp. 3982–3992.

[10] OWASP Foundation (2025) *OWASP Top 10 for Large Language Model Applications*. Available at:
https://genai.owasp.org/ (Accessed: October 2026).

[11] Flesch, R. (1948) 'A new readability yardstick', *Journal of Applied Psychology*, 32(3), pp.
221–233.

[12] Jones, M., Bradley, J. and Sakimura, N. (2015) *RFC 7519: JSON Web Token (JWT)*. IETF.

---

# Appendix A: Key Figures

**Table 20:** *Key figures*

| Item | Value |
|---|---|
| Agents and services | 4 agents + 1 gateway (5 FastAPI services) + React web app |
| Ways to start an analysis | 2 (saved business profile, free-text scenario) |
| Risk taxonomy | 19 risks, 7 categories, 30 indicator tags |
| Business types | 11 + Other |
| Saved business profiles | Up to 20 per account, encrypted |
| Scenario length | 10–4,000 characters |
| Coverage statuses | 5 (covered, conditional, excluded, unclear, not found) |
| Policies per analysis | 1–5 |
| Maximum PDF size | 25 MB |
| Chunk size / overlap / top-k | 800 / 120 characters / 8 |
| LLM validator checks | V1–V9 (report); 8 of them for Q&A |
| Agent 3 LLM budget | 90 s (then wording rules) |
| Agent 4 batch size / LLM budget | 4 findings / 280 s |
| Timeouts | Agents 1–2: 60 s; Agent 3: 300 s; Agent 4: 600 s; questions: 150 s |
| JWT lifetime | 60 minutes |
| Login lockout | 5 failures / 15 minutes |
| Question rate limit | 10 per user per minute |
| Question length / answer length | 3–500 characters / at most 130 words |
| Tests | 1,150 backend + 226 frontend (all passing) |
| Pricing (LKR per month) | 0 / 2,490 / 6,990 / 19,990 |

# Appendix B: Glossary

| Term | Meaning |
|---|---|
| SME | Small or medium-sized enterprise |
| Coverage gap | A business risk the policies exclude, do not mention, or do not clearly cover |
| Business profile | A structured description of a business (type, equipment, operations, location), saved to the user's account |
| Scenario analysis | An analysis that starts from the owner's own description of the business instead of a structured profile |
| Chunk / clause | A section of policy text stored and retrieved as one unit |
| Grounding check | Accepting an LLM answer only if every clause it cites is one it was given |
| RAG | Retrieval-augmented generation, where an LLM writes only from retrieved evidence |
| Prompt injection | Text in a document, scenario or question that tries to give the AI new instructions |
| Template wording | Fixed, pre-written explanation text used when the AI is not used or its output fails validation |
| Hub and spoke | All agent messages go through the gateway; agents never talk to each other directly |
| TF-IDF | Term frequency–inverse document frequency, a term-weighting scheme for lexical retrieval |

# Appendix C: Running the System

The repository README covers installation, configuration (three secrets and the LLM options),
starting all services, the web application, the demo account, mock mode, the smoke test and the test
suites. In outline:

```
python -m venv venv
pip install -r requirements.txt
# copy .env.example to .env and set INTERNAL_API_KEY, DOCUMENT_ENCRYPTION_KEY, JWT_SECRET_KEY
# optional LLM: LLM_PROVIDER=gemini (GEMINI_API_KEY; keep Ollama running as the fallback)
#           or  LLM_PROVIDER=ollama (OLLAMA_MODEL, e.g. qwen3:4b on a 16 GB laptop)
bash scripts/start_agents.sh                 # or .\scripts\start_agents.ps1
bash scripts/start_agents.sh --no-llm        # rules and templates only (no scenario risks)
cd frontend && npm install && npm run dev    # http://127.0.0.1:5173
npm run dev:mocks                            # UI with the built-in mock API, no backend
python scripts/smoke_test_gateway.py         # end-to-end check of all four agents
pytest                                       # backend tests;  npm test for the frontend
```

Tesseract must be installed separately for OCR of scanned PDFs (otherwise set
`OCR_ENABLED=false`). `python scripts/seed_demo.py` creates the demo account
`demo@insureintel.test` with two policies and a finished analysis; the same account works in mock
mode, where it also has the saved business "Sunrise Bakery". Scenario analyses need the real back
end.
