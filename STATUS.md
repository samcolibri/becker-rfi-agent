# Becker RFI Agent — Build Status
## Last updated: 2026-04-29 (Session 9 — v29 deploy, B2B multi-select live)
## Sandbox: becker--bpedevf.sandbox.my.salesforce.com

---

## Overall Status: ✅ SF FLOW v29 ACTIVE — Drupal form changes pending (Brian / BIT-10446)

Architecture: **Drupal Webform → Salesforce Suite → ExternalWebform__c → SF Flows (v29)**
No Node.js in live path.

---

## Active Salesforce Flows

| Flow | Version | Last Deployed | Status |
|---|---|---|---|
| `Becker_RFI_Lead_Routing` | **v29** | 2026-04-28 | ✅ Active |
| `External_Web_Form_Main_Record_Triggered_Flow_After_Save` | v21 | 2026-04-21 | ✅ Active (runs first) |
| `Create_Leads_Sub_Flow` | v32 | 2026-04-21 | ✅ Active |

---

## Flow Version History

### v29 (2026-04-28) — B2B multi-select product interest
- Create_B2B_Lead: Product_Line_MS__c now maps to $Record.Product_Interest__c (EW multipicklist). Was varProductLineMS.
- Update_Existing_Lead: Added Product_Line_MS__c = $Record.Product_Interest__c (was missing).
- Create_B2C_Lead: unchanged.
- EW.Product_Interest__c converted to multipicklist by Huma. Values: CIA, CMA, CPA, CPE, CFP, Becker Academy, EA Exam Review, EA CE.

### v28 (2026-04-27) — Country mapping + CIA normalization for support path
- varCUFCountry formula: 260-entry ISO code to full country name (3 CASE sub-formulas, 3900 char limit)
- varCUFProductInterest: normalizes CIA_CHALLENGE to "CIA", EA to "EA Exam Review"
- Create_Contact_Us_Form Country__c mapped from EW.Address__CountryCode__s via varCUFCountry
- Create_Contact_Us_Form I_would_like_to_hear_more_about__c uses varCUFProductInterest

### v25 (2026-04-26) — Support path (Contact_Us_Form__c)
- Is_Support_Form decision: Lead_Source_Form__c = 'Customer Service - Contact Us' → create Contact_Us_Form__c
- Create_Contact_Us_Form recordCreate with 14 field mappings
- OwnerId disabled (queue not yet associated with CUF — Angel task pending)

### v29 XML: flows/Becker_RFI_Lead_Routing_v29.xml

---

## Test Results

| Suite | Result | Command |
|---|---|---|
| Huma QA (113 checks) | ✅ 113/113 | `node scripts/huma-test-scenarios.js` |
| E2E Drupal to SF (30 assertions) | ✅ 30/30 | `node scripts/e2e-drupal-form.js` |
| Routing engine unit tests | ✅ 27/27 | `npm test` |

---

## Pending Drupal Form Changes (Brian — BIT-10446)
Decisions from 2026-04-28 alignment call. SF flow (v29) already handles the SF side.

1. B2B account lookup typeahead (reuse "Find Your Organization" controller, no org type filter, free-text fallback)
2. B2B multi-select product interest: EW.Primary_Interest__c (first) + EW.Product_Interest__c (all)
3. Phone number on B2C paths
4. "How can we help?" text field on both B2C and B2B (EW.If_other__c)
5. Remove consent step — merge to bottom of Step 2 with Submit button
6. SMS consent checkbox
7. Label renames: "What best describes you", "State", "Headquarters State", "Number of employees or members"
8. Graduation Year — conditional on role = Undergrad/Grad Student
9. HQ State — conditional on org type != Non-US Organization

---

## Blocking for Go-Live

| Priority | Owner | Action |
|---|---|---|
| P0 | Angel Cichy | Add CIA/CFP/EA CE/EA Exam Review/Becker Academy to Web_Request Case RecordType picklist |
| P0 | Angel Cichy | Add Contact_Us_Form__c to CS-Contact Center Inbound queue supported objects |
| P0 | Brian | Complete BIT-10446 |
| P1 | Josh | Legal consent copy for form |
| P1 | Sam | SF prod Connected App creds |
| P1 | Sam | SFMC creds + 11 journey event keys |
| P2 | Angel | Confirm 7 SF queue API names match prod |
| P2 | Huma | Confirm Lead assignment rules inactive in prod (BIT-10390) |
| P2 | All | Update Campaign IDs and RecordType IDs to prod values |

---

## Jira Epic: BIT-10392
https://beckeredu.atlassian.net/browse/BIT-10392

- BIT-10446 — Brian: Drupal form changes (Development)
- BIT-10389 — Huma: CommSubscriptionConsent SMS channel (Open)
- BIT-10390 — Huma: Confirm Lead duplicate rules inactive in prod (Open)
- BIT-10379 to 10388 — All Done
- BIT-10381, 10384 — Cancelled
