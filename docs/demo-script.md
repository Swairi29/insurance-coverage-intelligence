# Demo script: InsureIntel web app

A 12–15 minute walk through the whole system in the browser, written so it can also be followed
when recording a demo video. Screenshots of each screen are in
[images/frontend/](images/frontend/).

## Before the demo (10 minutes early)

1. **Free memory** if you will show the LLM: close Chrome tabs you do not need, other dev servers
   and large apps. `qwen3:4b` needs about 3 GB free (see the README).
2. **Terminal 1, backend** (from the project root, with the global Python, not the venv):
   ```bash
   bash scripts/start_agents.sh --no-llm          # Git Bash
   .\scripts\start_agents.ps1 -NoLlm              # PowerShell
   ```
   Wait until all five services say `up`. Use `--no-llm` for the live run: an LLM report takes
   5–6 minutes, which is too long to wait for in front of an audience. Without an LLM the run
   takes a few seconds, and the Ask panel gives rule-based answers.
3. **Terminal 2, frontend:** `cd frontend` then `npm run dev`, and open http://127.0.0.1:5173.
4. **Seed the demo account** (in a third terminal, once the services are up):
   ```bash
   python scripts/seed_demo.py
   ```
   This creates `demo@insureintel.test` / `demo-password-1` with two policies and a finished
   analysis. For an AI-written report to show, start the backend *without* `--no-llm` (with
   `OLLAMA_MODEL=qwen3:4b`) before seeding (about 5–6 minutes), then restart it with `--no-llm`
   for the live part.
5. Have two policy PDFs ready, e.g. `data/sample_policies/adversarial/TestDoc1.pdf` and a short
   synthetic business-pack PDF.

**Fallback:** if the backend will not start, run `npm run dev:mocks` instead and log in as
`demo@insureintel.test` / `demo-password-1`. Everything below works the same on saved data,
including the agent workspace (it plays through the four agents in about 8 seconds) and the Ask
panel.

**For a recording:** `npm run dev:mocks` is the most reliable choice: no backend, the same result
every time, and no waiting. Use a browser window about 1440 px wide.

## The walkthrough

| # | Do | Say |
|---|---|---|
| 1 | **Landing page**: scroll through "How the four agents work together", the example finding and "Built responsibly" | SMEs often do not know which of their risks their policies cover. Four agents check that, step by step, and every result points to the policy wording behind it. |
| 2 | Scroll to **Pricing** | The proposed plans in LKR, from a free tier to a broker plan; paying yearly costs 10 months. The prototype takes no payments. The reasoning behind the figures is in `docs/commercialisation.md`. |
| 3 | **Get started** → register a new account. Open the **privacy and data processing notice** link, then tick the box | Passwords need 8 characters and are hashed with bcrypt; login uses a JWT; five wrong logins lock the account for 15 minutes. An account cannot be created without agreeing to the notice: the server checks the notice version and records when the user agreed. |
| 4 | **Dashboard** | Three steps: describe the business, upload policies, run an analysis. The dot at the top shows that all four agents are up. |
| 5 | **Business profile**: open the *Type of business* list, then fill in Sunrise Bakery, bakery, 8 employees, equipment Ovens / Refrigerators / Mixers, handles cash Yes, flood-prone Yes | There are 11 business types in three groups. For anything else, choose **Other** and type what the business is, e.g. "printing shop": only general risks are assumed for it, and the text is searched like the description. "Not sure" is sent as unknown, not as No, so the agent does not assume anything. The profile stays in this browser tab only. |
| 6 | **Policies**: drop both PDFs | Each PDF is checked (by its content, not its name), stored encrypted and split into sections. Sections that look like instructions ("ignore previous instructions…") are flagged and never sent to the AI. |
| 7 | **New analysis** → choose the policies → **Run analysis** | The page opens the agent workspace straight away; the analysis runs on the server. |
| 8 | **Agent workspace**: watch the four agent cards and the **Handoff log** | Each card shows what the agent is doing and what it returned. The handoff log is every message of the run: the gateway calls an agent, the agent answers, the gateway passes the result to the next one. Agents never talk to each other. Only counts are logged, never business or policy details. You can leave this page; the result is saved to History. |
| 9 | **View results** → **Report tab** | The headline and counts. Each finding has its status, whether it is a potential gap, a "verify with your insurer" tag, what to do, and the exact policy wording it is based on (policy, section, page). The disclaimer is always shown: this is decision support, not advice. |
| 10 | **Coverage tab**: click the **Potential gaps** filter, then click a risk name | The evidence panel opens: why the status was given, the quoted policy wording, and which agent produced each part. Agent 3 decides the status from the evidence; Agent 4 only explains it and can never change it. Confidence is shown as High/Medium/Low, not as a percentage. Escape closes the panel. |
| 11 | **Risk profile tab** | Why each risk was identified: the profile answers behind it, and whether rules or AI found it. A risk with no matching answer says it was "assumed for a bakery". |
| 12 | **Ask about this analysis** (below the tabs): click an example question, then type "Does my policy cover flood damage?", then "What is the weather tomorrow?" | Answers use only this analysis and the policy wording it found, and cite the clauses. Each answer is labelled AI-written or Template. A question the analysis cannot answer is said to be "Not answered by this analysis", rather than guessed. Questions are not stored. |
| 13 | Log in as the demo account, **History** → open the seeded analysis | The header names the model ("AI used: qwen3:4b via Ollama, 8 of 13 findings"). Each card is labelled AI-written or Template; if the AI runs out of time, standard wording is used instead. **How the agents ran** reopens the workspace for this run, with its timings. |
| 14 | **Print report** | The whole report prints (or saves as PDF) with all three sections. |
| 15 | *Optional, resilience:* stop only Agent 4 in a third PowerShell terminal with `Stop-Process -Id (Get-NetTCPConnection -LocalPort 8004 -State Listen).OwningProcess`, then run an analysis (the dot now says "1 service down") | The workspace shows Agent 4's step as failed and the run as **Partial**: the coverage results are complete, only the written report is missing. If Agent 1 is down, the workspace says which step failed and offers **Retry analysis**. On mocks, use the business name `Partial Ltd` or `Down Ltd` instead. |
| 16 | **Log out** | The token and the business profile are cleared from the browser. |

## If something goes wrong

| Problem | What to do |
|---|---|
| Login says "not available right now" | `JWT_SECRET_KEY` is missing in `.env`; set it and restart the backend. |
| Registration says to agree to the notice, although the box is ticked | The backend and frontend consent versions differ; restart both from the same commit. |
| The dot says "services down" | Check the backend terminal and `logs/<service>.err.log`; restart with the start script. |
| An upload shows "0 sections" | The PDF has no readable text (e.g. a scan without OCR); use a text-based PDF. |
| The workspace stays on Agent 4 for minutes | With an LLM this is normal for up to ~10 minutes. For the live demo use `--no-llm`, or leave the page and open the result from History later. |
| An Ask answer takes long | With a local LLM an answer can take a minute or two (the gateway waits up to 150 s). With `--no-llm` it is instant. |
| Anything else | Switch to `npm run dev:mocks` and continue on saved data. |
