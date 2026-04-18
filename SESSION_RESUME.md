# Becker RFI Agent — Complete Session Context
## Cold-Start Document for Any Agent, Developer, or Terminal
### Last Updated: 2026-04-17 | Author: Sam Chaudhary

> **Use this file to resume any work on this project from scratch.**
> Any AI agent should read this BEFORE touching any code or SF.

---

## What This Project Is

A 3-step React wizard form embedded on `becker.com/contact-us` that:
1. Captures lead intent (Exploring / Ready to Enroll / B2B / Support)
2. Routes B2B leads to 6 Salesforce queues via org type × size matrix
3. Writes to `ExternalWebform__c` in Salesforce → existing SF Flow handles all record creation
4. Fires SFMC confirmation email + campaign membership for program nurture

**The problem it solves:** All Becker contact form submissions currently go to Andy M. with zero intelligence. This replaces that with a smart segmented intake.

---

## Repo

```
GitHub:  https://github.com/samcolibri/becker-rfi-agent
Local:   ~/becker-rfi-agent/
Deploy:  Railway (live) — https://becker-rfi-agent.up.railway.app
Dashboard: https://samcolibri.github.io/becker-rfi-agent/
```

---

## Run From Any Terminal

```bash
# 1. Clone
git clone https://github.com/samcolibri/becker-rfi-agent.git
cd becker-rfi-agent

# 2. Set environment variables (see .env.example for all keys)
cp .env.example .env
# Fill in: SF_PASSWORD, and SFMC creds when available

# Required env vars:
export SF_LOGIN_URL=https://test.salesforce.com
export SF_API_VERSION=v59.0
export SF_USERNAME=sam.chaudhary@colibrigroup.com.bpedevf
export SF_PASSWORD=<password>
export SF_SECURITY_TOKEN=<token>

# 3. Install + build
npm install
npm run build:client     # builds React → public/

# 4. Run
npm start                # server on :3000
open http://localhost:3000

# 5. Test routing engine (no SF needed)
npm test                 # 27 tests, all should pass

# 6. Refresh live dashboard
node scripts/update-dashboard.js --push
```

---

## Architecture — How It Works End to End

```
FORM SUBMIT (becker.com/contact-us)
  ↓
POST /api/submit  (Express, src/server.js)
  ↓
Step 1: Email validation (src/email-validator.js)
  → isLikelySpam() — pattern check + disposable domain
  → Hunter.io API — verify deliverable
  → REJECT if invalid — no SF record created

Step 2: Routing engine (src/routing-engine.js) — B2B ONLY
  → routeLead(submission) → suggestedQueue
  → Pure function, 27 unit tests, no network
  → Org type × employee count → 1 of 6 queues

Step 3: Write to ExternalWebform__c (src/sf-client.js)
  → SOAP login (no Connected App needed)
  → POST /sobjects/ExternalWebform__c with all fields
  → SF Flow CreateCaseLeadandOpportunity.v2 fires automatically
  → Flow handles: dedup by email, Lead/Opp/Case creation, OwnerId from SuggestedQueue__c

Step 4: SFMC confirmation email (src/sfmc-client.js)
  → fireJourneyEntry() → "Confirmation Email" journey
  → < 20 min SLA, all paths

Step 5: Campaign membership
  → Campaign__c written on ExternalWebform record
  → MC Connect syncs to SFMC for program nurture emails
```

---

## Salesforce Connection

```
Type:         SOAP login (no Connected App)
Login URL:    https://test.salesforce.com  (sandbox: bpedevf)
Prod URL:     https://login.salesforce.com (when Angel creates prod creds)
Username:     sam.chaudhary@colibrigroup.com.bpedevf
Org:          Becker Professional Education (Unlimited Edition, USA654S)
Instance:     https://becker--bpedevf.sandbox.my.salesforce.com
API Version:  v59.0

# Test connection:
node -e "require('dotenv').config(); require('./src/sf-client').searchAccounts('Deloitte').then(console.log)"
```

---

## ExternalWebform__c — Field Mapping

### Fields that EXIST today (confirmed via SF describe API)
```
Email__c                                   ← email
First_Name__c                              ← firstName
Last_Name__c                               ← lastName
Phone__c                                   ← phone
Company__c                                 ← orgName
Primary_Interest__c                        ← productInterest
Address__StateCode__s                      ← state
YearInSchool__c                            ← graduationYear
email_address_you_use_to_login_to_Becker__c ← beckerStudentEmail
BusinessBrand__c                           = 'Becker Professional Education Corporation'
Lead_Source_Form__c                        = 'Web - Contact Us Form'
Lead_Source_Form_Date__c                   = new Date().toISOString()
Campaign__c                                ← getCampaignId(intentPath, productInterest)
Consent_Provided__c                        ← consentGiven ? 'Commercial Marketing' : null
Consent_Captured_Source__c                 = 'RFI Form — becker.com/contact-us'
Privacy_Consent_Status__c                  ← privacyConsent ? 'Accepted' : null
If_other__c                                ← message (support path)
```

### Fields MISSING — Angel Cichy must create in SF Setup
```
IntentPath__c      Picklist   exploring | ready | b2b | support
OrganizationType__c Picklist  Accounting Firm | Corp/Healthcare/Bank/Financial Institution | Consulting Firm | CPA Alliance | Government Agency/Not-for-Profit | Society/Chapter | Non-US Organization | Student | University | Other
RoleType__c        Picklist   Undergrad Student | Grad Student | Professor | Supervisor/Director/Manager | Partner/CEO/CFO | Administrator | Unemployed | Learning/Training Leader | Staff Accountant | Other
OrgSizeCategory__c Picklist   <25 | 26-100 | 101-250 | 251+
SuggestedQueue__c  Text(100)  Free text — routing engine writes queue name here
LeadSourceDetail__c Text(255) UTM params string
QueryType__c       Picklist   Sales Query | Support Query
```

---

## B2B Routing Matrix (source of truth — also in routing-engine.js)

| Org Type | <25 | 26-100 | 101-250 | 251+ |
|---|---|---|---|---|
| Accounting Firm | Inside Sales | Global Firms | Global Firms | Global Firms |
| Corp/Healthcare/Bank/Fin Inst | Inside Sales | New Client Acquisition | New Client Acquisition | New Client Acquisition |
| Consulting Firm | Global Firms | Global Firms | Global Firms | Global Firms |
| CPA Alliance | Global Firms | Global Firms | Global Firms | Global Firms |
| Gov Agency/NFP | Inside Sales | New Client Acquisition | New Client Acquisition | New Client Acquisition |
| Society/Chapter | University | University | University | University |
| Non-US Organization | International | International | International | International |
| Student | Inside Sales | Inside Sales | Inside Sales | Inside Sales |
| University | University | University | University | University |
| Other | Inside Sales | Inside Sales | Inside Sales | Inside Sales |

**Special rule:** If email matches existing Business Account → both Lead + Opp assigned to BA Owner, ignoring matrix.

---

## Campaign ID Mapping (confirmed 2026-04-17)

| Intent | Product | SF Campaign ID |
|---|---|---|
| B2C | Certified Public Accountant | 7013r000001l0CwAAI |
| B2C | Certified Management Accountant | 7013r000001l0DBAAY |
| B2C | Continuing Professional Education | 7013r000001l0D6AAI |
| B2C | Certified Internal Auditor | 701VH00000coo8bYAA |
| B2C | Enrolled Agent | 701VH00000cnfxAYAQ |
| B2C | Certified Financial Planner | 701VH00000tZNTXYA4 |
| B2C | Staff Level Training | 701VH00000tZPTiYAO |
| B2C | CIA Challenge Exam | 701VH00000tZQ6QYAW |
| B2B | All products | 701VH00000tZOSqYAO |
| Support | — | null |

Logic: `getCampaignId(intentPath, productInterest)` in `src/lead-processor.js`

---

## Key Architectural Decisions (DO NOT CHANGE without reviewing)

1. **ExternalWebform__c is entry point** — NOT direct Lead creation. SF Flow handles everything downstream.
2. **SF Flow CreateCaseLeadandOpportunity.v2** — Huma Yousuf owns this Flow. It handles dedup, Lead/Opp/Case, OwnerId assignment.
3. **SuggestedQueue__c** — Routing engine writes queue name here. Flow reads it to set OwnerId.
4. **No Connected App needed** — SOAP login only requires username + password + security token.
5. **No Concierge hardcode** — B2C Ready goes to same program-matched campaign as Exploring. Concierge = CPA product only.
6. **Campaign__c drives SFMC** — MC Connect syncs Campaign Members → SFMC email sends. No Journey entry event keys needed initially.

---

## Stakeholders (do not contact without Sam's approval)

| Person | Company | Role | What they own |
|---|---|---|---|
| Angel Cichy | Becker/Colibri | SF Admin | Create 7 fields, confirm picklist values, SF Connected App creds |
| Huma Yousuf | Becker/Colibri | SF Developer | Update SF Flow, confirm assignment rules inactive |
| Monica Callahan | Becker/Colibri | Business Owner | Architecture approval (sent 2026-04-16) |
| Josh Elefante | Becker/Colibri | Product Lead | Form UX sign-off (sent 2026-04-16) |
| Nick Leavitt | Becker/Colibri | SFMC / Campaigns | Post-form nurture journey definitions |
| Dakshesh | 5X | Drupal Team | React form embed on becker.com |

---

## Blockers Before Go-Live (in order)

1. **[P0] Angel: create 7 fields on ExternalWebform__c** → unblocks live submission test
2. **[P0] Angel + Huma: SF Connected App creds + SFMC creds** → unblocks Railway prod deploy
3. **[P1] Huma: update SF Flow** → unblocks automatic lead routing
4. **[P1] Monica + Josh: architecture approval** → unblocks official launch
5. **[P2] Sam: intro Dakshesh** → unblocks becker.com embed
6. **[P2] Nick: post-form journey definitions** → unblocks SFMC nurture

---

## Files of Record

```
src/server.js           Express API — POST /api/submit, GET /api/accounts, GET /health
src/lead-processor.js   Orchestration — email validate → route → create webform → email
src/sf-client.js        SOAP login + all SF CRUD operations
src/sfmc-client.js      SFMC Journey Builder API client (11 journeys, token caching)
src/routing-engine.js   Pure routing function — org type × size → queue (27 unit tests)
src/email-validator.js  Hunter.io + spam pattern filter
client/src/app/App.tsx  React 3-step wizard (Becker Figma design, Framer Motion)
tests/                  27 routing engine unit tests
docs/index.html         Living project dashboard (GitHub Pages)
docs/data.json          Dashboard data — refresh: node scripts/update-dashboard.js --push
scripts/update-dashboard.js  Pulls live SF data → updates dashboard → git push
ARCHITECTURE.md         Full architecture for stakeholder review
SETUP.md                Step-by-step deployment guide
EXECUTIVE_SUMMARY.md    Non-technical stakeholder summary
```

---

## Railway Deployment

```bash
# Install Railway CLI (if not installed)
brew install railway

# Login
railway login

# Link to project (first time)
railway init   # or: railway link

# Set all env vars
railway variables set SF_LOGIN_URL=https://test.salesforce.com
railway variables set SF_USERNAME=sam.chaudhary@colibrigroup.com.bpedevf
railway variables set SF_PASSWORD=<password>
railway variables set SF_SECURITY_TOKEN=<token>
# ... (set all vars from .env.example)

# Deploy
railway up

# Logs
railway logs

# Health check
curl https://becker-rfi-agent.up.railway.app/health
```

---

## Quick Smoke Test (after deploy)

```bash
# 1. Health
curl https://becker-rfi-agent.up.railway.app/health

# 2. Account search
curl "https://becker-rfi-agent.up.railway.app/api/accounts?q=Deloitte"

# 3. Full form submission (B2B path)
curl -X POST https://becker-rfi-agent.up.railway.app/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "Submission",
    "email": "test@testfirm.com",
    "intentPath": "b2b",
    "orgName": "Test Accounting Firm",
    "orgType": "Accounting Firm",
    "orgSize": "26-100",
    "productInterest": "Certified Public Accountant",
    "roleType": "Partner/CEO/CFO",
    "consentGiven": true,
    "privacyConsent": true
  }'
# Expected: { "status": "created", "webformId": "a7I...", "queue": "Global Firms" }
```

---

## If You Are an AI Agent Reading This

1. **Do not create Leads directly** — always write to ExternalWebform__c
2. **Do not modify the routing matrix** without re-running the 27 unit tests
3. **Do not add SFMC journey keys** until Nick Leavitt confirms post-form journeys
4. **Do not deploy to prod SF** until Monica + Josh approve
5. **SOAP login** — use `src/sf-client.js`, no Connected App needed
6. **Session resume** — the dashboard at https://samcolibri.github.io/becker-rfi-agent/ shows current blockers and field status live

---

*Generated: 2026-04-17 | Repo: github.com/samcolibri/becker-rfi-agent*
