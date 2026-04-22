# Becker RFI Lead Routing Agent
# Sources: RFI Mapping 2.23.26.xlsx + becker.com scan + meeting transcript + form mockup + SF field spec
# DO NOT EDIT field values or routing rules without re-validating against source Excel

## ═══════════════════════════════════════════════════════
## CURRENT BUILD STATE — RESUME FROM HERE (2026-04-21)
## ═══════════════════════════════════════════════════════

### Status: SF FLOW E2E VERIFIED ✅ — 16/16 pass (2026-04-22 session 4)

### What is built + verified
- React form (Becker official Figma design): `client/src/app/App.tsx`
  - 4 intent paths: exploring / ready / b2b / support
  - All field mappings, consent, UTM capture, org autocomplete, inline errors
  - Builds to `public/` via `npm run build:client`
- Express API: `src/server.js` — POST /api/submit, GET /api/accounts, GET /health
- B2B routing engine: `src/routing-engine.js` — 27 unit tests, 6 SF queues
- SF client: `src/sf-client.js` — Lead/Case/Contact_Us_Form__c create, CommSubscriptionConsent, queue assign
- SFMC client: `src/sfmc-client.js` — 11 journey triggers, token caching
- Lead processor: `src/lead-processor.js` — orchestrates all layers
  - **B2C leads now route to "CS - Inside Sales" queue** (not plain "Inside Sales")
  - Graduation year now writes to `What_year_do_you_plan_to_graduate__c` EW field
- Email validator: `src/email-validator.js` — Hunter.io + spam pattern filter
- **SF Flow v15** (`Becker_RFI_Lead_Routing`): Active on ExternalWebform__c, Create, After Save
  - v13: Lead_Source_Form__c, Lead_Source_Form_Date__c, Product_Line__c mappings
  - v14 (2026-04-22): HQ_State__c, Resident_State__c, Is_Current_Becker_Student__c; RFI_HQ_State__c source fixed
  - v15 (2026-04-22): Lead_Source_Detail__c (UTM) mapped to all 3 Lead write paths
- **SF Flow v21** (`External_Web_Form_Main_Record_Triggered_Flow_After_Save`) — fixed twice:
  - Lead_Source_Form__c source bug fixed (2026-04-21)
  - B2B detection fixed (2026-04-22): Check_If_B2B now checks `Requesting_for__c = 'My organization'`
    (was only checking CDM label, so B2B leads from our form got B2C RecordTypeId — now fixed)
- **SF Flow v32** (`Create_Leads_Sub_Flow`): Lead_Source_Form__c source bug fixed (2026-04-21)
- **Support form**: `src/sf-client.js` + `src/lead-processor.js` — support path now creates
  `Contact_Us_Form__c` record with all 8 mapped fields + Query_Type__c=Support
- Approval docs: EXECUTIVE_SUMMARY.md, ARCHITECTURE.md, SETUP.md, README.md

### Verified scenarios — all pass (16/16 as of 2026-04-22)
| Scenario | Input | Expected | Status |
|---|---|---|---|
| B2B Active Account Owner | Standish Management (JoAnn Veiga — active, Sales_Channel=Firm) | Lead.Owner = JoAnn Veiga (user) | ✅ |
| B2B Inactive Account Owner | Felician University (BUPP) (Jackie Oblinger — inactive) | Lead.Owner = University queue | ✅ |
| B2C Exploring | Requesting_for=Myself, RFI_Suggested_Queue=CS - Inside Sales | Lead.Owner = CS - Inside Sales queue | ✅ |
| Campaign membership B2C | CPA product, Campaign__c set | CampaignMember created | ✅ |
| Campaign membership B2B | B2B Lead Form campaign | CampaignMember created | ✅ |
| B2B HQ_State__c | EW.HQ_State__c=TX | Lead.HQ_State__c=TX, Lead.RFI_HQ_State__c=TX | ✅ v14 |
| B2C Resident_State__c | EW.Resident_State__c=CA | Lead.Resident_State__c=CA | ✅ v14 |
| B2C Is_Current_Becker_Student__c | EW.Is_Current_Becker_Student__c=true | Lead.Is_Current_Becker_Student__c=true | ✅ v14 |
| B2B RecordTypeId | Requesting_for__c=My organization | Lead.RecordTypeId=B2B (012i0000001E3hmAAC) | ✅ v21 fix |
| B2B Lead_Source_Detail__c | UTM params set on EW | Lead.Lead_Source_Detail__c populated | ✅ v15 |
| B2C Lead_Source_Detail__c | UTM params set on EW | Lead.Lead_Source_Detail__c populated | ✅ v15 |
| Support form → Contact_Us_Form__c | Support submission | Contact_Us_Form__c created with all 8 fields | ✅ |

### Campaign note (confirmed 2026-04-21)
CampaignMember records ARE created even when campaigns are `IsActive = false`.
Huma does NOT need to activate campaigns for membership to work.
Activating campaigns is still recommended for SFMC MC Connect and campaign reports.

### Blocking for go-live
1. Sam: obtain SF Connected App credentials for prod (SF_CLIENT_ID, SF_CLIENT_SECRET, SF_USERNAME, SF_PASSWORD, SF_SECURITY_TOKEN)
2. Sam: obtain SFMC credentials + 11 journey event keys → SETUP.md §6+7
3. Angel Cichy: confirm 7 SF queue API names match prod → SETUP.md §2
4. Huma Yousuf: confirm existing SF lead assignment rules are inactive in prod → SETUP.md §3

### EW → Lead field mapping status (verified 2026-04-21 session 3)
All fields below exist in sandbox and are mapped in v14 flow. Smoke tested ✅.
| EW Field | Type | Lead Field | Type | Status |
|---|---|---|---|---|
| HQ_State__c | text(100) | HQ_State__c | text(2) | ✅ v14 — B2B path |
| HQ_State__c | text(100) | RFI_HQ_State__c | text(2) | ✅ v14 — fixed (was Address__StateCode__s) |
| Resident_State__c | text(100) | Resident_State__c | text(2) | ✅ v14 — B2C path |
| Is_Current_Becker_Student__c | boolean | Is_Current_Becker_Student__c | boolean | ✅ v14 |
| Requesting_for__c | picklist | (no Lead field) | — | N/A — field only on EW, not Lead |

Note: `Requesting_for__c` exists on EW (picklist: Myself/My organization). It does NOT exist on Lead in sandbox. The flow uses it internally for B2B/B2C branching — it does not need to be mapped to Lead.
7. Huma: optionally activate 9 campaigns in sandbox for SFMC MC Connect and reporting:
   - Becker.com email signup - CPA (701U700000eyrntIAA)
   - Becker.com email signup - CPE (701U700000eyrnuIAA)
   - Becker.com email signup - CMA (701U700000eyrnvIAA)
   - Becker.com email signup - EA Exam Review (701U700000eyrnwIAA)
   - Becker.com email signup - CIA (701U700000eyrnxIAA)
   - Becker.com email signup - CFP (701U700000eyrnyIAA)
   - B2B Lead Form (701U700000eyrnzIAA)
   - Becker.com email signup - Staff Level Training (701U700000eyro0IAA)
   - Becker.com email signup - CIA Challenge (701U700000eyro1IAA)

### Campaign mapping (Josh's Excel → Dev sandbox)
Source: `becker_campaign_mapping.xlsx` (Josh Elefante) + Dev campaign IDs (Huma Yousuf, 2026-04-21)

**B2C** — product-specific campaign per Josh's mapping (same ID for Exploring/Myself and Ready to Enroll):
| Product Interest | Dev Campaign ID | Campaign Name |
|---|---|---|
| Certified Public Accountant | 701U700000eyrntIAA | Becker.com email signup - CPA |
| Continuing Professional Education | 701U700000eyrnuIAA | Becker.com email signup - CPE |
| Certified Management Accountant | 701U700000eyrnvIAA | Becker.com email signup - CMA |
| Enrolled Agent | 701U700000eyrnwIAA | Becker.com email signup - EA Exam Review |
| Certified Internal Auditor | 701U700000eyrnxIAA | Becker.com email signup - CIA |
| Certified Financial Planner | 701U700000eyrnyIAA | Becker.com email signup - CFP |
| Staff Level Training | 701U700000eyro0IAA | Becker.com email signup - Staff Level Training |
| CIA Challenge Exam | 701U700000eyro1IAA | Becker.com email signup - CIA Challenge |

**B2B** — single campaign regardless of product (per Josh's mapping):
| Path | Dev Campaign ID | Campaign Name |
|---|---|---|
| All B2B (Exploring/Org + Buying for Org) | 701U700000eyrnzIAA | B2B Lead Form |

**Support** — no campaign (blank, per Josh's mapping ✅)

These IDs are hardcoded in `src/lead-processor.js` and can be re-synced anytime with:
```bash
node scripts/sync-campaign-ids.js
```

## ═══════════════════════════════════════════════════════
## SF FLOW — ARCHITECTURE & EXACT DEPLOY STEPS
## ═══════════════════════════════════════════════════════

### Flow: Becker_RFI_Lead_Routing (v14)
- **Object**: ExternalWebform__c
- **Trigger**: Create, After Save (no entry conditions — fires on every new EW record)
- **Source**: `/tmp/becker_rfi_v14.xml` (last deployed 2026-04-21)

### How the flow works (v12 logic)

1. **Check_Existing_Lead** — SOQL on Lead by Email. Looks for unconverted lead with same email.
2. **Did_Lead_Exist** decision:
   - **YES (existing lead found)**: `Update_Existing_Lead` — updates Phone, Company, Description,
     Subscription_id__c, Business_Brand__c, all consent fields, RecordTypeId (B2B or B2C formula).
     Then `Set_Lead_Id_From_Existing` assigns `varCreatedLeadId = varExistingLead.Id`.
     Flow continues to `Lookup_Queue` (same path as new lead creation).
   - **NO (new lead)**: `Check_Existing_Account` → `Did_Account_Exist` → `Create_B2B_Lead` or
     `Create_B2C_Lead`. Both set all fields including Subscription_id__c and RecordTypeId.
     faultConnector on each create goes to `Handle_Duplicate_Lead` (silent boolean flag).

3. **Lookup_Queue** — queries Group WHERE Type='Queue' AND Name = `$Record.RFI_Suggested_Queue__c`.
   - If queue found → `Assign_Lead_To_Queue` (sets OwnerId to queue ID)
   - If not found → `Lookup_Inside_Sales_Fallback` → `Assign_Lead_To_Queue`

4. **Should_Create_Campaign_Member** — if `$Record.Campaign__c` is set, creates CampaignMember record.

5. **Check_B2B_Account_Owner** — only runs for B2B leads where Company matched an existing Account.
   - `Lookup_Account_Owner_User` — queries User by Account.OwnerId WHERE Sales_Channel__c IS NOT NULL AND IsActive = true.
     (`Sales_Channel__c` is set on real sales reps, blank on ecommerce/system users.)
   - If a real rep is found → `Assign_Lead_To_Account_Owner` overwrites queue assignment.
   - If no rep (system/ecommerce account owner) → lead stays on queue.

### Why v21/v32 runs first (important context)
Salesforce runs multiple After Save flows on the same object in **Last Modified Date order (oldest first)**.
Flow v21 ("External Web Form Main Record Triggered Flow After Save") was created before our flow and
runs first. v21 calls v32 ("Create Leads Sub Flow") which creates the Lead record. Our v11 then runs,
finds the existing lead, and updates all RFI-specific fields + assigns to queue. This is by design in v11.

### Subscription_id__c formula (varSubscriptionIds)
```
B2B:  "B2B - News and Events;B2B - Events;B2B - New Products"
CPA:  "CPA Content;CPA Promotions"
CMA:  "CMA Content;CMA Promotions"
CPE:  "CPE Content;CPE Promotions"
CIA:  "CIA Content;CIA Promotions"
EA:   "EA Content;EA Promotions"
CFP:  "CPA Content;CPA Promotions"  (maps to CPA)
default: "CPA Content;CPA Promotions"
```
Note: SF multipicklist fields reorder values per picklist definition — order in DB may differ from formula.
The values are always correct; comparison must be order-insensitive.

### RecordTypeId formula (varB2BRecordTypeId)
```
B2B (Requesting_for__c = "My organization"): 012i0000001E3hmAAC
B2C (all other): 01231000000y0UoAAI
```
These IDs are sandbox-specific. Verify before deploying to production.

### How to deploy a new flow version

**Prerequisites**: Node.js + dotenv in `/Users/anmolsam/becker-rfi-agent/`

**Step 1** — Edit the flow XML at `/tmp/becker_rfi_vNN.xml`

**Step 2** — Build the ZIP (no `./` prefix — critical):
```python
import zipfile
pkg = '<?xml version="1.0"...><Package>...<members>Becker_RFI_Lead_Routing</members>...<version>59.0</version></Package>'
with zipfile.ZipFile('/tmp/becker_rfi_vNN.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    zf.writestr('package.xml', pkg)
    zf.writestr('flows/Becker_RFI_Lead_Routing.flow', open('/tmp/becker_rfi_vNN.xml').read())
```

**Step 3** — Deploy via SF Metadata REST API (multipart form-data, singlePackage: true):
```js
// In /Users/anmolsam/becker-rfi-agent/ (has node_modules/dotenv)
const zip = fs.readFileSync('/tmp/becker_rfi_vNN.zip');
const b64 = zip.toString('base64');
const body = [
  `--${boundary}`,
  'Content-Disposition: form-data; name="entity_content"',
  'Content-Type: application/json',
  '',
  JSON.stringify({ deployOptions: { checkOnly: false, ignoreWarnings: true,
    rollbackOnError: true, testLevel: 'NoTestRun', singlePackage: true } }),
  `--${boundary}`,
  'Content-Disposition: form-data; name="file"; filename="becker_rfi_vNN.zip"',
  'Content-Type: application/zip',
  'Content-Transfer-Encoding: base64',
  '',
  b64,
  `--${boundary}--`,
].join('\r\n');
// POST to: ${instanceUrl}/services/data/v59.0/metadata/deployRequest
// Then poll: GET ${instanceUrl}/services/data/v59.0/metadata/deployRequest/${jobId}?includeDetails=true
```

**Critical gotchas**:
- ZIP entries must be `package.xml` and `flows/Becker_RFI_Lead_Routing.flow` — no `./` prefix
- Deploy must be run from `/Users/anmolsam/becker-rfi-agent/` (needs `node_modules/dotenv`)
- `singlePackage: true` is REQUIRED — without it SF ignores the ZIP content (deploys 0 components)
- Deploying a new version of an Active flow automatically deactivates the prior version
- SF Metadata REST API uses multipart form-data, NOT JSON body with encodedZipFile

### How to run E2E tests

Create ExternalWebform__c records via SF REST API and verify resulting Lead fields.

**ExternalWebform__c key fields** (confirmed picklist values):
```
Requesting_for__c:    'Myself' | 'My organization'
Primary_Interest__c:  'CPA' | 'CMA' | 'CPE' | 'CIA' | 'EA' | 'CFP' | ...
Organization_Type__c: 'Accounting Firm' | 'Corporation/Healthcare/Bank/Financial Institution' |
                      'Consulting Firm' | 'CPA Alliance' | 'Government Agency/Not for Profit Organization' |
                      'Society/Chapter' | 'Non-US Organization' | 'Student' | 'University' | 'Other'
Organization_Size__c: '<25' | '26-100' | '101-250' | '251+'
Consent_Provided__c:  'Email' | 'Phone' | 'SMS' (multipicklist — NOT boolean)
Privacy_Consent_Status__c: 'NotSeen' | 'OptIn' | 'OptInPending' | 'OptOut' | 'OptOutPending'
RFI_Suggested_Queue__c: text field — set by Node routing engine before creating EW record
                         Valid values: 'Inside Sales' | 'Global Firms' | 'New Client Acquisition' |
                         'University' | 'International' | 'Customer Success & Expansion'
```

**E2E verified routing scenarios (2026-04-21)**:
| EW Input | Expected Lead |
|---|---|
| Myself + CPA + RFI_Suggested_Queue__c=Inside Sales | B2C Lead, Owner=Inside Sales, Sub=CPA Content;CPA Promotions |
| My organization + Accounting Firm + 251+ + Global Firms | B2B Lead, Owner=Global Firms, Sub=B2B - News and Events;... |
| My organization + Corporation + 101-250 + New Client Acquisition | B2B Lead, Owner=New Client Acquisition |
| My organization + University + 26-100 + University | B2B Lead, Owner=University |

**Wait time**: 8–10 seconds after creating EW record before querying Lead

**Comparison note**: `Subscription_id__c` is a multipicklist — compare order-insensitive (sort both sides on `;`)

### To run locally once .env is filled
```bash
npm run build:client    # builds React → public/
npm start               # server on :3000
open http://localhost:3000
```

### To deploy (Railway)
```bash
railway login && railway up
# set all env vars from .env.example via: railway variables set KEY=VALUE
```

### Test the routing engine (no credentials needed)
```bash
npm test    # 27 tests should pass
```

### Repo: https://github.com/samcolibri/becker-rfi-agent
### Control Tower: ~/.claude/control-tower/projects/becker-rfi.yaml

## ═══════════════════════════════════════════════════════
## FULL TRANSCRIPT INTELLIGENCE (1h6m45s — April 16, 2026)
## Source: /docs/B2B Lead Routing and New Form Fields Requirement Gathering.docx
## ═══════════════════════════════════════════════════════

### Key Decisions Made in the Meeting

**1. SLA — CORRECTED from initial design**
- Angel initially pitched: 1 hour
- Monica corrected: outside sales reps travel, can't respond in 1 hour
- **Final agreed SLAs:**
  - B2C (inside sales): **1–4 business hours** (aspirational; run SF report to confirm baseline)
  - B2B (outside sales): **48 business hours**
  - Support: 1 business day
- Action: Huma to run SF report → lead creation to first sales activity (existing leads)

**2. LeadSource = CHANNEL, not B2B/B2C**
- Angel: "Lead source should not say B2B. It needs to show where it came from."
- Josh confirmed: LeadSource = Web/Webinar/Flipbook/Event/Conference
- NOT "B2B Query" as the current form has it

**3. Deduplication — USE SF NATIVE RULES**
- Huma confirmed: SF already has lead duplicate rules (email-based)
- Same email → updates existing lead, doesn't create duplicate
- Sam does NOT need to build custom dedup — SF handles it natively

**4. Drupal Integration (NEW — critical)**
- Josh: "we just don't have the Drupal resources to develop that smart form"
- Charlene: Drupal team tied up with payment widget + guest checkout
- Sam committed to connect with **Dakshesh** (5X Drupal team)
- Sam can connect Drupal via REST API — "big platform, must have REST API"
- Form can also be delivered as standalone HTML embed in a Drupal block
- Drupal work is SEPARATE from routing/SF work — routing engine is fully testable without it

**5. Spam / Bot filtering (NEW)**
- Monica: "I am amazed at the number of spam contact us forms we get... bot type things"
- Current RFI goes to Verse → Inside Sales manually; Monica used to delete leads manually
- Sam proposed: waterfall enrichment (Clay + 6sense already at Colibri), Hunter.io API
- Sam: "hunter.io API — 10 minute job" for email validation
- Monica: caveat — some B2B buyers use Gmail; enrichment is fuzzy for personal emails
- Sam: "works best with business emails; Gmail → check if valid only"
- **Built:** email-validator.js with spam patterns, disposable domains, Hunter.io integration

**6. Organization Type → Farside CDM (NEW)**
- Angel: "we're going to need to add org type to our Farside data model"
- Angel to follow up on Farside CDM alignment
- Existing SF "industry type" field is internal-only — NOT what goes on the form
- New Organization_Type__c = prospect-facing values (Accounting Firm, Corp, etc.)

**7. Phase 1 vs Phase 2 (CONFIRMED)**
- Phase 1: Contact Us / RFI form only
- Phase 2+: Same segmentation model extended to webinars, events, conferences, flipbooks
- Monica: "we need to be asking those questions on every type of intake form"
- Josh: floating RFI widget on every page (future)

**8. Typo / Fuzzy Org Name matching (DECIDED)**
- Josh raised: what if they type "Amazone" instead of "Amazon"?
- Monica: "If it's weird and outside the norm, it goes to Inside Sales first"
- Don't try to fuzzy-match — too many companies with close names
- Create a report on "Other" category to monitor frequency

**9. Sam's Architecture Process (what Sam committed to)**
- "I will create a git and whatever we spoke here, I will assemble in a repo in an architecture and then I will send it today before EOD"
- "You guys approve the architecture. Once you approve the architecture, we go in development"
- ✅ DONE: repo is live at github.com/samcolibri/becker-rfi-agent
- ✅ DONE: ARCHITECTURE.md created for stakeholder review

**10. The Bigger Vision (context for future phases)**
- Angel: "single smarter intake form — every person landing on Becker website funneled to singular segmented intake form process"
- Monica: "I think we're going to get a lot more B2C leads, actually. The biggest bang will be B2C."
- Current form is "a hidden form" — "it's somewhat of a hidden form and we're not pointing people to that space"
- Josh: form should float on all pages so anyone can access it anytime

### People & Roles (full from transcript)
| Person | Role | Responsibility |
|---|---|---|
| Sam Chaudhary | AI Architect/Developer | Build routing engine, SF integration, architecture |
| Huma Yousuf | Salesforce Developer | Dev coordination, smoke testing, working session with Sam |
| Monica Callahan | Business Owner | Requirements, field mapping, routing logic owner |
| Josh Elefante | Product Lead | Form UX direction, floating widget idea, webinar takeover |
| Angel Cichy | Salesforce Product/Admin | SF field creation, Farside CDM, requirements approval |
| Charlene Ceci (Shar) | Drupal/DevOps | Release cycles, Drupal resources, deployment |
| Shital Patil | Engineering Manager | Sprint oversight, Cloud access for Huma |
| Smita Katariya | VP/Director | Sponsor — "why can't we do this in two days?" |
| Dakshesh | 5X Drupal Team Lead | Sam must connect for Drupal integration |
| Aaron | Unknown | B2C side UAT testing |
| Haley | Unknown | UAT tester — needs sandbox access |
| Jackie Hartwig + Annette Lee | Marketing | KPIs and baselines |

---

## ═══════════════════════════════════════════════════════
## PROJECT CONTEXT & THE PROBLEM BEING SOLVED
## ═══════════════════════════════════════════════════════

**The Problem:**
Becker Professional Education has had virtually zero functioning B2B lead pipeline.
All contact form submissions currently route to a single person (Andy M.) with no
intelligence. Monica Callahan: "We really haven't had B2B leads — we can only go up."
Josh Elefante: "We have not had proper B2B lead conversion for a long time."

**The Solution — 5 Layers:**
1. Smart segmented web form (3-step wizard, 4 intent paths)
2. Salesforce Lead record creation with full field mapping + SFMC-ready data
3. Intelligent B2B routing engine (org type × employee count → SF queue)
4. SFMC journey triggers per program of interest + intent path
5. 1-business-hour SLA monitoring and rep assignment

**Key Stakeholders:**
- Angel Cichy — Salesforce admin (SF field creation, flows, routing)
- Josh Elefante — Product/project lead
- Monica Callahan — Business stakeholder
- Jackie Hartwig + Annette Lee — Marketing, KPIs and baselines
- Shital Patil — Lead conversion/management data
- "Shar" — Lead data corral

**6 Sales Queues:**
1. Customer Success & Expansion
2. Global Firms
3. Inside Sales (default fallback)
4. International
5. New Client Acquisition (NCA)
6. University

---

## ═══════════════════════════════════════════════════════
## TAB 1: RFI FORM FIELDS → SALESFORCE FIELD MAPPING
## ═══════════════════════════════════════════════════════

### Shared / Top-Level
| Form Field      | SF Field         | Notes                                              |
|-----------------|------------------|----------------------------------------------------|
| Requesting for* | **NEW FIELD**    | Toggles B2B or B2C record type. Values: "Myself" / "My organization" |

### B2B Section — "For My Organization"
| Form Field                    | SF Field                | Notes                                                                 |
|-------------------------------|-------------------------|-----------------------------------------------------------------------|
| First Name                    | First Name              | Exists                                                                |
| Last Name                     | Last Name               | Exists                                                                |
| Product Interest*             | Product Line MS         | Exists. Drop-down (see Tab 2)                                         |
| Business email                | Email                   | Exists                                                                |
| Phone number                  | Phone                   | Exists                                                                |
| Headquarter state or province | **NEW FIELD**           | HQ state for B2B. Not on lead record (only on contact form object)    |
| Organization name             | Company                 | Connect with Business Account list. Handle "Other" case               |
| Role Type*                    | **NEW FIELD**           | Different values for B2B vs B2C. Drop-down (see Tab 2)               |
| Organization type*            | **NEW FIELD**           | Internal industry types won't work — use prospect-facing values       |
| # of employees*               | Training audience size? | Drop-down (see Tab 2). Used in routing matrix                         |

> Note: Current Becker for Business Contact Us form only routes to Andy M. — this replaces that.

### B2C Section — "For Myself"
| Form Field                        | SF Field         | Notes                                                              |
|-----------------------------------|------------------|--------------------------------------------------------------------|
| First Name                        | First Name       | Exists                                                             |
| Last Name                         | Last Name        | Exists                                                             |
| Product Interest*                 | Product Line MS  | Exists. Drop-down (see Tab 2)                                      |
| Email                             | Email            | Exists                                                             |
| Phone number                      | Phone            | Exists                                                             |
| State or province of residence    | **NEW FIELD**    | Not on lead record (only on contact form object)                   |
| Organization name                 | Company          | Connect with Business Account list. Handle "Other" case            |
| Role Type*                        | **NEW FIELD**    | Drop-down (see Tab 2)                                              |
| Organization type*                | **NEW FIELD**    | Drop-down — "None" option for B2C only                             |
| What year do you plan to graduate?| **NEW FIELD?**   | Drop-down of years + "0000" if already graduated                   |
| Are you a current Becker student? | (TBD)            | Yes/No toggle                                                      |
| If so, email on Becker account    | Email 2 field?   | Secondary email field                                              |

### New SF Fields Required (summary)
1. `Requesting_For__c` — B2B/B2C toggle
2. `HQ_State__c` — Headquarter state (B2B) / State of Residence (B2C)
3. `Role_Type__c` — Role type (different picklist per B2B/B2C)
4. `Organization_Type__c` — Org type (prospect-facing values)
5. `Graduation_Year__c` — B2C only
6. `Becker_Student_Email__c` — B2C only, secondary email

---

## ═══════════════════════════════════════════════════════
## TAB 2: DROP-DOWN VALUES FOR STARRED (*) FIELDS
## ═══════════════════════════════════════════════════════

### Product Interest
- Certified Financial Planner
- Certified Internal Auditor
- Certified Management Accountant
- Certified Public Accountant
- Continuing Professional Education
- Enrolled Agent
- Staff Level Training
- CIA Challenge Exam
- *(Note: "Products need spelled out" — values may expand)*

### Organization Type
- Accounting Firm
- Corporation/Healthcare/Bank/Financial Institution
- Consulting Firm
- CPA Alliance
- Government Agency/Not for Profit Organization
- Society/Chapter
- Non-US Organization
- Student
- University
- Other
- **None** *(B2C only)*

### # of Employees
- <25
- 26-100
- 101-250
- 251+

### Requesting For
- Myself *(→ B2C)*
- My organization *(→ B2B)*

### Role Type
- Undergrad Student
- Grad Student
- Professor
- Supervisor/Director/Manager
- Partner/CEO/CFO
- Administrator
- Unemployed
- Learning/Training Leader
- Staff Accountant
- Other

---

## ═══════════════════════════════════════════════════════
## TAB 3: LEAD ROUTING LOGIC
## ═══════════════════════════════════════════════════════

### B2B Routing Matrix — Org Type × Employee Count → Sales Channel

| Org Type                                         | <25           | 26-100                 | 101-250                | 251+                   |
|--------------------------------------------------|---------------|------------------------|------------------------|------------------------|
| Accounting Firm                                  | Inside Sales  | Global Firms           | Global Firms           | Global Firms           |
| Corporation / Healthcare / Bank / Fin. Inst.     | Inside Sales  | New Client Acquisition | New Client Acquisition | New Client Acquisition |
| Consulting Firm                                  | Global Firms  | Global Firms           | Global Firms           | Global Firms           |
| CPA Alliance                                     | Global Firms  | Global Firms           | Global Firms           | Global Firms           |
| Government Agency / Not for Profit Org           | Inside Sales  | New Client Acquisition | New Client Acquisition | New Client Acquisition |
| Society/Chapter                                  | University    | University             | University             | University             |
| Non-US Organization                              | International | International          | International          | International          |
| Student                                          | Inside Sales  | Inside Sales           | Inside Sales           | Inside Sales           |
| University                                       | University    | University             | University             | University             |
| Other                                            | Inside Sales  | Inside Sales           | Inside Sales           | Inside Sales           |

### Special Rules
- If lead is owned by **Customer Success & Expansion** team → assign to that queue regardless
- If lead does NOT meet any criteria → default to **Inside Sales**
- **6 total queues** in Salesforce

### Lead Assignment — Two Phases
**Phase One (current):**
1. Lead → Account Owner if one exists on the account
2. Lead → Team queue based on sales channel routing matrix above

**Phase Two (future):**
1. Lead → Account Owner based on Salesforce assignment rules
2. Lead → Queue when multiple reps meet criteria (e.g., 2 reps in same state)

---

## ═══════════════════════════════════════════════════════
## TAB 4: SALES REP LIST
## ═══════════════════════════════════════════════════════

### Customer Success & Expansion (Manager: Jenae Klinke)
Alexandria Reyes, Ashley Stephens, Jenae Klinke, JoAnn Veiga, Laura Copley,
Melissa VanFossen, Shaida Hong

### Global Firms (Manager: Andrea Jennings)
Andrea Jennings, Kristin Curcuru, Moira Gordon, Richard Slusz

### Inside Sales (Manager: Mark Pisani)
Aaron Smith, Andrew Masiewicz, Ashley Griffin, Austin Shields, Brock Batchko,
Catalina Gamez, Glenn Proud, Matt Anklam, Matthew Clark, Michelle Mazurek,
Ruben Munoz, Sarah Lunday, Stacey Bachara, Tim Carpenter, Zina Fitzgerald

### International
Ben Wong, Digvijay Singh, Eduardo Escalante, Manmeet Anand

### New Client Acquisition — NCA (Manager: Angelique Watson)
Angelique Watson, Henry Quinones, Jill Kirkpatrick, Nahal Shafagh, Sara DiGello,
Sharice Jessup, Stephanie Anastasio

### University (Managers: Andrea Jennings, Carson Crosby, Julie Champion, Mychal Patterson)
Aaron Gocer, Addie Mitchell, Amy Johnson, Amy Napolski, Angela White,
Anthony Quintero, Chandler Lackey, Chantel Garrone, Christian Santiago,
Diego Mansilla, Ellen Garner Crawford, Hayley Bales, Jackie Oblinger,
Jeffrey Sampson, Kim Holland, Kristine Snyder, Kurtis Williams, Lindsay Sauter,
Lisa Easley, Lupe Casillas, Michael Ceglie, Moyrali Roig, Natasha Nurse,
Robyn Hampton Peers, Sandy Broadbent, Sharrieff Hazim, Stephen McIntosh

---

## ═══════════════════════════════════════════════════════
## TAB 5: TERRITORIES (2026 CAT — NCA Team Only)
## ═══════════════════════════════════════════════════════

| Rep                  | Account Types              | SME Industries                        | Geographic Territory                                              |
|----------------------|----------------------------|---------------------------------------|-------------------------------------------------------------------|
| Stephanie Anastasio  | F1000, Banks, Insurance    | Pharma, Energy/Utilities              | OH, ID, WV, DC, MD, NY, PA, NJ, CT, VA, RI, DE, NH, MA, ME       |
| Jill Kirkpatrick     | F1000, Banks, Insurance    | Oil & Gas, Gaming                     | OK, KS, MO, IL, MI, WI, East TX, NE, IA, MN, SD, ND, AR, NV     |
| Sharice Jessup       | F1000, Banks, Insurance    | Healthcare, Wine & Spirits, Cannabis  | Nor CAL, AZ, UT, CO, WY, MT, ID, HI                              |
| Henry Quinones       | F1000, Banks, Insurance    | Manufacturing, Gaming, Wine & Spirits | NM, West TX, AL, GA, NC, SC, FL, TN, KY, LA, MS                  |
| Nahal Safagh         | Firms 150-350, F1000, Banks| Wine & Spirits, Cannabis              | So Cal, OR, WA, AK, 150-350 Firms                                 |

> Territories only defined for NCA team (2026). Other teams (Global Firms, University, etc.)
> use different assignment logic (not yet defined in source doc).

---

## ═══════════════════════════════════════════════════════
## ROUTING DECISION TREE (FULL LOGIC)
## ═══════════════════════════════════════════════════════

```
FORM SUBMITTED
└── Requesting For = "My organization" (B2B)?
    ├── YES → B2B Lead Record
    │   ├── Check: Existing Account Owner?
    │   │   ├── YES → Assign to Account Owner
    │   │   └── NO → Apply Routing Matrix (Org Type + # Employees → Queue)
    │   │       ├── Queue = Customer Success & Expansion? → CS&E queue
    │   │       ├── Queue = Global Firms? → Global Firms queue
    │   │       ├── Queue = New Client Acquisition? → NCA queue
    │   │       │   └── Phase Two: Territory match → specific NCA rep
    │   │       ├── Queue = University? → University queue
    │   │       ├── Queue = International? → International queue
    │   │       └── No match → Inside Sales (default)
    └── Requesting For = "Myself" (B2C)?
        └── B2C Lead Record → routing TBD (transcript will clarify)
```

---

## ═══════════════════════════════════════════════════════
## OPEN QUESTIONS (from source doc)
## ═══════════════════════════════════════════════════════

1. Can we use B2B / B2C SF Record Type for the "Requesting for" toggle?
2. How to handle "Other" in Organization Name — use affiliation display list?
3. Is "Training audience size" the right SF field for # of employees?
4. Should Role Type have different picklist values for B2B vs B2C?
5. B2C routing rules — not yet defined in source doc (expect in transcript)
6. State field: needs new field on Lead object (currently only on Contact Form object)
7. Graduation year: drop-down of years or text field + "0000" for already graduated?
8. "Are you a current Becker student?" — Yes/No toggle or checkbox?
9. Phase Two territory-based rep assignment for NCA — full rules not yet defined

---

## ═══════════════════════════════════════════════════════
## FILE STRUCTURE (to be built)
## ═══════════════════════════════════════════════════════

```
becker-rfi-agent/
├── CLAUDE.md              ← this file
├── README.md
├── data/
│   ├── rfi-fields.json    ← field mapping from Tab 1
│   ├── dropdowns.json     ← picklist values from Tab 2
│   ├── routing-matrix.json← routing rules from Tab 3
│   ├── sales-reps.json    ← rep list from Tab 4
│   └── territories.json   ← NCA territories from Tab 5
├── src/
│   └── (TBD from transcript)
└── tests/
    └── (TBD)
```

---

## ═══════════════════════════════════════════════════════
## WEBSITE INTELLIGENCE (scanned 2026-04-16)
## ═══════════════════════════════════════════════════════

### Brand Overview
- **Becker Professional Education** — part of **Colibri Group**
- 60+ years in professional education, 1M+ students, 2,900+ accounting firms
- Vision: "Empower people globally to advance their careers through a lifelong partnership of superior professional education"
- HQ: St. Louis, MO
- Phone: US 877.272.3926 | International 630.472.2213
- Hours: Mon–Fri 7:30am–9pm CST | Sat 9am–1pm | Sun 10am–3pm

---

### Product Lines (what the RFI form maps to "Product Interest")

#### CPA Exam Review (largest product)
| Package | Price | Key differentiator |
|---|---|---|
| Advantage | $2,499 | Self-paced essentials, 24-month access |
| Premium | $3,099 | Mid-tier |
| Pro | $2,499 (was $3,845) | +coaching, tutoring, 1yr CPE sub, Pass Guarantee |
| Pro+ | $2,698 | Above Pro |
| Concierge | $5,349 | 25 coaching + 25 tutoring sessions, US only, most premium |

Also: Single-part courses, Final Reviews, Discipline Reviews (BAR/ISC/TCP), LiveOnline, Deep Dive Workshops, ExamSolver, Becker Academy

#### CMA Exam Review
| Package | Price |
|---|---|
| CMA Review Advantage | $1,599 |
| CMA Review Pro | $1,099 (50% off) |

#### CIA Exam Review
| Package | Price |
|---|---|
| Essentials | $899 |
| Premium | Available |
| Pro | Available |
| Challenge Exam | Available (separate product) |
| IAP | Available |

#### EA (Enrolled Agent) Exam Review
| Package | Price |
|---|---|
| Essentials | $499 (25% off through 4/27/26) |
| Pro | Available |
| Single Parts (1, 2, 3) | Available |

#### CPE (Continuing Professional Education)
| Package | Price |
|---|---|
| Prime 2-Year | $1,429 |
| Prime 1-Year | $799 |
| Select | $499 |
| Essentials | $329 |

- 942+ courses, 1,700+ total (on-demand + webcasts + podcasts + flash)
- 19+ subject areas: Accounting & Auditing, Tax, Business Law, Finance, IT, Ethics, etc.
- B2B firms can subscribe teams; "Bill Your Organization" functionality exists

#### CFP (Certified Financial Planner)
- Listed in contact form Product Interest — separate product line

---

### Current Contact Form (becker.com/contact-us) — What Exists Today
Fields on LIVE form:
- Email, Phone, Address, Country (249 options), First Name, Last Name, City, State (US only), Zip Code
- "Tell us your story" (free text)
- "I would like to hear more about" → CPA, CPE, CMA, CIA, EA, CFP
- "Query Type" → Sales Query | Support Query | B2B Query
- 3 consent checkboxes (calls/texts/emails)

**CRITICAL GAP**: Current B2B form only routes to Andy M. — no intelligent routing. This is exactly what the new RFI form replaces.

---

### B2B Audience Segments (who buys for their org)

| Segment | Becker Offering | Routes To |
|---|---|---|
| Accounting Firms (Big 4, regional, local) | CPA/CPE bulk seats, firm training | Global Firms (26+), Inside Sales (<25) |
| Corporations / Healthcare / Banks / Fin Inst | Staff CPE, exam prep for finance teams | NCA (26+), Inside Sales (<25) |
| Consulting Firms | Staff training, CPA/CPE | Global Firms (all sizes) |
| CPA Alliances | Member licensing, group pricing | Global Firms (all sizes) |
| Government Agencies / NFPs | CPE compliance, audit training | NCA (26+), Inside Sales (<25) |
| Societies/Chapters | Member CPE benefits | University team (all sizes) |
| Non-US Organizations | International bulk | International (all sizes) |
| Universities | Faculty access, student discounts, bridge programs | University team (all sizes) |

---

### B2C Audience Segments (individual buyers)
- CPA exam candidates (students, recent grads, career changers)
- Active professionals maintaining CPE credits
- CIA/CMA/EA candidates
- Current Becker students upgrading packages
- Role types: Undergrad Student, Grad Student, Professor, Supervisor/Director/Manager, Partner/CEO/CFO, Staff Accountant, Administrator, Learning/Training Leader

---

### Key Website Insights for RFI Routing

1. **"Find Your Organization"** (node/1051) — existing B2B billing portal, shows org already has Becker relationship
2. **Concierge is US-only** — flag if international B2C lead selects high-end products
3. **Pass Guarantee is B2C only** — not available for employer-paid purchases
4. **CFP** is in the contact form product list but not prominently on site — likely legacy or new product
5. **CPE is the primary B2B product** — firms buy CPE subscriptions for teams at scale
6. **CPA is the primary B2C product** — individual exam prep
7. **LiveOnline is add-on/included** in Pro/Concierge, also sold separately at $699/bundle
8. **B2B query type already exists** in current form but goes nowhere useful

---

### Sitemap Key Sections
- `/cpa-exam-courses/` — CPA packages (advantage, premium, pro)
- `/cma-exam-courses/` — CMA packages
- `/cia-exam-review/` — CIA packages
- `/ea-review/` — EA packages
- `/cpe/catalog` — 942+ CPE courses
- `/cpa-review/liveonline` — LiveOnline classes
- `/concierge` — Top-tier CPA package
- `/pass-guarantee` — Guarantee policy
- `/contact-us` — Current RFI form (to be replaced/enhanced)

---

## ═══════════════════════════════════════════════════════
## FORM UX — 3-STEP WIZARD (from image mockup)
## ═══════════════════════════════════════════════════════

Header: "Typical reply within 1 business hour" (green badge)
Title: "How can we help?"
Sub: "Tell us a little about yourself and we'll connect you with the right person."
Progress: Step 1 of 3

### Step 1 — Intent (4 cards)
| Card | Label | Sub-label | Maps to |
|---|---|---|---|
| 🎓 | I'm exploring courses | Interested in CPA, CMA, EA, CIA, CPE, or CFP | Exploring path |
| ✅ | I'm ready to enroll | I know what I want and need to get started | Ready-to-enroll path |
| 📋 | I'm buying for my team | Firm, corporation, university, or government | B2B path |
| 🔧 | I need student support | I'm already enrolled and need help | Support path |

Bottom escape: "Not ready to talk? Explore on your own first."
→ [Try a free CPA demo] [Browse CPE courses] [View CMA packages]

### Step 2 — Context (conditional per intent)
- All paths: Program of interest (multi-select picklist)
- B2B path only: Company name, Org type, Team/org size, Phone
- Exploring/Ready: State/Province, Role type, Org name
- B2C: Graduation year (if student), Current Becker student? toggle

### Step 3 — Contact + Consent
- First name, Last name, Email, Phone
- Marketing opt-in (CommSubscriptionConsent — CDM model, NOT just a checkbox)
- Privacy acknowledgment

---

## ═══════════════════════════════════════════════════════
## SALESFORCE FIELD MAPPING SPEC (from image field doc)
## ═══════════════════════════════════════════════════════

**Summary:** 7 Required | 9 Optional | 3 System | 2 Consent Sets

### Core Identity — All Paths
| Form Field | SF Field | Status | Notes |
|---|---|---|---|
| First name | FirstName | Required | Standard Lead, ISBLANK validation |
| Last name | LastName | Required | Standard Lead, ISBLANK validation |
| Email address | Email | Required | Primary SFMC identifier, must contain @ |
| Phone number | Phone | Optional | Required for B2B path |

### Intent & Journey Qualification — All Paths
| Form Field | SF Field | Status | Notes |
|---|---|---|---|
| Intent card selection | LeadSource | Required | Maps to LeadSource picklist. Also populates Program_of_Interest__c |
| Program of interest | Program_of_Interest__c | Required | Multi-select: CPA Demo, CMA Demo, CPE Free Demo Takers, etc. Fires SFMC journey entry event |
| Lead segment | Lead_Status__c / CRM_Status__c | Required | Values: Exploring / Ready / B2B / Support |

### Consent — All Paths
| Form Field | SF Field | Status | Notes |
|---|---|---|---|
| Marketing opt-in | CommSubscriptionConsent | Required | Must create CommSubscriptionConsent record in CDM model for commercial sends. NOT a simple checkbox. Link to ContentProvider |
| Privacy acknowledgment | Privacy_Consent__c | Optional | Links to Privacy Policy |

### System-Captured (Auto, Not Shown on Form)
| Field | SF Field | Notes |
|---|---|---|
| UTM params | LeadSource_Detail__c | Capture utm_source, utm_medium, utm_campaign from URL |
| Brand | Brand__c | Auto-set = "Becker Professional Education Corporation" |
| Timestamp | CreatedDate | Auto-populated |

### B2B-Only Fields (shown on team/firm path)
| Form Field | SF Field | Status | Notes |
|---|---|---|---|
| Company / Org name | Company | Required | Attempt dedup match against existing Account Name before creating new Lead |
| Organization type | Organization_Type__c | Required | Key B2B field (currently "deferred-yes" in SF doc — needs activation) |
| Team / org size | Organization_Size__c | Required | Values: 1-10 / 11-25 / 26-50 / 51-100 / 101-250 / 251-500 / 500+ |
| Phone | Phone | Required | B2B reps need phone to reach decision-maker |

### Optional Enrichment (shown but not required)
| Form Field | SF Field | Notes |
|---|---|---|
| Message / notes | Description | Context for reps before first call |
| Preferred learning modality | lms__Preferred_Learning_Modality__c | Maps to content personalization, show as radio buttons |
| Year in school / education level | Year_in_School__c | Conditional — relevant for university partnership journeys |

---

## ═══════════════════════════════════════════════════════
## SFMC JOURNEY TRIGGER MAP
## ═══════════════════════════════════════════════════════

| Program_of_Interest__c value | Journey Entry Event |
|---|---|
| CPA | CPA Demo journey |
| CMA | CMA Demo journey |
| CPE | CPE Free Demo Takers journey |
| CIA | CIA journey (TBD) |
| EA | EA journey (TBD) |
| B2B (any program) | B2B nurture journey (separate from B2C) |
| Student Support | Support ticket flow, not SFMC nurture |

Also: "6 months from sitting" journey — triggered by journey stage field
- Lead_Status = "Ready to enroll" + exam_date proximity → 6-month journey

---

## ═══════════════════════════════════════════════════════
## FULL AUTOMATION ARCHITECTURE — WHAT WE'RE BUILDING
## ═══════════════════════════════════════════════════════

### Layer 1: Smart Form (Frontend)
- 3-step wizard embedded on becker.com/contact-us (or new page)
- Step 1: Intent card (4 options)
- Step 2: Conditional fields per intent
- Step 3: Contact info + CDM-compliant consent
- UTM params captured on page load, passed with submission
- "Typical reply within 1 business hour" SLA promise shown upfront

### Layer 2: Lead Creation API / Handler
- Receives form POST
- Validates required fields
- Deduplication check: match Email OR Company against existing SF Contacts/Accounts
  - If match found → update existing record, don't create duplicate Lead
  - If no match → create new Lead
- Sets Brand__c = "Becker Professional Education Corporation"
- Sets all SF fields from mapping spec above
- Creates CommSubscriptionConsent record (CDM model, 14 subscription channel types)
- Captures CreatedDate timestamp (SLA clock starts here)

### Layer 3: Routing Engine (the Excel matrix as code)
```
INPUT: intent_path, org_type, org_size, state, existing_account_owner
OUTPUT: queue_name, rep_name (Phase 2), priority

RULES:
if intent_path == "B2B":
  if existing_account_owner → assign to account_owner
  else → lookup routing_matrix[org_type][org_size] → queue
  if queue == "NCA" and phase == 2:
    → lookup territory_matrix[state][account_type] → specific_rep
  if no match → default Inside Sales

if intent_path in ["Exploring", "Ready"]:
  → Lead_Status = intent_path
  → no queue assignment, goes to nurture journey

if intent_path == "Support":
  → route to support queue, not sales
  → skip SFMC sales journey
```

### Layer 4: SFMC Journey Trigger
- After Lead is created + routed → call SFMC API entry event
- Pass: email, program_of_interest, lead_status, brand
- SFMC fires appropriate journey (CPA Demo, CMA Demo, CPE Demo, etc.)
- B2B leads go into separate B2B nurture sequence

### Layer 5: SLA Monitor
- Track time from Lead.CreatedDate to first rep activity
- SLA target: 1 business hour
- Alert if breach: Slack/email to queue manager
- Dashboard: SLA compliance % by team, by week

### Layer 6: Analytics & Baselines
- Since there are NO historical B2B baselines, we establish them from day 1:
  - Lead volume by type (B2B/B2C/Exploring/Support)
  - Lead volume by program (CPA/CMA/CIA/EA/CPE/CFP)
  - Lead volume by queue (all 6 teams)
  - Conversion rate: Lead → Opportunity → Won
  - SLA compliance rate per team
  - Source attribution (UTM → campaign → lead → revenue)
- Owner: Jackie Hartwig + Annette Lee (KPIs), Shital Patil (SF data)

---

## ═══════════════════════════════════════════════════════
## CRITICAL OPEN QUESTIONS (must resolve before build)
## ═══════════════════════════════════════════════════════

1. **Deduplication logic** — Who owns the rule for matching a submission against existing Person Account? Angel Cichy (SF admin) must define this before launch or support submissions will pollute Lead pipeline
2. **CommSubscriptionConsent CDM** — Angel needs to confirm 14 subscription channel types are configured in SF. A generic checkbox does NOT meet this standard
3. **Organization_Type__c and Organization_Size__c** — Currently "deferred-yes" in SF field doc. Angel must activate/create these custom fields
4. **B2C routing rules** — Not defined in Excel. Are B2C leads (Exploring/Ready) routed to a queue or just go into SFMC nurture with no rep assignment?
5. **Phase Two territory rep assignment** — Full logic for NCA not yet defined. Needs input from Angelique Watson (NCA manager)
6. **SLA enforcement** — Who gets alerted when 1-hour SLA is breached? Needs ops alignment
7. **Support path routing** — "Student support" intent → goes to support queue or CS&E team?
8. **International B2C** — If B2C lead is outside US, does it go to International team or just SFMC nurture?
9. **CFP** — Is this product line active? Show on form or not?
10. **SFMC journey names** — Need exact entry event API names from SFMC admin to wire triggers

---

## ═══════════════════════════════════════════════════════
## SOURCE FILES
## ═══════════════════════════════════════════════════════

- Excel: `/Users/anmolsam/Downloads/RFI Mapping 2.23.26.xlsx`
- CSV (Tab 1 only): `/Users/anmolsam/Downloads/RFI Mapping 2.23.csv`
- Website: https://www.becker.com (scanned 2026-04-16, all major pages)
- Form mockup: `/Users/anmolsam/Downloads/image (10).png` (3-step wizard, Step 1 of 3)
- SF field spec: `/Users/anmolsam/Downloads/image (9).png` (7 required + 9 optional + 3 system + 2 consent)
- Transcript: Meeting with Josh Elefante, Monica Callahan, Angel Cichy, Shital Patil (2026-04-16)
