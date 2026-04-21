# Becker RFI Agent — Build Status
## Last updated: 2026-04-21 (all facts verified live against sandbox)
## Sandbox: becker--bpedevf.sandbox.my.salesforce.com
## Author: Sam Chaudhary (AI Architect) + Claude Sonnet 4.6

---

## What Is Confirmed Live in Salesforce Sandbox — Verified 2026-04-21

### Salesforce Flow Chain (Existing Platform Flow — Active)

The org already runs a record-triggered flow on `ExternalWebform__c` After Save.
This is the correct flow to extend for RFI routing.

| Flow | ID | Version | Status |
|---|---|---|---|
| External Web Form Main Record Triggered Flow After Save | `301U700000bJ16UIAS` | v21 | ✅ Active |
| External Web Form Sub Assign Consent to Person Record | `301U700000aBIuXIAW` | v3 | ✅ Active |
| Create Leads Sub Flow | `301U700000dv71dIAA` | v32 | ✅ Active (called by main flow) |

The main flow calls "Create Leads Sub Flow" which creates the Lead record.
No new flow is needed — the existing one must be extended.

### Conflicting Custom Flow — Must Be Deactivated

| Flow | ID | Version | Status | Action Required |
|---|---|---|---|---|
| Becker RFI Lead Routing | `301U700000exNo4IAE` | v2 | ⚠️ Still Active | Huma: Deactivate in UI |

This flow fires on the same trigger as the existing platform flow.
If left Active it will create **duplicate leads** on every ExternalWebform__c insert.
API deactivation of an Active flow version is blocked by Salesforce — requires UI:
> **Setup → Flows → "Becker RFI Lead Routing" → Deactivate**

---

### Salesforce Queues — All 6 Created, All Linked to Lead

Verified via `QueueSobject` query — all 6 queues have Lead as a supported SObject type.

| Queue Name | ID | Lead Linked |
|---|---|---|
| Customer Success & Expansion | `00GU7000007dK2rMAE` | ✅ |
| Global Firms | `00GU7000007dJwPMAU` | ✅ |
| Inside Sales | `00GU7000007dJunMAE` | ✅ |
| International | `00GU7000007dK1FMAU` | ✅ |
| New Client Acquisition | `00GU7000007dJy1MAE` | ✅ |
| University | `00GU7000007dJzdMAE` | ✅ |

---

### Custom Fields on `ExternalWebform__c` — Verified Present

| Field API Name | Type | Source |
|---|---|---|
| `Organization_Type__c` | Picklist | Pre-existing on ExternalWebform__c |
| `Role_Type__c` | Picklist | Pre-existing on ExternalWebform__c |
| `Organization_Size__c` | Picklist | Pre-existing on ExternalWebform__c |
| `Lead_Source_Form__c` | Picklist | Pre-existing on ExternalWebform__c |
| `Lead_Source_Detail__c` | Text(255) | Created 2026-04-21 |
| `RFI_Suggested_Queue__c` | Text(100) | Created 2026-04-21 — routing engine writes here |

> `Organization_Type__c`, `Role_Type__c`, `Organization_Size__c` already existed on
> `ExternalWebform__c` with clean names. The Huma subflow additions below use these
> original names directly.

---

### Custom Fields on `Lead` — Verified Present

| Field API Name | Type | Purpose |
|---|---|---|
| `RFI_Organization_Type__c` | Picklist | B2B org type (11 values) |
| `RFI_Org_Size_Category__c` | Picklist | Employee count bucket |
| `RFI_Role_Type__c` | Picklist | Role of the contact |
| `RFI_HQ_State__c` | Text(2) | B2B HQ state |
| `RFI_Resident_State__c` | Text(2) | B2C resident state |
| `RFI_Graduation_Year__c` | Text(4) | B2C student graduation year |
| `RFI_Becker_Student_Email__c` | Email | Existing Becker account email |
| `Lead_Source_Detail__c` | Text(255) | UTM parameters |

> **Field naming note (sandbox only):** `Organization_Type__c`, `Role_Type__c` etc. were
> previously soft-deleted in this sandbox so these Lead fields use `RFI_` prefix.
> In production Huma should create them with clean names (`Organization_Type__c`, etc.)
> matching the ExternalWebform__c field names above.

---

### PermissionSet — BeckerRFIFieldAccess

- **ID:** `0PSU7000001IGybOAG`
- Read + edit on all 8 custom Lead fields, assigned to API user

---

### E2E Test Records — Verified Live 2026-04-21

**Test 1 — B2B (Accounting Firm, 26-100 employees → Global Firms)**

| What | ID | Verified |
|---|---|---|
| ExternalWebform__c | `a7IU7000004T9IXMA0` | ✅ HTTP 200 |
| Lead | `00QU700000MnhdSMAR` | ✅ exists |
| Lead.RecordTypeId | `012i0000001E3hmAAC` (B2B) | ✅ |
| Lead.OwnerId | `00GU7000007dJwPMAU` (Global Firms) | ✅ |

**Test 2 — B2C (Exploring, individual → Inside Sales)**

| What | ID | Verified |
|---|---|---|
| ExternalWebform__c | `a7IU7000004T9K9MAK` | ✅ HTTP 200 |
| Lead | `00QU700000MniHlMAJ` | ✅ exists |
| Lead.RecordTypeId | `01231000000y0UoAAI` (B2C) | ✅ |
| Lead.OwnerId | `00GU7000007dJunMAE` (Inside Sales) | ✅ |

> These tests ran against `Becker_RFI_Lead_Routing` (the custom flow, now deprecated).
> Queue assignment worked end-to-end. Once Huma adds queue assignment to "Create Leads
> Sub Flow", re-run to confirm the same result via the platform flow path.

---

## What Huma Needs to Add to "Create Leads Sub Flow"

Open the flow in Flow Builder, add a new version with the following changes:

### 1. Fix existing wrong mapping
The subflow currently sets:
```
Lead.Lead_Source_Form__c ← External_Web_Form.Consent_Captured_Source__c
```
Change to:
```
Lead.Lead_Source_Form__c ← External_Web_Form.Lead_Source_Form__c
```
Our form sets `Lead_Source_Form__c` on ExternalWebform__c to values like
"Contact Us - Buying for Org" / "Contact Us - Exploring" etc. The current
mapping overwrites this with the consent source string instead.

### 2. Add 4 field assignments to the Create_Lead element
```
Company                   ← External_Web_Form.Company__c
RFI_Organization_Type__c  ← External_Web_Form.Organization_Type__c
RFI_Org_Size_Category__c  ← External_Web_Form.Organization_Size__c
RFI_Role_Type__c          ← External_Web_Form.Role_Type__c
```

### 3. Add queue assignment after Create_Lead (3 new elements)

**recordLookup — Get Queue by name:**
```
Object: Group
Filter: DeveloperName Equals {!External_Web_Form.RFI_Suggested_Queue__c}
Store first record in: varQueueGroup
```

**decision — Queue Found?**
```
If varQueueGroup.Id is not null → Assign Owner
Default → end (keep default owner — covers B2C leads)
```

**recordUpdate — Set Lead Owner:**
```
Object: Lead
ID: {!Create_Lead}
OwnerId = {!varQueueGroup.Id}
```

`RFI_Suggested_Queue__c` is populated by the Node.js routing engine before the
ExternalWebform__c record is written. For B2B it contains one of:
`Global Firms`, `New Client Acquisition`, `University`, `International`,
`Inside Sales`, `Customer Success & Expansion`. For B2C it is empty.

---

## Drupal Webform Field Mapping Status

Drupal submits to `ExternalWebform__c` via the existing "Drupal B2B Commerce Integration"
Connected App. No new Connected App needed.

| Drupal Form Field | ExternalWebform__c Field | Status |
|---|---|---|
| `first_name` | `First_Name__c` | ✅ Mapped |
| `last_name` | `Last_Name__c` | ✅ Mapped |
| `email` | `Email__c` | ✅ Mapped |
| `phone` | `Phone__c` | ✅ Mapped |
| `company` | `Company__c` | ✅ Mapped |
| `org_type` | `Organization_Type__c` | ✅ Mapped |
| `org_size` | `Organization_Size__c` | ✅ Mapped |
| `role_type` | `Role_Type__c` | ✅ Mapped |
| `state` | `Address__StateCode__s` | ✅ Mapped (workaround for HQ state) |
| `consent_given` | `Consent_Provided__c` | ✅ Mapped |
| `privacy_consent` | `Privacy_Consent_Status__c` | ✅ Mapped |
| `business_brand` | `BusinessBrand__c` | ✅ Mapped |
| `requesting_for` | `Requesting_for__c` | ✅ Mapped |
| `primary_interest` | `Primary_Interest__c` | ✅ Mapped |
| `suggested_queue` | `RFI_Suggested_Queue__c` | ✅ Mapped |
| `lead_source_form` | `Lead_Source_Form__c` | ✅ Mapped |
| `utm_params` | `Lead_Source_Detail__c` | ✅ Mapped |
| `intent_path` | `Lead_Source_Form__c` | ❌ Not set — needs 2-min UI change (see below) |
| `is_current_becker_student` | `Is_Current_Becker_Student__c` | ❌ Blocked on drush cr |

**`intent_path` fix (2 minutes):** The Drupal site uses SSO — CLI login is blocked.
Requires browser session:
1. Log into `https://www.dev.becker.com/user/login` via browser (SSO)
2. Go to `/admin/structure/salesforce/mappings/manage/switcher_webform_mapping/fields`
3. Find `intent_path` row → set SF Field dropdown to `Lead_Source_Form__c` → Save

**`is_current_becker_student` fix:** Requires Charlene to run `drush cr` on Acquia
dev server first (field not yet visible in Drupal's cached field list), then the
mapping can be added.

---

## What Is Blocked — By Owner

### Huma Yousuf
| # | Task | Time |
|---|---|---|
| 1 | Deactivate "Becker RFI Lead Routing" flow in Flow Builder UI | 30 sec |
| 2 | Add field mappings + queue assignment to "Create Leads Sub Flow" (spec above) | ~30 min |
| 3 | Provide prod Connected App credentials (existing Drupal API integration app) | — |
| 4 | Rename `RFI_*` Lead fields to clean names in production (optional, cosmetic) | — |

### Nick Leavitt
| # | Task |
|---|---|
| 1 | SFMC Installed Package: `Client ID`, `Client Secret`, `Auth Base URI`, `Subdomain` |
| 2 | 11 journey event definition keys from Journey Builder (one per product interest) |

Code is written and ready in `src/sfmc-client.js` — fires the moment `.env` is populated.

### Charlene Ceci
| # | Task |
|---|---|
| 1 | SSH to Acquia dev, run `drush cr` |

### Sam Chaudhary
| # | Task |
|---|---|
| 1 | Set `intent_path → Lead_Source_Form__c` Drupal mapping via browser (2 min) |

### Dakshesh
| # | Task |
|---|---|
| 1 | Build 3-step wizard UX in Drupal Webform module (Figma design) |
| 2 | Add B2B/B2C conditional field display rules |

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
| Huma Yousuf | SF Developer | Deactivate old flow + extend Create Leads Sub Flow + prod creds |
| Angel Cichy | SF Admin | UAT sign-off |
| Dakshesh | Drupal Team Lead | 3-step wizard UX + conditional fields |
| Charlene Ceci | DevOps | `drush cr` on Acquia dev + release window for prod deploy |
| Nick Leavitt | SFMC Admin | SFMC credentials + journey event keys |
| Monica Callahan | Business Owner | Final UAT approval |
| Sam Chaudhary | AI Architect | `intent_path` Drupal mapping (2 min browser task) |
