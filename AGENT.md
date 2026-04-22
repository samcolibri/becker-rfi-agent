# Becker RFI Agent — UAT Runbook
**Last verified:** 2026-04-22 | **Sandbox:** becker--bpedevf.sandbox.my.salesforce.com
**16/16 E2E scenarios pass** — run `node scripts/test_routing_scenarios.js` to re-verify any time

---

## How to Run E2E Tests

```bash
cd /Users/anmolsam/becker-rfi-agent
node scripts/test_routing_scenarios.js
```

All steps below are automated by this script. Manual verification steps also shown for UAT team.

---

## Test Scenarios

### STEP 1 — B2B Active Account Owner Override
**What it tests:** When a lead's company matches an existing Salesforce Account whose owner is an active sales rep, the lead routes to that specific rep — not a queue.

**Input:**
- Company: `Standish Management`
- Requesting for: `My organization`
- Org Type: `Accounting Firm`
- Size: `251+`

**Expected outcome:**
- ✅ Lead created with **B2B RecordTypeId** (`012i0000001E3hmAAC`)
- ✅ Lead.OwnerId = **JoAnn Veiga** (user ID, not a queue)
- ✅ Lead_Source_Form__c = `Contact Us - Buying for Org`
- ✅ CampaignMember created (B2B Lead Form campaign)

**Verify in SF:**
1. Open Lead record → Owner field shows "JoAnn Veiga"
2. Record Type shows "B2B Lead"

---

### STEP 2 — B2B Inactive Account Owner → Queue Fallback
**What it tests:** When the account owner is inactive, routing falls back to the correct queue based on org type × size matrix.

**Input:**
- Company: `Felician University (BUPP)`
- Requesting for: `My organization`
- Org Type: `University`
- Size: `101-250`
- Account owner: `Jackie Oblinger` (inactive)

**Expected outcome:**
- ✅ Lead created with **B2B RecordTypeId**
- ✅ Lead.OwnerId = **University queue** (not Jackie Oblinger)
- ✅ Lead_Source_Form__c = `Contact Us - Buying for Org`

**Verify in SF:**
1. Lead record → Owner field shows "University" (queue)
2. Record Type shows "B2B Lead"

---

### STEP 3 — B2C Exploring → CS - Inside Sales Queue
**What it tests:** All B2C leads (Myself path) route to the CS - Inside Sales queue, not the plain Inside Sales queue.

**Input:**
- Requesting for: `Myself`
- Product: `CPA`
- RFI_Suggested_Queue__c: `CS - Inside Sales`

**Expected outcome:**
- ✅ Lead created with **B2C RecordTypeId** (`01231000000y0UoAAI`)
- ✅ Lead.OwnerId = **CS - Inside Sales** queue
- ✅ Lead_Source_Form__c = `Contact Us - Exploring`
- ✅ CampaignMember created (CPA campaign)

**Verify in SF:**
1. Lead record → Owner shows "CS - Inside Sales"
2. Record Type shows "B2C Lead"

---

### STEP 4 — B2B Campaign Membership
**What it tests:** B2B leads create a CampaignMember record linking to the B2B Lead Form campaign.

**Input:**
- Requesting for: `My organization`
- Campaign__c: `701U700000eyrnzIAA` (B2B Lead Form)

**Expected outcome:**
- ✅ CampaignMember record created
- ✅ CampaignMember.CampaignId = `701U700000eyrnzIAA`

**Verify in SF:**
1. Lead record → Campaign History related list → B2B Lead Form entry

---

### STEP 5 — B2B State (HQ_State__c) Maps to Lead
**What it tests:** HQ state entered on the form flows through EW to both `Lead.HQ_State__c` and `Lead.RFI_HQ_State__c`.

**Input:**
- Requesting for: `My organization`
- EW.HQ_State__c: `TX`

**Expected outcome:**
- ✅ Lead.HQ_State__c = `TX`
- ✅ Lead.RFI_HQ_State__c = `TX`

---

### STEP 6 — B2C Resident State Maps to Lead
**What it tests:** State of residence entered by B2C user flows to `Lead.Resident_State__c`.

**Input:**
- Requesting for: `Myself`
- EW.Resident_State__c: `CA`

**Expected outcome:**
- ✅ Lead.Resident_State__c = `CA`

---

### STEP 7 — Is Current Becker Student
**What it tests:** The "current Becker student" boolean flows from EW to Lead.

**Input:**
- EW.Is_Current_Becker_Student__c: `true`

**Expected outcome:**
- ✅ Lead.Is_Current_Becker_Student__c = `true`

---

### STEP 8 — UTM Parameters (Lead_Source_Detail__c)
**What it tests:** UTM params captured from the URL are stored on the Lead for attribution reporting.

**Input:**
- EW.Lead_Source_Detail__c: `utm_source=google | utm_medium=cpc | utm_campaign=b2b_test`

**Expected outcome:**
- ✅ Lead.Lead_Source_Detail__c populated (not null)

---

### STEP 9 — B2B RecordTypeId = B2B (not B2C)
**What it tests:** Leads submitted with `Requesting_for__c = 'My organization'` get the B2B Lead record type. Previously broken — v21 flow was always assigning B2C record type.

**Input:**
- Requesting for: `My organization`

**Expected outcome:**
- ✅ Lead.RecordTypeId = `012i0000001E3hmAAC` (B2B Lead)

---

### STEP 10 — Support Form → Contact_Us_Form__c
**What it tests:** Support path submissions create a `Contact_Us_Form__c` record in addition to `ExternalWebform__c`.

**Input (support path):**
- First Name, Last Name, Email, Phone
- Country: `United States`, City: `Chicago`, State: `IL`
- Product Interest: `CPA`
- Message: free text

**Expected outcome:**
- ✅ Contact_Us_Form__c record created
- ✅ All 8 fields populated: First_Name__c, Last_Name__c, Email__c, Phone__c, Country__c, City__c, State__c, I_would_like_to_hear_more_about__c
- ✅ Query_Type__c = `Support`
- ✅ Lead_Source_Form__c = `Customer Service - Contact Us`

**Verify in SF:**
1. Open Contact_Us_Form__c tab → find record by email
2. Confirm all fields populated, Query Type = Support

---

## Routing Matrix (B2B)

| Org Type | <25 | 26-100 | 101-250 | 251+ |
|---|---|---|---|---|
| Accounting Firm | Inside Sales | **Global Firms** | **Global Firms** | **Global Firms** |
| Corporation/Healthcare/Bank | Inside Sales | **NCA** | **NCA** | **NCA** |
| Consulting Firm | **Global Firms** | **Global Firms** | **Global Firms** | **Global Firms** |
| CPA Alliance | **Global Firms** | **Global Firms** | **Global Firms** | **Global Firms** |
| Government / NFP | Inside Sales | **NCA** | **NCA** | **NCA** |
| Society/Chapter | **University** | **University** | **University** | **University** |
| Non-US Organization | **International** | **International** | **International** | **International** |
| Student | Inside Sales | Inside Sales | Inside Sales | Inside Sales |
| University | **University** | **University** | **University** | **University** |
| Other | Inside Sales | Inside Sales | Inside Sales | Inside Sales |

**Override rule:** If company matches an existing SF Account with an active owner (`Sales_Channel__c` set), lead goes to that owner regardless of matrix.

---

## Salesforce Flows — Current State

| Flow | Version | Last Changed | Status |
|---|---|---|---|
| `Becker_RFI_Lead_Routing` | v15 | 2026-04-22 | ✅ Active |
| `External_Web_Form_Main_Record_Triggered_Flow_After_Save` | v22 | 2026-04-22 | ✅ Active |
| `Create_Leads_Sub_Flow` | patched | 2026-04-21 | ✅ Active |

**Flow execution order on ExternalWebform__c insert:**
1. `Becker_RFI_Lead_Routing` (v15) — newest, runs first → checks existing lead, creates/updates Lead, assigns queue
2. `External_Web_Form_Main_Record_Triggered_Flow_After_Save` (v22) — runs second → B2B detection, RecordType, CampaignMember

---

## EW → Lead Field Mapping (complete, verified 2026-04-22)

| Form Field | ExternalWebform__c | Lead | Verified |
|---|---|---|---|
| First Name | First_Name__c | FirstName | ✅ |
| Last Name | Last_Name__c | LastName | ✅ |
| Email | Email__c | Email | ✅ |
| Phone | Phone__c | Phone | ✅ |
| Company | Company__c | Company | ✅ |
| Product Interest | Primary_Interest__c | Product_Line__c | ✅ |
| Requesting For | Requesting_for__c | (branching only) | ✅ |
| Org Type | Organization_Type__c | RFI_Organization_Type__c | ✅ |
| Org Size | Organization_Size__c | RFI_Org_Size_Category__c | ✅ |
| Role Type | Role_Type__c | RFI_Role_Type__c | ✅ |
| HQ State (B2B) | HQ_State__c | HQ_State__c + RFI_HQ_State__c | ✅ |
| Resident State (B2C) | Resident_State__c | Resident_State__c | ✅ |
| Current Becker Student | Is_Current_Becker_Student__c | Is_Current_Becker_Student__c | ✅ |
| Graduation Year | What_year_do_you_plan_to_graduate__c | What_year_do_you_plan_to_graduate__c | ✅ |
| Becker Account Email | email_address_you_use_to_login_to_Becker__c | RFI_Becker_Student_Email__c | ✅ |
| Lead Source Form | Lead_Source_Form__c | Lead_Source_Form__c | ✅ |
| Lead Source Date | Lead_Source_Form_Date__c | Lead_Source_Form_Date__c | ✅ |
| UTM Params | Lead_Source_Detail__c | Lead_Source_Detail__c | ✅ |
| Queue Assignment | RFI_Suggested_Queue__c | OwnerId (via queue lookup) | ✅ |
| Campaign | Campaign__c | CampaignMember (created) | ✅ |
| Consent | Consent_Provided__c | Consent_Provided__c | ✅ |
| Privacy Consent | Privacy_Consent_Status__c | Privacy_Consent_Status__c | ✅ |
| Brand | BusinessBrand__c | Business_Brand__c | ✅ |
| Message | If_other__c | Description | ✅ |

---

## Contact_Us_Form__c Field Mapping (Support Path)

| Form Field | Contact_Us_Form__c Field | Verified |
|---|---|---|
| First Name | First_Name__c | ✅ |
| Last Name | Last_Name__c | ✅ |
| Email | Email__c | ✅ |
| Phone Number | Phone__c | ✅ |
| Country | Country__c | ✅ |
| City | City__c | ✅ |
| State | State__c | ✅ |
| Product Interest | I_would_like_to_hear_more_about__c | ✅ |
| Message | Please_tell_us_about_your_question__c | ✅ |
| (auto) | Query_Type__c = Support | ✅ |
| (auto) | Lead_Source_Form__c = Customer Service - Contact Us | ✅ |

---

## Blockers Before Go-Live

| # | Owner | Item |
|---|---|---|
| 1 | **Sam** | SF Connected App credentials for prod (SF_CLIENT_ID, SF_CLIENT_SECRET, SF_USERNAME, SF_PASSWORD, SF_SECURITY_TOKEN) |
| 2 | **Sam** | SFMC credentials + 11 journey event keys → SETUP.md §6+7 |
| 3 | **Angel Cichy** | Confirm 7 SF queue API names match prod → SETUP.md §2 |
| 4 | **Huma Yousuf** | Confirm existing lead assignment rules are inactive in prod → SETUP.md §3 |

---

## Sandbox Details

- **URL:** https://becker--bpedevf.sandbox.my.salesforce.com
- **API version:** 59.0
- **B2B RecordTypeId:** `012i0000001E3hmAAC`
- **B2C RecordTypeId:** `01231000000y0UoAAI`
- **CS - Inside Sales queue ID:** `00G3r000005Z3dLEAS`
- **Inside Sales queue ID:** `00GU7000007dJunMAE`
