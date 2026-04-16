# Becker RFI Agent — Architecture
## For Stakeholder Review & Approval
### Repo: github.com/samcolibri/becker-rfi-agent
### Date: 2026-04-16 | Author: Sam Chaudhary

---

## Objective
> "Fixing the front door, capturing the right data, routing leads correctly, and enabling sales and marketing to act faster — starting with a focused MVP on the Contact Us / RFI flow, but designed to scale across all inbound channels."
> — Angel Cichy, 2026-04-16 requirements call

---

## Phase 1 MVP — What We're Building

### 1. Smart Intake Form (3-Step Wizard)

**Where it lives:** Embedded on becker.com/contact-us (Drupal — Sam to coordinate with Dakshesh's team for integration)

**Step 1 — Intent (4 cards):**
| Card | Who it's for | Routes to |
|---|---|---|
| I'm exploring courses | B2C prospect browsing CPA/CMA/CIA/EA/CPE/CFP | SFMC nurture journey |
| I'm ready to enroll | B2C ready to buy | SFMC hot lead journey |
| I'm buying for my team | B2B — firm, corp, university, gov | SF queue routing |
| I need student support | Existing enrolled student | CS&E support queue |

**Step 2 — Context (conditional per intent):**
- B2B: Company name, Org type, Team size, HQ state, Product interest
- B2C: Program of interest, Role type, State, Org name, Graduation year (students)
- Support: Topic, Product

**Step 3 — Contact + Consent:**
- First name, Last name, Email, Phone (required for B2B)
- CommSubscriptionConsent (CDM-compliant — NOT a simple checkbox)
- Privacy policy acknowledgment

**SLA Promise shown on form:**
- B2C: 1–4 business hours
- B2B: 48 business hours
- Support: 1 business day

---

### 2. Lead Creation Layer (Salesforce)

**What happens when form is submitted:**

```
Form POST → Email validation (spam/bot filter + Hunter.io verify)
         → SF duplicate check (existing lead duplicate rules already in SF — Huma confirmed)
         → If new: create Lead record with all 7 required fields
         → Create CommSubscriptionConsent record (CDM model)
         → Set Brand__c = "Becker Professional Education Corporation"
         → Capture LeadSource = channel (Contact Us Form / Webinar / Flipbook / Event)
         → Capture UTM params (utm_source, utm_medium, utm_campaign)
```

**New SF fields required (Angel + Monica confirmed 2026-04-16):**
| Field API Name | Type | Notes |
|---|---|---|
| Organization_Type__c | Picklist | Prospect-facing values (not internal industry codes) |
| Organization_Size__c | Picklist | 1-10 / 11-25 / 26-50 / 51-100 / 101-250 / 251-500 / 500+ |
| HQ_State__c | Text | HQ state (B2B) or state of residence (B2C) |
| Role_Type__c | Picklist | 10 values — different for B2B vs B2C |
| Graduation_Year__c | Text | B2C students only |
| Becker_Student_Email__c | Email | B2C — secondary email for existing Becker students |
| Brand__c | Text | System-generated = "Becker Professional Education Corporation" |
| LeadSource_Detail__c | Text | UTM params concatenated |

> **Angel's note:** Organization_Type__c must also be added to the Farside customer data model (CDM). Angel confirmed this on the call.

---

### 3. B2B Routing Engine

**Pure logic — fully tested independently of Salesforce.**

```
GIVEN: org_type + employee_count + state + existing_account_owner

STEP 1: Does existing SF account have an owner?
  → YES: Assign lead to that account owner (CS&E, any team)
  → CS&E account? → goes to CS&E regardless of org type/size
  → NO: continue to matrix

STEP 2: Apply routing matrix
  Org Type                              | <25          | 26-100 | 101-250 | 251+
  Accounting Firm                       | Inside Sales | Global | Global  | Global
  Corp/Healthcare/Bank/Fin Inst         | Inside Sales | NCA    | NCA     | NCA
  Consulting Firm                       | Global       | Global | Global  | Global
  CPA Alliance                          | Global       | Global | Global  | Global
  Gov Agency/NFP                        | Inside Sales | NCA    | NCA     | NCA
  Society/Chapter                       | University   | Univ   | Univ    | Univ
  Non-US Organization                   | Intl         | Intl   | Intl    | Intl
  Student                               | Inside Sales | IS     | IS      | IS
  University                            | University   | Univ   | Univ    | Univ
  Other / Unknown / Typo                | Inside Sales | IS     | IS      | IS

STEP 3 (Phase 2): NCA queue → territory match → specific rep
  State → NCA rep (Anastasio/Kirkpatrick/Jessup/Quinones/Safagh)

DEFAULT FALLBACK: Inside Sales (Monica confirmed: "if everything goes haywire, send to Inside Sales")
```

**Typo / fuzzy org name (Josh raised this concern):**
- If org name doesn't match any account → routing proceeds on org type + size
- "Other" always → Inside Sales
- Report to be created on "Other" leads to monitor frequency

---

### 4. B2C Path

- B2C leads do NOT get queue-assigned to reps (confirmed: SFMC nurture first)
- Intent → program of interest → SFMC journey entry event fired

| Program | SFMC Journey |
|---|---|
| CPA | CPA Demo Journey |
| CMA | CMA Demo Journey |
| CPE | CPE Free Demo Takers |
| CIA | CIA Demo Journey |
| EA | EA Demo Journey |
| CFP | CFP Demo Journey |
| B2B (any program) | B2B Nurture Journey |
| 6mo-from-sitting + Ready | 6-Months-From-Sitting Journey |

---

### 5. Email Validation + Spam Filter

Monica flagged spam as a significant problem with the current Contact Us form.

```
Submission → isLikelySpam() check (patterns, disposable domains, bot names)
           → Hunter.io API verify (email exists, not disposable)
           → Business vs personal email detection
           → REJECT if invalid/spam before any SF record is created
```

Sam proposed: `hunter.io API — "10 minute job"`. Colibri also has Clay + 6sense for enrichment (phase 2).

---

### 6. SLA Monitor (Phase 1.5)

- Clock starts at `Lead.CreatedDate`
- B2C target: 1–4 hours | B2B target: 48 hours (Monica confirmed; NOT 1 hour as initially pitched)
- Breach alert → manager of relevant queue
- Report: lead creation → first sales activity (Huma to build in SF reports)

---

## Drupal Integration (Open Item)

Josh flagged: "we just don't have the Drupal resources on this call to develop that smart form."

**Sam's action item:** Connect with Dakshesh (5X Drupal team) to:
1. Understand Drupal REST API availability for form embed
2. Confirm whether a standalone HTML form can be embedded in a Drupal block
3. Or use Drupal Web Form module with custom submit handler pointing to `/api/submit`

The routing engine and SF integration are **fully buildable and testable independently of Drupal**. Drupal is only needed for the form embed on becker.com.

---

## Phase 2+ (Out of Scope for MVP)

- Extend same segmentation to webinars, events, conferences, flipbook content offers
- LeadSource will tag each channel (Webinar / Event / Flipbook) so reps know origin
- Monica: "we need to be asking those questions whenever we're doing an intake form, not just RFI"
- Floating RFI widget: available on all pages (Josh's idea)
- Data enrichment waterfall: Clay + 6sense + Hunter.io (Sam proposed)

---

## Environments & Release

```
Sam builds → dev branch → Huma smoke tests → stage → UAT (Monica/Angel/Josh/Aaron/Haley) → prod
```

- Release cycle: **Wednesdays**
- UAT testers: Monica Callahan, Aaron (B2C), Haley (needs sandbox access)
- Huma Yousuf: smoke testing in dev, coordinates UAT

---

## Files in This Repo

```
becker-rfi-agent/
├── ARCHITECTURE.md          ← this file — share with stakeholders for approval
├── CLAUDE.md                ← full project brain (all context, all decisions)
├── data/
│   ├── routing-matrix.json  ← org type × size → queue (100% from Monica's Excel)
│   ├── territories.json     ← NCA 2026 rep territories
│   ├── sales-reps.json      ← all 6 teams + reps
│   └── dropdowns.json       ← all picklist values
├── src/
│   ├── routing-engine.js    ← pure routing logic (no SF dependency, fully tested)
│   ├── email-validator.js   ← spam filter + Hunter.io verify
│   ├── sf-client.js         ← Salesforce REST API integration
│   ├── sfmc-client.js       ← SFMC journey entry events
│   ├── lead-processor.js    ← 7-step pipeline orchestrator
│   └── server.js            ← Express API server
├── public/
│   └── form.html            ← 3-step wizard (embeddable in Drupal)
├── tests/
│   └── routing-engine.test.js ← 27 unit tests
└── .env.example             ← all required config keys
```

---

## What Needs Stakeholder Approval Before Dev Continues

**Monica + Josh — please confirm:**
- [ ] Routing matrix is correct (matches your Excel document)
- [ ] Organization Type picklist values are correct for prospects
- [ ] SLA commitments: B2C 1–4 hrs, B2B 48 hrs
- [ ] "Other" org name → fallback to Inside Sales confirmed
- [ ] Phase 1 = Contact Us form only (webinars in Phase 2)

**Angel + Shar — please confirm:**
- [ ] Organization_Type__c field creation approved in SF + Farside CDM
- [ ] Organization_Size__c field creation approved
- [ ] CommSubscriptionConsent CDM model — 14 channel types configured?
- [ ] Native SF lead duplicate rules confirmed as sufficient (email-based)
- [ ] SFMC entry event API keys for each journey (needed to wire journey triggers)

**Sam's action item:**
- [ ] Connect with Dakshesh (5X Drupal team) re: form embed options

---

## Questions / Comments
Post in the group chat or reply to this repo. Once approved, code will be completed same day.
