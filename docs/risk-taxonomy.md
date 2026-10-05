# Risk Taxonomy

The Risk Profiling Agent (Agent 1) picks risks from a fixed list of 19 **business risks**. The
list describes what can go wrong for the business, not insurance products: whether a policy
covers a risk is decided later by Agents 2 and 3.

The list is defined in code in [agents/risk_agent/taxonomy.py](../agents/risk_agent/taxonomy.py)
(`TAXONOMY_VERSION = "1.0"`). This page describes that file. If the two disagree, the code is
right and this page should be updated.

## Categories

Each risk belongs to one of seven categories (`RiskCategory` in
[shared/models/risk.py](../shared/models/risk.py)):

| Category | Value | What it groups |
|---|---|---|
| Property | `property` | Theft, weather and transit damage to premises, stock and goods |
| Fire | `fire` | Fire from cooking, electrics or combustible materials |
| Equipment | `equipment` | Breakdown of machinery and refrigeration |
| Employee | `employee` | Harm to staff, and harm caused by staff |
| Business interruption | `business_interruption` | Trading stops because of damage, outages or suppliers |
| Liability | `liability` | Injury or illness caused to customers and the public |
| Cyber | `cyber` | Data breaches, payment fraud and system outages |

## The 19 risks

**Applies to** says which business types the risk can be reported for. **Assumed for** says
which types get it even when the profile gives no details that point to it (see
[How a risk is identified](#how-a-risk-is-identified)). "Food" means bakery, restaurant and café;
"retail" means general retail shop, grocery store, pharmacy, clothing store and hardware store.

| ID | Risk | Category | Applies to | Assumed for | Indicators (any one is enough) |
|---|---|---|---|---|---|
| `PROP_THEFT` | Theft, burglary and vandalism | Property | All | All | stock on premises, cash handling, valuable equipment |
| `PROP_WEATHER` | Flood, storm and water damage | Property | All | All | flood-prone area, stock on premises |
| `PROP_TRANSIT` | Loss or damage of goods in delivery | Property | All | None | delivery channel, online orders |
| `FIRE_COOKING` | Fire from cooking and baking equipment | Fire | Food | Food | cooking equipment, gas supply |
| `FIRE_ELECTRICAL` | Electrical fire | Fire | All | All | electrical equipment, refrigeration |
| `FIRE_COMBUSTIBLES` | Fire or explosion from combustible materials | Fire | All | None | combustible materials, gas supply |
| `EQP_BREAKDOWN` | Equipment breakdown | Equipment | All | Food | cooking equipment, refrigeration, production equipment, POS system |
| `EQP_REFRIGERATION` | Refrigeration failure and stock spoilage | Equipment | All | Food | refrigeration, perishable stock |
| `EMP_INJURY` | Employee injury at work | Employee | All | None | has employees, hazardous work tasks, cooking equipment |
| `EMP_DISHONESTY` | Employee theft or fraud | Employee | All | None | has employees, cash handling, stock on premises |
| `BI_PREMISES_CLOSURE` | Forced closure after premises damage | Business interruption | All | All | single location, physical premises |
| `BI_UTILITY_OUTAGE` | Power, gas or water outage | Business interruption | All | None | refrigeration, cooking equipment, POS system |
| `BI_SUPPLIER` | Supplier or supply-chain disruption | Business interruption | All | None | relies on few suppliers, perishable stock, imported goods |
| `LIA_PUBLIC` | Customer or visitor injury on premises | Liability | All | All | customer footfall, physical premises |
| `LIA_FOOD_SAFETY` | Food-borne illness and allergen incidents | Liability | All | Food | prepares food, sells food, common allergens |
| `LIA_PRODUCT` | Harm caused by products sold | Liability | Retail | Retail | sells physical goods, resells third-party products |
| `CYB_DATA_BREACH` | Customer data breach | Cyber | All | None | stores customer data, online orders, loyalty program |
| `CYB_PAYMENT_FRAUD` | Payment fraud and chargebacks | Cyber | All | None | card payments, online orders |
| `CYB_SYSTEM_OUTAGE` | Ransomware or system outage | Cyber | All | None | POS system, online orders, cloud systems |

Every risk also has a one-sentence `reason` (why it matters), which is shown to the user. Risk IDs
are stable: other agents and stored results refer to them, so an ID is never renamed or reused.

### What each business type gets

Salons, repair workshops, offices and "Other" are not food or retail types. They can get every
risk except `FIRE_COOKING` and `LIA_PRODUCT`, but only the general risks are assumed for them;
the rest need a matching detail in the profile.

| Business type | Assumed with no details |
|---|---|
| Bakery, restaurant, café | 9: the five general ones, plus `FIRE_COOKING`, `EQP_BREAKDOWN`, `EQP_REFRIGERATION`, `LIA_FOOD_SAFETY` |
| Retail types | 6: the five general ones, plus `LIA_PRODUCT` |
| Salon, workshop, office, Other | 5 general ones: `PROP_THEFT`, `PROP_WEATHER`, `FIRE_ELECTRICAL`, `BI_PREMISES_CLOSURE`, `LIA_PUBLIC` |

## Indicators

An indicator is a tag such as `cash_handling` or `refrigeration` that the profile supports
([agents/risk_agent/features.py](../agents/risk_agent/features.py)). There are 30 tags, listed in
`FEATURE_TAGS`. They come from three places, in this order of priority:

1. **Structured answers** in the business profile:

   | Profile field | Tag |
   |---|---|
   | `employee_count` above 0 | `has_employees` |
   | Sales channel `online` | `online_orders` |
   | Sales channel `delivery` | `delivery_channel` |
   | Sales channel `in_store` | `customer_footfall`, `physical_premises` |
   | `accepts_card_payments` = yes | `card_payments` |
   | `handles_cash` = yes | `cash_handling` |
   | `stores_customer_data` = yes | `stores_customer_data` |
   | `operates_single_location` = yes | `single_location` |
   | `location.flood_prone_area` = yes | `flood_prone_area` |

2. **The equipment list**, matched against keywords. "Oven" gives `cooking_equipment`,
   "Refrigerator" gives `refrigeration`, "Dough mixer" gives `production_equipment` and
   `electrical_equipment`.
3. **Keywords in the description** (and in the "Other" business-type text, e.g. "printing
   shop"). At most three phrases per tag are kept as evidence.

The keywords are in [agents/risk_agent/rules/feature_lexicon.json](../agents/risk_agent/rules/feature_lexicon.json),
so they can be extended without changing code. Matching is whole-word and allows plurals
("oven" matches "ovens"); it does not understand grammar, so "we do **not** deliver" still
matches `delivery_channel`.

**An explicit "No" wins.** If the owner answers No to "Handles cash" (or enters 0 employees),
that tag is removed even if the description mentions cash or staff. "Not sure" is different
from No: it adds nothing and removes nothing.

## How a risk is identified

The rule engine ([agents/risk_agent/rule_engine.py](../agents/risk_agent/rule_engine.py)) goes
through the risks that apply to the business type:

1. **Matched:** at least one of the risk's indicators is present. Confidence is
   0.6 + 0.1 per matching indicator, capped at 0.9. The reason ends with the evidence, e.g.
   "(based on: ovens and refrigerators)".
2. **Assumed:** no indicator matched, but the risk is assumed for this business type.
   Confidence is 0.3, and the reason says so: "(assumed for a bakery; no matching details were
   provided)".
3. Otherwise the risk is not reported.

Each risk is reported at most once, highest confidence first. The rules use no AI, so every
result can be traced back to a profile answer.

### The optional AI step

When `GEMINI_API_KEY` is set, Agent 1 also asks Gemini which risks from the same list apply
([agents/risk_agent/risk_merger.py](../agents/risk_agent/risk_merger.py)). The AI cannot invent
risks or remove rule results:

| Case | Result |
|---|---|
| Rules and AI both found it | Source `rule+llm`, confidence +0.1 (max 0.95), the AI's business-specific reason, the rules' evidence |
| Only the AI found it | Source `llm`, confidence capped at 0.6 so it never outranks a rule match, no evidence |
| AI suggests an ID not in the list, or confidence below 0.4 | Ignored |

Names and categories always come from the taxonomy, never from the AI. Without an API key the
rule results are returned unchanged; if the Gemini call fails, they are returned with an
`llm_unavailable` warning.

## Changing the taxonomy

- **New risk:** add one `RiskDefinition` to `RISK_TAXONOMY`. Agents 2–4 need no changes: Agent 2
  searches the policies with the risk's name plus the keywords for its category
  ([agents/policy_agent/synonyms.json](../agents/policy_agent/synonyms.json)), so a new category
  also needs an entry there.
- **New indicator tag:** add it to `FEATURE_TAGS` and give it keywords in `feature_lexicon.json`.
  The lexicon loader refuses unknown tags, and
  [agents/risk_agent/tests/test_taxonomy.py](../agents/risk_agent/tests/test_taxonomy.py) checks
  that the two files stay consistent.
- Raise `TAXONOMY_VERSION` when risks are added, removed or change meaning.
