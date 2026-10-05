# Input Specification

What the system accepts from a user, and how each input is checked and cleaned. There are four
inputs: the **business profile**, the **policy PDFs**, the **account details** and the
**questions** asked about an analysis.

All of them reach the agents through the gateway
([services/orchestration/api.py](../services/orchestration/api.py)); the endpoints are in
[api-specification.md](api-specification.md). The models below are the source of truth. If this
page and the code disagree, the code is right.

## 1. Business profile

Defined by `BusinessProfile` in [shared/models/business.py](../shared/models/business.py) and
sent with every analysis (`POST /api/v1/analyses`). Agent 1 turns it into risks; see
[risk-taxonomy.md](risk-taxonomy.md) for how each answer is used.

Only the name and the type are required. Everything else is optional, because an owner may not
know every answer and a partial profile must never break an analysis.

### Fields

| Field | Web form label | Type | Required | Limits |
|---|---|---|---|---|
| `business_name` | Business name | text | Yes | 1–100 characters, one line |
| `business_type` | Type of business | one of the types below | Yes | |
| `business_type_detail` | What kind of business is it? (only for "Other") | text | No | up to 60 characters, one line |
| `description` | What does the business do? | text | No | up to 2,000 characters, line breaks kept |
| `employee_count` | Number of employees | whole number | No | 0–250 (the upper bound for an SME) |
| `equipment` | Equipment | list of text | No | up to 50 items, each up to 60 characters |
| `operations.sales_channels` | How do you sell? | list of `in_store`, `online`, `delivery`, `wholesale` | No | |
| `operations.accepts_card_payments` | Yes / No / Not sure | yes/no/unknown | No | |
| `operations.handles_cash` | Yes / No / Not sure | yes/no/unknown | No | |
| `operations.stores_customer_data` | Yes / No / Not sure | yes/no/unknown | No | |
| `operations.operates_single_location` | Yes / No / Not sure | yes/no/unknown | No | |
| `location.city`, `location.district`, `location.country` | City, District, Country | text | No | up to 80 characters each |
| `location.flood_prone_area` | Is the business in a flood-prone area? | yes/no/unknown | No | |

### Business types

| Value | Shown as | Group |
|---|---|---|
| `bakery` | Bakery | Food and drink |
| `restaurant` | Restaurant | Food and drink |
| `cafe` | Café | Food and drink |
| `retail_shop` | General retail shop | Shops |
| `grocery_store` | Grocery store / supermarket | Shops |
| `pharmacy` | Pharmacy | Shops |
| `clothing_store` | Clothing store | Shops |
| `hardware_store` | Hardware store | Shops |
| `salon` | Salon / barber | Services |
| `repair_workshop` | Repair workshop / garage | Services |
| `professional_services` | Office / professional services | Services |
| `other` | Other (describe it) | Something else |

For `other`, the owner types what the business is (e.g. "printing shop") in
`business_type_detail`. Only general risks are assumed for it, and the typed text is searched for
keywords like the description. The web form sends `business_type_detail` only when the type is
`other`.

API callers may use friendly spellings. The type is lowercased, spaces and hyphens become `_`,
and common aliases are mapped: `Retail Shop` → `retail_shop`, `coffee shop` → `cafe`,
`supermarket` → `grocery_store`, `chemist` → `pharmacy`, `boutique` → `clothing_store`,
`barber` → `salon`, `garage` → `repair_workshop`, `office` → `professional_services` (full list
in `_BUSINESS_TYPE_ALIASES`). Anything else is rejected with a 422.

### Yes / No / Not sure

The yes/no fields have three values, and they mean different things:

| Form answer | Sent as | Effect |
|---|---|---|
| Yes | `true` | Adds the matching risk indicator |
| No | `false` | Removes that indicator, even if the description suggests it |
| Not sure | `null` | Nothing is assumed either way |

So "Not sure" is never treated as No.

### Cleaning

Before the profile is used (and before any of it can reach an LLM prompt):

- Leading and trailing spaces are removed from all text.
- Control characters are removed. One-line fields also have their whitespace collapsed to
  single spaces; the description keeps its line breaks.
- An empty optional text field becomes "not provided" (`null`).
- Equipment: blank items are dropped, and duplicates are removed ignoring case ("Oven" and
  "oven" count once).
- Sales channels: spellings are normalised (`In Store` → `in_store`) and duplicates removed.
- `"operations": null` and `"location": null` mean the same as leaving them out.
- **Unknown fields are rejected**, so a typo such as `employe_count` gives a 422 instead of being
  silently ignored.

### Where the profile is kept

The gateway does not save the profile on its own. It is stored only inside each saved analysis
result, encrypted with `DOCUMENT_ENCRYPTION_KEY`. In the web app, the profile form is kept in the
browser tab's `sessionStorage` and cleared on logout.

### Example

```json
{
  "business_name": "Sunrise Bakery",
  "business_type": "bakery",
  "description": "Neighbourhood bakery selling bread and cakes, with a small dine-in area.",
  "employee_count": 8,
  "equipment": ["Ovens", "Refrigerators", "Mixers"],
  "operations": {
    "sales_channels": ["in_store", "delivery"],
    "accepts_card_payments": true,
    "handles_cash": true,
    "stores_customer_data": null,
    "operates_single_location": true
  },
  "location": { "city": "Colombo", "country": "Sri Lanka", "flood_prone_area": true }
}
```

## 2. Policy documents

Uploaded one at a time with `POST /api/v1/policies` (multipart field `file`). The gateway forwards
the file to Agent 2 ([agents/policy_agent/service.py](../agents/policy_agent/service.py)).

| Check | Rule | If it fails |
|---|---|---|
| File type | The bytes must start with `%PDF-`. The file name and extension are not trusted. | 400 `invalid_pdf` |
| Size | At most `MAX_UPLOAD_MB` (default 25 MB) | 413 `file_too_large` |
| Text | Text is extracted per page. Pages without text are read with OCR when Tesseract is installed and `OCR_ENABLED=true`. | A PDF with no readable text is still stored, with 0 sections (see below) |
| Instruction-like wording | Each section is scanned for text such as "ignore previous instructions" or "this policy covers everything" | The section is **flagged**, not rejected; flagged sections are never sent to an LLM |
| Policies per analysis | 1–5 distinct policy IDs, all belonging to the logged-in user | 422, or 404 `policy_not_found` |

The PDF is stored encrypted (`<policy_id>.pdf.enc`) and split into sections (chunks) with their
section heading and page number. These sections are what the coverage results quote.

**Known limitation:** a PDF with no readable text (e.g. a scan without OCR) is marked `ready`
with 0 sections, instead of failing. An analysis on it finds no policy wording for any risk. The
web app shows "0 sections" on the Policies page so the user can see it.

## 3. Account details

Registration (`POST /api/v1/auth/register`) and login (`POST /api/v1/auth/login`).

| Field | Rule |
|---|---|
| `email` | 3–254 characters, a valid address; trimmed and lowercased, so `Me@Shop.lk` and `me@shop.lk` are the same account |
| `password` | At registration at least 8 characters and at most 72 bytes in UTF-8 (bcrypt only uses the first 72 bytes). No other rules. Stored only as a bcrypt hash. |
| `consent_version` | Registration only. Must equal the current privacy-notice version (`CURRENT_CONSENT_VERSION` in [shared/schemas/requests.py](../shared/schemas/requests.py)). Sending it is the agreement; the version and time are stored with the account. |

Five wrong logins for the same email within 15 minutes lock that email for 15 minutes (429 with
`Retry-After`).

When the privacy notice changes, raise `CURRENT_CONSENT_VERSION` and `CONSENT_VERSION` in
[frontend/src/lib/consent.ts](../frontend/src/lib/consent.ts) together, or registration fails.

## 4. Questions about an analysis

Sent with `POST /api/v1/analyses/{request_id}/questions` from the Ask panel on the results page.

| Rule | Value |
|---|---|
| Length | 3–500 characters |
| Content | Must contain at least one word. Line breaks and repeated spaces are collapsed to one line, so a question cannot add its own lines or blocks to the prompt. |
| Rate | At most 10 questions per user per minute (429 `too_many_questions` with `Retry-After`) |
| Scope | Only an analysis that belongs to the logged-in user (otherwise 404) |

The answer is built only from that saved analysis and the policy wording it already found;
nothing is retrieved again and the question is not stored.

## 5. Inputs the user cannot set

The gateway sets these itself, so a user cannot use them to reach someone else's data:

- `business_id`: taken from the logged-in account.
- `request_id`: a new one for every upload, analysis and question.

The agents' own request models also reject unknown fields, and their IDs may contain only letters,
digits, `-` and `_`, because they are written to the logs.
