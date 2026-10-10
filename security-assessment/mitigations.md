# Mitigation Strategies — Student 4 (Information Retrieval & Security)

Recommendations only — nothing was changed during the assessment. Each names where the change
belongs and how to confirm it by re-running the original test.

## Priority
| Priority | Findings | Why |
|---|---|---|
| 1 — Fix first | SA-01, SA-02, SA-03, SA-04 | Wrong results in normal use; each fix is small and local |
| 2 — Next | SA-05, SA-06, SA-08, SA-07, SA-10, SA-11 | Defence in depth between services and input hygiene |
| 3 — Before deployment | SA-13, SA-09, SA-12, SA-14 | Matter once off a single machine, under restarts or real traffic |

## SA-01 — Wrong coverage status from inapplicable evidence (Critical)
- Make `verification_required_for` (`agents/explanation_agent/templates.py`) return True for COVERED
  too, at least for low-confidence or rule/LLM-derived decisions.
- Treat condition words ("following", "forcible", "subject to", "provided that") as conditional when
  deciding status; the current list misses "following ... forcible entry".
- Give each risk required terms (employee dishonesty needs "employee", "staff" or "fidelity";
  business interruption needs "income", "profit" or "interruption") and treat clauses without them
  as not applicable.
- Re-rank candidates by meaning before Agent 3; adding an LLM on top of the same evidence was shown
  not to be sufficient (test 8).
**Verify:** re-run test 8 — `EMP_DISHONESTY` and `BI_PREMISES_CLOSURE` no longer covered; covered
findings carry `verification_required: true`.

## SA-02 — Clause on the same line as its label discarded (High)
- In `_segment_by_section`, split a heading line containing clause text at the first `:` or ` - `;
  keep the label as the section and send the rest to the body.
- Tighten the heading pattern to match only a short label; warn when extracted text is missing from
  chunks; add a regression test with the test 4 input.
**Verify:** re-run test 4 — the one-line version yields `chunk_count: 1`.

## SA-03 — "fire" discarded as a stop word (High)
- Replace `stop_words="english"` with scikit-learn's list minus insurance terms ("fire", "bill",
  "amount", "interest", "part", "full", "system", ...); unit-test that every synonym and risk name
  survives preprocessing.
- Fit IDF over the business's whole chunk set or use a relative cut-off instead of a fixed 0.1.
**Verify:** re-run test 3 — "Loss caused by fire is covered." is returned.

## SA-04 — Paraphrased clauses missed (High)
- Make hybrid retrieval the default: union or weighted combination of TF-IDF and the existing
  semantic backend (`RETRIEVAL_BACKEND`), so paraphrases are found while exact matches stay strong.
- Extend `synonyms.json` with common policy vocabulary (e.g. "conflagration", "combustion", "blaze")
  as a stop-gap, and build a labelled set of paraphrased clauses to measure recall.
**Verify:** re-run test 5 — both paraphrased clauses are returned.

## SA-05 — Agent 2 trusts caller-supplied `business_id` (Medium)
- Gateway mints a short-lived signed service token per call (audience = target agent) carrying
  `business_id`; agents take `business_id` from the verified token, not the body.
- Separate key per agent, rotated; keep agents on localhost or a private network; mTLS when split.
**Verify:** re-run test 16 — a call with only the shared key is rejected.

## SA-06 — Unreadable document reported `ready` by the backend (Low)
- Move the check the frontend already does into Agent 2: treat `chunk_count == 0` as FAILED or add
  the warning "No readable text could be extracted" to the upload response, so every client gets it;
  show it in the upload confirmation too, not only in the policy list.
**Verify:** re-run test 11 — the API response is failed or carries the warning.

## SA-07 — Keyword stuffing (Low)
- `sublinear_tf=True` or `binary=True`; flag low-diversity chunks at ingestion; hybrid ranking.
**Verify:** re-run test 6 — the genuine clause ranks first or the stuffed page is flagged.

## SA-08 — Injection flag lost at retrieval (Low)
- Add `flagged`/`flag_reason` to `EvidenceClause` and copy them in `PolicyRetrievalService`
  (shared-contract change: all four members review); Agent 3 withholds flagged evidence from its LLM.
**Verify:** re-run test 10 — evidence includes `flagged: true`.

## SA-09 — Lockout keyed on email, in memory (Low)
- Add a per-IP limiter; use progressive delays instead of a hard lock; store counters in SQLite or
  Redis so they survive restarts and are shared across instances.
**Verify:** repeat tests 14 and 19 — lockout persists across a restart.

## SA-10 — `business_id` not validated on Agent 2 (Low)
- Validate `business_id` in Agent 2's upload and retrieval endpoints against the gateway's format
  (e.g. `^B-[0-9a-f]{16}$`, or `^[A-Za-z0-9_-]{1,64}$`), returning 422 otherwise; resolve the final
  path and confirm it stays under the upload folder.
**Verify:** re-run test 18 — every malformed value returns 422 and no folders are created.

## SA-11 — Agent 2 errors echo input (Low)
- Register the gateway's validation-error handler (`ErrorResponse.from_validation_errors`) in every agent.
**Verify:** re-run test 17 — no 422 body contains `input`.

## SA-12 — Running analyses lost on restart (Low)
- Persist job state in the existing SQLite database when a run starts and update it per stage; on
  startup mark interrupted runs as "failed — please retry" instead of letting them vanish.
**Verify:** repeat test 19 — the interrupted analysis shows a clear failed state.

## SA-13 — No transport encryption (Informational)
- TLS-terminating reverse proxy (nginx/Caddy) with HSTS in front of the gateway; TLS/mTLS between
  gateway and agents when on separate hosts.
**Verify:** repeat test 20 on the deployed setup.

## SA-14 — Agent 2 reads full upload before size check (Informational)
- Read at most limit + 1 bytes, as the gateway does.
**Verify:** re-run test 9.
