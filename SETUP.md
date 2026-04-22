# Becker RFI Agent — Setup & Go-Live Guide

This document lists every prerequisite, credential, and configuration step needed before the system can process live form submissions. Work through each section in order — the system cannot run without the items marked **REQUIRED**.

---

## Prerequisites Checklist

### 1. Salesforce — Custom Fields (Angel Cichy)

All fields go on the **Lead** object unless noted. Angel must create these in both the SF org and the Farside CDM where indicated.

| Field API Name | Label | Type | Picklist Values | CDM? |
|---|---|---|---|---|
| `Organization_Type__c` | Organization Type | Picklist | Accounting Firm · Corp/Healthcare/Bank/Financial Institution · Consulting Firm · CPA Alliance · Gov Agency/Not-for-Profit · Society/Chapter · Non-US Organization · Student · University · Other | **Yes — Farside** |
| `Organization_Size__c` | Organization Size | Picklist | 1-10 · 11-25 · 26-50 · 51-100 · 101-250 · 251-500 · 500+ | No |
| `HQ_State__c` | HQ State / Province | Text(50) | Free text | No |
| `Role_Type__c` | Role Type | Picklist | Undergrad Student · Grad Student · Professor · Supervisor/Director/Manager · Partner/CEO/CFO · Administrator · Unemployed · Learning/Training Leader · Staff Accountant · Other | No |
| `Graduation_Year__c` | Graduation Year | Text(10) | Free text; "0000" = already graduated | No |
| `Becker_Student_Email__c` | Becker Student Email | Email | — | No |
| `Brand__c` | Brand | Text(100) | System-set; no picklist needed | No |
| `LeadSource_Detail__c` | Lead Source Detail | Text(255) | System-set; stores UTM params | No |
| `CreatedDate_RFI__c` | RFI Created Date | DateTime | System-set | No |

**Also required:** Confirm that `CommSubscriptionConsent__c` object exists with these fields:
- `Lead__c` (Lookup to Lead)
- `Email__c` (Email)
- `ConsentGiven__c` (Checkbox)
- `ConsentCapturedDateTime__c` (DateTime)
- `ConsentCapturedSource__c` (Text)
- `Brand__c` (Text)
- `SubscriptionChannel__c` (Picklist — "Commercial Marketing" must be a value)

---

### 2. Salesforce — Queue Names (Angel Cichy — BLOCKING)

The routing engine assigns leads to queues by name via SOQL. Provide the **exact API Name** of each queue as it exists in SF Setup → Queues.

| Routing Engine Name | SF Queue Name (confirm or correct) |
|---|---|
| `Inside Sales` | __________________ |
| `Global Firms` | __________________ |
| `New Client Acquisition` | __________________ |
| `University` | __________________ |
| `International` | __________________ |
| `Customer Success & Expansion` | __________________ |
| `Support Tier 1` | __________________ |

Once confirmed, if any names differ, provide the correct names and the engine will be updated in a single pass (all queue names are in one constant object in `src/routing-engine.js`).

---

### 3. Salesforce — Existing Lead Assignment Rules (Huma — BLOCKING)

Huma noted on the call: "currently we have certain lead assignment rules in the system, we are not utilizing it, but we can definitely... we have implemented in the past."

> ⚠️ **If any existing SF lead assignment rules are active, they will override the API's `OwnerId` PATCH calls and silently break all routing.**

Before go-live, Huma must:
1. SF Setup → Lead Assignment Rules → confirm whether any rules are currently active (checkbox: "Default")
2. If active rules exist: either deactivate them, or confirm they won't conflict with API-set OwnerId values
3. The routing engine sets `OwnerId` directly via `PATCH /sobjects/Lead/{id}` — SF assignment rules run after record creation, not after a PATCH, so they should not interfere. But confirm this with a smoke test: create a test lead via API, verify OwnerId matches the queue the engine assigned

---

### 4. Salesforce — Queue List Views (Angel Cichy)

Monica described this at 10:41: *"We would create views for each of the teams. Each team would be able to see any lead that is assigned either to the queue or to a sales rep who is in that queue."*

Angel/Huma must create a **Lead List View** for each of the 6 sales queues:
- Filter: `Owner = [Queue Name]` OR `Owner = [Rep in that team]` AND `IsConverted = false`
- Columns to include: Name, Company, Organization Type, Organization Size, Program of Interest, Lead Status, Created Date
- Share each view with the relevant queue group

This is an SF admin configuration task, not code.

---

### 5. Salesforce — Connected App (Angel + Huma)

The API uses OAuth 2.0 password flow. A Connected App must exist in the SF org:

1. SF Setup → App Manager → New Connected App
2. Enable OAuth Settings
3. Scopes: `api`, `refresh_token`
4. Note: Consumer Key (`SF_CLIENT_ID`) and Consumer Secret (`SF_CLIENT_SECRET`)

**API service user required:**
- Username: `api_user@beckerprofessional.com` (or equivalent)
- Profile: must have permissions to: Create Lead, Create Case, Create CommSubscriptionConsent, Update Lead OwnerId, Query Group (queues), Query User
- Security token: found in user's personal settings → Reset My Security Token

---

### 6. Salesforce Marketing Cloud — Server-to-Server Package (SFMC admin)

1. SFMC Setup → Installed Packages → New Package
2. Add component: API Integration → Server-to-Server
3. Scopes needed: `Journeys: Read, Write, Execute`
4. Note: Client ID, Client Secret, MID (Account ID), Auth Base URL, REST Base URL

---

### 7. SFMC — Journey Entry Event Keys (SFMC admin)

For each journey below, go to Journey Builder → open the journey → Entry Source → API Entry Event → copy the **Event Definition Key**.

| Journey Name | Event Definition Key | Env Variable |
|---|---|---|
| Confirmation Email | | `SFMC_EVENT_CONFIRMATION` |
| CPA Demo Journey | | `SFMC_EVENT_CPA` |
| CMA Demo Journey | | `SFMC_EVENT_CMA` |
| CPE Free Demo Takers | | `SFMC_EVENT_CPE` |
| CIA Demo Journey | | `SFMC_EVENT_CIA` |
| EA Demo Journey | | `SFMC_EVENT_EA` |
| CFP Demo Journey | | `SFMC_EVENT_CFP` |
| Concierge Day One | | `SFMC_EVENT_CONCIERGE` |
| B2B Nurture Journey | | `SFMC_EVENT_B2B` |
| General Nurture Journey | | `SFMC_EVENT_GENERAL` |
| CSAT Survey | | `SFMC_EVENT_CSAT` |

**If any of these journeys don't exist yet:** they need to be created in Journey Builder with an API Entry Source before the env variable will work. The routing engine will log a warning (not throw) if a key fires an event that doesn't exist in SFMC.

---

### 8. Hunter.io API Key (Sam)

Used for email deliverability verification and spam filtering.

1. Create account at hunter.io
2. API Keys → Create key
3. Free tier: 25 requests/month. Paid from $49/month.
4. Set as `HUNTER_API_KEY` in `.env`

---

## Local Development Setup

```bash
# Clone the repo
git clone https://github.com/samcolibri/becker-rfi-agent.git
cd becker-rfi-agent

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Fill in all values in .env (see sections above)

# Run tests (routing engine — no credentials needed)
npm test
# Expected: 27 tests passing

# Start development server
npm start
# Server runs on http://localhost:3000

# Test the form
open http://localhost:3000/form.html

# Test the API directly
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane.smith@bigfirm.com",
    "intentPath": "b2b",
    "orgType": "Accounting Firm",
    "orgSize": "101-250",
    "state": "NY",
    "productInterest": "Certified Public Accountant",
    "consentGiven": true
  }'
```

---

## Environment Variables Reference

Copy `.env.example` to `.env` and fill in all values:

```bash
# Hunter.io
HUNTER_API_KEY=

# Server
PORT=3000
NODE_ENV=production

# Salesforce
SF_INSTANCE_URL=https://your-org.my.salesforce.com
SF_API_VERSION=v59.0
SF_CLIENT_ID=
SF_CLIENT_SECRET=
SF_USERNAME=
SF_PASSWORD=
SF_SECURITY_TOKEN=

# Salesforce Marketing Cloud
SFMC_AUTH_BASE_URL=https://YOUR_MID.auth.marketingcloudapis.com
SFMC_REST_BASE_URL=https://YOUR_MID.rest.marketingcloudapis.com
SFMC_CLIENT_ID=
SFMC_CLIENT_SECRET=
SFMC_ACCOUNT_ID=

# SFMC Journey Entry Event Keys
SFMC_EVENT_CONFIRMATION=
SFMC_EVENT_CPA=
SFMC_EVENT_CMA=
SFMC_EVENT_CPE=
SFMC_EVENT_CIA=
SFMC_EVENT_EA=
SFMC_EVENT_CFP=
SFMC_EVENT_CONCIERGE=
SFMC_EVENT_B2B=
SFMC_EVENT_GENERAL=
SFMC_EVENT_CSAT=
```

---

## Deployment

The server is a standard Node.js Express app. It can run on any Node.js-capable host (EC2, Azure App Service, Heroku, or any VPS):

```bash
npm install
npm run build:client
npm start               # serves on PORT env var (default 3000)
```

Set all environment variables from `.env.example` on the host before starting.

**AWS / Azure / GCP:** any container or Node.js runtime works. The app listens on `process.env.PORT || 3000`.

**Health check endpoint:** `GET /health` → `{"status":"ok","ts":"..."}` — use this for uptime monitoring.

---

## Smoke Test Checklist (Huma — post-deploy to stage)

Run each test case and verify the expected SF record and SFMC event.

| Test | Input | Expected SF | Expected SFMC |
|---|---|---|---|
| B2B Accounting Firm <25 | orgType=Accounting Firm, orgSize=<25 | Lead, Owner=Inside Sales queue | Confirmation + B2B Nurture |
| B2B Accounting Firm 101+ | orgType=Accounting Firm, orgSize=101-250 | Lead, Owner=Global Firms queue | Confirmation + B2B Nurture |
| B2B Corp 26+ | orgType=Corp/Healthcare..., orgSize=26-100 | Lead, Owner=NCA queue | Confirmation + B2B Nurture |
| B2C CPA Exploring | intentPath=exploring, program=CPA | Lead, no queue | Confirmation + CPA Demo Journey |
| B2C Ready to Enroll | intentPath=ready | Lead, no queue | Confirmation + Concierge Day One |
| Student Support | intentPath=support | Case, CS&E queue | Confirmation only |
| Spam email | email=test@mailinator.com | REJECTED — no SF record | No SFMC event |
| Duplicate email | same email as existing lead | Updated existing lead | No duplicate record |
| Non-US org | orgType=Non-US Organization | Lead, International queue | Confirmation + B2B Nurture |

---

## UAT Sign-Off (Monica / Angel / Josh)

After stage passes smoke tests:

- [ ] Monica: test B2B path with 3+ different org types
- [ ] Aaron: test B2C Exploring and Ready paths
- [ ] Haley: test Student Support path (sandbox access required)
- [ ] Angel: verify SF Lead fields populated correctly on each test record
- [ ] Angel: verify CommSubscriptionConsent record created on each consent submission
- [ ] Josh: review confirmation email content and timing

---

## Post-Launch Monitoring

| Metric | How to check |
|---|---|
| Form submission rate | SF report: Leads by CreatedDate_RFI__c + LeadSource |
| Routing accuracy | SF report: Leads by OwnerId / Queue, grouped by Organization_Type__c |
| SFMC journey entry rate | SFMC Journey Builder → journey analytics |
| Confirmation email delivery rate | SFMC Email Send → delivery report |
| Lead → first activity time | Huma's SF report (baseline for SLA targets) |
