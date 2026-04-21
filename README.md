# Becker RFI Agent

Smart lead intake and routing system for Becker Professional Education.

Replaces the current Contact Us form (all submissions → one person, zero intelligence) with a segmented 3-step wizard that creates Salesforce Lead records, routes B2B leads to the correct team queue, sets Communication Subscriptions per product interest, and fires SFMC nurture journeys on submission.

**Repo:** https://github.com/samcolibri/becker-rfi-agent  
**Sandbox:** becker--bpedevf.sandbox.my.salesforce.com  
**Status:** ✅ E2E verified in sandbox — awaiting production deploy

---

## Run locally in 5 minutes

### 1. Clone and install

```bash
git clone https://github.com/samcolibri/becker-rfi-agent.git
cd becker-rfi-agent
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your Salesforce credentials:

```env
SF_LOGIN_URL=https://test.salesforce.com        # sandbox
# SF_LOGIN_URL=https://login.salesforce.com     # production

SF_USERNAME=your.api.user@yourorg.com.sandbox   # sandbox username format
SF_PASSWORD=YourPassword
SF_SECURITY_TOKEN=YourSecurityToken             # from SF: My Settings → Personal → Reset My Security Token

SF_API_VERSION=v59.0
```

> **Minimal setup:** Only the four SF variables above are required to submit leads and test routing.
> SFMC and Hunter.io variables are optional — the form works without them (those steps are skipped gracefully).

### 3. Build the form UI

```bash
npm run build:client
```

This compiles the React 3-step wizard into `public/`. Only needs to be run once (or after UI changes).

### 4. Run tests (no credentials needed)

```bash
npm test
```

Runs 23 routing engine unit tests — pure logic, no network calls. All should pass.

### 5. Start the server

```bash
npm start
```

Open **http://localhost:3000** — the full form is live.

```
http://localhost:3000          → 3-step wizard form
http://localhost:3000/health   → health check
```

### 6. Submit a test lead

Fill the form or use the API directly:

```bash
curl -s -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane@bigfirm.com",
    "intentPath": "b2b",
    "orgType": "Accounting Firm",
    "orgSize": "26-100",
    "state": "IL",
    "productInterest": "Certified Public Accountant",
    "roleType": "Partner/CEO/CFO",
    "orgName": "Smith & Associates CPA",
    "consentGiven": true,
    "privacyConsent": true
  }' | jq .
```

Expected response:
```json
{
  "success": true,
  "message": "Thank you! A Becker Business Solutions representative will be in touch within 48 business hours."
}
```

Check Salesforce → Leads → a new B2B Lead should appear within 30 seconds assigned to the **Global Firms** queue.

---

## What happens on submission

```
Browser form
  → POST /api/submit (Node.js)
    → Spam / bot filter (Hunter.io + pattern matching)
    → Routing engine (org type × employee count → queue name)
    → POST ExternalWebform__c to Salesforce REST API
      → Salesforce Flow fires automatically:
          - Check existing Lead by email (dedup)
          - Create B2B or B2C Lead with correct Record Type
          - Look up queue by RFI_Suggested_Queue__c
          - Assign Lead.OwnerId to queue
          - Set Subscription_id__c per product interest
          - Create CampaignMember if Campaign__c is set
    → SFMC confirmation email fires (if credentials set)
```

---

## Routing matrix

| Org Type | <25 | 26–100 | 101–250 | 251+ |
|---|---|---|---|---|
| Accounting Firm | Inside Sales | **Global Firms** | Global Firms | Global Firms |
| Corp / Healthcare / Bank / Fin Inst | Inside Sales | **NCA** | NCA | NCA |
| Consulting Firm | **Global Firms** | Global Firms | Global Firms | Global Firms |
| CPA Alliance | **Global Firms** | Global Firms | Global Firms | Global Firms |
| Gov Agency / NFP | Inside Sales | **NCA** | NCA | NCA |
| Society / Chapter | **University** | University | University | University |
| Non-US | **International** | International | International | International |
| Student | Inside Sales | Inside Sales | Inside Sales | Inside Sales |
| University | **University** | University | University | University |
| Other | Inside Sales | Inside Sales | Inside Sales | Inside Sales |

B2C → always Inside Sales queue.

---

## Round Robin rep assignment

The routing engine includes `pickRoundRobinRep(queueName)` — stateless, no database needed.

Rotates reps in 15-minute slots across the working day. Rep data lives in `data/sales-reps.json`.

```js
const { routeLead, pickRoundRobinRep } = require('./src/routing-engine');

const routing = routeLead(submission);
const rep = pickRoundRobinRep(routing.queue);
// { name: 'Kristin Curcuru', index: 1, queueName: 'Global Firms', reason: '...' }
```

**To activate round-robin assignment (Huma/Angel action required):**
1. In SF Setup → Queues → each queue → **Add Members** (add the reps from `data/sales-reps.json`)
2. In SF Setup → Lead Assignment Rules → create a rule that routes leads within each queue to individual reps
3. OR: Sam can wire `pickRoundRobinRep()` into `lead-processor.js` to write a rep name to SF directly — contact Sam when queues are populated

---

## Campaign association

Campaigns are automatically set per product interest:

| Product | Campaign ID |
|---|---|
| CPA | `7013r000001l0CwAAI` |
| CMA | `7013r000001l0DBAAY` |
| CPE | `7013r000001l0D6AAI` |
| CIA | `701VH00000coo8bYAA` |
| EA | `701VH00000cnfxAYAQ` |
| CFP | `701VH00000tZNTXYA4` |
| Staff Level Training | `701VH00000tZPTiYAO` |
| CIA Challenge Exam | `701VH00000tZQ6QYAW` |
| B2B (all products) | `701VH00000tZOSqYAO` |

The Salesforce flow creates a `CampaignMember` record linking the Lead to the campaign automatically on insert.

---

## Communication subscriptions

Set automatically on the Lead's `Subscription_id__c` field based on product interest:

| Product | Subscriptions set |
|---|---|
| CPA | CPA Content; CPA Promotions |
| CMA | CMA Content; CMA Promotions |
| CPE | CPE Content; CPE Promotions |
| CIA | CIA Content; CIA Promotions |
| EA | EA Content; EA Promotions |
| B2B (any) | B2B - News and Events; B2B - Events; B2B - New Products |

---

## Deploy to Railway (public URL)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Deploy
railway up

# Set environment variables
railway variables set SF_LOGIN_URL=https://login.salesforce.com
railway variables set SF_USERNAME=your.api.user@org.com
railway variables set SF_PASSWORD=YourPassword
railway variables set SF_SECURITY_TOKEN=YourToken
railway variables set NODE_ENV=production
```

Railway auto-detects the `Dockerfile` and builds the app. The URL will be something like `https://becker-rfi-agent.up.railway.app`.

---

## Embed on becker.com (iframe)

Once deployed, embed on any page with:

```html
<iframe
  src="https://YOUR-RAILWAY-URL.railway.app"
  title="Becker Contact Us"
  width="100%"
  height="750"
  frameborder="0"
  style="border:none;"
></iframe>
```

See [DRUPAL_FORM_BUILD.md](./DRUPAL_FORM_BUILD.md) for full Drupal embed instructions and native Drupal Webform build spec.

---

## Project structure

```
becker-rfi-agent/
├── src/
│   ├── server.js              Express API — POST /api/submit, GET /api/accounts
│   ├── lead-processor.js      Orchestrates routing → SF → SFMC pipeline
│   ├── routing-engine.js      B2B routing matrix + round-robin rep picker
│   ├── sf-client.js           Salesforce REST client (SOAP login, no Connected App needed)
│   ├── sfmc-client.js         SFMC Journey Builder entry events
│   └── email-validator.js     Spam filter + Hunter.io verification
├── client/
│   └── src/app/App.tsx        React 3-step wizard (Figma design)
├── public/                    Built React app (generated by npm run build:client)
├── data/
│   ├── routing-matrix.json    Org type × size → queue (40 rules)
│   ├── sales-reps.json        All 6 teams, all reps (round-robin source)
│   ├── territories.json       NCA 2026 territory map
│   └── dropdowns.json         All picklist values
├── tests/
│   └── routing-engine.test.js 23 unit tests
├── .env.example               All environment variables with comments
├── Dockerfile                 Production container (Railway-ready)
├── railway.toml               Railway deploy config
├── DRUPAL_FORM_BUILD.md       Complete guide for Dakshesh
├── SALESFORCE_REQUIREMENTS.md Field specs + Flow spec for Huma
└── STATUS.md                  Live verified sandbox state
```

---

## API reference

### POST /api/submit

| Field | Type | Required | Notes |
|---|---|---|---|
| `firstName` | string | ✅ | |
| `lastName` | string | ✅ | |
| `email` | string | ✅ | |
| `intentPath` | string | ✅ | `exploring` \| `ready` \| `b2b` \| `support` |
| `consentGiven` | boolean | ✅ | Marketing opt-in |
| `privacyConsent` | boolean | ✅ | Privacy policy |
| `productInterest` | string | | `Certified Public Accountant` \| `CMA` \| `CPE` \| etc. |
| `orgType` | string | B2B | `Accounting Firm` \| `Consulting Firm` \| etc. |
| `orgSize` | string | B2B | `<25` \| `26-100` \| `101-250` \| `251+` |
| `orgName` | string | B2B | Company name |
| `roleType` | string | | `Partner/CEO/CFO` \| `Grad Student` \| etc. |
| `state` | string | | 2-letter state code |
| `phone` | string | | |
| `utm_source` | string | | Auto-captured from URL |
| `utm_medium` | string | | |
| `utm_campaign` | string | | |

### GET /api/accounts?q=smith

Returns SF Account typeahead for org name autocomplete.

### GET /health

```json
{ "status": "ok", "ts": "2026-04-21T..." }
```

---

## Contacts

| Person | Role | Contact |
|---|---|---|
| Sam Chaudhary | AI Architect | sam.chaudhary@colibrigroup.com |
| Huma Yousuf | SF Developer | SF flow + fields + Connected App credentials |
| Angel Cichy | SF Admin | SF field creation, record type assignments, queue membership |
| Dakshesh | Drupal Team Lead | Form build — see DRUPAL_FORM_BUILD.md |
| Charlene Ceci | DevOps | Acquia deployment, release windows |
| Nick Leavitt | SFMC Admin | Journey credentials + event keys |
