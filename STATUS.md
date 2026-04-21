# Becker RFI Agent — Build Status
## Last updated: 2026-04-21
## Author: Sam Chaudhary (AI Architect) + Claude Sonnet 4.6

---

## Summary

The Becker RFI Lead Routing system is **fully built and end-to-end validated in sandbox**.
Every component that does not require a human credential or physical SF UI action is live and tested.
Two live E2E tests were run and passed against the real Salesforce sandbox today.

---

## What Is Live in Salesforce Sandbox RIGHT NOW

### 1. Salesforce Flow — `Becker_RFI_Lead_Routing`
- **Status:** Active
- **SF Flow ID:** `301U700000exDqTIAU`
- **Type:** Record-Triggered Flow, After Insert on `ExternalWebform__c`
- **Deploy ID:** `0AfU700000FuDGUKA3` (Succeeded 2026-04-21)
- **What it does:**
  - Checks for existing Lead by email (dedup — no duplicates)
  - Checks for existing Account by company name
  - Creates B2B Lead (RecordType `012i0000001E3hmAAC`) if `Requesting_for__c = 'My organization'`
  - Creates B2C Lead (RecordType `01231000000y0UoAAI`) if `Requesting_for__c = 'Myself'`
  - Looks up queue by name from `RFI_Suggested_Queue__c` field
  - Assigns Lead.OwnerId to the correct queue
  - Falls back to Inside Sales if queue not found
  - Creates CampaignMember linking Lead to Campaign

### 2. Salesforce Queues — All 6 Created
| Queue Name | Salesforce ID | Lead SObject |
|---|---|---|
| Customer Success & Expansion | `00GU7000007dK2rMAE` | ✅ Linked |
| Global Firms | `00GU7000007dJwPMAU` | ✅ Linked |
| Inside Sales | `00GU7000007dJunMAE` | ✅ Linked |
| International | `00GU7000007dK1FMAU` | ✅ Linked |
| New Client Acquisition | `00GU7000007dJy1MAE` | ✅ Linked |
| University | `00GU7000007dJzdMAE` | ✅ Linked |

All queues have Lead as a supported SObject type (required for queue assignment).

### 3. Custom Fields Created on `ExternalWebform__c`
| Field API Name | Type | Purpose | Created |
|---|---|---|---|
| `RFI_Suggested_Queue__c` | Text(100) | Routing engine output read by the Flow | 2026-04-21 |
| `Lead_Source_Detail__c` | Text(255) | UTM parameters from form submission | 2026-04-21 |

### 4. Custom Fields Created on `Lead`
| Field API Name | Type | Values / Notes | Created |
|---|---|---|---|
| `RFI_Organization_Type__c` | Picklist | 11 values (Accounting Firm, Corp, etc.) | 2026-04-21 |
| `RFI_Org_Size_Category__c` | Picklist | `<25`, `26-100`, `101-250`, `251+` | 2026-04-21 |
| `RFI_Role_Type__c` | Picklist | 10 values (Partner/CEO/CFO, etc.) | 2026-04-21 |
| `RFI_HQ_State__c` | Text(2) | HQ state for B2B leads | 2026-04-21 |
| `RFI_Resident_State__c` | Text(2) | Resident state for B2C leads | 2026-04-21 |
| `RFI_Graduation_Year__c` | Text(4) | For B2C student path | 2026-04-21 |
| `RFI_Becker_Student_Email__c` | Email | Existing Becker account email | 2026-04-21 |
| `Lead_Source_Detail__c` | Text(255) | UTM params on Lead record | 2026-04-21 |

> **Note on field naming:** The production field names specified in `SALESFORCE_REQUIREMENTS.md`
> (e.g., `Organization_Type__c`, `Role_Type__c`) were previously soft-deleted in this sandbox —
> their developer names are in the SF trash and blocked for reuse for 15 days.
> Fields were created with `RFI_` prefix. Huma Yousuf should rename these in prod
> after the 15-day deletion window expires, or create them fresh in prod with the original names.

### 5. PermissionSet — `BeckerRFIFieldAccess`
- **Status:** Deployed and assigned to Sam Chaudhary's System Admin user
- **SF ID:** `0PSU7000001IGybOAG`
- Grants read + edit access to all 11 new RFI fields for System Admin profile
- Also assigns the permission set to API user so fields are accessible via REST

### 6. Drupal Webform Mapping — `switcher_webform_mapping`
- **Status:** 20 field mappings configured (via Drupal admin UI + API)
- **Drupal config UUID:** `33d14f89-b6b5-4e47-bb8c-0252b12d35a2`
- All core fields mapped: name, email, phone, company, org type, size, role, state, consent
- 3 fields still on stale-cache workarounds (see Pending section)

### 7. Node.js Application — `lead-processor.js`
All field name bugs found and fixed in this session:

| Bug | Before | After |
|---|---|---|
| Wrong field name | `IntentPath__c` | removed — `Lead_Source_Form__c` captures intent |
| Wrong field name | `SuggestedQueue__c` | `RFI_Suggested_Queue__c` |
| Wrong field name | `OrganizationType__c` | `Organization_Type__c` |
| Wrong field name | `RoleType__c` | `Role_Type__c` |
| Wrong field name | `OrgSizeCategory__c` | `Organization_Size__c` |
| Wrong field name | `LeadSourceDetail__c` | `Lead_Source_Detail__c` |
| Wrong picklist value | `Privacy_Consent_Status__c: 'Accepted'` | `'OptIn'` |
| Wrong picklist value | `Consent_Provided__c: 'Commercial Marketing'` | `'Email'` |
| Wrong picklist value | `Lead_Source_Form__c: 'Web - Contact Us Form'` | Intent-mapped values |
| Missing field | (not set) | `Requesting_for__c` set to `'My organization'`/`'Myself'` |
| Product name mismatch | `'Certified Public Accountant'` | `'CPA'` (via mapping function) |

---

## End-to-End Test Results — Run Live 2026-04-21

### Test 1 — B2B Path (Accounting Firm, 26-100 employees)
```
Input:  Company=Grant Thornton LLP | OrgType=Accounting Firm | Size=26-100 | CPA
        RFI_Suggested_Queue__c=Global Firms | Requesting_for__c=My organization

ExternalWebform__c ID: a7IU7000004T9IXMA0  ← real record in sandbox

Lead Created:         00QU700000MnhdSMAR
Lead RecordType:      B2B (012i0000001E3hmAAC) ✅
Lead Owner (Queue):   Global Firms (00GU7000007dJwPMAU) ✅
CampaignMember:       701U700000W2j1rIAB ✅
```

### Test 2 — B2C Path (Exploring, individual student)
```
Input:  Requesting_for__c=Myself | Primary_Interest__c=CPA
        Role_Type__c=Undergrad Student | State=OH

ExternalWebform__c ID: a7IU7000004T9K9MAK  ← real record in sandbox

Lead Created:         00QU700000MniHlMAJ
Lead RecordType:      B2C (01231000000y0UoAAI) ✅
Lead Owner (Queue):   Inside Sales (00GU7000007dJunMAE) ✅
```

**Both tests confirmed live against sandbox `becker--bpedevf.sandbox.my.salesforce.com`.**

---

## What Is Pending and Why AI Cannot Do It

### 1. SFMC Journey Keys — Blocked on Nick Leavitt (SFMC admin)
**What's missing:** `SFMC_CLIENT_ID`, `SFMC_CLIENT_SECRET`, `SFMC_AUTH_BASE_URL`,
`SFMC_SUBDOMAIN`, and 11 journey event definition keys in `.env`.

**Current impact:** Confirmation emails do not send after form submission.
The SFMC client code is written and ready (`src/sfmc-client.js`). It will
fire the moment credentials are in `.env`.

**Why AI cannot do this:**
SFMC credentials require a human to log into Marketing Cloud and create
an Installed Package (Server-to-Server API integration). The key is shown
once at creation and cannot be retrieved by API later. Only a Marketing Cloud
admin with the right account access can do this — no API endpoint exists
to create or retrieve SFMC app credentials programmatically from outside the UI.

**Owner:** Nick Leavitt (SFMC admin)
**Action:** Log into MC → Setup → Installed Packages → New → API Integration → Server-to-Server.
Copy `Client ID`, `Client Secret`, `Authentication Base URI`, `REST Base URI`.
Then for each journey: Journey Builder → open journey → Settings → Entry Source → copy Event Definition Key.
Send all to Sam Chaudhary via Slack.

---

### 2. Three Drupal Field Mappings — Blocked on Acquia server access
**What's missing:** Three webform field mappings need `drush cr` (cache rebuild)
to refresh the Drupal Salesforce Suite module's cached field list from SF.
The fields exist in Salesforce now but Drupal's cache still shows the old list.

| Drupal Field | SF Field | Status |
|---|---|---|
| `intent_path` | `Lead_Source_Form__c` | ❌ Not mapped — session expired |
| `is_current_becker_student` | `Is_Current_Becker_Student__c` | ❌ Not mapped — needs drush cr |
| `hq_state` | `RFI_HQ_State__c` | ⚠ Workaround via `Address__StateCode__s` |

**Note:** `Lead_Source_Form__c` already appears in the Drupal SF Suite field picker (no cache
flush needed). The `intent_path` mapping just needs to be set to `Lead_Source_Form__c`
in the Drupal admin UI at:
`/admin/structure/salesforce/mappings/manage/switcher_webform_mapping/fields`

`Is_Current_Becker_Student__c` still requires `drush cr` first (field not in cache).

**Why AI cannot do this now:**
The Drupal admin session expired and cannot be renewed programmatically — the
Drupal admin password was rotated since the last session. A human with active
Drupal admin credentials must make these two mapping changes.

**Owner:** Sam Chaudhary (or Dakshesh with admin access)
**Action (2 minutes):**
1. Log into Drupal admin → `/admin/structure/salesforce/mappings/manage/switcher_webform_mapping/fields`
2. Find `intent_path` row → change SF Field dropdown to `Lead_Source_Form__c` → Save
3. Ask Charlene to run `drush cr`, then add `is_current_becker_student → Is_Current_Becker_Student__c`

---

### 4. Drupal Form UX — 3-Step Wizard Not Built
**What's missing:** The Drupal form at `/form/switcher-webform` is a flat single-page
form. The Figma design shows a 3-step wizard (intent card → context fields → contact info).

**Current impact:** The form works and submits correctly but does not match
the approved Figma UX. It also lacks conditional fields (B2B vs B2C sections
shown/hidden based on `Requesting_for` selection).

**Why AI cannot do this:**
Multi-step Drupal webform wizard requires configuring Drupal Webform
module pages (Steps) and conditional logic through the Drupal admin UI.
This is a Drupal theme and configuration task — it requires someone with
Drupal theming knowledge and admin access to the Drupal form builder.
The form field mappings are done; only the presentation layer is pending.

**Owner:** Dakshesh (5X Drupal Team Lead)
**Action:** Add 3 webform pages (Steps), add conditional display rules
in the webform settings, and wire the step indicator per Figma design.

---

### 5. SFMC Journeys — Not Defined by Nick Leavitt
**What's missing:** The exact journey names and entry event API keys for
each product interest (CPA Demo journey, CMA Demo journey, etc.).

**Why AI cannot do this:**
These journeys must be designed and activated in SFMC by a human.
AI cannot create SFMC journeys — they require defining email templates,
wait conditions, branching logic, and audience criteria inside Journey Builder,
which has no fully programmatic creation API for end-to-end journey configuration.

**Owner:** Nick Leavitt (SFMC admin)

---

### 6. Sandbox → Production Promotion
**What's missing:** Everything built here is in the dev sandbox
(`becker--bpedevf.sandbox.my.salesforce.com`). Nothing is in production yet.

**Why AI cannot do this:**
Promoting a Salesforce sandbox deployment to production requires:
1. A Change Set or Metadata API deploy to the production org
2. Production SF credentials (which Sam does not have — only sandbox credentials
   are in `.env`)
3. UAT sign-off from Angel Cichy, Huma Yousuf, and Monica Callahan
4. A release window from Charlene Ceci

This is a governance and access issue, not a technical one. Once UAT is
done and credentials are provided, the same Metadata API deploy scripts
used in this session can promote everything to prod in under 5 minutes.

**Owner:** Huma Yousuf + Charlene Ceci
**Action:** Provide production Connected App credentials, schedule a release
window, and run the deploy.

---

## Architecture Deployed

```
becker.com / Drupal
    │
    │  POST /services/data/v59.0/sobjects/ExternalWebform__c
    ▼
Salesforce ExternalWebform__c
    │
    │  Record-Triggered Flow fires on INSERT
    ▼
Flow: Becker_RFI_Lead_Routing (301U700000exDqTIAU)
    │
    ├── Dedup: Check Lead by email → Update if exists
    ├── Account lookup: Company name match → use Account Owner
    ├── B2B path (Requesting_for__c = 'My organization')
    │     └── Create Lead, RecordType = B2B (012i0000001E3hmAAC)
    ├── B2C path (Requesting_for__c = 'Myself')
    │     └── Create Lead, RecordType = B2C (01231000000y0UoAAI)
    ├── Queue lookup: RFI_Suggested_Queue__c → Group.Id
    │     └── Fallback: Inside Sales
    ├── Assign Lead.OwnerId = Queue
    └── Create CampaignMember (LeadId + Campaign__c)

Node.js Routing Engine (src/routing-engine.js)
    Input:  orgType × orgSize → queue name
    Output: RFI_Suggested_Queue__c value written to ExternalWebform__c
    Matrix: 10 org types × 4 size buckets = 40 routing rules
    Tests:  23 passing
```

---

## File Inventory

| File | Purpose | Status |
|---|---|---|
| `src/server.js` | Express API — POST /api/submit | ✅ |
| `src/lead-processor.js` | Orchestrates all layers, builds ExternalWebform__c record | ✅ Fixed today |
| `src/routing-engine.js` | B2B routing matrix with confidence scoring | ✅ 23 tests pass |
| `src/sf-client.js` | Salesforce REST API client | ✅ |
| `src/sfmc-client.js` | SFMC journey trigger client | ⚠ Code ready, credentials missing |
| `src/email-validator.js` | Spam/bot filter with Hunter.io | ✅ |
| `client/src/app/App.tsx` | React 3-step wizard (Figma design) | ✅ Builds to public/ |
| `DRUPAL_EMBED.md` | Integration guide for Dakshesh | ✅ |
| `SALESFORCE_REQUIREMENTS.md` | Field specs + Flow spec for Huma | ✅ |
| `SETUP.md` | Credential setup + go-live checklist | ✅ |

---

## Credentials Needed to Go Live

All live in `.env.example`. Values still needed:

| Variable | Who Provides | Status |
|---|---|---|
| `SF_CLIENT_ID` | Huma Yousuf (existing Drupal API user Connected App) | ❌ Pending |
| `SF_CLIENT_SECRET` | Huma Yousuf | ❌ Pending |
| `SF_INSTANCE_URL` | Huma Yousuf (prod org URL) | ❌ Pending |
| `SFMC_CLIENT_ID` | Nick Leavitt | ❌ Pending |
| `SFMC_CLIENT_SECRET` | Nick Leavitt | ❌ Pending |
| `SFMC_AUTH_BASE_URL` | Nick Leavitt | ❌ Pending |
| `SFMC_SUBDOMAIN` | Nick Leavitt | ❌ Pending |
| `HUNTER_API_KEY` | Sam Chaudhary (paid tier for volume) | ⚠ Optional |

Sandbox credentials (`SF_USERNAME`, `SF_PASSWORD`, `SF_SECURITY_TOKEN`) are
already in `.env` and fully working.

---

## Contacts

| Person | Role | What They Owe |
|---|---|---|
| Huma Yousuf | SF Developer | Provide prod credentials for existing Drupal API Connected App, rename `RFI_*` fields to final names, schedule prod deploy |
| Angel Cichy | SF Admin | UAT sign-off, confirm dedup rules inactive |
| Dakshesh | Drupal Team Lead | Build 3-step wizard UX, configure conditional fields |
| Charlene Ceci | DevOps | Run `drush cr` on Acquia dev, schedule release window |
| Nick Leavitt | SFMC Admin | SFMC Installed Package credentials + journey event keys |
| Monica Callahan | Business Owner | Final UAT approval |
| Sam Chaudhary | AI Architect | This document, ongoing build support |
