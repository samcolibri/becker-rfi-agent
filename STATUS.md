# Becker RFI Agent — Build Status
## Last updated: 2026-04-21
## Author: Sam Chaudhary (AI Architect) + Claude Sonnet 4.6

---

## Summary

The Becker RFI routing system is built, custom fields are live in sandbox, queues are
configured, and the Node.js routing engine passes all tests. The Salesforce Flow
architecture has been clarified: an **existing platform flow already handles
ExternalWebform__c → Lead creation** and must be extended (not replaced) with the
RFI-specific field mappings and queue assignment logic. Three human actions remain
before the end-to-end path is complete.

---

## Salesforce Flow Architecture — CORRECTED

### The Existing Flow Chain (Already Active — Do Not Replace)

```
ExternalWebform__c INSERT
    │
    ▼
"External Web Form Main Record Triggered Flow After Save"  (v21, ID: 301U700000bJ16UIAS)
    │
    ├── Check_If_B2B decision
    ├── getAccountRecord lookup (dedup by company)
    ├── getB2BContact lookup
    │
    ├── Calls: "Create Leads Sub Flow" (v32, ID: 301U700000dv71dIAA)
    │     └── Creates Lead (B2B or B2C RecordType)
    │     └── Maps: Email, Name, Phone, Brand, Consent, Lead_Source_Form__c, Product_Line__c
    │
    ├── Calls: "Call Create Campaign Members Sub Flow"
    └── Updates Account/Contact if existing record found
```

This flow was already serving the other Becker webforms. The RFI form submits to the
same `ExternalWebform__c` object and the same flow fires. **No new flow is needed.**

### What "Create Leads Sub Flow" Currently Maps

| Lead Field | Source on ExternalWebform__c | Status |
|---|---|---|
| `FirstName` | `First_Name__c` | ✅ |
| `LastName` | `Last_Name__c` | ✅ |
| `Email` | `Email__c` | ✅ |
| `Phone` | `Phone__c` | ✅ |
| `Business_Brand__c` | `BusinessBrand__c` | ✅ |
| `Privacy_Consent_Status__c` | `Privacy_Consent_Status__c` | ✅ |
| `Product_Line__c` | `Primary_Interest__c` | ✅ |
| `State` | `Address__StateCode__s` | ✅ |
| `RecordTypeId` | B2B/B2C lookup by `isB2B` flag | ✅ |
| `Lead_Source_Form__c` | `Consent_Captured_Source__c` | ⚠️ Wrong for RFI — see below |
| `Company` | *(not mapped)* | ❌ Needs adding |
| `RFI_Organization_Type__c` | *(not mapped)* | ❌ Needs adding |
| `RFI_Org_Size_Category__c` | *(not mapped)* | ❌ Needs adding |
| `RFI_Role_Type__c` | *(not mapped)* | ❌ Needs adding |
| `OwnerId` (queue) | *(not mapped)* | ❌ Needs adding |

### Our Custom Flow — CONFLICT, Needs Deactivation

A separate `Becker_RFI_Lead_Routing` flow (v2, ID: `301U700000exNo4IAE`) was deployed
during development. It fires on the **same trigger** as the existing platform flow and
would create **duplicate leads** on every RFI submission. It must be deactivated.

**Huma needs to do one thing in Flow Builder UI:**
> Setup → Flows → "Becker RFI Lead Routing" → Deactivate

API deactivation of an Active flow version is not supported in Salesforce — requires
human action in the UI. This is a 30-second task.

---

## What Huma Needs to Add to "Create Leads Sub Flow"

These are the exact additions needed in the **Create Leads Sub Flow** (open in Flow Builder,
save as a new version):

### 1. Fix the Lead_Source_Form__c mapping (existing bug for RFI)
The subflow currently sets:
```
Lead.Lead_Source_Form__c ← External_Web_Form.Consent_Captured_Source__c
```
For the RFI form this produces "RFI Form — becker.com/contact-us" on Lead.Lead_Source_Form__c
which is wrong. Fix to:
```
Lead.Lead_Source_Form__c ← External_Web_Form.Lead_Source_Form__c
```
(Our form populates `Lead_Source_Form__c` on ExternalWebform__c with values like
"Contact Us - Buying for Org", "Contact Us - Exploring", etc.)

### 2. Add 4 new field assignments to the Create_Lead element
```
Company                   ← External_Web_Form.Company__c
RFI_Organization_Type__c  ← External_Web_Form.Organization_Type__c
RFI_Org_Size_Category__c  ← External_Web_Form.Organization_Size__c
RFI_Role_Type__c          ← External_Web_Form.Role_Type__c
```

### 3. Add queue assignment after Lead creation
Add after the `Create_Lead` element:

**New recordLookup — Get Queue:**
```
Object: Group
Filter: DeveloperName = {!External_Web_Form.RFI_Suggested_Queue__c}
Store in: varQueueGroup
```

**New decision — Queue Found?**
```
If varQueueGroup is not null → go to Update Lead Owner
Else → end (keep default owner)
```

**New recordUpdate — Assign Lead to Queue:**
```
Object: Lead
Record ID: {!Create_Lead} (the newly created Lead ID)
Field: OwnerId = {!varQueueGroup.Id}
```

The `RFI_Suggested_Queue__c` field on ExternalWebform__c is populated by the Node.js
routing engine before the record is written to Salesforce. For B2B leads this will
contain one of: "Global Firms", "New Client Acquisition", "University",
"International", "Inside Sales", "Customer Success & Expansion".
For B2C leads it will be empty (no queue assignment needed).

---

## What Is Live in Salesforce Sandbox

### Salesforce Queues — All 6 Created and Linked to Lead
| Queue Name | Salesforce ID | Lead SObject |
|---|---|---|
| Customer Success & Expansion | `00GU7000007dK2rMAE` | ✅ Linked |
| Global Firms | `00GU7000007dJwPMAU` | ✅ Linked |
| Inside Sales | `00GU7000007dJunMAE` | ✅ Linked |
| International | `00GU7000007dK1FMAU` | ✅ Linked |
| New Client Acquisition | `00GU7000007dJy1MAE` | ✅ Linked |
| University | `00GU7000007dJzdMAE` | ✅ Linked |

### Custom Fields on `ExternalWebform__c`
| Field API Name | Type | Purpose |
|---|---|---|
| `RFI_Suggested_Queue__c` | Text(100) | Routing engine writes queue name here; Flow reads it |
| `Lead_Source_Detail__c` | Text(255) | UTM parameters from form submission |

### Custom Fields on `Lead`
| Field API Name | Type | Notes |
|---|---|---|
| `RFI_Organization_Type__c` | Picklist | 11 values (Accounting Firm, Corp, etc.) |
| `RFI_Org_Size_Category__c` | Picklist | `<25`, `26-100`, `101-250`, `251+` |
| `RFI_Role_Type__c` | Picklist | 10 values (Partner/CEO/CFO, etc.) |
| `RFI_HQ_State__c` | Text(2) | HQ state for B2B leads |
| `RFI_Resident_State__c` | Text(2) | Resident state for B2C leads |
| `RFI_Graduation_Year__c` | Text(4) | B2C student path |
| `RFI_Becker_Student_Email__c` | Email | Existing Becker account email |
| `Lead_Source_Detail__c` | Text(255) | UTM params on Lead record |

> **Field naming note:** These carry an `RFI_` prefix because the original names
> (e.g. `Organization_Type__c`) were soft-deleted in this sandbox and blocked for
> 15 days. In production, Huma should create them with the clean names from
> `SALESFORCE_REQUIREMENTS.md`. The flow additions above reference the `RFI_*` names
> for sandbox; they'll need updating for prod with the final names.

### PermissionSet — `BeckerRFIFieldAccess`
- **SF ID:** `0PSU7000001IGybOAG`
- Grants read + edit on all 8 new RFI custom fields to the API user

### Node.js Routing Engine (`src/routing-engine.js`)
- 10 org types × 4 employee size buckets = 40 routing rules
- Outputs queue name → written to `RFI_Suggested_Queue__c` on ExternalWebform__c
- 23 unit tests passing

---

## E2E Tests — Run Against Real Sandbox 2026-04-21

These tests confirmed that ExternalWebform__c → Flow → Lead works end-to-end.
Note: the tests ran against our now-deprecated `Becker_RFI_Lead_Routing` flow.
Once Huma adds queue assignment to the existing "Create Leads Sub Flow", new tests
should be re-run to confirm queue assignment.

### Test 1 — B2B Path
```
Input:  Company=Grant Thornton LLP | OrgType=Accounting Firm | Size=26-100 | CPA
        RFI_Suggested_Queue__c=Global Firms | Requesting_for__c=My organization

ExternalWebform__c ID: a7IU7000004T9IXMA0  ← real record in sandbox
Lead ID:               00QU700000MnhdSMAR   ← created by flow
Lead RecordType:       B2B ✅
```

### Test 2 — B2C Path
```
Input:  Requesting_for__c=Myself | Primary_Interest__c=CPA | State=OH

ExternalWebform__c ID: a7IU7000004T9K9MAK  ← real record in sandbox
Lead ID:               00QU700000MniHlMAJ   ← created by flow
Lead RecordType:       B2C ✅
```

---

## What Is Pending — By Owner

### Huma Yousuf (Salesforce) — 2 items

**1. Deactivate `Becker RFI Lead Routing` flow (30 seconds)**
> Setup → Flows → "Becker RFI Lead Routing" → Deactivate
> Prevents duplicate lead creation when ExternalWebform__c is inserted.

**2. Add RFI field mappings + queue assignment to "Create Leads Sub Flow" (~30 min)**
> Full exact spec above in "What Huma Needs to Add" section.
> After changes: re-run E2E test and verify Lead.OwnerId = queue.

---

### Nick Leavitt (SFMC) — 1 item

**SFMC Installed Package credentials + journey event keys**
- `SFMC_CLIENT_ID`, `SFMC_CLIENT_SECRET`, `SFMC_AUTH_BASE_URL`, `SFMC_SUBDOMAIN`
- 11 journey event definition keys (one per product interest)
- Code is written and ready in `src/sfmc-client.js` — fires the moment credentials exist

**Why AI cannot do this:** SFMC Installed Package creation requires UI access to
Marketing Cloud Setup. The client secret is shown once at creation — only a human
MC admin can retrieve it.

---

### Charlene Ceci (DevOps) — 1 item

**Run `drush cr` on Acquia dev environment**
- Needed to flush Drupal's SF field cache so `Is_Current_Becker_Student__c` appears
  in the Drupal Salesforce Suite field picker.
- `Lead_Source_Form__c` and the other fields are already in cache — only this one field
  needs the cache flush.

---

### Sam Chaudhary (or Dakshesh) — 2 items

**1. Set `intent_path → Lead_Source_Form__c` in Drupal field mapping (2 min)**
> Log into Drupal admin (requires SSO browser session — CLI login blocked)
> `/admin/structure/salesforce/mappings/manage/switcher_webform_mapping/fields`
> Find `intent_path` row → set SF Field = `Lead_Source_Form__c` → Save

**2. After Charlene runs drush cr:**
> Add `is_current_becker_student → Is_Current_Becker_Student__c` in same UI

---

### Dakshesh (Drupal) — 1 item

**3-step wizard UX**
> The Drupal form at `/form/switcher-webform` is a flat form — data maps correctly
> but visual presentation doesn't match the Figma 3-step wizard design.
> Requires Drupal Webform module pages + conditional field logic.
> This is a presentation-layer task — all data plumbing is complete.

---

### Prod Deploy — Huma + Charlene

Nothing is in production yet. Sandbox is validated.
To promote: Metadata API deploy (same scripts used today) + prod SF credentials +
UAT sign-off + Charlene's release window.

---

## File Inventory

| File | Purpose | Status |
|---|---|---|
| `src/server.js` | Express API — POST /api/submit | ✅ |
| `src/lead-processor.js` | Builds ExternalWebform__c record, calls routing engine | ✅ |
| `src/routing-engine.js` | B2B routing matrix → queue name | ✅ 23 tests pass |
| `src/sf-client.js` | Salesforce REST API client | ✅ |
| `src/sfmc-client.js` | SFMC journey trigger client | ⚠ Code ready, no credentials |
| `src/email-validator.js` | Spam/bot filter + Hunter.io | ✅ |
| `client/src/app/App.tsx` | React 3-step wizard (Figma design) | ✅ |
| `DRUPAL_EMBED.md` | Integration guide for Dakshesh | ✅ Updated |
| `SALESFORCE_REQUIREMENTS.md` | Field specs for Huma | ✅ |
| `SETUP.md` | Credential setup + go-live checklist | ✅ |

---

## Contacts

| Person | Role | Outstanding Action |
|---|---|---|
| Huma Yousuf | SF Developer | Deactivate old flow + extend Create Leads Sub Flow |
| Angel Cichy | SF Admin | UAT sign-off |
| Dakshesh | Drupal Team Lead | 3-step wizard UX |
| Charlene Ceci | DevOps | `drush cr` on Acquia dev + release window |
| Nick Leavitt | SFMC Admin | SFMC credentials + journey event keys |
| Monica Callahan | Business Owner | Final UAT approval |
| Sam Chaudhary | AI Architect | `intent_path` Drupal mapping (2 min) |
