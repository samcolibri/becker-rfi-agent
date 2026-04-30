# Becker RFI Agent — Session Resume
## Last Updated: 2026-04-29 (Session 9) | Flow: v29 Active
## Read this file first before touching ANY code or SF.

---

## What This Project Is

Smart lead routing form for **Becker Professional Education (Colibri Group)**.  
Replaces a broken contact form that routed all leads to one person (Andy M.) with zero intelligence.

**Architecture:** Pure Drupal-native — NO Node.js in the live path.
```
Drupal Webform (Brian)
  → Salesforce Suite module (push on submit)
    → ExternalWebform__c (SF object)
      → External_Web_Form_Main_Record_Triggered_Flow_After_Save v21  ← runs FIRST, creates Lead
      → Create_Leads_Sub_Flow v32                                     ← called by above
      → Becker_RFI_Lead_Routing v29  ← OUR FLOW — updates Lead, assigns queue, support path
```

---

## Active Flow: Becker_RFI_Lead_Routing v29
**File:** `flows/Becker_RFI_Lead_Routing_v29.xml`  
**Sandbox:** https://becker--bpedevf.sandbox.my.salesforce.com  
**Trigger:** ExternalWebform__c — Create, After Save  
**Deploy:** `node scripts/rest-deploy.js /tmp/becker_rfi_vNN.zip`

### Flow Logic (v29)
1. **Is_Support_Form** — if `Lead_Source_Form__c = 'Customer Service - Contact Us'`
   - YES → `Create_Contact_Us_Form` (Contact_Us_Form__c with 14 fields + country mapping) → STOP
   - NO → continue
2. **Check_Existing_Lead** → find unconverted Lead by email
3. **Did_Lead_Exist** → update OR create B2B/B2C Lead
4. **Lookup_Queue** → assign Lead.OwnerId to SF queue
5. **Should_Create_Campaign_Member** → create CampaignMember if Campaign__c set
6. **Check_B2B_Account_Owner** → if B2B + real account owner exists → override queue with rep

### Key Formula Variables
| Variable | What It Does |
|---|---|
| `varProductLineMS` | Normalizes EA→"EA Exam Review", CIA_CHALLENGE→"CIA"; from `EW.Primary_Interest__c` |
| `varComputedQueue` | B2B routing matrix: org type × org size → queue name |
| `varSubscriptionIds` | Maps product → CommSubscriptionConsent subscription IDs |
| `varB2BRecordTypeId` | Returns B2B or B2C RecordTypeId based on `Requesting_for__c` |
| `varCUFProductInterest` | Normalizes CIA_CHALLENGE/EA for Contact_Us_Form__c |
| `varCUFCountry` | 260-entry ISO code → full country name (split across 3 CASE sub-formulas) |

---

## EW → Lead Field Mapping (all confirmed in sandbox v29)

| EW Field | Lead Field | Notes |
|---|---|---|
| `Primary_Interest__c` | `Product_Line__c` | Via varProductLineMS (normalizes EA/CIA). B2C + B2B first value |
| `Product_Interest__c` | `Product_Line_MS__c` | **B2B multi-select** — all selected products. NEW v29. B2C: unchanged |
| `Organization_Type__c` | `RFI_Organization_Type__c` | B2B only |
| `Organization_Size__c` | `RFI_Org_Size_Category__c` | B2B only |
| `HQ_State__c` | `RFI_HQ_State__c` | B2B only |
| `Role_Type__c` | `RFI_Role_Type__c` | Both |
| `Resident_State__c` | `RFI_Resident_State__c` | B2C only |
| `Is_Current_Becker_Student__c` | `Is_Current_Becker_Student__c` | B2C only |
| `Lead_Source_Form__c` | `Lead_Source_Form__c` | Both |
| `Lead_Source_Detail__c` | `Lead_Source_Detail__c` | UTM params |
| `BusinessBrand__c` | `Business_Brand__c` | Always "Becker" |
| `CommunicationSubscription__c` | `Subscription_id__c` | Via varSubscriptionIds |
| `Consent_Provided__c` | `Consent_Provided__c` | multipicklist |
| `Privacy_Consent_Status__c` | `Privacy_Consent_Status__c` | |
| `Requesting_for__c` | (drives B2B/B2C branch) | NOT mapped to Lead field |

### EW → Contact_Us_Form__c (Support path)
| EW Field | CUF Field |
|---|---|
| `First_Name__c` | `First_Name__c` |
| `Last_Name__c` | `Last_Name__c` |
| `Email__c` | `Email__c` |
| `Phone__c` | `Phone__c` |
| `Address__City__s` | `City__c` |
| `Address__StateCode__s` | `State__c` |
| `Address__CountryCode__s` | `Country__c` (via varCUFCountry ISO→full name) |
| `Primary_Interest__c` | `I_would_like_to_hear_more_about__c` (via varCUFProductInterest) |
| `If_other__c` | `Please_tell_us_about_your_question__c` |
| `Lead_Source_Form__c` | `Lead_Source_Form__c` |
| `Lead_Source_Form_Date__c` | `Lead_Source_Form_Date__c` |
| Hardcoded `'Becker Contact US'` | `Form_Applied__c` |
| Hardcoded `'Support'` | `Query_Type__c` |

---

## Sandbox Credentials (in .env)
```
SF_USERNAME=sam.chaudhary@colibrigroup.com.bpedevf
SF_LOGIN_URL=https://test.salesforce.com
SF_INSTANCE_URL=https://becker--bpedevf.sandbox.my.salesforce.com
```

### Key Sandbox IDs
| Item | ID |
|---|---|
| B2B Lead RecordTypeId | `012i0000001E3hmAAC` |
| B2C Lead RecordTypeId | `01231000000y0UoAAI` |
| CS - Inside Sales queue | `00G3r000005Z3dLEAS` |
| CS - Contact Center Inbound queue | `00Gi0000002CIZqEAO` |

---

## Test Results (session 8 — 2026-04-27)
- **113/113 Huma QA checks passing** ✅ → `node scripts/huma-test-scenarios.js`
- **30/30 E2E Drupal→SF assertions passing** ✅ → `node scripts/e2e-drupal-form.js`

---

## B2B Routing Matrix
| Org Type | <25 | 26-100 | 101-250 | 251+ |
|---|---|---|---|---|
| Accounting Firm | Inside Sales | Global Firms | Global Firms | Global Firms |
| Corporation/Healthcare/Bank | Inside Sales | New Client Acq. | New Client Acq. | New Client Acq. |
| Consulting Firm | Global Firms | Global Firms | Global Firms | Global Firms |
| CPA Alliance | Global Firms | Global Firms | Global Firms | Global Firms |
| Gov/NFP | Inside Sales | New Client Acq. | New Client Acq. | New Client Acq. |
| Society/Chapter | University | University | University | University |
| Non-US Org | International | International | International | International |
| Student / Other | Inside Sales | Inside Sales | Inside Sales | Inside Sales |
| University | University | University | University | University |

B2C always → CS - Inside Sales

---

## Known Gotchas (SILENT FAILURES — read before testing)
1. **Phone format** — SF requires `(XXX) XXX-XXXX`. Dashes (`312-555-0100`) → EW created but Lead silently not created.
2. **Duplicate phone** — Same phone on multiple EW records → only first Lead created.
3. **Concurrent EW + same phone** — Create sequentially with 35s wait between each.
4. **Country__c restricted picklist** — Accepts full names only ("United States"), not ISO codes. Flow handles this via varCUFCountry CASE formula.
5. **Queue ownership** — CS - Contact Center Inbound not yet associated with Contact_Us_Form__c → OwnerId routing disabled until Angel fixes.
6. **Flow execution order** — External_Web_Form... v21 runs BEFORE our flow (SF: oldest first). It creates the Lead. We update it.
7. **Support path creates Lead too** — v21 fires on ALL EW records including support; creates a Lead even when we create CUF. Known gap.
8. **Wait times** — 35s after EW create for Lead; 45s if Campaign__c is set.
9. **CIA RecordType restriction** — `CreateCaseLeadandOpportunity.v2` creates Cases with Web_Request RecordType. That RecordType only allows CMA/CPA/CPE for `I_would_like_to_hear_more_about__c`. Angel must add CIA/CFP/EA CE/EA Exam Review/Becker Academy. Until fixed, CIA support submissions fail with INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST.

---

## 2026-04-28 Meeting Decisions (form changes pending from Brian)
All confirmed by Josh Elefante, Huma Yousuf, Brian Clement:

| Change | Detail |
|---|---|
| **Account lookup** | B2B only. Reuse "Find Your Organization" SF controller. Query: `Account WHERE Record_Type_Name__c = 'Business account'` (no org type filter). "My company isn't listed" → free text fallback. |
| **B2B multi-select product** | `EW.Product_Interest__c` (multipicklist) → `Lead.Product_Line_MS__c`. First value → `EW.Primary_Interest__c`. SF flow (v29) already handles this. Brian needs to wire Drupal form. |
| **Phone on B2C** | Add phone field to B2C paths (currently B2B only). |
| **"How can we help?" field** | Add to both B2C and B2B. Reuse support form's `If_other__c` field. |
| **Remove consent step** | Merge consent to bottom of Step 2. Submit replaces Next. Legal copy from Josh. |
| **SMS checkbox** | Separate opt-in. Email + Phone always in CommSubscriptionConsent. SMS only if checked. |
| **Label renames** | "Role Type"→"What best describes you", "Resident State"→"State", "HQ State"→"Headquarters State", "# of Employees"→"Number of employees or members" |
| **Graduation Year conditional** | Show only if role = Undergrad/Grad Student |
| **HQ State conditional** | Hide if org type = Non-US Organization |

**Pending from Brian (BIT-10446):** All of the above Drupal form + SF mapping changes.

---

## Jira Epic: BIT-10392
**URL:** https://beckeredu.atlassian.net/browse/BIT-10392

| Ticket | Status | Owner | What |
|---|---|---|---|
| BIT-10446 | Development | Brian | Drupal form changes (meeting decisions above) |
| BIT-10389 | Open | Huma | Confirm CommSubscriptionConsent channel types (SMS new req) |
| BIT-10390 | Open | Huma | Confirm Lead duplicate rules inactive in prod |
| BIT-10379–88 | Done ✅ | — | All SF field creation + flow work |
| BIT-10381, 10384 | Cancelled | — | Connected App (not needed), Dedup flow (SF native) |

---

## Pending Blockers Before Go-Live

| # | Owner | Action |
|---|---|---|
| 1 | **Angel Cichy** | Add CIA, CFP, Becker Academy, EA CE, EA Exam Review to Web_Request Case RecordType picklist for `I_would_like_to_hear_more_about__c` |
| 2 | **Angel Cichy** | Add `Contact_Us_Form__c` to CS-Contact Center Inbound queue supported objects → re-enable OwnerId routing in flow |
| 3 | **Angel/Huma** | Build Case auto-creation from Contact_Us_Form__c (Case__c lookup exists, no automation) |
| 4 | **Brian** | BIT-10446 — all 2026-04-28 form changes |
| 5 | **Josh** | Provide legal-approved consent language text |
| 6 | **Sam** | SF prod Connected App creds (SF_CLIENT_ID, SF_CLIENT_SECRET, SF_USERNAME, SF_PASSWORD, SF_SECURITY_TOKEN) |
| 7 | **Sam** | SFMC creds + 11 journey event keys |
| 8 | **Angel** | Confirm 7 SF queue API names match prod |
| 9 | **Huma** | Confirm Lead assignment rules inactive in prod (BIT-10390) |
| 10 | **Campaign IDs** | Update to prod values (current = dev sandbox) |
| 11 | **RecordType IDs** | Verify B2B/B2C IDs for prod (sandbox-specific) |

---

## Key People
| Person | Role | Owns |
|---|---|---|
| Huma Yousuf | SF Developer | QA, smoke testing, SF field/flow changes |
| Angel Cichy | SF Admin | Field creation, queue config, flow deploy to prod |
| Brian Clement | Drupal Dev | Webform config + SF mapping on dev.becker.com |
| Josh Elefante | Product Lead | Form UX, consent copy, form sign-off |
| Monica Callahan | Business Owner | Requirements, routing rules |
| Nick Leavitt | SFMC | Post-form journey definitions |
| Diogo Marcos | Drupal Admin | dev.becker.com access |

---

## How to Deploy a New Flow Version
```bash
# 1. Edit /tmp/becker_rfi_vNN.xml (copy from previous version)
# 2. Build ZIP (no ./ prefix — critical)
python3 -c "
import zipfile
pkg = open('/path/to/package.xml').read()  # see scripts/rest-deploy.js for pkg content
with zipfile.ZipFile('/tmp/becker_rfi_vNN.zip','w',zipfile.ZIP_DEFLATED) as zf:
    zf.writestr('package.xml', pkg)
    zf.writestr('flows/Becker_RFI_Lead_Routing.flow', open('/tmp/becker_rfi_vNN.xml').read())
"
# 3. Deploy
node scripts/rest-deploy.js /tmp/becker_rfi_vNN.zip
# 4. Copy to repo
cp /tmp/becker_rfi_vNN.xml flows/Becker_RFI_Lead_Routing_vNN.xml
```

**XML schema order required:** assignments → decisions → formulas → label → processMetadataValues → processType → recordCreates → recordLookups → recordUpdates → start → status → variables

---

## Key Files
| File | Purpose |
|---|---|
| `flows/Becker_RFI_Lead_Routing_v29.xml` | Current active flow XML |
| `scripts/huma-test-scenarios.js` | 113-check automated QA test suite |
| `scripts/e2e-drupal-form.js` | E2E Playwright: Drupal form → SF verify (30 assertions) |
| `scripts/rest-deploy.js` | Deploy flow via SF Metadata REST API |
| `docs/UAT_TEST_SCRIPT.md` | Human UAT guide for Huma/team |
| `drupal/BRIAN_DEPLOY.md` | Drupal deploy guide for Brian |
| `src/routing-engine.js` | B2B routing matrix (27 unit tests) |

---

*Last updated: 2026-04-29 | Flow: v29 | Tests: 113/113 ✅*
