# Commercialisation plan

InsureIntel helps small and medium-sized businesses (SMEs) understand what their insurance
policies actually cover. This page sets out who would pay for it, the proposed prices and the
reasoning behind them. The prototype takes **no payments**; the landing page shows these tiers
only to present the plan. The figures are in one place in the code,
`frontend/src/lib/pricing.ts`, and must be changed there and here together.

## 1. The problem and who pays

- Most SME owners never read their policy wording in full. Gaps (an excluded flood, equipment
  breakdown with no cover) are usually found only when a claim is refused.
- Brokers spend hours reading policies to answer one client's "am I covered for…?" question.
- InsureIntel reads the business profile and the policy PDFs, checks each business risk
  against the wording and shows the exact clause behind every answer.

| Segment | Pain | Who pays |
|---|---|---|
| Owner-run shops, cafés, salons | No time or expertise to read policies | The owner, monthly |
| Growing SMEs (10-50 staff, several policies) | Many overlapping policies, renewals | The business, monthly or yearly |
| Insurance brokers and agents | Reviewing many clients' policies by hand | The broker, per seat / volume |

Launch market: Sri Lanka (prices in LKR), where SMEs make up the large majority of businesses
and insurance is mostly sold through brokers and agents.

## 2. Pricing

| Tier | Price (LKR / month) | Annual (2 months free) | Includes |
|---|---|---|---|
| **Free** | 0 | 0 | 2 policy PDFs, 2 analyses a month, coverage status and cited clauses, standard (template) explanations |
| **Starter** | 2,490 | 24,900 | 10 policy PDFs, 10 analyses a month, AI-written explanations and next steps, full history |
| **Business** | 6,990 | 69,900 | 30 policy PDFs, 40 analyses a month, questions about each analysis, print-ready reports |
| **Broker** | 19,990 | 199,900 | 200 analyses a month, up to 25 client businesses (planned), priority processing, support within one working day |

Why these tiers:

- **Free** has no AI cost (template explanations run on rules only), so it can be offered at
  zero marginal cost and lets an owner see a real finding on their own policy.
- **Starter → Business** is the step most SMEs make when they hold more than one policy; the
  question feature is in Business because it makes the most LLM calls.
- **Broker** prices volume: one broker serving 25 SMEs pays less than LKR 800 per client a
  month, well below the time it saves.
- "Planned" features (multi-client workspace) are on the roadmap and are labelled as such on
  the landing page.

## 3. Unit economics (assumptions)

The estimates below use stated assumptions, not measured production figures. They should be
re-checked against real usage before launch.

| Item | Assumption | Monthly cost (LKR) |
|---|---|---|
| Hosting (gateway, four agents, database) | One small cloud VM | ~ 15,000 |
| LLM calls | Gemini Flash API; a 14-risk report plus a few questions per analysis | well under 30 per analysis |
| Storage | Encrypted PDFs and results | < 1,000 |

- At these assumptions, **about 10 paying Starter accounts cover the fixed hosting cost**,
  and each extra analysis costs a small fraction of the tier price.
- Running Agent 4 on a local model (Ollama) removes the per-call LLM cost entirely, at the
  price of slower reports; this is an option for brokers with data-residency concerns.

## 4. Go-to-market

1. **Free tier first**: owners try one policy and see a real cited finding.
2. **Brokers as a channel**: brokers use InsureIntel with their SME clients and upgrade them
   to Starter or Business.
3. **Partnerships**: chambers of commerce and SME associations (for example, through member
   newsletters and workshops).

## 5. Risks and responsible use

- InsureIntel is **decision support, not advice**: every result tells the user to confirm with
  their insurer or broker (see `docs/responsible-ai.md`). Selling it as advice would need a
  regulated partner.
- Policy documents are sensitive: they are encrypted at rest, and the consent notice
  (`/privacy` in the app) explains when clauses are sent to an AI provider.
- Pricing must stay above LLM and hosting costs if usage per analysis grows; the per-tier
  analysis limits protect against that.
