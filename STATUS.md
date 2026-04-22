# Becker RFI Agent — Build Status
## Last updated: 2026-04-22 (v20 deploy — Drupal-native architecture)
## Sandbox: becker--bpedevf.sandbox.my.salesforce.com
## Author: Sam Chaudhary (AI Architect) + Claude Sonnet 4.6

---

## Overall Status: ✅ SF FLOW v20 DEPLOYED — Drupal webform config ready for Brian

Architecture: **Native Drupal Webform → Salesforce Suite → ExternalWebform__c → SF Flows**
No Node.js middleware. No Railway. Pure Drupal → Salesforce.

### What Brian needs to do next
1. Import `drupal/config/webform.webform.becker_rfi.yml` via Admin → Structure → Webforms → Import
2. Configure SF Mapping (Admin → Salesforce → Mappings → Add) using `drupal/config/salesforce_field_map.yml`
3. Place form on `/contact-us` via `atge_form` paragraph component
4. Test B2B + B2C submissions end-to-end
See `drupal/BRIAN_DEPLOY.md` for full step-by-step.

---

## Active Salesforce Flows

| Flow | Version | Last Deployed | Status |
|---|---|---|---|
| `Becker_RFI_Lead_Routing` | **v20** | 2026-04-22 | ✅ Active |
| `External_Web_Form_Main_Record_Triggered_Flow_After_Save` | **v22** | 2026-04-22 | ✅ Active |
| `Create_Leads_Sub_Flow` | patched | 2026-04-21 | ✅ Active |

**v18 changes (2026-04-22):** Removed duplicate `Lead.HQ_State__c` mapping — HQ state from form now only writes to `Lead.RFI_HQ_State__c` (was writing to both `HQ_State__c` and `RFI_HQ_State__c`). Affects Update_Existing_Lead and Create_B2B_Lead paths. Also added Requesting_for__c documentation (branching only, not written to Lead) and RecordTypeId mapping entry to field map.

**v17 changes (2026-04-22):** Retired "Inside Sales" queue — all references changed to "CS - Inside Sales". Affects: Lookup_Inside_Sales_Fallback node (flow), QUEUES.INSIDE_SALES constant (routing-engine.js), routing matrix JSON, low-confidence fallback in lead-processor.js. SF admin action required: reassign existing Inside Sales leads to CS - Inside Sales, then delete the Inside Sales queue.

**v16 changes (2026-04-22):** Added RFI_Organization_Type__c, RFI_Org_Size_Category__c, RFI_Role_Type__c, RFI_HQ_State__c to Update_Existing_Lead path. These fields were only in Create_B2B/B2C_Lead paths but those never run (v21/v32 creates the Lead first, so our flow always hits Update_Existing_Lead). Also fixed Subscription_id__c (blank on B2B leads): root cause was EW.CommunicationSubscription__c not being set — v21 reads that field to create CDM records, which CDM - Lead Trigger Flow then uses to set Lead.Subscription_id__c. Now Node.js sets CommunicationSubscription__c on EW for all paths. Also fixed support path city/state/country fields (form sends them but server.js wasn't reading them).

**v15 changes (2026-04-22):** Lead_Source_Detail__c (UTM params) mapped to Lead in all 3 write paths

**v14 changes (2026-04-22):** HQ_State__c, Resident_State__c, Is_Current_Becker_Student__c mapped; RFI_HQ_State__c source fixed (was Address__StateCode__s)

**v13 changes (2026-04-21):** Lead_Source_Form__c, Lead_Source_Form_Date__c, Product_Line__c mapped; graduation year field corrected

**v21 changes (2026-04-22):** B2B detection now checks `Requesting_for__c = 'My organization'` — previously only used CDM label check, causing all our B2B leads to get B2C RecordTypeId

**v21+v32 changes (2026-04-21):** Lead_Source_Form__c source fixed (was EW.Consent_Captured_Source__c), Lead_Source_Form_Date__c source fixed (was Todays_Date/midnight)

---

## E2E Test Results — All Pass (2026-04-22 v16)

| Step | Scenario | Result |
|---|---|---|
| STEP 1 | B2B Active Account Owner → rep override (Standish Mgmt → JoAnn Veiga) | ✅ |
| STEP 2 | B2B Inactive Account Owner → queue fallback (Felician Univ → University queue) | ✅ |
| STEP 3 | B2C Exploring → CS - Inside Sales queue | ✅ |
| STEP 4 | B2B Campaign membership created | ✅ |
| STEP 5 | B2C Campaign membership created | ✅ |
| STEP 6 | B2B HQ_State__c → Lead.HQ_State__c + Lead.RFI_HQ_State__c | ✅ |
| STEP 7 | B2C Resident_State__c → Lead.Resident_State__c | ✅ |
| STEP 8 | Is_Current_Becker_Student__c → Lead | ✅ |
| STEP 9 | B2B RecordTypeId = B2B (not B2C) | ✅ |
| STEP 10 | B2C RecordTypeId = B2C | ✅ |
| STEP 11 | Lead_Source_Form__c populated correctly | ✅ |
| STEP 12 | Lead_Source_Detail__c (UTM) populated on Lead | ✅ |
| STEP 13 | Graduation year → What_year_do_you_plan_to_graduate__c | ✅ |
| STEP 14 | RFI_Role_Type__c → Lead | ✅ |
| STEP 15 | Support form → Contact_Us_Form__c (8 fields + Query_Type=Support) | ✅ |
| STEP 16 | Business_Brand__c = Becker on Lead | ✅ |
| STEP 17 | B2B RFI_Organization_Type__c → Lead (was missing from Update_Existing_Lead) | ✅ v16 |
| STEP 18 | B2B RFI_Org_Size_Category__c → Lead (was missing from Update_Existing_Lead) | ✅ v16 |
| STEP 19 | B2B Subscription_id__c = B2B - News and Events;B2B - Events;B2B - New Products | ✅ v16 |
| STEP 20 | B2C Subscription_id__c = CPA Promotions;CPA Content (for CPA path) | ✅ v16 |
| STEP 21 | B2C routing → CS - Inside Sales queue (not plain Inside Sales) | ✅ v16 |

---

## Salesforce Queues — All 6 Verified

| Queue Name | ID |
|---|---|
| Customer Success & Expansion | `00GU7000007dK2rMAE` |
| CS - Inside Sales | `00G3r000005Z3dLEAS` |
| Global Firms | `00GU7000007dJwPMAU` |
| Inside Sales | `00GU7000007dJunMAE` |
| International | `00GU7000007dK1FMAU` |
| New Client Acquisition | `00GU7000007dJy1MAE` |
| University | `00GU7000007dJzdMAE` |

---

## Salesforce Record Types — Lead

| Name | ID |
|---|---|
| B2B Lead | `012i0000001E3hmAAC` |
| B2C Lead | `01231000000y0UoAAI` |
| Person Lead | `012i0000001E3hnAAC` |

---

## Campaign IDs (Dev Sandbox)

| Product | Campaign ID | Campaign Name |
|---|---|---|
| CPA | `701U700000eyrntIAA` | Becker.com email signup - CPA |
| CPE | `701U700000eyrnuIAA` | Becker.com email signup - CPE |
| CMA | `701U700000eyrnvIAA` | Becker.com email signup - CMA |
| EA | `701U700000eyrnwIAA` | Becker.com email signup - EA Exam Review |
| CIA | `701U700000eyrnxIAA` | Becker.com email signup - CIA |
| CFP | `701U700000eyrnyIAA` | Becker.com email signup - CFP |
| B2B | `701U700000eyrnzIAA` | B2B Lead Form |
| Staff Level Training | `701U700000eyro0IAA` | Becker.com email signup - Staff Level Training |
| CIA Challenge | `701U700000eyro1IAA` | Becker.com email signup - CIA Challenge |

---

## Blockers Before Go-Live

| # | Owner | Item | Status |
|---|---|---|---|
| 1 | Sam | SF Connected App credentials for prod | ⏳ Pending |
| 2 | Sam | SFMC credentials + 11 journey event keys | ⏳ Pending |
| 3 | Angel Cichy | Confirm 7 SF queue API names match prod | ⏳ Pending |
| 4 | Huma Yousuf | Confirm existing lead assignment rules inactive in prod | ⏳ Pending |

---

## File Inventory

| File | Purpose | Status |
|---|---|---|
| `src/server.js` | Express API — POST /api/submit, GET /api/accounts | ✅ |
| `src/lead-processor.js` | Builds EW record, calls routing engine, writes Contact_Us_Form__c | ✅ |
| `src/routing-engine.js` | B2B routing matrix — 27 unit tests | ✅ |
| `src/sf-client.js` | SF REST client — EW, Lead, Case, Contact_Us_Form__c | ✅ |
| `src/sfmc-client.js` | SFMC journey trigger | ⚠ Code ready, no credentials |
| `src/email-validator.js` | Spam/bot filter + Hunter.io | ✅ |
| `client/src/app/App.tsx` | React 3-step wizard | ✅ |
| `scripts/test_routing_scenarios.js` | Automated E2E test suite | ✅ |
| `AGENT.md` | UAT runbook — step-by-step test scenarios | ✅ |
| `SETUP.md` | Credential setup + go-live checklist | ✅ |
| `CLAUDE.md` | Full project context for AI resume | ✅ |
