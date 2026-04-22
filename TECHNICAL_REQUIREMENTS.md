# Becker RFI Agent — Technical Requirements & Change Log
## For: Confluence / Huma Yousuf
## Sandbox: becker--bpedevf.sandbox.my.salesforce.com | API Version: v59.0
## Last updated: 2026-04-22 | Author: Sam Chaudhary (AI Architect)

---

## 1. FLOW INVENTORY — All Active Flows Related to RFI

| Flow Name | Object | Trigger | Current Version | Owner |
|---|---|---|---|---|
| `Becker_RFI_Lead_Routing` | ExternalWebform__c | Record Created — After Save | **v16** | RFI Agent (Sam) |
| `External_Web_Form_Main_Record_Triggered_Flow_After_Save` | ExternalWebform__c | Record Created — After Save | **v22** (patched) | Becker Existing |
| `Create_Leads_Sub_Flow` | Called by v22 | Subflow | **v32** (patched) | Becker Existing |
| `CDM - Lead Trigger Flow` | Lead | Record Updated — After Save | Active (unmodified) | Becker CDM |

**Execution order on ExternalWebform__c insert** (Salesforce runs After Save flows oldest-first):
1. `External_Web_Form_Main_Record_Triggered_Flow_After_Save` (v22) → calls `Create_Leads_Sub_Flow` (v32) → **creates the Lead**
2. `Becker_RFI_Lead_Routing` (v16) → finds the Lead just created → **updates all RFI fields + assigns queue**
3. `CDM - Lead Trigger Flow` → fires on Lead update → **sets Subscription_id__c from CDM consent records**

---

## 2. LEAD ASSIGNMENT

### Flow Responsible
`Becker_RFI_Lead_Routing` (v16) — nodes: `Lookup_Queue`, `Did_Queue_Exist`, `Assign_Lead_To_Queue`, `Lookup_Inside_Sales_Fallback`, `Check_B2B_Account_Owner`, `Lookup_Account_Owner_User`, `Account_Owner_Is_Rep`, `Assign_Lead_To_Account_Owner`

### How It Works

**Step 1 — Queue assignment (all leads)**

Node.js routing engine calculates `RFI_Suggested_Queue__c` before creating the EW record, based on this matrix:

| Organization Type | < 25 employees | 26–100 | 101–250 | 251+ |
|---|---|---|---|---|
| Accounting Firm | Inside Sales | Global Firms | Global Firms | Global Firms |
| Corporation / Healthcare / Bank / Financial Institution | Inside Sales | New Client Acquisition | New Client Acquisition | New Client Acquisition |
| Consulting Firm | Global Firms | Global Firms | Global Firms | Global Firms |
| CPA Alliance | Global Firms | Global Firms | Global Firms | Global Firms |
| Government Agency / Not for Profit Organization | Inside Sales | New Client Acquisition | New Client Acquisition | New Client Acquisition |
| Society/Chapter | University | University | University | University |
| Non-US Organization | International | International | International | International |
| Student | Inside Sales | Inside Sales | Inside Sales | Inside Sales |
| University | University | University | University | University |
| Other | Inside Sales | Inside Sales | Inside Sales | Inside Sales |
| **B2C (Myself path)** | **CS - Inside Sales** | **CS - Inside Sales** | **CS - Inside Sales** | **CS - Inside Sales** |
| **Support path** | **Customer Success & Expansion** | | | |

The flow does a SOQL lookup on `Group` WHERE `Type = 'Queue'` AND `Name = EW.RFI_Suggested_Queue__c`.
- If queue found → `Assign_Lead_To_Queue` sets `Lead.OwnerId = varQueue.Id`
- If queue NOT found → fallback lookup for `Inside Sales` → assigns to Inside Sales

**Step 2 — Account owner override (B2B leads only)**

After queue assignment, node `Check_B2B_Account_Owner` fires for B2B leads where the EW company matched an existing SF Account:
- Lookup `User` WHERE `Id = varExistingAccount.OwnerId` AND `Sales_Channel__c IS NOT NULL` AND `IsActive = true`
- If a real rep is found (has `Sales_Channel__c` set, is active) → `Assign_Lead_To_Account_Owner` overwrites `Lead.OwnerId` with the rep's User ID
- If account owner is inactive OR is a system/ecommerce user (no `Sales_Channel__c`) → lead stays on the queue

**What is written to Lead.OwnerId**

| Scenario | Lead.OwnerId set to |
|---|---|
| B2C (Exploring, Ready to Enroll) | CS - Inside Sales queue ID (`00G3r000005Z3dLEAS`) |
| B2B — no existing account | Queue ID from routing matrix |
| B2B — existing account, active rep with Sales_Channel__c | Rep's User ID |
| B2B — existing account, inactive owner | Queue ID from routing matrix |
| Support | Customer Success & Expansion queue ID (`00GU7000007dK2rMAE`) |
| Queue lookup fails | Inside Sales fallback (`00GU7000007dJunMAE`) |

### Queue IDs (Sandbox — Verified)

| Queue Name | Salesforce ID |
|---|---|
| CS - Inside Sales | `00G3r000005Z3dLEAS` |
| Inside Sales | `00GU7000007dJunMAE` |
| Global Firms | `00GU7000007dJwPMAU` |
| New Client Acquisition | `00GU7000007dJy1MAE` |
| University | `00GU7000007dJzdMAE` |
| International | `00GU7000007dK1FMAU` |
| Customer Success & Expansion | `00GU7000007dK2rMAE` |

> ⚠️ **Production action required (Angel Cichy):** Confirm the 7 queue names above exactly match production SF queue names. If any differ, update in `src/routing-engine.js` constants before go-live.

---

## 3. CAMPAIGN MAPPING

### Flow Responsible
`Becker_RFI_Lead_Routing` (v16) — nodes: `Should_Create_Campaign_Member`, `Create_Campaign_Member`

### How It Works

Node.js sets `EW.Campaign__c` to a hard-coded campaign ID before creating the EW record. The flow then checks: if `EW.Campaign__c` is not blank → create a `CampaignMember` record linking `Lead.Id` to `Campaign__c`.

**Campaign IDs (Sandbox — Verified)**

| Path | Product Interest | Campaign ID (Sandbox) | Campaign Name |
|---|---|---|---|
| B2C | Certified Public Accountant | `701U700000eyrntIAA` | Becker.com email signup - CPA |
| B2C | Continuing Professional Education | `701U700000eyrnuIAA` | Becker.com email signup - CPE |
| B2C | Certified Management Accountant | `701U700000eyrnvIAA` | Becker.com email signup - CMA |
| B2C | Enrolled Agent | `701U700000eyrnwIAA` | Becker.com email signup - EA Exam Review |
| B2C | Certified Internal Auditor | `701U700000eyrnxIAA` | Becker.com email signup - CIA |
| B2C | Certified Financial Planner | `701U700000eyrnyIAA` | Becker.com email signup - CFP |
| B2B | All products | `701U700000eyrnzIAA` | B2B Lead Form |
| B2C | Staff Level Training | `701U700000eyro0IAA` | Becker.com email signup - Staff Level Training |
| B2C | CIA Challenge Exam | `701U700000eyro1IAA` | Becker.com email signup - CIA Challenge |
| Support | — | null | No campaign for support path |

**Flow change made:** Added `Create_Campaign_Member` node to `Becker_RFI_Lead_Routing`. The node reads `$Record.Campaign__c` from the EW object. If populated, creates a `CampaignMember` with:
- `CampaignId` = `EW.Campaign__c`
- `LeadId` = `varCreatedLeadId` (the Lead created or found in this flow run)
- `Status` = default (`Sent`)

> **Confirmed:** CampaignMember records ARE created even when `Campaign.IsActive = false`. Activation of campaigns is recommended for SFMC MC Connect and campaign reporting but is not required for membership creation.

> ⚠️ **Production action required:** Campaign IDs above are sandbox-only. Production campaign IDs must be confirmed and updated in `src/lead-processor.js` before go-live. Run `node scripts/sync-campaign-ids.js` after updating.

---

## 4. EXTERNALWEBFORM__C → LEAD FIELD MAPPING

### Flows Responsible
- `Becker_RFI_Lead_Routing` (v16) — sets all RFI-specific fields via `Update_Existing_Lead`
- `External_Web_Form_Main_Record_Triggered_Flow_After_Save` (v22) + `Create_Leads_Sub_Flow` (v32) — create the base Lead record

### Complete Field Mapping (All Verified in Sandbox)

| Form Field | ExternalWebform__c Field | Lead Field | Type | Notes |
|---|---|---|---|---|
| First Name | `First_Name__c` | `FirstName` | Text | Standard Lead field |
| Last Name | `Last_Name__c` | `LastName` | Text | Standard Lead field |
| Email | `Email__c` | `Email` | Email | Primary dedup key |
| Phone | `Phone__c` | `Phone` | Phone | Standard Lead field |
| Company | `Company__c` | `Company` | Text | Standard Lead field |
| Product Interest | `Primary_Interest__c` | `Product_Line__c` | Text | EW uses short code (CPA, CMA, etc.); EA maps to "EA Exam Review" on Lead |
| Requesting For | `Requesting_for__c` | *(branching only)* | Picklist | Values: "Myself" / "My organization". Not written to Lead — used by flow for B2B/B2C branching and RecordType |
| Organization Type | `Organization_Type__c` | `RFI_Organization_Type__c` | Picklist | **Added to Update_Existing_Lead in v16** |
| Organization Size | `Organization_Size__c` | `RFI_Org_Size_Category__c` | Picklist | **Added to Update_Existing_Lead in v16** |
| Role Type | `Role_Type__c` | `RFI_Role_Type__c` | Picklist | **Added to Update_Existing_Lead in v16** |
| HQ State (B2B) | `HQ_State__c` | `HQ_State__c` | Text(2) | B2B path only |
| HQ State (B2B) | `HQ_State__c` | `RFI_HQ_State__c` | Text(2) | B2B path only. **Fixed in v14** — was incorrectly reading `Address__StateCode__s` |
| Resident State (B2C) | `Resident_State__c` | `Resident_State__c` | Text(2) | B2C path only |
| Current Becker Student | `Is_Current_Becker_Student__c` | `Is_Current_Becker_Student__c` | Checkbox | Added v14 |
| Graduation Year | `What_year_do_you_plan_to_graduate__c` | `What_year_do_you_plan_to_graduate__c` | Text(10) | Fixed in v13 |
| Becker Account Email | `email_address_you_use_to_login_to_Becker__c` | `RFI_Becker_Student_Email__c` | Email | B2C student path |
| Lead Source Form | `Lead_Source_Form__c` | `Lead_Source_Form__c` | Picklist | Values: "Contact Us - Buying for Org" / "Contact Us - Exploring" / "Contact Us - Enrolling" / "Customer Service - Contact Us". **Fixed in v21/v32** — was reading `Consent_Captured_Source__c` |
| Lead Source Date | `Lead_Source_Form_Date__c` | `Lead_Source_Form_Date__c` | DateTime | **Fixed in v21/v32** — was using Todays_Date formula (midnight) |
| UTM Parameters | `Lead_Source_Detail__c` | `Lead_Source_Detail__c` | Text(255) | Format: `utm_source=X \| utm_medium=Y \| utm_campaign=Z`. **Added in v15** |
| Communication Subscriptions | `CommunicationSubscription__c` | `Subscription_id__c` | Multipicklist | **Added in v16** — Node.js now sets this on EW so CDM - Lead Trigger Flow can populate Lead.Subscription_id__c. Previously blank on B2B leads. |
| Queue Assignment | `RFI_Suggested_Queue__c` | `OwnerId` (via queue lookup) | Text → ID | Set by Node.js routing engine before EW creation |
| Campaign | `Campaign__c` | CampaignMember (created) | ID | CampaignMember record created by flow |
| Consent | `Consent_Provided__c` | `Consent_Provided__c` | Multipicklist | Value: "Email;Phone;SMS" when user opts in |
| Privacy Consent | `Privacy_Consent_Status__c` | `Privacy_Consent_Status__c` | Picklist | Values: "OptIn" / "NotSeen" |
| Brand | `BusinessBrand__c` | `Business_Brand__c` | Text | Always "Becker" |
| Message / Notes | `If_other__c` | `Description` | Long Text | Free text — support message or additional notes |
| Record Type | *(derived from Requesting_for__c)* | `RecordTypeId` | ID | B2B: `012i0000001E3hmAAC` / B2C: `01231000000y0UoAAI`. **Fixed in v21** — was assigning B2C RecordType to B2B leads |

### Subscription ID Values (Multipicklist — set via CommunicationSubscription__c → CDM → Lead)

| Intent / Product | CommunicationSubscription__c (set on EW) | Subscription_id__c (appears on Lead) |
|---|---|---|
| B2B (any product) | `B2B - News and Events;B2B - Events;B2B - New Products` | `B2B - News and Events;B2B - New Products;B2B - Events` |
| B2C — CPA | `CPA Content;CPA Promotions` | `CPA Promotions;CPA Content` |
| B2C — CMA | `CMA Content;CMA Promotions` | `CMA Promotions;CMA Content` |
| B2C — CPE | `CPE Content;CPE Promotions` | `CPE Promotions;CPE Content` |
| B2C — CIA | `CIA Content;CIA Promotions` | `CIA Promotions;CIA Content` |
| B2C — EA | `EA Content;EA Promotions` | `EA Promotions;EA Content` |
| B2C — CFP | `CPA Content;CPA Promotions` | `CPA Promotions;CPA Content` |
| B2C — CIA Challenge | `CIA Content;CIA Promotions` | `CIA Promotions;CIA Content` |
| B2C — Staff Level Training | `CPE Content;CPE Promotions` | `CPE Promotions;CPE Content` |
| Support | null | null |

> **Note:** Order of multipicklist values on Lead may differ from what is set — Salesforce reorders per the picklist definition. Values are always correct; comparison must be order-insensitive.

---

## 5. CONTACT US CASE (Support Path)

### How It Works

When `intentPath = 'support'`, Node.js creates **two** records:

**Record 1: `Contact_Us_Form__c`** (created directly via REST API by Node.js, before EW)

| Contact_Us_Form__c Field | Source | Value |
|---|---|---|
| `First_Name__c` | Form | Submitted first name |
| `Last_Name__c` | Form | Submitted last name |
| `Email__c` | Form | Submitted email |
| `Phone__c` | Form | Submitted phone (optional) |
| `Country__c` | Form | Submitted country (picklist) |
| `City__c` | Form | Submitted city |
| `State__c` | Form | Submitted state (2-letter code) |
| `I_would_like_to_hear_more_about__c` | Form | Product interest |
| `Please_tell_us_about_your_question__c` | Form | Free text message |
| `Query_Type__c` | System | Hard-coded: `Support` |
| `Lead_Source_Form__c` | System | Hard-coded: `Customer Service - Contact Us` |
| `Lead_Source_Form_Date__c` | System | Timestamp of submission |
| `Business_Brand__c` | System | Hard-coded: `Becker` |
| `Consent_Provided__c` | Form | `Email;Phone;SMS` if consent given |
| `Consent_Captured_Source__c` | System | `Becker Contact Us Form` |
| `Privacy_Consent_Status__c` | Form | `OptIn` or `NotSeen` |

**Record 2: `ExternalWebform__c`** (created after Contact_Us_Form__c — triggers Becker's existing flows which create a Case and route to CS - Contact Center Inbound queue)

The EW record for support path also includes `Address__City__s`, `Address__StateCode__s`, `Address__CountryCode__s` so Becker's existing flows can populate the Case address fields correctly.

> **No modifications were made to Becker's existing Case creation flow.** The support Case is created by Becker's existing `External_Web_Form_Main_Record_Triggered_Flow_After_Save` (v22) using the EW record. Our only addition is the `Contact_Us_Form__c` record created directly by Node.js.

---

## 6. MODIFICATIONS MADE TO EXISTING BECKER FLOWS

### `External_Web_Form_Main_Record_Triggered_Flow_After_Save` (patched to v22)

| Change | Node/Element | What was wrong | What was fixed |
|---|---|---|---|
| Lead_Source_Form__c source | `Create_B2B_Lead`, `Create_B2C_Lead`, `Update_Existing_Lead` | Was reading `EW.Consent_Captured_Source__c` | Now reads `EW.Lead_Source_Form__c` |
| Lead_Source_Form_Date__c source | `Create_B2B_Lead`, `Create_B2C_Lead` | Was using `Todays_Date` formula (always midnight) | Now reads `EW.Lead_Source_Form_Date__c` (exact timestamp) |
| B2B detection (Check_If_B2B decision) | `Check_If_B2B` | Was only checking CDM label field — all RFI form B2B submissions got B2C RecordTypeId | Added condition: `Requesting_for__c = 'My organization'` with OR logic so either check passes |

### `Create_Leads_Sub_Flow` (patched to v32)

| Change | Node/Element | What was wrong | What was fixed |
|---|---|---|---|
| Lead_Source_Form__c source | Lead create element | Same bug as v21 — reading wrong source field | Now reads `EW.Lead_Source_Form__c` |

### `Becker_RFI_Lead_Routing` — New Flow (v13 → v16, all new)

This is a **net-new flow** created for this project. It does not replace or modify any existing flow. It runs in addition to existing flows.

**Version history:**

| Version | Date | Changes |
|---|---|---|
| v13 | 2026-04-21 | Initial: Lead_Source_Form__c, Lead_Source_Form_Date__c, Product_Line__c, graduation year |
| v14 | 2026-04-22 | HQ_State__c, Resident_State__c, Is_Current_Becker_Student__c, RFI_HQ_State__c source fix |
| v15 | 2026-04-22 | Lead_Source_Detail__c (UTM params) added to all 3 Lead write paths |
| **v16** | **2026-04-22** | **RFI_Organization_Type__c, RFI_Org_Size_Category__c, RFI_Role_Type__c, RFI_HQ_State__c added to Update_Existing_Lead. These were only in Create_B2B/B2C_Lead paths which never run because v21/v32 creates the Lead first — our flow always hits Update_Existing_Lead.** |

**Key v16 fix — why Update_Existing_Lead is always used:**
Salesforce runs multiple After Save flows on the same object in Last Modified Date order (oldest first). `External_Web_Form_Main_Record_Triggered_Flow_After_Save` (v22) was created before our flow, so it always runs first. v22 calls `Create_Leads_Sub_Flow` (v32) which creates the Lead. By the time our `Becker_RFI_Lead_Routing` (v16) runs, the Lead already exists → our flow goes to `Update_Existing_Lead`, never to `Create_B2B_Lead` or `Create_B2C_Lead`. All fields must therefore be in `Update_Existing_Lead`.

---

## 7. NEW CUSTOM FIELDS CREATED FOR THIS PROJECT

All on the **Lead** object (created by Angel Cichy in sandbox):

| Field API Name | Label | Type | Used For |
|---|---|---|---|
| `RFI_Organization_Type__c` | RFI Org Type | Picklist | Org type from form → Lead for segmentation/reporting |
| `RFI_Org_Size_Category__c` | RFI Org Size | Picklist | Employee count from form → Lead for segmentation |
| `RFI_Role_Type__c` | RFI Role Type | Picklist | Submitter's role → Lead |
| `RFI_HQ_State__c` | RFI HQ State | Text(2) | HQ state → Lead (B2B) |
| `HQ_State__c` | HQ State | Text(2) | HQ state (primary) → Lead (B2B) |
| `Resident_State__c` | Resident State | Text(2) | State of residence → Lead (B2C) |
| `Is_Current_Becker_Student__c` | Current Becker Student | Checkbox | Student flag → Lead |
| `What_year_do_you_plan_to_graduate__c` | Graduation Year | Text(10) | Graduation year → Lead |
| `RFI_Becker_Student_Email__c` | Becker Student Email | Email | Becker login email → Lead |
| `Lead_Source_Form__c` | Lead Source Form | Picklist | Which form/path submitted → Lead |
| `Lead_Source_Form_Date__c` | Lead Source Form Date | DateTime | Exact submission timestamp |
| `Lead_Source_Detail__c` | Lead Source Detail | Text(255) | UTM parameters string |

---

## 8. WHAT TO VERIFY BEFORE PRODUCTION GO-LIVE

| # | Item | Owner | What to do |
|---|---|---|---|
| 1 | Queue names match prod | **Angel Cichy** | Go to SF Setup → Queues → confirm the 7 queue API names exactly match the names in Section 2 above. If any differ, update `src/routing-engine.js` QUEUES constant. |
| 2 | Lead assignment rules | **Huma Yousuf** | SF Setup → Lead Assignment Rules → confirm no rules are currently set as Default. Active assignment rules run after Lead create and can override our OwnerId assignment. |
| 3 | Custom fields exist on prod Lead | **Angel Cichy** | All 12 fields in Section 7 must exist in production Lead object before go-live. |
| 4 | RecordType IDs | **Huma Yousuf** | B2B RecordTypeId `012i0000001E3hmAAC` and B2C `01231000000y0UoAAI` are **sandbox-specific**. Query prod: `SELECT Id, Name FROM RecordType WHERE SObjectType='Lead'` and update `varB2BRecordTypeId` formula in the flow before deploying to prod. |
| 5 | Campaign IDs | **Huma / Josh** | Section 3 campaign IDs are sandbox-only. Confirm or create matching campaigns in prod and update `src/lead-processor.js`. |
| 6 | CDM subscription values | **Angel Cichy** | Confirm `CommunicationSubscription__c` picklist on `ExternalWebform__c` in prod contains the same values listed in Section 4 (B2B - News and Events, B2B - Events, B2B - New Products, CPA Promotions, etc.). |
| 7 | v21/v22 flow patched in prod | **Huma Yousuf** | The v21/v22 patches (Lead_Source_Form__c source fix, B2B detection fix) need to be deployed to production as well, not just sandbox. |

---

*Prepared by Sam Chaudhary (AI Architect) | Verified in sandbox 2026-04-22 | Contact: sam.chaudhary@colibrigroup.com*
