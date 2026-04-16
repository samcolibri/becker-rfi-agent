# Becker RFI Agent — Technical Architecture
## For Stakeholder Review & Approval
### Repo: github.com/samcolibri/becker-rfi-agent
### Date: April 16, 2026 | Author: Sam Chaudhary

> **"Fixing the front door: capturing the right data, routing leads correctly, and enabling sales and marketing to act faster — starting with a focused MVP on the Contact Us / RFI flow, but designed to scale across all inbound channels."**
> — Angel Cichy, 2026-04-16 requirements call

---

## Full End-to-End Journey

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FORM SUBMIT (becker.com/contact-us)                  │
│         3-step wizard · intent → context → contact + consent                │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                         [Spam / Bot Filter]
                    Hunter.io verify + pattern check
                    REJECT if invalid → no SF record created
                                    │
                    ┌───────────────▼───────────────┐
                    │   SIMULTANEOUS — ALL PATHS    │
                    │  (before any branching)       │
                    │                               │
                    │  SF Record created ──────┐   │
                    │  CommSubscription        │   │
                    │  Consent CDM record      │   │
                    │                          │   │
                    │  Confirmation email ─────┘   │
                    │  (SFMC · < 20 min · ALL)     │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │   PARALLEL — HUMAN SLA STARTS │
                    │                               │
                    │  SF Routing ────────────────► │ ── queue / rep assigned
                    │  SFMC Journey Entry ────────► │ ── nurture fires
                    └───────────────┬───────────────┘
                                    │
          ┌─────────────────────────┼──────────────────────────────┐
          │                         │                              │
    ┌─────▼─────┐           ┌───────▼──────┐              ┌───────▼──────┐
    │  B2C      │           │     B2B      │              │   SUPPORT    │
    │ Exploring │           │ (team/firm)  │              │  (students)  │
    │ or Ready  │           │              │              │              │
    └─────┬─────┘           └──────┬───────┘              └──────┬───────┘
          │                        │                             │
   Program-matched          Route matrix:              SF Case created
   SFMC journey             org type × size             (not a Lead)
   entry fires              → 1 of 6 queues              CS&E queue
          │                        │                     No nurture*
   CPA Demo Journey         Inside Sales
   CMA Demo Journey         Global Firms
   CIA Demo Journey         New Client Acq
   EA Demo Journey          University
   CFP Demo Journey         International
   CPE Demo Takers          CS&E (if existing
   Concierge Day One          account owner)
   (Ready to Enroll)               │
   B2B Nurture Journey             │
          │                        │
          └────────────────┬───────┘
                           │
              [First rep or support activity]
                           │
          ┌────────────────▼────────────────┐
          │  CSAT SURVEY — ALL PATHS        │
          │  Qualtrics trigger via SFMC     │
          │  Fires post-first-touch         │
          │  (NOT just post-purchase)       │
          │  Measures: first impression,    │
          │  form quality, rep response     │
          └─────────────────────────────────┘

* Support path has no nurture today. Future phase: upsell detection from support cases.
```

---

## Layer 1 — Smart Intake Form (3-Step Wizard)

**Location:** becker.com/contact-us (embedded via Drupal block or Drupal Web Form module)

### Step 1 — Intent (4 cards, required)

| Card | Who it's for | Creates | SLA |
|---|---|---|---|
| I'm exploring courses | B2C — interested in CPA/CMA/CIA/EA/CPE/CFP | SF Lead | 1–4 business hours |
| I'm ready to enroll | B2C — wants to start, knows the program | SF Lead | 1–4 business hours |
| I'm buying for my team | B2B — firm, corporation, university, gov | SF Lead | 48 business hours |
| I need student support | Existing Becker student needing help | SF Case | 1 business day |

SLA badge updates dynamically on the form as user selects their intent card.

### Step 2 — Context (conditional per intent)

**B2B fields:**
- Company / Organization name (attempts match against existing SF Account)
- Organization Type* (picklist — prospect-facing values, not internal codes)
- Team / Organization Size* (picklist — used in routing matrix)
- HQ State or Province*
- Program / Product of Interest* (multi-select)
- Phone (required for B2B — reps need to call)

**B2C fields:**
- Program / Product of Interest* (multi-select)
- Role Type*
- State or Province of Residence
- Organization name (optional)
- Graduation Year (conditional — shown if student role selected)
- Currently a Becker student? (Yes/No toggle)
- If yes: Becker account email

**Support fields:**
- Support Topic (picklist)
- Product (which Becker product)
- Message / description

### Step 3 — Contact + Consent (all paths)

- First Name*, Last Name*, Email*, Phone (required for B2B)
- **CommSubscriptionConsent** (CDM-compliant — creates a `CommSubscriptionConsent__c` record, NOT a simple checkbox field)
- Privacy Policy acknowledgment

"Escape links" at bottom: Try free CPA demo · Browse CPE courses · View CMA packages

### Fields captured for all paths (auto, not shown on form)

| Data | Where it goes | Notes |
|---|---|---|
| UTM params (source/medium/campaign/content/term) | `LeadSource_Detail__c` | Captured from URL on page load |
| Brand | `Brand__c` | Auto-set: "Becker Professional Education Corporation" |
| Submission timestamp | `CreatedDate_RFI__c` | SLA clock starts here |
| Lead Source | `LeadSource` | Channel: "Web - Contact Us Form" (NOT "B2B" — confirmed by Angel + Josh) |

---

## Layer 2 — API Server

**Runtime:** Node.js + Express  
**Endpoint:** `POST /api/submit`  
**Health check:** `GET /health`

### Processing pipeline (9 steps, all within one request)

```
STEP 1  Email validation
        → isLikelySpam(): 50+ spam patterns, disposable domain list, bot name detection
        → Hunter.io API: verify email exists, deliverable, not catch-all
        → Reject with reason before any SF call if invalid

STEP 2  Support path branch (early exit)
        → if intentPath === 'support':
           • Create SF Case object (not Lead)
           • Assign to "Support Tier 1" queue
           • Fire Confirmation Email (SFMC)
           • Return early — does not proceed through routing engine

STEP 3  SF dedup check
        → Query: SELECT Id FROM Lead WHERE Email = ? AND IsConverted = false
        → If match found: update existing lead, return leadId
        → SF native duplicate rules are the primary guard (Huma confirmed)

STEP 4  Account owner lookup (B2B only)
        → Query: SELECT OwnerId, Owner.Name, Owner.Department FROM Account WHERE Name = ?
        → If found: passes accountId + ownerName into routing engine
        → Enables "route to existing account owner" rule

STEP 5  Routing engine
        → routeLead(submission) → { queue, rep, journey, leadType, reason }
        → Pure function, no network calls, 27 unit tests

STEP 6  Create SF Lead record
        → POST /sobjects/Lead with all mapped fields
        → Returns leadId

STEP 6a Confirmation email (ALL paths — fires in parallel, non-fatal)
        → SFMC Journey: "Confirmation Email"
        → Event key: SFMC_EVENT_CONFIRMATION
        → < 20 min SLA, every path, honors CX promise before any human acts

STEP 7  CommSubscriptionConsent record
        → POST /sobjects/CommSubscriptionConsent__c
        → CDM-compliant: channel type, consent datetime, source, brand
        → Only created if consentGiven === true

STEP 8  Queue / rep assignment (B2B only)
        → If rep known: PATCH Lead OwnerId → SF User.Id
        → If queue known: PATCH Lead OwnerId → SF Group.Id (Type=Queue)

STEP 9  SFMC journey entry (path-specific nurture)
        → B2C Ready:     "Concierge Day One"
        → B2B:           "B2B Nurture Journey"
        → B2C Exploring: program-matched journey (CPA Demo, CMA Demo, etc.)
```

---

## Layer 3 — B2B Routing Engine

Source: Monica's Excel (RFI Mapping 2.23.26.xlsx, Tab 3). Translated verbatim to code.

### Routing matrix — Org Type × Employee Count → SF Queue

| Org Type | <25 | 26–100 | 101–250 | 251+ |
|---|---|---|---|---|
| Accounting Firm | Inside Sales | Global Firms | Global Firms | Global Firms |
| Corp / Healthcare / Bank / Financial Institution | Inside Sales | New Client Acquisition | New Client Acquisition | New Client Acquisition |
| Consulting Firm | Global Firms | Global Firms | Global Firms | Global Firms |
| CPA Alliance | Global Firms | Global Firms | Global Firms | Global Firms |
| Gov Agency / Not-for-Profit | Inside Sales | New Client Acquisition | New Client Acquisition | New Client Acquisition |
| Society / Chapter | University | University | University | University |
| Non-US Organization | International | International | International | International |
| Student | Inside Sales | Inside Sales | Inside Sales | Inside Sales |
| University | University | University | University | University |
| Other / Unknown | Inside Sales | Inside Sales | Inside Sales | Inside Sales |

### Override rules (applied before matrix)

1. **CS&E account owner exists** → route to that rep regardless of org type/size
2. **Any account owner exists** → route to that owner's team
3. **No account match** → apply matrix
4. **Matrix returns no match** → Inside Sales (fallback confirmed by Monica)

### Phase 2 — NCA territory matching (not in Phase 1)

When queue = New Client Acquisition, the engine will additionally match state + account type to a specific NCA rep:

| Rep | Territory | Account Types |
|---|---|---|
| Stephanie Anastasio | OH, WV, DC, MD, NY, PA, NJ, CT, VA, RI, DE, NH, MA, ME | F1000, Banks, Insurance |
| Jill Kirkpatrick | OK, KS, MO, IL, MI, WI, East TX, NE, IA, MN, SD, ND, AR, NV | F1000, Banks, Insurance |
| Sharice Jessup | Nor CA, AZ, UT, CO, WY, MT, ID, HI | F1000, Banks, Insurance |
| Henry Quinones | NM, West TX, AL, GA, NC, SC, FL, TN, KY, LA, MS | F1000, Banks, Insurance |
| Nahal Safagh | So CA, OR, WA, AK + Firms 150–350 nationally | Firms 150–350, F1000, Banks |

---

## Layer 4 — SFMC Journey Map

All journeys triggered by a Journey Builder API entry event. Payload: ContactKey (email), First/Last name, Program of Interest, Lead ID, Lead Status, Brand, SubmittedAt.

| Path | Journey | SFMC Event Key (env var) | Trigger condition |
|---|---|---|---|
| ALL paths | Confirmation Email | `SFMC_EVENT_CONFIRMATION` | Every submission, < 20 min |
| B2C — CPA | CPA Demo Journey | `SFMC_EVENT_CPA` | intentPath = exploring/ready + program = CPA |
| B2C — CMA | CMA Demo Journey | `SFMC_EVENT_CMA` | intentPath = exploring/ready + program = CMA |
| B2C — CPE | CPE Free Demo Takers | `SFMC_EVENT_CPE` | program = CPE or Staff Level Training |
| B2C — CIA | CIA Demo Journey | `SFMC_EVENT_CIA` | program = CIA or CIA Challenge Exam |
| B2C — EA | EA Demo Journey | `SFMC_EVENT_EA` | program = EA |
| B2C — CFP | CFP Demo Journey | `SFMC_EVENT_CFP` | program = CFP |
| B2C — Ready to Enroll | Concierge Day One | `SFMC_EVENT_CONCIERGE` | intentPath = ready (all programs) |
| B2B | B2B Nurture Journey | `SFMC_EVENT_B2B` | intentPath = b2b |
| No program match | General Nurture Journey | `SFMC_EVENT_GENERAL` | fallback |
| All paths (post-touch) | CSAT Survey | `SFMC_EVENT_CSAT` | First rep/support activity |

**CSAT — Phase 1 scope. This is an SFMC configuration task, not a code change.**
- **Who builds it:** SFMC admin in Journey Builder
- **How:** Add a Qualtrics Survey / Send Email activity at the end of each journey, triggered after a wait-for-SF-activity step (first task or call logged on the Lead or Case)
- **Why post-first-touch, not post-purchase:** measures whether the *form is working* — did the right person respond in time? Not whether a sale happened months later
- **SF side:** requires a SF→SFMC data event when first sales/support activity is logged — this is a Journey Builder trigger, not custom API code

---

## Layer 5 — Salesforce Objects & Fields

### New custom fields required on Lead object

| API Name | Label | Type | Values / Notes | Required by |
|---|---|---|---|---|
| `Organization_Type__c` | Organization Type | Picklist | Accounting Firm, Corp/Healthcare/Bank/Fin Inst, Consulting Firm, CPA Alliance, Gov Agency/NFP, Society/Chapter, Non-US Organization, Student, University, Other | Angel (also add to Farside CDM) |
| `Organization_Size__c` | Organization Size | Picklist | 1-10, 11-25, 26-50, 51-100, 101-250, 251-500, 500+ | Angel |
| `HQ_State__c` | HQ State / Province | Text(50) | B2B = HQ state; B2C = state of residence | Angel |
| `Role_Type__c` | Role Type | Picklist | Undergrad Student, Grad Student, Professor, Supervisor/Director/Manager, Partner/CEO/CFO, Administrator, Unemployed, Learning/Training Leader, Staff Accountant, Other | Angel |
| `Graduation_Year__c` | Graduation Year | Text(10) | B2C students; "0000" = already graduated | Angel |
| `Becker_Student_Email__c` | Becker Student Email | Email | Secondary email for existing students | Angel |
| `Brand__c` | Brand | Text(100) | System-set: "Becker Professional Education Corporation" | Angel |
| `LeadSource_Detail__c` | Lead Source Detail | Text(255) | UTM params concatenated | Angel |
| `CreatedDate_RFI__c` | RFI Created Date | DateTime | SLA clock start | Angel |

### Existing fields used (no changes needed)

`FirstName`, `LastName`, `Email`, `Phone`, `Company`, `LeadSource`, `Description`, `Lead_Status__c` (or standard `Status`)

### CommSubscriptionConsent object (CDM model)

One record created per submission when consentGiven = true.

| Field | Value |
|---|---|
| `Lead__c` | leadId |
| `Email__c` | email |
| `ConsentGiven__c` | true |
| `ConsentCapturedDateTime__c` | ISO timestamp |
| `ConsentCapturedSource__c` | "RFI Form — becker.com/contact-us" |
| `Brand__c` | "Becker Professional Education Corporation" |
| `SubscriptionChannel__c` | "Commercial Marketing" |

### SF Case object (support path only)

| Field | Value |
|---|---|
| `SuppliedName` | First + Last name |
| `SuppliedEmail` | email |
| `Subject` | "Student Support Request — {topic}" |
| `Description` | user message |
| `Origin` | "Web - Contact Us Form" |
| `Product__c` | product of interest |
| `Brand__c` | "Becker Professional Education Corporation" |
| `Status` | "New" |
| `Priority` | "Medium" |

### SF Queues required

The routing engine assigns leads to these exact queue names via SOQL `SELECT Id FROM Group WHERE Name = ? AND Type = 'Queue'`. **Angel must confirm the exact SF object names.**

> ⚠️ **BLOCKING — Queue Name Conflict**
> The architecture diagram uses: "Learning Advisor queue", "Enrollment team queue", "Business Solutions queue"
> Monica's Excel uses: Inside Sales, Global Firms, New Client Acquisition, University, International, Customer Success & Expansion
> **Current code uses Monica's Excel names.** If the actual SF queue objects are named per the diagram, all routing assignments will fail at runtime.
> **Angel: please confirm exact SF queue object Name values and we update the engine in one pass.**

---

## Layer 6 — Email Validation (Spam Filter)

Monica: *"I am amazed at the number of spam contact us forms we get."*

Three-stage filter — runs before any SF record is created:

1. **Pattern check** — detects `test@test.com`, XSS payloads, script injection, bot names ("Test Test", "Asdf Asdf"), word-salad names
2. **Disposable domain list** — blocks mailinator, guerrillamail, yopmail, tempmail, etc.
3. **Hunter.io API verify** — checks email deliverability and existence (returns `valid`, `accept_all`, `unknown`, `invalid`)

B2B vs personal email detection — triggers a warning (not a rejection) when business email expected but personal domain detected (Gmail, Yahoo, etc.).

**Credential needed:** `HUNTER_API_KEY` (hunter.io — free tier 25 req/mo, paid from $49/mo)

---

## Environment Configuration

All credentials are injected via environment variables. See `.env.example` for the full list.

### Salesforce

| Variable | Notes |
|---|---|
| `SF_INSTANCE_URL` | e.g. `https://beckerprofessional.my.salesforce.com` |
| `SF_API_VERSION` | Default: `v59.0` |
| `SF_CLIENT_ID` | Connected App consumer key |
| `SF_CLIENT_SECRET` | Connected App consumer secret |
| `SF_USERNAME` | API service user (api_user@beckerprofessional.com) |
| `SF_PASSWORD` | API user password |
| `SF_SECURITY_TOKEN` | API user security token |

### Salesforce Marketing Cloud

| Variable | Notes |
|---|---|
| `SFMC_AUTH_BASE_URL` | `https://{MID}.auth.marketingcloudapis.com` |
| `SFMC_REST_BASE_URL` | `https://{MID}.rest.marketingcloudapis.com` |
| `SFMC_CLIENT_ID` | Server-to-Server installed package key |
| `SFMC_CLIENT_SECRET` | Server-to-Server installed package secret |
| `SFMC_ACCOUNT_ID` | Business Unit MID |

### SFMC Journey Entry Event Keys (9 total)

| Variable | Journey |
|---|---|
| `SFMC_EVENT_CONFIRMATION` | Confirmation Email (all paths) |
| `SFMC_EVENT_CPA` | CPA Demo Journey |
| `SFMC_EVENT_CMA` | CMA Demo Journey |
| `SFMC_EVENT_CPE` | CPE Free Demo Takers |
| `SFMC_EVENT_CIA` | CIA Demo Journey |
| `SFMC_EVENT_EA` | EA Demo Journey |
| `SFMC_EVENT_CFP` | CFP Demo Journey |
| `SFMC_EVENT_CONCIERGE` | Concierge Day One (Ready to Enroll) |
| `SFMC_EVENT_B2B` | B2B Nurture Journey |
| `SFMC_EVENT_GENERAL` | General Nurture (fallback) |
| `SFMC_EVENT_CSAT` | CSAT Survey (post-first-touch) |

All keys are found in SFMC Journey Builder → Entry Source → API Entry → Event Definition Key.

---

## Drupal Integration

Form is built as standalone HTML and JavaScript (`public/form.html`). Three integration paths:

1. **Drupal Block embed** — paste form HTML into a Custom Block, style to match Becker design system. No Drupal dev needed.
2. **Drupal Web Form module** — native Drupal form with a custom submit handler POSTing to `/api/submit`. Requires Drupal dev (Dakshesh / 5X team).
3. **iFrame** — embed the hosted form at `{api-url}/form` as an iFrame. Zero Drupal involvement.

**Sam's action:** Connect with Dakshesh (5X Drupal team) to select the right path.

---

## Release & Test Plan

```
Dev (Sam + Huma working session)
  → routing-engine.test.js: 27 unit tests (run: node --test or npm test)
  → Manual smoke test: POST /api/submit with each of 4 intent paths
  → Verify SF Lead/Case created, SFMC event fired, queue assigned

Stage
  → Huma smoke tests against SF sandbox
  → Verify all 6 queues receive test leads
  → Verify confirmation email fires for all paths

UAT
  → Monica Callahan: B2B path (3–4 org types across size bands)
  → Aaron: B2C exploring + ready paths
  → Haley: Student support path (needs sandbox access)

Prod
  → Wednesday release cycle
  → Monitor: SF lead creation rate, SFMC journey entry rate
  → Huma builds SF report: lead creation → first sales activity
```

---

## Stakeholder Approval Checklist

**Monica + Josh — please confirm:**
- [ ] Routing matrix matches your Excel (org type × size → queue, see table above)
- [ ] Organization Type picklist values are correct for prospects
- [ ] SLA commitments: B2C 1–4 hrs, B2B 48 hrs, Support 1 business day
- [ ] "Other" org name always → Inside Sales (confirmed on call — report on "Other" frequency to monitor)
- [ ] Phase 1 = Contact Us / RFI only (webinars/events/flipbooks in Phase 2)
- [ ] CSAT fires post-first-touch — not just post-purchase (confirm this is the intent)
- [ ] Review **form.html** — wording, field labels, intent card copy — and flag any changes needed
- [ ] Aaron confirmed as B2C UAT tester; Haley confirmed for support path UAT

**Angel + Shar — please confirm:**
- [ ] **BLOCKING: Exact SF queue object names** (see queue name conflict above)
- [ ] All 9 new Lead custom fields approved for creation
- [ ] `Organization_Type__c` added to Farside CDM model
- [ ] `CommSubscriptionConsent__c` object configured (SubscriptionChannel__c includes "Commercial Marketing")
- [ ] Native SF lead duplicate rules sufficient (email-based dedup — confirmed by Huma on call)
- [ ] 11 SFMC entry event API keys provided (see env var table above)
- [ ] SF Connected App created with correct OAuth scopes for API user
- [ ] CSAT configured in Journey Builder (Qualtrics activity post-first-touch on each journey)
- [ ] Lead list views created for each of the 6 queues (see SETUP.md §4)

**Huma:**
- [ ] **BLOCKING: Confirm existing SF lead assignment rules are inactive** or will not conflict with API OwnerId PATCH (see SETUP.md §3)
- [ ] Haley given SF sandbox access for UAT
- [ ] Run SF report: Contact Us leads → time to first sales activity (establishes SLA baseline before go-live)

**Sam:**
- [ ] Connect with Dakshesh re: Drupal integration path
- [ ] Hunter.io API key obtained

---

## Repo Map

```
becker-rfi-agent/
├── EXECUTIVE_SUMMARY.md     ← outcomes, business case, Monica's goals
├── ARCHITECTURE.md          ← this file — full technical E2E (for approval)
├── SETUP.md                 ← step-by-step go-live prerequisites
├── README.md                ← developer quickstart
├── CLAUDE.md                ← full project brain (all context, decisions)
├── data/
│   ├── routing-matrix.json  ← org type × size → queue (from Monica's Excel)
│   ├── territories.json     ← NCA 2026 rep territories
│   ├── sales-reps.json      ← all 6 teams + rep names
│   └── dropdowns.json       ← all picklist values
├── src/
│   ├── routing-engine.js    ← pure B2B routing logic, no network calls
│   ├── email-validator.js   ← spam filter + Hunter.io verify
│   ├── sf-client.js         ← Salesforce REST API (Lead, Case, Consent, Queue)
│   ├── sfmc-client.js       ← SFMC Journey Builder entry events
│   ├── lead-processor.js    ← 9-step pipeline orchestrator
│   └── server.js            ← Express API (POST /api/submit)
├── public/
│   └── form.html            ← 3-step wizard (standalone, Drupal-embeddable)
├── tests/
│   └── routing-engine.test.js ← 27 unit tests
└── .env.example             ← all required config keys with defaults
```
