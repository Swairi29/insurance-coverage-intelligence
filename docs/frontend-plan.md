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
| 502 / 503 / 504 | `GatewayError` with `stage` (`risk_profiling`, `policy_retrieval`, …) | "The analysis could not finish at step X. Please try again." plus a Retry button |

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

| Tab | Data | Content |
|---|---|---|
| **Report** (default when there is one) | `report.findings[]` | One card per finding, sorted high → medium → low priority. Shows title, status badge, "Potential gap" tag, explanation, recommendation, a "Verify with your insurer" tag when `verification_required`, a small "AI-written" / "Template" label from `generated_by`, and the evidence list |
| **Coverage** (default when partial) | `coverage.assessments[]` | A table with columns risk, status, gap, confidence and reason. Filter by status and "gaps only". A row expands to show its evidence |
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
    │   ├── handlers.ts
    │   └── fixtures/
    │       ├── analysis-complete.json
    │       ├── analysis-partial.json
    │       └── policies.json
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

- Turn MSW off (`VITE_USE_MOCKS=false`) and run against the real gateway with all four agents.
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
| 1 | The analysis call can take up to ~10 min and the connection could drop | Week-1 check; the History page is the fallback since the gateway saves results anyway |
| 2 | Agent 3 currently returns only `unclear` / `not_found` (no interpreter yet) | Build and test with fixtures for all five statuses |
| 3 | The gateway has no CORS, so only the dev proxy works | Fine for the demo. For a production build, serve the built files from the same origin or add CORS on the gateway (separate PR) |
| 4 | The business profile isn't stored on the server | `sessionStorage` draft for now. Ask the team whether we want a `/profile` endpoint |
| 5 | Members' laptops can't all run the LLM | MSW + `-NoLlm` mode cover development; only one real LLM run is needed |
| 6 | Do we need a PDF/print export of the report? | Decide in week 1. A print stylesheet (`@media print`) is the cheapest option |
| 7 | TypeScript experience in the team | Keep types simple. `api/types.ts` is written once by M4 and everyone reviews it |
