# Becker RFI Agent — Build Status
## Last updated: 2026-04-21 (all facts verified live against sandbox)
## Sandbox: becker--bpedevf.sandbox.my.salesforce.com
## Author: Sam Chaudhary (AI Architect) + Claude Sonnet 4.6

---

## Overall Status: ✅ E2E VERIFIED IN SANDBOX — Awaiting Production Deploy

All three routing paths confirmed live end-to-end:
- B2B Accounting Firm 26-100 → **Global Firms** ✅
- B2C Exploring → **Inside Sales** ✅
- B2B Corporation 251+ → **New Client Acquisition** ✅

---

## Active Salesforce Flow

| Flow | ID | Version | Status |
|---|---|---|---|
| Becker RFI Lead Routing | `301U700000exNo4IAE` | **v7** | ✅ Active |

**v7 changes (deployed 2026-04-21):**
- Added `faultConnector` on `Create_B2B_Lead` and `Create_B2C_Lead` elements
- DUPLICATES_DETECTED errors now caught silently (no flow error emails)
- Flow ends cleanly when duplicate submission is detected

**What the flow does on every ExternalWebform__c insert:**
1. Checks for existing Lead by email → updates if found, skips create
2. Creates B2B or B2C Lead based on `Requesting_for__c`
3. Looks up queue by `RFI_Suggested_Queue__c` value → assigns Lead owner
4. Falls back to Inside Sales if no queue match
5. Creates CampaignMember if `Campaign__c` is set

---

## Salesforce Queues — All 6 Verified

| Queue Name | ID | Lead Linked |
|---|---|---|
| Customer Success & Expansion | `00GU7000007dK2rMAE` | ✅ |
| Global Firms | `00GU7000007dJwPMAU` | ✅ |
| Inside Sales | `00GU7000007dJunMAE` | ✅ |
| International | `00GU7000007dK1FMAU` | ✅ |
| New Client Acquisition | `00GU7000007dJy1MAE` | ✅ |
| University | `00GU7000007dJzdMAE` | ✅ |

---

## Custom Fields on `ExternalWebform__c` — Verified Present

| Field API Name | Type | Notes |
|---|---|---|
| `Organization_Type__c` | Picklist | Pre-existing |
| `Role_Type__c` | Picklist | Pre-existing |
| `Organization_Size__c` | Picklist | Pre-existing |
| `Lead_Source_Form__c` | Picklist | Pre-existing |
| `Lead_Source_Detail__c` | Text(255) | Created 2026-04-21 |
| `RFI_Suggested_Queue__c` | Text(100) | Created 2026-04-21 — routing engine writes here before insert |

---

## Custom Fields on `Lead` — Verified Present + FLS Fixed

| Field API Name | Type | FLS (Automated Process) |
|---|---|---|
| `RFI_Organization_Type__c` | Picklist | ✅ Fixed 2026-04-21 |
| `RFI_Org_Size_Category__c` | Picklist | ✅ |
| `RFI_Role_Type__c` | Picklist | ✅ Fixed 2026-04-21 |
| `RFI_HQ_State__c` | Text(2) | ✅ |
| `RFI_Resident_State__c` | Text(2) | ✅ |
| `RFI_Graduation_Year__c` | Text(4) | ✅ Fixed 2026-04-21 |
| `RFI_Becker_Student_Email__c` | Email | ✅ Fixed 2026-04-21 |
| `Lead_Source_Detail__c` | Text(255) | ✅ |

> **FLS fix (2026-04-21):** `RFI_Becker_Student_Email__c`, `RFI_Graduation_Year__c`, and
> `RFI_Role_Type__c` were missing Visible+Edit for the Automated Process profile. Fixed via
> Setup → Object Manager → Lead → field → Set Field-Level Security → Automated Process.

> **Field naming note (sandbox only):** `Organization_Type__c`, `Role_Type__c` etc. were
> previously soft-deleted in this sandbox so these Lead fields use `RFI_` prefix.
> In production Huma should create them with clean names matching the ExternalWebform__c fields.

---

## PermissionSet — BeckerRFIFieldAccess

- **ID:** `0PSU7000001IGybOAG`
- Read + edit on all 8 custom Lead fields, assigned to API user

---

## E2E Test Records — Verified Live 2026-04-21

**Test 1 — B2B Accounting Firm 26-100 → Global Firms**

| What | ID | Result |
|---|---|---|
| ExternalWebform__c | `a7IU7000004TH4nMAG` | ✅ HTTP 200 |
| Lead | `00QU700000Mp0ULMAZ` | ✅ created |
| Lead.RecordTypeId | `012i0000001E3hmAAC` (B2B) | ✅ |
| Lead.OwnerId | `00GU7000007dJwPMAU` (Global Firms) | ✅ |
| Lead.RFI_Organization_Type__c | `Accounting Firm` | ✅ |
| Lead.RFI_Role_Type__c | `Partner/CEO/CFO` | ✅ |

**Test 2 — B2C Exploring → Inside Sales**

| What | ID | Result |
|---|---|---|
| ExternalWebform__c | `a7IU7000004TH6PMAW` | ✅ HTTP 200 |
| Lead | `00QU700000Mp0VxMAJ` | ✅ created |
| Lead.RecordTypeId | `01231000000y0UoAAI` (B2C) | ✅ |
| Lead.OwnerId | `00GU7000007dJunMAE` (Inside Sales) | ✅ |
| Lead.RFI_Role_Type__c | `Grad Student` | ✅ |

**Test 3 — B2B Corporation 251+ → New Client Acquisition**

| What | ID | Result |
|---|---|---|
| ExternalWebform__c | `a7IU7000004TFpOMAW` | ✅ HTTP 200 |
| Lead | `00QU700000MopKQMAZ` | ✅ created |
| Lead.RecordTypeId | `012i0000001E3hmAAC` (B2B) | ✅ |
| Lead.OwnerId | `00GU7000007dJy1MAE` (New Client Acquisition) | ✅ |
| Lead.RFI_Organization_Type__c | `Corporation/Healthcare/Bank/Financial Institution` | ✅ |
| Lead.RFI_Role_Type__c | `Supervisor/Director/Manager` | ✅ |

**Test 4 — Duplicate submission (same email) — Silent handling**

| What | Result |
|---|---|
| ExternalWebform__c | `a7IU7000004TEdBMAW` ✅ created |
| Flow v7 fault connector | ✅ caught silently — 0 failed interviews, no error email |
| Lead created | ✅ No — existing lead untouched (correct) |

---

## What Is Blocked — By Owner

### Huma Yousuf
| # | Task | Status |
|---|---|---|
| 1 | Provide prod Connected App credentials (existing Drupal API integration app) | ⏳ Pending |
| 2 | Rename `RFI_*` Lead fields to clean names in production (optional, cosmetic) | — |

> Flow work is complete. Field-level security fixed. E2E verified.

### Nick Leavitt
| # | Task |
|---|---|
| 1 | SFMC Installed Package: `Client ID`, `Client Secret`, `Auth Base URI`, `Subdomain` |
| 2 | 11 journey event definition keys from Journey Builder (one per product interest) |

Code is written and ready in `src/sfmc-client.js` — fires the moment `.env` is populated.

### Charlene Ceci
| # | Task |
|---|---|
| 1 | SSH to Acquia dev, run `drush cr` (unblocks `is_current_becker_student` Drupal mapping) |
| 2 | Provide production release window |

### Sam Chaudhary
| # | Task |
|---|---|
| 1 | Set `intent_path → Lead_Source_Form__c` Drupal mapping via browser SSO (2 min task) |

### Dakshesh
| # | Task |
|---|---|
| 1 | Build 3-step wizard UX in Drupal Webform module (Figma design) |
| 2 | Add B2B/B2C conditional field display rules |

---

## Drupal Webform Field Mapping Status

| Drupal Form Field | ExternalWebform__c Field | Status |
|---|---|---|
| `first_name` | `First_Name__c` | ✅ |
| `last_name` | `Last_Name__c` | ✅ |
| `email` | `Email__c` | ✅ |
| `phone` | `Phone__c` | ✅ |
| `company` | `Company__c` | ✅ |
| `org_type` | `Organization_Type__c` | ✅ |
| `org_size` | `Organization_Size__c` | ✅ |
| `role_type` | `Role_Type__c` | ✅ |
| `state` | `Address__StateCode__s` | ✅ |
| `consent_given` | `Consent_Provided__c` | ✅ |
| `privacy_consent` | `Privacy_Consent_Status__c` | ✅ |
| `business_brand` | `BusinessBrand__c` | ✅ |
| `requesting_for` | `Requesting_for__c` | ✅ |
| `primary_interest` | `Primary_Interest__c` | ✅ |
| `suggested_queue` | `RFI_Suggested_Queue__c` | ✅ |
| `lead_source_form` | `Lead_Source_Form__c` | ✅ |
| `utm_params` | `Lead_Source_Detail__c` | ✅ |
| `intent_path` | `Lead_Source_Form__c` | ❌ Needs 2-min browser fix by Sam |
| `is_current_becker_student` | `Is_Current_Becker_Student__c` | ❌ Blocked on Charlene: `drush cr` |

---

## Node.js Routing Engine

- **File:** `src/routing-engine.js`
- **Tests:** 23 passing (`npm test`)
- **Logic:** 10 org types × 4 employee size buckets → 40 routing rules → queue name
- **Output:** Writes queue name to `RFI_Suggested_Queue__c` on ExternalWebform__c before insert

---

## File Inventory

| File | Purpose | Status |
|---|---|---|
| `src/server.js` | Express API — POST /api/submit, GET /api/accounts | ✅ |
| `src/lead-processor.js` | Builds ExternalWebform__c record, calls routing engine | ✅ |
| `src/routing-engine.js` | B2B routing matrix | ✅ 23 tests |
| `src/sf-client.js` | Salesforce REST client | ✅ |
| `src/sfmc-client.js` | SFMC journey trigger client | ⚠ Code ready, no credentials |
| `src/email-validator.js` | Spam/bot filter + Hunter.io | ✅ |
| `client/src/app/App.tsx` | React 3-step wizard (Figma design) | ✅ |
| `DRUPAL_EMBED.md` | Integration guide for Dakshesh | ✅ |
| `SALESFORCE_REQUIREMENTS.md` | Field specs + Flow spec for Huma | ✅ |
| `SETUP.md` | Credential setup + go-live checklist | ✅ |

---

## Contacts

| Person | Role | What They Owe |
|---|---|---|
| Huma Yousuf | SF Developer | Prod Connected App credentials |
| Angel Cichy | SF Admin | UAT sign-off |
| Dakshesh | Drupal Team Lead | 3-step wizard UX + conditional fields |
| Charlene Ceci | DevOps | `drush cr` on Acquia dev + release window |
| Nick Leavitt | SFMC Admin | SFMC credentials + journey event keys |
| Monica Callahan | Business Owner | Final UAT approval |
| Sam Chaudhary | AI Architect | `intent_path` Drupal mapping (2 min browser task) |
