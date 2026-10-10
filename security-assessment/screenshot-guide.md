# Screenshot Guide: Evidence Capture

Test files are in `security-assessment/test-inputs/`. They are identical to what the scripts used.
Save every screenshot in `security-assessment/evidence/` using the file name given in each step.

## 0. Setup (once)

1. Start the backend (PowerShell, repo root):
   ```
   $env:PYTHON = ".venv\Scripts\python.exe"
   .\scripts\start_agents.ps1
   ```
2. Start the frontend (second terminal): `cd frontend; npm run dev`
3. Open these three tabs:
   - Web app: http://127.0.0.1:5173
   - Gateway Swagger: http://127.0.0.1:8000/docs
   - Agent 2 Swagger: http://127.0.0.1:8002/docs
4. Copy the `INTERNAL_API_KEY` value from your `.env`. Agent 2 calls need it in the `X-API-Key` field.
5. Set the browser zoom to about 80%, so each screenshot shows the request and the response together.

**How to run a call in Swagger:** expand the endpoint, click **Try it out**, fill in the fields, then click
**Execute**. Scroll until the request body and the **Server response** (code and body) are both visible,
then take the screenshot.

**FIRE_COOKING risk:** several Agent 2 calls ask for evidence about this risk. Paste this inside `"risks"`:
```json
{"risk_id": "FIRE_COOKING", "name": "Fire from cooking and baking equipment", "category": "fire", "reason": "test", "source": "rule", "confidence": 0.9}
```

---

## Part A: Web app (what a real user sees)

### Test 8 (SA-01, Critical): wrong "Covered" status. Most important.
1. Register a new account, for example `shots-a@example.test`, and log in. **Keep this account**:
   Parts C and D use it as "user A".
2. Create a business profile with these details, as closely as the form allows:
   - Name: `Assessment Test Bakery`; Type: bakery
   - Description: `A bakery producing bread and cakes with ovens and refrigerators.`
   - Employees: 6; Equipment: Ovens, Refrigerators
   - Accepts card payments: yes; Handles cash: yes; Single location: yes; Colombo, Sri Lanka
3. Upload `T08_bakery_policy.pdf`.
4. Run an analysis with this profile and this policy. It takes a few minutes.
5. Take these screenshots:
   - `S-T08-web-employee-dishonesty.png`: Employee dishonesty shown as **Covered**, citing
     "Theft of stock or cash following forcible and violent entry…". Also show that there is **no**
     "verify with your broker" warning on it.
   - `S-T08-web-business-interruption.png`: Business interruption shown as **Covered**, citing the
     property-damage clause.
   - `S-T08-web-summary.png`: the overall results list.
6. The LLM can vary slightly between runs. If a status differs from the expected one, screenshot it
   anyway and tell me.

### Test 11 (SA-06): corrupted file accepted as ready
1. As the same user, upload `T11_corrupted.pdf`.
2. `S-T11-web-upload.png`: the policy list showing it as ready or processed, with no error.

### Test 3 (SA-03): impact of the "fire" stop word. Optional, but strong.
1. Upload `T03_fire_only.pdf` ("Loss caused by fire is covered.").
2. Run an analysis with the bakery profile and **only** this policy.
3. `S-T03-web-fire-gap.png`: a fire risk shown as **Potential Coverage Gap**, even though the policy
   says fire is covered.

---

## Part B: Agent 2 Swagger (the cause), port 8002

For every call, paste the key into `X-API-Key`.
For uploads, use **POST /api/v1/policies**: `business_id` = the value given in the step; `file` = the PDF.
For retrieval, use **POST /api/v1/retrieve-policy-evidence**.
Copy the `policy_id` from each upload response; you need it for the next call.

### Test 3 (SA-03): fire clause scores 0
1. Upload `T03_fire_only.pdf` with `business_id` = `SHOT-T03`.
2. Retrieve with this body:
   ```json
   {"business_id": "SHOT-T03", "policy_ids": ["<policy_id>"], "risks": [ FIRE_COOKING ], "top_k": 5}
   ```
3. `S-T03-swagger-empty-evidence.png`: `"evidence": []`.

### Test 4 (SA-02): same-line clause dropped
1. Upload `T04_same_line.pdf` with `business_id` = `SHOT-T04`.
   - `S-T04-swagger-same-line.png`: `"chunk_count": 0`, `"status": "ready"`, `"warnings": []`.
2. Upload `T04_separate_lines.pdf` with `business_id` = `SHOT-T04`.
   - `S-T04-swagger-separate-lines.png`: `"chunk_count": 1`.

### Test 21 (SA-04): paraphrased clauses missed
1. Upload `T05_paraphrase.pdf` with `business_id` = `SHOT-T21`. It should give 3 chunks.
2. Retrieve with FIRE_COOKING and `"top_k": 10`.
3. `S-T05-swagger-paraphrase.png`: only the control clause ("smoke, flame or explosion") is
   returned. The "conflagration" and "blaze" clauses are missing.

### Test 10 (SA-08): injection flag lost at retrieval
1. Upload `T10_adversarial.pdf` with `business_id` = `SHOT-T10`.
   - `S-T10-swagger-upload-flagged.png`: `"flagged_chunk_count": 1` and the warning.
2. Retrieve with FIRE_COOKING.
   - `S-T10-swagger-retrieve-no-flag.png`: the same text is returned as evidence, and the item has
     no `flagged` field.

### Test 11 (SA-06): API view
1. Upload `T11_corrupted.pdf` with `business_id` = `SHOT-T11`.
2. `S-T11-swagger-ready-zero-chunks.png`: `"status": "ready"`, `"chunk_count": 0`, no warnings.

### Test 5 (SA-07): keyword stuffing. Optional.
1. Upload `T06_stuffed.pdf`, then `T06_genuine.pdf`, both with `business_id` = `SHOT-T05`.
2. Retrieve with both `policy_ids` and FIRE_COOKING.
3. `S-T06-swagger-stuffing.png`: the stuffed text ranked first (about 0.69) above the genuine clause
   (about 0.19).

### Test 19 (SA-11): Agent 2 echoes your input
1. Retrieve with this body:
   ```json
   {"business_id": "SHOT-T19", "policy_ids": "not-a-list", "risks": []}
   ```
2. `S-T17-swagger-agent2-echo.png`: 422 with `"input": "not-a-list"` in the body.

### Test 22 (SA-10): business_id not validated
1. Upload `T04_separate_lines.pdf` with `business_id` = `SHOT T22 has spaces & symbols`.
   - `S-T18-swagger-accepted.png`: 200, with that exact value used as the business id.
2. Upload again with `business_id` = three spaces (`   `).
   - `S-T18-swagger-500.png`: 500.

---

## Part C: Gateway Swagger, port 8000

**How to log in:** use **POST /api/v1/auth/login** with your email and password, and copy
`access_token`. Click **Authorize** (top right), paste the token, click **Authorize**, then **Close**.
To switch users, click **Authorize**, then **Logout**, then paste the other user's token.

### Get user A's IDs (needed for tests 16, 17 and 18)
1. Log in as user A (`shots-a@example.test`).
2. **GET /api/v1/auth/me**: note `business_id`.
3. **GET /api/v1/policies**: note the `policy_id` of `T08_bakery_policy.pdf`.
4. **GET /api/v1/business-profiles**: note the `profile_id` of "Assessment Test Bakery".

### Test 16: user B cannot use user A's policy
1. Register user B in the web app, for example `shots-b@example.test`. Log in as B in Swagger.
2. **GET /api/v1/policies**
   - `S-T16-swagger-b-policy-list.png`: user A's policy is not in the list.
3. **POST /api/v1/analyses** with this body:
   ```json
   {"business": {"business_name": "Assessment Test Bakery", "business_type": "bakery",
     "description": "A bakery producing bread and cakes with ovens and refrigerators.",
     "employee_count": 6, "equipment": ["Ovens", "Refrigerators"],
     "operations": {"accepts_card_payments": true, "handles_cash": true, "operates_single_location": true},
     "location": {"city": "Colombo", "country": "Sri Lanka"}},
    "policy_ids": ["<user A's policy_id>"]}
   ```
   - `S-T16-swagger-b-uses-a-policy-404.png`: 404 `policy_not_found`.

### Test 17: user B cannot read or delete user A's profile
Stay logged in as B.
1. **GET /api/v1/business-profiles/{profile_id}** with A's `profile_id`.
   - `S-T17-swagger-b-reads-a-profile-404.png`: 404 `profile_not_found`.
2. **DELETE /api/v1/business-profiles/{profile_id}** with A's `profile_id`.
   - `S-T17-swagger-b-deletes-a-profile-404.png`: 404.
3. Back in the web app as user A, show that the profile still exists.
   - `S-T15-web-a-profile-intact.png`

### Test 19 (gateway side): injection rejected cleanly
As B, call **GET /api/v1/business-profiles/{profile_id}** with the id `' OR '1'='1`.
- `S-T19-swagger-gateway-sql-404.png`: 404, and no data or input echoed.

### Test 23: gateway size cap
As B, call **POST /api/v1/policies** and choose `T23_oversized_26MB.pdf`.
- `S-T23-swagger-413.png`: 413 `file_too_large`.

---

## Part D: Test 18 (SA-05): reading user A's policy without logging in
This step uses **Agent 2 Swagger** with user A's IDs from Part C.
1. **POST /api/v1/retrieve-policy-evidence**, with only `X-API-Key` (no login), and this body:
   ```json
   {"business_id": "<user A's business_id>", "policy_ids": ["<user A's policy_id>"], "risks": [ FIRE_COOKING ]}
   ```
2. `S-T18-swagger-direct-access.png`: 200, with user A's policy text returned.
3. Clear `X-API-Key` and execute again.
   - `S-T18-swagger-no-key-401.png`: 401 "Missing or invalid API key."

---

## When you are done
- Tell me, and I will add the screenshots to the report as figures next to the JSON evidence,
  then rebuild it.
- Tell me before you commit, so I can remove the `SHOT-*` test folders from `data/` and delete
  `test-inputs/T23_oversized_26MB.pdf` (26 MB; do not commit it).
