# Risk Assessment — Student 4 (Information Retrieval & Security)

Every test result that is not a clean pass, rated with the method below. Test numbers refer to
`test-log.md`; evidence files are in `evidence/`.

## 1. Rating method
Impact and Likelihood are each rated High, Medium or Low; the matrix gives the Risk Level.
Informational = no exploitable impact in the current deployment.

| Impact | Meaning in this system |
|---|---|
| High | Wrong coverage conclusion presented as evidence-backed, loss of policy content, or another business's data exposed |
| Medium | Degraded or misleading output that is still flagged or recoverable, or limited availability loss |
| Low | Minor disclosure, inconsistency or reliability issue with no direct effect on decisions |

| Likelihood | Meaning |
|---|---|
| High | Happens in normal use with no attacker, or reproduced on the first ordinary attempt |
| Medium | Needs a specific but realistic condition (common document format, a restart, knowing an email) |
| Low | Needs deliberate crafting plus a privileged position (local access, a leaked secret) |

| Impact \ Likelihood | High | Medium | Low |
|---|---|---|---|
| **High** | Critical | High | Medium |
| **Medium** | High | Medium | Low |
| **Low** | Medium | Low | Low |

## 2. Risk register
| ID | Finding | Test | Impact | Likelihood | Risk Level |
|---|---|---|---|---|---|
| SA-01 | Inapplicable evidence produces wrong coverage status (false "covered") | 8 | High | High | **Critical** |
| SA-02 | Clause on the same line as its section label silently discarded | 4 | High | Medium | **High** |
| SA-03 | "fire" discarded as a stop word by the TF-IDF retriever | 3 | Medium | High | **High** |
| SA-04 | Default retriever misses paraphrased clauses | 5 | Medium | High | **High** |
| SA-05 | Agent 2 trusts any caller-supplied `business_id` | 16 | High | Low | **Medium** |
| SA-06 | Unreadable document reported as `ready` by the backend (frontend warns) | 11 | Low | Medium | **Low** |
| SA-07 | Retrieval ranking manipulable by keyword stuffing | 6 | Medium | Low | **Low** |
| SA-08 | Injection flag not carried through the retrieval contract | 10 | Medium | Low | **Low** |
| SA-09 | Login lockout keyed only on email and held in memory | 14, 19 | Low | Medium | **Low** |
| SA-10 | `business_id` not validated on Agent 2 uploads | 18 | Low | Low | **Low** |
| SA-11 | Agent 2 validation errors echo request content | 17 | Low | Medium | **Low** |
| SA-12 | Running analyses lost on gateway restart | 19 | Low | Medium | **Low** |
| SA-13 | No transport encryption | 20 | — | — | **Informational** |
| SA-14 | Agent 2 reads the full upload before checking size | 9 | — | — | **Informational** |

Distribution: 1 Critical, 3 High, 1 Medium, 7 Low, 2 Informational.

## 3. Findings

### SA-01 — Inapplicable evidence produces wrong coverage status (Critical)
**Description:** Agent 2 ranks clauses by shared words, not meaning, so a clause sharing vocabulary
with a risk is returned as its evidence even when it does not apply. Agent 3 decides status from it.
**Evidence:** `T08-citation-grounding.json` — `EMP_DISHONESTY` covered on "Theft of stock or cash
following forcible and violent entry is covered" (staff theft has no forced entry);
`BI_PREMISES_CLOSURE` covered on a property-damage clause (does not cover lost income);
`FIRE_ELECTRICAL` excluded on a breakdown exclusion. The LLM (`rules+llm`) agreed with both false
"covered" results.
**Impact — High:** A false "covered" tells the user they are protected. `verification_required_for`
(`agents/explanation_agent/templates.py:108`) returns False for COVERED, so these findings carry no
"verify with your broker" warning. Real citations make them look evidence-backed.
**Likelihood — High:** Occurred in an ordinary analysis with no attacker, with and without the LLM.
**Technical explanation:** TF-IDF matches "theft", "stock", "cash"; nothing checks whether a
clause's conditions fit the risk. The LLM sees the same retrieved clause and reaches the same
conclusion, so adding an LLM does not correct a retrieval error.

### SA-02 — Clause on the same line as its section label is discarded (High)
**Description:** `detect_section` treats lines under 100 characters starting "Section/Clause/Part N"
as headings and excludes them from the searchable text.
**Evidence:** `T04-same-line-clause.json` — one line → 0 chunks; two lines → 1; both `ready`, no warning.
**Impact — High:** Wording disappears silently; dropped cover creates false gaps, dropped exclusions
can make risks look covered.
**Likelihood — Medium:** Numbered clauses with text on the same line are common in real policies.
**Technical explanation:** `^(section|clause|part)\s+[a-z0-9]+\b.*$` ends in `.*`, matching the whole line.

### SA-03 — "fire" discarded as a stop word (High)
**Description:** `TfidfRetriever` uses `stop_words="english"`, which contains "fire".
**Evidence:** `T03-fire-stopword.json` — "Loss caused by fire is covered." scored 0.0.
**Impact — Medium:** False "Potential Coverage Gap" for fire risks; gap findings are flagged for
verification, so more likely to be caught than SA-01.
**Likelihood — High:** Deterministic; fire is a baseline risk for bakeries and restaurants.
**Technical explanation:** Stop words are removed before vectorisation, so "fire" has no dimension.

### SA-04 — Default retriever misses paraphrased clauses (High)
**Description:** TF-IDF only matches words shared with the query (risk name + `synonyms.json`).
**Evidence:** `T05-paraphrase-recall.json` — "conflagration or combustion" and "blaze or scorching"
clauses scored 0.0 with TF-IDF; semantic scored them 0.28 and 0.53.
**Impact — Medium:** Genuine cover written in different words is not found, producing false gaps.
**Likelihood — High:** Policy wording varies widely between insurers; TF-IDF is the default backend.
**Technical explanation:** Lexical retrieval has no notion of synonyms beyond the fixed list; the
semantic backend already in the code recovers both paraphrases.

### SA-05 — Agent 2 trusts any caller-supplied `business_id` (Medium)
**Description:** One shared `X-API-Key` authenticates all callers; `business_id` is taken from the request.
**Evidence:** `T16-direct-agent-access.json` — another business's policy text returned with only the
shared key. The gateway blocks the same attempt (test 15).
**Impact — High:** Anyone holding the key who can reach an agent port can read every business's policies.
**Likelihood — Low:** Agents listen on 127.0.0.1; requires local access and the secret.
**Technical explanation:** No per-request proof of identity from the gateway reaches the agent.

### SA-06 — Unreadable document reported as `ready` by the backend (Low)
**Evidence:** `T11-corrupted-pdf.json` — truncated PDF → `ready`, 0 chunks, no warning in the API
response. `S-T11-web-upload.png` — the upload confirmation says "Uploaded". `S-T11-web-policy-list.png`
— the policy list (and analysis picker) then warn that no text could be read.
**Impact — Low:** Initially rated Medium from the API result; re-rated after the web-app check found
the frontend warning (`frontend/src/pages/Policies.tsx:109`). Users of the web app are told; any other
API client is not, and the warning covers only zero-chunk documents, not partially dropped text (SA-02).
**Likelihood — Medium:** Corrupted uploads and scans where OCR finds nothing.
**Technical explanation:** PyMuPDF repairs the file instead of failing; status is READY whenever no
exception occurs, and no warning is added for zero chunks.

### SA-07 — Retrieval ranking manipulable by keyword stuffing (Low)
**Evidence:** `T06-keyword-stuffing-tfidf.json` (0.6936 vs 0.1937), `T06-keyword-stuffing-semantic.json`
(0.6313 vs 0.4634).
**Impact — Medium:** Junk becomes top evidence and can push genuine clauses out of `top_k`; limited to
the uploader's own report.
**Likelihood — Low:** Requires a deliberately crafted document in the user's own policy set.
**Technical explanation:** TF-IDF rewards term frequency against a predictable query; embeddings are
less frequency-sensitive but still pulled by repeated topical words.

### SA-08 — Injection flag not carried through the retrieval contract (Low)
**Evidence:** `T10-adversarial-document.json` — flagged chunk returned as top evidence with no flag field.
**Impact — Medium:** Agent 3's LLM receives the flagged text with only prompt-level defence.
**Likelihood — Low:** Requires an adversarial document.
**Technical explanation:** `PolicyChunk` has `flagged`; `EvidenceClause` has no equivalent field.

### SA-09 — Login lockout keyed only on email and held in memory (Low)
**Evidence:** `T14-lockout.png` (lock after 5 failures); `T19-login-after-restart.png` (lockout
cleared by a restart).
**Impact — Low:** Anyone knowing an email can lock that user out for 15 minutes; one password can be
tried across many emails without throttling; any restart clears active lockouts.
**Likelihood — Medium:** Needs only a known email, or a routine restart/redeploy.
**Technical explanation:** Counters are an in-memory dictionary keyed by email in one gateway process.

### SA-10 — `business_id` not validated on Agent 2 uploads (Low)
**Evidence:** `T18-business-id-validation.json` — spaces, non-ASCII and a `/` accepted as folder names
(nested folder created); whitespace-only and 300-character values caused 500s.
**Impact — Low:** Unexpected folder structures inside the data folders, unhandled errors, and
chunks in nested folders are not reloaded by `load_index_from_disk` after a restart.
**Likelihood — Low:** Reachable only by calling Agent 2 directly; the gateway generates `business_id`.
**Technical explanation:** `business_id` is a plain form field joined straight into a `Path`.

### SA-11 — Agent 2 validation errors echo request content (Low)
**Evidence:** `T17-agent2-error-bodies.json` — `"input": "not-a-list"`; gateway bodies do not echo.
**Impact — Low:** Request content could reach logs or other consumers if relayed.
**Likelihood — Medium:** Any malformed request.
**Technical explanation:** Agent 2 lacks the gateway's custom validation-error handler.

### SA-12 — Running analyses lost on gateway restart (Low)
**Evidence:** `T19-before-restart.json` (`running`), `T19-after-restart.json` (404, not in history).
**Impact — Low:** A multi-minute analysis disappears and the user only sees "not found"; saved results
are unaffected and no data is exposed.
**Likelihood — Medium:** Any restart or redeploy while an analysis is running.
**Technical explanation:** Job status lives in the gateway's in-memory job store; results are written
to the database only on completion.

### SA-13 — No transport encryption (Informational)
**Evidence:** `T20-transport.json`. No current exposure while all services listen on 127.0.0.1;
becomes High once services run on separate hosts.

### SA-14 — Agent 2 reads the full upload before checking size (Informational)
**Evidence:** `T09-oversized-file.json`, `T09-gateway-size-cap.json`. The gateway's cap runs first
(test 9) and agents are local-only, so no practical exposure.
