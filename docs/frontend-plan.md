# Frontend Plan (React)

This is the plan for the web frontend of the Insurance Coverage Intelligence system. It covers the
tech stack, the pages, the API the frontend uses, who builds what, and the order we build it in.
Each of the four members owns one part of the frontend, and that part is the one that shows their
own agent's output.

> The Streamlit stubs in `frontend/` (`app.py`, `pages/`, `components/`) are replaced by the React
> app. We keep the branding and landing-page text from `frontend/app.py` and
> `frontend/assets/styles.css` (the "InsureIntel" name, the hero text, the three capability cards)
> and remove the Python files in the setup PR.

---

## 1. Goals

1. A business owner can **register, log in, describe the business, upload policy PDFs, run an
   analysis and read the report** in the browser, without seeing any agent or technical detail.
2. Every finding in the report is shown **with its evidence** (policy, section, page, excerpt).
   This is the main point of the project, so the UI must make it easy to see.
3. The UI shows clearly that the report is **decision support, not advice**. The disclaimer is
   always visible. Findings that need checking are marked. Confidence is never shown as certainty.
4. Every member builds and demos a real part of it.

Out of scope for now: the free-text scenario endpoint of Agent 1 (the gateway doesn't expose it),
editing or deleting policies, password reset, admin pages and deployment. We can add them if we
have time.

---

## 2. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Build tool | **Vite** | Fast dev server; its proxy removes the need for CORS on the gateway |
| Language | **TypeScript** | The backend contracts are strict (Pydantic). Types that match them catch mistakes when two members' code meets |
| UI | **React 18** | Team decision |
| Routing | **React Router v6** | Standard choice |
| Server data | **TanStack Query** | Caching, loading and error state for every API call, so we don't write it by hand |
| Forms | **React Hook Form** | The business profile form has nested fields and lists |
| Styling | **Tailwind CSS** | No CSS files to merge between four people. Colours go in one config file |
| Mock API | **MSW (Mock Service Worker)** | Everyone can build their page before the real backend runs on their laptop, and without an LLM |
| Tests | **Vitest + React Testing Library** | Works with Vite |
| Lint/format | **ESLint + Prettier** | Same code style for all four members; runs before each PR |

Node.js **20 LTS** or newer. The package manager is **npm**. Commit `package-lock.json`.

---

## 3. How the frontend talks to the backend

The frontend only talks to the **orchestration gateway** on port 8000. It never calls an agent
directly and it never knows `INTERNAL_API_KEY`.

### 3.1 Dev proxy (no CORS)

The gateway has no CORS setup. In development, Vite forwards `/api` and `/health` to the gateway,
so the browser sees one origin:

```ts
// frontend/vite.config.ts
server: {
  proxy: {
    '/api':    { target: 'http://127.0.0.1:8000', proxyTimeout: 0, timeout: 0 },
    '/health': { target: 'http://127.0.0.1:8000' },
  },
},
```

Use `127.0.0.1`, not `localhost`. On Windows, `localhost` added about 2 s to every call.
`proxyTimeout: 0` matters because an analysis can take up to 10 minutes (see 3.4).

### 3.2 Endpoints we use

| Method & path | Auth | Used by | Notes |
|---|---|---|---|
| `GET /health/agents` | no | Status indicator | `{status: "healthy"\|"degraded", agents: {name: "up"\|"down"}}` |
| `POST /api/v1/auth/register` | no | Register page | `{email, password}` (password 8–72 bytes) → `201 UserResponse`; `409 email_taken` |
| `POST /api/v1/auth/login` | no | Login page | → `{access_token, token_type, expires_in}`; `401` wrong login; `429` + `Retry-After` after 5 failures in 15 min; `503` when the server has no JWT secret |
| `GET /api/v1/auth/me` | yes | App shell | Checks that a stored token still works |
| `GET /api/v1/policies` | yes | Policies page | `PolicyDocument[]` |
| `POST /api/v1/policies` | yes | Policies page | `multipart/form-data`, field `file`; `400 invalid_pdf`, `413 file_too_large` (25 MB) |
| `POST /api/v1/analyses` | yes | New analysis | `{business: BusinessProfile, policy_ids: string[1..5]}` → `AnalysisResponse` (slow, see 3.4) |
| `GET /api/v1/analyses` | yes | History page | `AnalysisSummary[]` |
| `GET /api/v1/analyses/{request_id}` | yes | Results page | `AnalysisResponse`; `404 analysis_not_found` |

Authenticated calls send `Authorization: Bearer <token>`. The full field lists are in
[api-specification.md](api-specification.md). The source of truth for the types is
`shared/schemas/responses.py`, `shared/schemas/requests.py` and `shared/models/*.py`.

### 3.3 Error shapes

| Status | Body | What the UI does |
|---|---|---|
| 401 | `{detail}` | Clear the token and go to `/login?next=<current page>` |
| 422 | `{error: "validation_error", message, details: [{field, message}]}` | Show each `details[].message` next to the form field named by `field` (e.g. `business.employee_count`) |
| 429 | `GatewayError` + `Retry-After` header | "Too many attempts, try again in N minutes"; disable the button |
| 404 / 409 / 413 / 400 | `GatewayError` `{error, message}` | Show `message`. It is already written for users |
| 502 / 503 / 504 | `GatewayError` with `stage` (`risk_profile`, `policy_evidence`, `coverage`, `report`, `policy_upload`) | "The analysis could not finish at step X. Please try again." plus a Retry button |

The gateway never puts agent output or user input in an error body. The UI never shows raw JSON
or stack traces either.

### 3.4 The analysis request is slow

`POST /api/v1/analyses` is **one synchronous request**. With the local LLM on CPU, Agent 4 can take
**several minutes** (the gateway waits up to 600 s). The UI must handle this:

- Use a full-page progress screen with the four steps (Risk profiling → Policy evidence → Coverage
  → Report). The API doesn't report progress, so show elapsed time and a note like
  "Writing the report can take a few minutes."
- The client must not time out and must never retry this call on its own. Set
  `retry: false` on this mutation in TanStack Query.
- Disable the Run button while a request is running, so nobody starts two analyses.
- If the user leaves or refreshes the page, the gateway still finishes and saves the result.
  Say so on the progress screen and point to the History page.
- `status: "partial"` means the coverage results are there but the written report is not
  (Agent 4 failed or timed out). Show the coverage results with a banner that repeats `warnings`.
  This is **not** an error page.

**Risk to check in week 1:** confirm that a 10-minute request works through the Vite proxy and the
browser. Run the gateway with the real Agent 4, or with a fake that sleeps.

### 3.5 Login token

- Keep the JWT in memory **and** in `sessionStorage`, so a page refresh doesn't log the user out
  but closing the tab does. Don't use `localStorage`.
- It expires after `expires_in` seconds (60 min by default) and there is no refresh endpoint.
  When a call returns 401, send the user back to the login page and remember where they were.
- Never log the token, the password or business details to the console.

### 3.6 Where the business profile lives

The gateway **doesn't store the business profile**. `POST /analyses` sends the whole profile each
time. The frontend keeps the last profile in `sessionStorage` as a draft, so "Run again" is easy.
It is cleared on logout.

---

## 4. Pages and routes

```
/                    Landing (public): hero, capabilities, "Get started"
/login               Log in
/register            Create account
/app                 Dashboard: latest analysis summary, quick links      (logged in)
/app/profile         Business profile form                                (logged in)
/app/policies        Upload and list policy PDFs                          (logged in)
/app/analyses/new    Choose policies + confirm profile → run → progress   (logged in)
/app/analyses        History list                                         (logged in)
/app/analyses/:id    Results: tabs Report | Coverage | Risk profile       (logged in)
*                    Not found
```

The user flow: **Register → Profile → Upload policies → New analysis → Results**. The dashboard
shows a 3-step checklist (profile done? at least one ready policy? an analysis run?) so new users
know what to do next.

### Results page (`/app/analyses/:id`)

Header: date, status badge (`complete` / `partial`), `report.summary.headline`, counts by status,
the disclaimer (always visible, not hidden in a tooltip), and `warnings` if there are any.
It also has an **"AI used"** line built from each agent's `metadata` (`llm_used`, `llm_model`,
`llm_provider`), e.g. "AI used: Gemini (risk profile), qwen3:4b via Ollama (report: 12 of 14
findings)", or "No AI model was used; results are rule-based" when no agent used one.

The full system runs with LLMs (Gemini for Agent 1, Ollama or Gemini for Agents 3 and 4). A
machine without one gets rule/template results in the same format. The UI must work the same
for both and always say which parts were written by AI.

| Tab | Data | Content |
|---|---|---|
| **Report** (default when there is one) | `report.findings[]` | One card per finding, sorted high → medium → low priority. Shows title, status badge, "Potential gap" tag, explanation, recommendation, a "Verify with your insurer" tag when `verification_required`, a small "AI-written" / "Template" label from `generated_by`, and the evidence list |
| **Coverage** (default when partial) | `coverage.assessments[]` | A table with columns risk, status, gap, confidence, reason and method (an "AI-assisted" label when `method` is `rules+llm`, otherwise "Rules"). Filter by status and "gaps only". A row expands to show its evidence |
| **Risk profile** | `risk_profile.risks[]` | Risks grouped by category, with reason, source (`rule` / `llm` / `rule+llm`), confidence and the input that led to them (`evidence[].field/value`), plus the profile `warnings` |

### Shared visual language

| Coverage status | Colour | Label |
|---|---|---|
| `covered` | green | Covered |
| `conditional` | amber | Covered with conditions |
| `unclear` | grey | Unclear – check the policy |
| `excluded` | red | Excluded |
| `not_found` | red (outline) | Not found in your policies |

Show confidence as a word (High ≥ 0.75 / Medium ≥ 0.5 / Low), with the number in a tooltip.
Never show it as a percentage like "92% covered".

Evidence that has `flagged: true` gets a warning icon: "This clause contained unusual instructions
and was not used by the AI." Render all policy text **as plain text**. Never use
`dangerouslySetInnerHTML`, because policy PDFs are untrusted input.

---

## 5. Folder structure

```
frontend/
├── index.html
├── package.json
├── vite.config.ts            # proxy to :8000
├── tailwind.config.ts        # status colours defined once here
├── .env.example              # (nothing secret; the frontend has no secrets)
└── src/
    ├── main.tsx
    ├── App.tsx               # routes
    ├── api/
    │   ├── client.ts         # fetch wrapper: base URL, token, error mapping   (M4)
    │   ├── types.ts          # TS copies of the Pydantic models              (M4, all review)
    │   ├── auth.ts           # login/register/me hooks                        (M4)
    │   ├── policies.ts       # usePolicies / useUploadPolicy                  (M2)
    │   └── analyses.ts       # useRunAnalysis / useAnalyses / useAnalysis     (M3)
    ├── auth/                 # AuthProvider, RequireAuth, token storage      (M4)
    ├── components/           # shared building blocks
    │   ├── Layout/           # app shell, nav, logout                         (M4)
    │   ├── StatusBadge.tsx   #                                                 (M3)
    │   ├── ConfidenceLabel.tsx  #                                              (M1)
    │   ├── EvidenceList.tsx  # evidence clause / citation display             (M2)
    │   ├── ErrorMessage.tsx  # renders GatewayError / 422 details             (M4)
    │   ├── Disclaimer.tsx    #                                                 (M4)
    │   └── AgentStatus.tsx   # /health/agents dot in the nav                  (M2)
    ├── pages/
    │   ├── Landing.tsx                                                         (M1)
    │   ├── Login.tsx, Register.tsx                                             (M4)
    │   ├── Dashboard.tsx                                                       (M3)
    │   ├── BusinessProfile.tsx                                                 (M1)
    │   ├── Policies.tsx                                                        (M2)
    │   ├── NewAnalysis.tsx   # includes the progress screen                   (M3)
    │   ├── History.tsx                                                         (M4)
    │   └── Results/
    │       ├── ResultsPage.tsx   # header + tabs                               (M4)
    │       ├── ReportTab.tsx                                                   (M4)
    │       ├── CoverageTab.tsx                                                 (M3)
    │       └── RiskProfileTab.tsx                                              (M1)
    ├── mocks/                # MSW handlers + fixtures                         (everyone)
    │   ├── handlers.ts       # magic inputs for every error path are listed at the top
    │   ├── db.ts             # in-memory state, reset per test
    │   └── fixtures/         # made by scripts/make_frontend_fixtures.py
    │       ├── analysis-{bakery,restaurant,retail_shop}.json
    │       ├── analysis-partial.json
    │       ├── analysis-all-statuses.json
    │       └── policies.json, analyses.json, user.json
    └── test/                 # test setup
```

---

## 6. Who does what

Each member builds the screens that show their own agent's output, because they know those fields
best. Each member also owns one shared component that the others use.

### Member 1 – Risk Profiling (Agent 1)

- **Business profile form** (`/app/profile`). Fields: business name and type (bakery / restaurant /
  retail shop), description, employee count (0–250), equipment (a tag input, up to 50 items),
  sales channels (checkboxes), yes/no/unknown for card payments, cash, customer data and single
  location, and location (city, district, country, flood-prone yes/no/unknown). "Unknown" must be
  sent as `null`, not `false`. The field limits must match `shared/models/business.py`.
  Server 422 errors are shown on the right field.
- **Risk profile tab** on the results page.
- **Landing page**, using the existing InsureIntel content.
- Shared: `ConfidenceLabel`.
- Fixture: a real `risk_profile` block for each business type.

### Member 2 – Policy Intelligence (Agent 2)

- **Policies page** (`/app/policies`): a drag-and-drop PDF upload that checks type and 25 MB
  before sending, shows upload progress, and shows `invalid_pdf` / `file_too_large` errors. A
  list of policies with filename, pages, chunks, status (`processing` / `ready` / `failed`) and
  the flagged-chunk count, plus an empty state.
- **`EvidenceList`** component. It is used by both the Coverage tab (`EvidenceClause`: section,
  page, text, score) and the Report tab (`EvidenceCitation`: section, page, excerpt, flagged).
  Show the policy filename instead of the `policy_id` by looking it up in the policies list.
  Long text collapses. Flagged clauses show a warning.
- **`AgentStatus`**: a dot in the nav from `/health/agents`, checked every 30 s. When an agent is
  down, it shows which one.
- Fixture: `policies.json`, and evidence with and without a section and with `flagged: true`.

### Member 3 – Coverage & Gap Analysis (Agent 3)

- **New analysis flow** (`/app/analyses/new`): pick 1–5 *ready* policies, check the profile
  summary (with a link to edit it), then Run. Then the **progress screen** from §3.4, the error
  and retry states for 502/503/504 using `stage`, and `404 policy_not_found`. When it finishes, go
  to `/app/analyses/:id`.
- **Coverage tab**: the table, status and gap filters, and expanding rows.
- **Dashboard**.
- Shared: `StatusBadge` and the Tailwind status colours.
- Fixtures: an assessment for **each of the five statuses**. The real Agent 3 currently returns
  only `unclear` / `not_found`, so the UI must be tested with fixtures.

### Member 4 – Explanation & Recommendation (Agent 4) + setup

- **Week 1 setup** (blocks everyone, so it goes first): Vite project, Tailwind, ESLint/Prettier,
  router, TanStack Query, MSW, Vitest, `api/client.ts`, `api/types.ts`, the app shell and the CI
  lint and test commands.
- **Auth**: login, register, `RequireAuth`, token storage, 401 redirect, the 429 message.
- **Results page** layout: header, disclaimer, tabs, the partial banner, and the **Report tab**.
- **History page**.
- Shared: `ErrorMessage`, `Disclaimer`.
- Fixtures: a complete and a partial `AnalysisResponse` saved from a real no-LLM run.

### Everyone

- Review at least one other member's PR each week.
- Write tests for your own pages (see §8).
- Take part in the final end-to-end test with the real backend and the demo.

---

## 7. Timeline

Durations are in working weeks. Put in dates once we agree on the submission deadline.

### Week 1 – Setup and contracts

| Who | Task |
|---|---|
| M4 | Scaffold PR: everything under "Week 1 setup" above, the landing page placeholder, and a working login against MSW. **Merge by mid-week** |
| M1–M3 | Save real JSON fixtures from their agent (run `scripts/start_agents.ps1 -NoLlm` + `scripts/smoke_test_gateway.py`, or call the agent). Remove any real personal data. Review `api/types.ts` against their Pydantic models |
| All | Agree on the look: a simple wireframe for each page (paper or Figma is fine) and the colour tokens |
| M3 | The 10-minute request check (§3.4) |

### Week 2 – Build pages against mocks (in parallel)

Each member builds their pages from §6 using MSW. Nobody needs the backend running. Open small PRs
(one page or component each) and don't wait for a big-bang merge.

### Week 3 – Connect to the real gateway

- Use `npm run dev` (MSW off) instead of `npm run dev:mocks`, and run against the real gateway with all four agents.
- Fix contract mismatches. When a mismatch is in the backend, raise it with the agent's owner and
  don't work around it in the UI.
- Test with a real LLM once (Agent 4 with Ollama) to check the slow path and the `partial` path
  (stop Agent 4 during a run).

### Week 4 – Polish, tests, demo

- Loading and empty states, mobile width (≥ 360 px), keyboard navigation, focus states, colour
  contrast (status is never shown by colour alone; there is always a text label).
- Fill the test gaps. Write the README section on running the frontend.
- Demo script and screenshots for the report.

---

## 8. Definition of done (every PR)

- [ ] `npm run lint`, `npm run typecheck` and `npm test` pass.
- [ ] The page works with MSW **and** has been tried against the real gateway once it's available.
- [ ] Loading, empty and error states are done. There is no blank screen and no raw JSON.
- [ ] Tests: at least one render test per page and one test per error path it handles. For
      example, the profile form shows a 422 `details` message on the right field, the upload page
      shows `file_too_large`, the results page shows the partial banner, and login shows the 429
      message.
- [ ] No `dangerouslySetInnerHTML` and no `console.log` of tokens, passwords or business details.
- [ ] Types come from `api/types.ts`, with no `any` for API data.
- [ ] Reviewed by one other member.

---

## 9. Git workflow

- Branch from `main`: `feature/fe-<area>`, e.g. `feature/fe-setup`, `feature/fe-policies`,
  `feature/fe-coverage-tab`.
- Keep PRs small, one page or component each. Squash or merge commits are both fine; pick one.
- Changes to `api/types.ts` or the shared components need a review from the owner (see §6).
- Backend changes that the frontend needs (for example CORS for a production build, or a stored
  business profile) go in a **separate** backend PR, agreed with the owner of that code.

---

## 10. Risks and open questions

| # | Item | Plan |
|---|---|---|
| 1 | The analysis call can take up to ~10 min and the connection could drop | **Checked in step 6 (2026-09-26): works.** Headless Chrome → Vite dev proxy (`proxyTimeout: 0`) → real gateway and Agents 1–3 → an Agent 4 stand-in that waited 570 s before sending the real template report. The request returned `200` after 570 s with a `complete` analysis (11 findings). No proxy or browser timeout was hit. The History page stays the fallback if the tab is closed, since the gateway saves results anyway. A request longer than the gateway's own `EXPLANATION_TIMEOUT_SECONDS` (600 s) still comes back as `partial`, by design |
| 2 | Agent 3 currently returns only `unclear` / `not_found` (no interpreter yet) | Build and test with fixtures for all five statuses |
| 3 | The gateway has no CORS, so only the dev proxy works | Fine for the demo. For a production build, serve the built files from the same origin or add CORS on the gateway (separate PR) |
| 4 | The business profile isn't stored on the server | `sessionStorage` draft for now. Ask the team whether we want a `/profile` endpoint |
| 5 | Low-RAM laptops can't run the bigger local LLM | `qwen3:8b` (5.2 GB) does not fit on M4's 16 GB laptop, but `qwen3:4b` does (checked 2026-09-26: 3.2 GB in RAM on CPU, about 5–7 tokens/s, valid JSON output). Use `OLLAMA_MODEL=qwen3:4b` there and close big apps (Chrome, VS Code) during an LLM run. MSW and `-NoLlm` mode cover day-to-day development |
| 6 | Do we need a PDF/print export of the report? | Decide in week 1. A print stylesheet (`@media print`) is the cheapest option |
| 7 | TypeScript experience in the team | Keep types simple. `api/types.ts` is written once by M4 and everyone reviews it |

---

## 11. Implementation steps

We build the frontend in this order, one step at a time. Each step is one PR on its own branch
(the name is given), follows §8 (definition of done), and is merged before the next step that
depends on it. Steps 7–10 depend only on steps 1–6, so they can be built in parallel.
Tick a step here when its PR is merged.

### Step 1 – Project scaffold · M4 · `feature/fe-setup`

- [x] Remove the Streamlit stubs from `frontend/`: `app.py`, `api_client.py`, `pages/`,
      `components/` and `requirements.txt`. Copy the landing text into a note first, for step 7.
      Keep `assets/styles.css` until step 7 has used its colours.
- [x] Create a Vite React + TypeScript app in `frontend/`.
- [x] Add Tailwind, with the status colours from §4 as tokens in `tailwind.config.ts`.
- [x] Add ESLint + Prettier and the scripts `npm run dev`, `build`, `lint`, `typecheck` and `test`.
- [x] Add Vitest + React Testing Library, with setup in `src/test/`.
- [x] Add the dev proxy in `vite.config.ts` (§3.1).
- [x] Add `frontend/node_modules` and `frontend/dist` to `.gitignore`.
- **Done when:** `npm run dev` shows a placeholder page, and lint, typecheck and a sample test pass.

### Step 2 – API types and client · M4 · `feature/fe-api-client`

- [x] `src/api/types.ts`: TS copies of `BusinessProfile`, `PolicyDocument`, `AnalysisRequest`,
      `AnalysisResponse` (with `RiskProfileResponse`, `CoverageAnalysisResponse` and
      `ExplanationResponse` and their nested models), `AnalysisSummary`, `TokenResponse`,
      `UserResponse`, `GatewayError` and `ErrorResponse`. The enums are string unions.
- [x] `src/api/client.ts`: a `fetch` wrapper. It adds the base URL and the bearer token, parses
      JSON, and throws a typed `ApiError {status, error, message, stage?, details?, retryAfter?}`
      for every error shape in §3.3. On 401 it calls an `onUnauthorized` hook.
- [x] Unit tests for `client.ts`, with one test per error shape (401, 422, 429 with
      `Retry-After`, a `GatewayError` with `stage`, and a network failure).
- **Done when:** M1, M2 and M3 have reviewed `types.ts` against their Pydantic models.

### Step 3 – Mock API and fixtures · M4 + all · `feature/fe-mocks`

- [x] Add MSW. Start it in `main.tsx` only when `VITE_USE_MOCKS=true`, and add `.env.example`.
      `npm run dev:mocks` turns it on (via `.env.mocks`); `npm run dev` uses the real gateway.
- [x] Add handlers for every endpoint in §3.2, including the error cases. The handlers are driven
      by magic inputs, e.g. the password `wrong` → 401, and a file named `big.pdf` → 413.
      Add a slow mode for `POST /analyses` (a 20 s delay: a business name containing "Slow").
      The full list is at the top of `src/mocks/handlers.ts`.
- [x] Add fixtures in `src/mocks/fixtures/`, made by `python scripts/make_frontend_fixtures.py`
      (gateway + all four real agents in-process, no LLM):
      - `analysis-bakery.json` (the complete run) and `analysis-partial.json`;
      - `policies.json`;
      - full analyses for the three business types (each has its `risk_profile`);
      - `analysis-all-statuses.json`: hand-edited so all five statuses appear. It also has flagged
        evidence and evidence with no section.
      Real names and emails are replaced with made-up ones.
- **Done when:** the app runs fully on mocks with no backend running.

### Step 4 – Auth and app shell · M4 · `feature/fe-auth`

- [x] `src/auth/`: `AuthProvider` (token in memory and `sessionStorage`), `useAuth`, and
      `RequireAuth` (redirects to `/login?next=…`).
- [x] The router in `App.tsx` with every route from §4. Pages that don't exist yet are
      placeholders.
- [x] `Login.tsx` and `Register.tsx`. They handle 401, 409, 422, 429 (the button is disabled for
      the `Retry-After` time) and 503. After registering, the user is logged in automatically.
- [x] `components/Layout/`: the nav (Dashboard, Profile, Policies, New analysis, History), the
      user's email and Logout. Logout clears the token, the profile draft and the query cache.
- [x] `/app` checks the stored token with `GET /auth/me` on load.
- [x] A `NotFound` page.
- **Done when:** register → login → protected page → logout works on mocks. There are tests for
  the redirect, the 401 and the 429.

### Step 5 – Shared components · M1, M2, M3, M4 · one small PR each

- [x] `StatusBadge` (M3): colour and text label for each of the five statuses, a
      "Potential gap" tag, and the `complete` / `partial` badges.
- [x] `ConfidenceLabel` (M1): High / Medium / Low, with the number in a tooltip.
- [x] `EvidenceList` (M2): accepts both `EvidenceClause` and `EvidenceCitation`, maps
      `policy_id` to the filename, collapses long text, and warns on flagged clauses.
      Renders plain text only.
- [x] `AgentStatus` (M2): polls `/health/agents` every 30 s and shows the down agents.
- [x] `ErrorMessage` and `Disclaimer` (M4). `ErrorMessage` takes an `ApiError` and never shows
      raw JSON.
- [x] `AiLabel` (M4): one small label for "who wrote this", used by all three tabs. It shows
      "AI-written" / "Template" for `generated_by`, "AI-assisted" / "Rules" for Agent 3's
      `method`, and "AI" / "Rules" / "Rules + AI" for Agent 1's `source`. A tooltip names the
      model when it is known.
- **Done when:** each has a test covering its variants. M2 has a test for the flagged state and
  for text that contains HTML.

### Step 6 – The 10-minute request check · M3 · no PR (write the result here)

- [x] Run the real gateway with a slow Agent 4 (the real LLM, or a fake that sleeps 10 min), then
      call `POST /api/v1/analyses` through the Vite proxy from the browser.
- [x] Write the result in §10, risk 1. If it fails, fix the proxy settings before step 9.
      Result: passed (570 s, `200`, `complete`). No proxy changes were needed.

### Step 7 – Landing page and business profile · M1 · `feature/fe-profile`

- [x] `Landing.tsx`: the hero, the three capability cards and "Get started", reusing the
      InsureIntel text and colours. Then delete `frontend/assets/styles.css`.
- [x] `BusinessProfile.tsx` with React Hook Form. It has every field from §6 M1, with the limits
      from `shared/models/business.py`. The yes/no questions are three-way (Yes / No / Unknown →
      `null`). Equipment is a tag input.
- [x] The draft is saved to `sessionStorage` (§3.6), and "Save" leads on to the policies page.
- [x] A helper that maps 422 `details[].field` (`business.x.y`) onto form fields. Step 9 uses it
      too.
- **Done when:** there are tests for required fields, unknown → `null`, and a server 422 shown
  on the right field.

### Step 8 – Policies page · M2 · `feature/fe-policies`

- [x] `api/policies.ts`: `usePolicies` and `useUploadPolicy` (multipart, field `file`).
- [x] `Policies.tsx`: a drag-and-drop upload that checks the type and the 25 MB limit before
      sending and shows progress. Handles `invalid_pdf` and `file_too_large`. The list shows
      filename, pages, chunks, status and flagged count, plus an empty state.
- [x] Add `AgentStatus` to the nav.
- **Done when:** there are tests for the client-side size and type check, the server 400 and
  413, and the list and empty states.

### Step 9 – New analysis and progress · M3 · `feature/fe-new-analysis`

- [x] `api/analyses.ts`: `useRunAnalysis` (`retry: false`, no timeout), `useAnalyses` and
      `useAnalysis(id)`.
- [x] `NewAnalysis.tsx`:
      1. pick 1–5 policies that are `ready`;
      2. a profile summary with an "Edit" link (if there is no draft, go to the profile page);
      3. Run.
- [x] The progress screen from §3.4: the four steps, elapsed time, a "you can leave this page"
      note pointing to History, and a disabled Run button.
- [x] Errors: 502/503/504 name the failed step (`stage`) and offer Retry; `404
      policy_not_found`; 422 goes back to the profile.
- [x] On success, go to `/app/analyses/:request_id` and put the response in the query cache.
- **Done when:** there are tests for the policy limit, the progress screen and each error path.

### Step 10 – Results page · M4 (shell + Report), M3 (Coverage), M1 (Risk profile)

Three PRs. M4's goes first, because it contains the tab slots.

- [x] `feature/fe-results` (M4): `ResultsPage.tsx`, with the header (date, status badge,
      headline, counts by status), the disclaimer that is always shown, the warnings, the partial
      banner, the "AI used" line from §4 and the tabs. The default tab is Report, or Coverage when the result is partial.
      `ReportTab.tsx` shows finding cards sorted by priority, with the tags "Potential gap",
      "Verify with your insurer" and "AI-written" / "Template", and `EvidenceList`.
      404 → an "Analysis not found" state.
- [x] `feature/fe-coverage-tab` (M3): `CoverageTab.tsx` with the table, the status filter,
      "gaps only", expanding rows with evidence, and `AiLabel` for `method`.
- [x] `feature/fe-risk-tab` (M1): `RiskProfileTab.tsx`, grouped by category, showing source,
      confidence, the input that led to each risk, and the profile warnings.
- **Done when:** there are tests using the complete and partial fixtures, the five-status fixture
  and the 404.

### Step 11 – History and dashboard · M4 (History), M3 (Dashboard)

- [x] `feature/fe-history` (M4): `History.tsx` lists analyses newest first (date, status, gaps,
      findings) and opens the results page. Includes an empty state.
- [x] `feature/fe-dashboard` (M3): `Dashboard.tsx` with the 3-step checklist (profile, a ready
      policy, an analysis) and a card for the latest analysis.
- **Done when:** each has a test for the empty state and the list/checklist.

### Step 12 – Real gateway integration · all · `feature/fe-integration`

- [x] Run `scripts/start_agents.ps1 -NoLlm` and the gateway, then `npm run dev` (MSW off).
- [x] Walk the whole flow: register → profile → upload `data/sample_policies/...` → analysis →
      results → history → logout. Each member checks their own pages.
- [x] Get a `partial` result by stopping Agent 4 during a run, and a 503 by stopping Agent 1.
- [x] Do the full flow once with the LLMs switched on (Gemini for Agent 1, Ollama or Gemini for
      Agents 3 and 4), using `scripts/start_agents.ps1` without `-NoLlm`. On M4's laptop set
      `OLLAMA_MODEL=qwen3:4b` (see §10, item 5); a report then takes several minutes, and some
      findings may fall back to templates when Agent 4's time budget runs out. Check the slow
      progress screen, the "AI-written" labels and the "AI used" line, and that long LLM
      explanations still fit the layout.
- [x] Run `python scripts/make_frontend_fixtures.py --use-llm` with the same settings and commit
      the fixtures, so the mock API has real LLM wording from then on.
- [ ] Log each contract mismatch as an issue for the agent's owner. Don't work around backend
      bugs in the UI.
- **Done when:** the whole flow works on the real backend and every mismatch is fixed or logged.

#### Step 12 results (2026-09-26)

Run with the real gateway and all four real agents (on test ports with throwaway data, so the
normal `data/app.db` was not touched), driven through the real UI in Chrome.

| Check | Result |
|---|---|
| Register → dashboard (agent status "All services up") | Works |
| Business profile form → saved → Policies | Works |
| Upload a text PDF + `data/sample_policies/adversarial/TestDoc1.pdf` | Works; both Ready (TestDoc1: 5 pages, 14 sections) |
| Analysis → results (Report / Coverage / Risk profile tabs) | Works; `complete`, 13 risks, no page errors |
| History → open → logout (token cleared) | Works |
| Agent 4 stopped | `partial` result, banner, Coverage tab opens, header shows "1 service down" |
| Agent 1 stopped | 503 "A required analysis service is not available", step "Risk profiling", Try again |
| No frontend ↔ gateway contract mismatch was found | – |
| LLM run (Agent 4 on `qwen3:4b`) | Works once enough RAM is free. First try: Ollama could not load the model with ~1.3 GB free ("unable to allocate CPU_REPACK buffer"); Agent 4 fell back to 13 template findings after its 280 s budget and the UI said "No AI model was used". Second try, with other apps closed (3.5 GB free): `complete` after 356 s, 8 of 13 findings AI-written (two batches of 4 accepted, the rest template after the time budget), header "AI used: qwen3:4b via Ollama (report: 8 of 13 findings)", AI-written labels on 8 cards, no page errors |
| `make_frontend_fixtures.py --use-llm` | Done: the fixtures now hold real `qwen3:4b` wording (bakery 5 of 14, restaurant 8 of 18, retail shop 6 of 14 findings AI-written; the rest template after the time budget). Hand-edited findings in `analysis-all-statuses.json` are always labelled Template |

Backend findings for the agents' owners (not worked around in the UI):

1. **Agent 2 (M2):** a PDF with very little text is stored as `ready` with `chunk_count: 0` and
   no warning, so it silently never provides evidence. Suggest `failed`, or a `warnings` entry
   in the upload response. (The Policies page now shows a note for such a policy.)
2. **Agent 3 (M3):** the API builds `CoverageAnalysisService()` without an interpreter, so the
   LLM step never runs (known issue I7). Its notes also use internal IDs, e.g.
   "LLM interpretation was unavailable for risk 'PROP_THEFT'"; the risk name would be clearer.
3. **Agent 4 (M4):** the flagged-clause warning names the policy by ID (`POL-…`) instead of its
   filename, and is repeated once per finding that cites it (the UI de-duplicates it).
4. **Agent 4 (M4):** when Ollama cannot load the model, batches 1 and 2 failed in ~3–5 s but
   batch 3 waited 288 s before failing, so a report with zero LLM text took 5 minutes. Stopping
   after the first "model could not be loaded" error would return the template report at once.
5. **Agent 1 (M1):** only uses Gemini and ignores `LLM_PROVIDER=ollama`; with no
   `GEMINI_API_KEY` it is rule-based ("The AI assistant is not configured…"). Fine, but worth
   documenting in the README.

### Step 13 – Polish and accessibility · all · small PRs

- [ ] Loading skeletons and empty states on every page.
- [ ] Works at 360 px width.
- [ ] Keyboard navigation and visible focus.
- [ ] Labels on all inputs.
- [ ] Status is never shown by colour alone.
- [ ] Contrast checked.
- [ ] A print stylesheet for the results page, if we decided on it in §10, item 6.
- [ ] No `console.log` of tokens, passwords or business details (grep for it).

### Step 14 – Docs and demo · M4 + all · `feature/fe-docs`

- [ ] A frontend section in the root `README.md`: install, run on mocks, run against the
      gateway, test.
- [ ] Update `docs/architecture.md` and `docs/project-structure.md` to say the frontend is React.
- [ ] Screenshots for the report, and a demo script that walks the flow in step 12.
