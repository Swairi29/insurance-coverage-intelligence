# Demo script: InsureIntel web app

A 10–12 minute walk through the whole system in the browser. Screenshots of each screen are in
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
   5–6 minutes, which is too long to wait for in front of an audience.
3. **Terminal 2, frontend:** `cd frontend` then `npm run dev`, and open http://127.0.0.1:5173.
4. **Prepare an LLM result to show** (optional, do it before the demo): restart the backend
   without `--no-llm` (with `OLLAMA_MODEL=qwen3:4b`), run one analysis, and leave it in History.
   Then restart with `--no-llm` for the live part.
5. Have two policy PDFs ready, e.g. `data/sample_policies/adversarial/TestDoc1.pdf` and a short
   synthetic business-pack PDF.

**Fallback:** if the backend will not start, run `npm run dev:mocks` instead and log in as
`demo@insureintel.test` / `demo-password-1`. Everything below works the same on saved data.

## The walkthrough

| # | Do | Say |
|---|---|---|
| 1 | Landing page, scroll to "How it works" | SMEs often do not know which of their risks their policies cover. Four agents check that, step by step, and explain the result. |
| 2 | **Get started** → register a new account | Passwords are hashed with bcrypt; login uses a JWT; five wrong logins lock the account for 15 minutes. |
| 3 | Dashboard | Three steps: describe the business, upload policies, run an analysis. The dot at the top shows that all four agents are up. |
| 4 | **Business profile**: Sunrise Bakery, bakery, 8 employees, equipment Ovens / Refrigerators / Mixers, handles cash Yes, flood-prone Yes | "Not sure" is sent as unknown, not as No, so the agent does not assume anything. The profile stays in this browser tab only. |
| 5 | **Policies**: drop both PDFs | Each PDF is checked, stored encrypted and split into sections. Clauses that look like instructions ("ignore previous instructions…") are flagged and never sent to the AI. |
| 6 | **New analysis** → Run | Four steps: risk profiling, policy evidence, coverage analysis, report writing. With an LLM the last step takes minutes; the page shows progress and you can leave, the result goes to History. |
| 7 | **Results → Report tab** | The headline and counts. Each finding has its status, whether it is a potential gap, a "verify with your insurer" tag, what to do, and the exact policy wording it is based on (policy, section, page). The disclaimer is always shown: this is decision support, not advice. |
| 8 | **Coverage tab**: filter "Potential gaps only", expand a row | Agent 3 decides the status from the evidence; Agent 4 only explains it and can never change it. Confidence is shown as High/Medium/Low, not as a percentage. |
| 9 | **Risk profile tab** | Why each risk was identified: the profile answers behind it, and whether rules or AI found it. |
| 10 | **History** → open the LLM analysis prepared earlier | The header names the model ("AI used: qwen3:4b via Ollama, 8 of 13 findings"). Each card is labelled AI-written or Template; if the AI runs out of time, standard wording is used instead. |
| 11 | **Print report** | The whole report prints (or saves as PDF) with all three sections. |
| 12 | *Optional, resilience:* stop only Agent 4 in a third PowerShell terminal with `Stop-Process -Id (Get-NetTCPConnection -LocalPort 8004 -State Listen).OwningProcess`, then run an analysis (the dot now says "1 service down") | The result is still shown, marked **Partial**: the coverage results are complete, only the written report is missing. If Agent 1 is down the page says which step failed and offers Try again. |
| 13 | **Log out** | The token and the business profile are cleared from the browser. |

## If something goes wrong

| Problem | What to do |
|---|---|
| Login says "not available right now" | `JWT_SECRET_KEY` is missing in `.env`; set it and restart the backend. |
| The dot says "services down" | Check the backend terminal and `logs/<service>.err.log`; restart with the start script. |
| An upload shows "0 sections" | The PDF has no readable text (e.g. a scan without OCR); use a text-based PDF. |
| The analysis stays on the progress screen | With an LLM this is normal for up to ~10 minutes. For the live demo use `--no-llm`. |
| Anything else | Switch to `npm run dev:mocks` and continue on saved data. |
