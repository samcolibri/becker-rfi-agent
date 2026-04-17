# Becker RFI Agent — Technical Architecture
## For Stakeholder Review & Approval
### Repo: github.com/samcolibri/becker-rfi-agent
### Updated: April 17, 2026 | Author: Sam Chaudhary

> **"Fixing the front door: capturing the right data, routing leads correctly, and enabling sales and marketing to act faster — starting with a focused MVP on the Contact Us / RFI flow, but designed to scale across all inbound channels."**
> — Angel Cichy, 2026-04-16 requirements call

---

## Full End-to-End Journey

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     FORM SUBMIT (becker.com/contact-us)                     │
│        3-step wizard · intent → context → contact + consent                 │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                         [Spam / Bot Filter]
                    Hunter.io verify + pattern check
                    REJECT if invalid → no SF record created
                                    │
                    ┌───────────────▼───────────────────────┐
                    │  Sam's API — validates + calculates   │
                    │  B2B queue (routing engine)           │
                    │  Writes to ExternalWebform__c         │
                    └───────────────┬───────────────────────┘
                                    │
                    ┌───────────────▼───────────────────────┐
                    │  SF FLOW fires automatically          │
                    │  (CreateCaseLeadandOpportunity.v2     │
                    │   updated by Huma Yousuf)             │
                    │                                       │
                    │  Dedup by email:                      │
                    │  ├─ Email not found → Create Lead     │
                    │  ├─ Email = existing Lead → Update    │
                    │  ├─ Email = Person Account → Opp      │
                    │  └─ Email = Business Account          │
                    │       → Lead + Opp (both → BA Owner) │
                    │                                       │
                    │  Support Query → Case → CS&E Queue    │
                    │                                       │
                    │  SuggestedQueue__c → sets OwnerId     │
                    │  (routing engine result passed in)    │
                    │                                       │
                    │  Campaign Member created              │
                    │  (Nick Leavitt to define campaigns)   │
                    └───────────────┬───────────────────────┘
                                    │
                    ┌───────────────▼───────────────────────┐
                    │  Confirmation email fires (ALL paths) │
                    │  SFMC · < 20 min · every submission   │
                    └───────────────┬───────────────────────┘
                                    │
          ┌─────────────────────────┼────────────────────────┐
          │                         │                        │
    ┌─────▼──────┐          ┌───────▼──────┐        ┌───────▼──────┐
    │  B2C       │          │     B2B      │        │   SUPPORT    │
    │ Exploring  │          │  (team/firm) │        │  (students)  │
    │ or Ready   │          │              │        │              │
    └─────┬──────┘          └──────┬───────┘        └──────┬───────┘
          │                        │                        │
  Program-matched           Route matrix:           SF Case created
  SF Campaign               org type × size          CS&E queue
  (Nick Leavitt)            → 1 of 6 queues          No nurture*
          │                        │
  Nurture journeys          Inside Sales
  TBD — Nick Leavitt        Global Firms
  to define which           New Client Acq
  journeys fire on          University
  form submission           International
  (current list =           CS&E (existing
  post-demo, not             account owner)
  post-form)
          │                        │
          └────────────┬───────────┘
                       │
          [First rep or support activity]
                       │
          ┌────────────▼─────────────────┐
          │  CSAT SURVEY — ALL PATHS     │
          │  Qualtrics trigger via SFMC  │
          │  Fires post-first-touch      │
          │  (NOT just post-purchase)    │
          └──────────────────────────────┘

* Support path has no nurture today. Future phase: upsell detection from support cases.
```

---

## Architecture Decisions — Updated April 17, 2026

### Decision 1: ExternalWebform__c as entry point (not Lead directly)
The existing Drupal Contact Us form already writes to `ExternalWebform__c`, and a SF Flow processes each submission. **We plug into the same system.** Our API writes a single record to `ExternalWebform__c` — the Flow handles all dedup, Lead/Opportunity/Case creation, and assignment. We do not call `POST /sobjects/Lead` directly.

### Decision 2: SF Flow owns dedup and record creation
The existing Flow (`CreateCaseLeadandOpportunity.v2`) already handles:
- Email found → update existing Lead
- Email matches Person Account → create Opportunity
- No match → create new Lead
- Support → create Case

Huma Yousuf will update this Flow to add:
- Business Account match → Lead + Opportunity (both assigned to BA Owner)
- New ExternalWebform fields mapped to Lead/Opp fields
- SuggestedQueue__c → sets OwnerId on created Lead
- Campaign Member creation (per Nick Leavitt)

### Decision 3: Routing engine pre-calculates queue, passes via SuggestedQueue__c
Our routing engine (27 unit tests) calculates the correct SF queue from org type × employee count. It writes the result into `SuggestedQueue__c` on the ExternalWebform record. The Flow reads this field and sets OwnerId. This keeps routing logic in code (easy to update) and the Flow just consumes the result.

### Decision 4: SFMC journeys TBD — pending Nick Leavitt
Angel flagged that the original journey list (CPA Demo, CMA Demo, etc.) fires **post-demo**, not post-form-submission. Nick Leavitt is the correct owner. Until Nick defines the correct journeys, only the confirmation email fires via SFMC. Campaign membership (via `Campaign__c` lookup on ExternalWebform) will drive email sends.

### Decision 5: No Concierge Day One hardcode for B2C Ready
B2C Ready to Enroll enters the **same program-matched campaign/journey as B2C Exploring**. Concierge is a specific CPA product — it is not the default for all ready-to-enroll submissions. Nick Leavitt to confirm correct journey per program.

### Decision 6: Deployment via Drupal (not standalone)
Josh Elefante and Monica Callahan are not the technical architecture reviewers. A Drupal developer (Dakshesh, 5X team) must review how the React form embeds within Becker's existing Drupal deployment process. Sam to connect with Dakshesh.

---

## Layer 1 — Smart Intake Form (3-Step Wizard)

**Built with:** React 18 + Vite + Tailwind CSS + Framer Motion (Becker official Figma design)
**Location:** Embedded on becker.com/contact-us via Drupal block (Dakshesh to confirm method)

### Step 1 — Intent (4 tiles — click advances immediately, no Continue button)

| Tile | Who it's for | SF Object | SLA |
|---|---|---|---|
| I'm exploring courses | B2C — interested in CPA/CMA/CIA/EA/CPE/CFP | Lead | 1–4 business hours |
| I'm ready to enroll | B2C — wants to start, knows the program | Lead | 1–4 business hours |
| I'm buying for my team | B2B — firm, corporation, university, gov | Lead + Opportunity | 48 business hours |
| I need student support | Existing Becker student needing help | Case | 1 business day |

### Step 2 — Context (conditional per intent)

**B2B fields:** Organization Name (SF Account autocomplete) · Organization Type · Organization Size · HQ State · Role Type · Product Interest · Phone

**B2C fields:** Role Type · Organization Type · Product Interest · State of Residence · Graduation Year · Becker student toggle · Becker account email (conditional)

**Support fields:** Country · City · State · Product Interest · Message

### Step 3 — Contact + Consent (all paths, embedded in Step 2)
First Name · Last Name · Email · Phone · Marketing consent checkbox · Privacy Policy checkbox

---

## Layer 2 — API Server

**Runtime:** Node.js + Express
**Repo:** github.com/samcolibri/becker-rfi-agent
**Endpoint:** `POST /api/submit` · `GET /api/accounts` · `GET /health`

### Processing pipeline

```
STEP 1  Email validation
        → isLikelySpam(): spam patterns, disposable domain list, bot name detection
        → Hunter.io API: verify email deliverable, not catch-all
        → Reject with reason before any SF call if invalid

STEP 2  Routing calculation (B2B only)
        → routeLead(submission) → suggestedQueue
        → Pure function, no network calls, 27 unit tests
        → Result written to SuggestedQueue__c on ExternalWebform record

STEP 3  Write to ExternalWebform__c
        → POST /sobjects/ExternalWebform__c with all mapped fields
        → SF Flow fires automatically — handles all record creation + assignment

STEP 4  Confirmation email (ALL paths — non-fatal)
        → SFMC Journey: "Confirmation Email"
        → < 20 min SLA, every submission

STEP 5  Program nurture — PENDING Nick Leavitt
        → Will be wired once Nick defines correct journeys/campaigns for form submission
```

---

## Layer 3 — ExternalWebform__c Field Mapping

### Existing fields used
| Form Field | SF API Name | SF Type |
|---|---|---|
| First Name | First_Name__c | Text(40) |
| Last Name | Last_Name__c | Text(80) |
| Email | Email__c | Email |
| Phone | Phone__c | Phone |
| Organization Name | Company__c | Text(255) |
| Product Interest | Primary_Interest__c | Picklist |
| HQ / Residence State | Address__c (State sub-field) | Address |
| Becker Student Email | email_address_you_use_to_login_to_Becker__c | Text(255) |
| Year in School | YearInSchool__c | Picklist |
| Brand | BusinessBrand__c | Text(255) |
| Campaign | Campaign__c | Lookup(Campaign) |
| Lead Source | Lead_Source_Form__c | Picklist |
| Submission Timestamp | Lead_Source_Form_Date__c | Date/Time |
| Marketing Consent | Consent_Provided__c | Multi-Select Picklist |
| Consent Source | Consent_Captured_Source__c | Text(255) |
| Privacy Consent | Privacy_Consent_Status__c | Picklist |

### New fields — Angel to create
| Field Label | API Name | Type | Values |
|---|---|---|---|
| Intent Path | IntentPath__c | Picklist | exploring · ready · b2b · support |
| Organization Type | OrganizationType__c | Picklist | Accounting Firm · Corp/Healthcare/Bank/Financial Institution · Consulting Firm · CPA Alliance · Gov Agency/Not-for-Profit · Society/Chapter · Non-US Organization · Student · University · Other |
| Role Type | RoleType__c | Picklist | Undergrad Student · Grad Student · Professor · Supervisor/Director/Manager · Partner/CEO/CFO · Administrator · Unemployed · Learning/Training Leader · Staff Accountant · Other |
| Organization Size | OrgSizeCategory__c | Picklist | <25 · 26-100 · 101-250 · 251+ |
| Suggested Queue | SuggestedQueue__c | Text(100) | Free text — routing engine output |
| UTM / Lead Source Detail | LeadSourceDetail__c | Text(255) | Free text — UTM string |

---

## Layer 4 — B2B Routing Matrix

Org type × employee count → SF queue. Calculated by routing engine, passed to Flow via `SuggestedQueue__c`.

| Org Type | <25 | 26-100 | 101-250 | 251+ |
|---|---|---|---|---|
| Accounting Firm | Inside Sales | Global Firms | Global Firms | Global Firms |
| Corp / Healthcare / Bank / Fin Inst | Inside Sales | New Client Acquisition | New Client Acquisition | New Client Acquisition |
| Consulting Firm | Global Firms | Global Firms | Global Firms | Global Firms |
| CPA Alliance | Global Firms | Global Firms | Global Firms | Global Firms |
| Gov Agency / Not-for-Profit | Inside Sales | New Client Acquisition | New Client Acquisition | New Client Acquisition |
| Society / Chapter | University | University | University | University |
| Non-US Organization | International | International | International | International |
| Student | Inside Sales | Inside Sales | Inside Sales | Inside Sales |
| University | University | University | University | University |
| Other | Inside Sales | Inside Sales | Inside Sales | Inside Sales |

**Special rule:** If email matches a Business Account, Lead and Opportunity are both assigned to the Business Account Owner regardless of the matrix above.

---

## Layer 5 — SFMC + Campaign

**Confirmed:** Confirmation email fires on all paths via SFMC Journey Builder.

**Pending Nick Leavitt:** Which journeys/campaigns fire on form submission. Angel noted the original list (CPA Demo Journey, CMA Demo Journey, etc.) fires post-demo, not post-form. Nick Leavitt is the correct owner to define this.

**Campaign approach (Angel's suggestion):** Rather than Journey entry events, add the Lead to the matching SF Campaign (`Campaign__c` on ExternalWebform). MC Connect syncs Campaign Members to SFMC. Email sends are driven by campaign membership. This removes the dependency on journey event keys from SFMC admin.

---

## Open Items — Blocking Go-Live

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | Create 6 new fields on ExternalWebform__c | Angel Cichy | Pending |
| 2 | Confirm existing picklist values (Primary_Interest__c, Consent_Provided__c, etc.) | Angel Cichy | Pending |
| 3 | Update SF Flow for new fields + Business Account path + campaign membership | Huma Yousuf | Pending |
| 4 | Define which campaigns/journeys fire on form submission | Nick Leavitt | Pending |
| 5 | SF Connected App credentials + SFMC credentials | Angel / Huma | Pending |
| 6 | Drupal deployment review — how React form embeds | Dakshesh (5X) | Pending |

---

## Approval Checklist

- [ ] **Angel Cichy** — ExternalWebform__c new fields approved
- [ ] **Huma Yousuf** — SF Flow update scope confirmed
- [ ] **Nick Leavitt** — Campaign / journey map defined
- [ ] **Dakshesh (5X)** — Drupal embed method confirmed
- [ ] **Monica Callahan** — Business requirements sign-off
- [ ] **Josh Elefante** — Form UX sign-off
