# Becker RFI Agent

Smart lead intake and routing system for Becker Professional Education. Replaces the current Contact Us form — which routes all submissions to a single person with zero intelligence — with a segmented 3-step wizard that creates structured Salesforce records, routes B2B leads to the correct team automatically, and fires SFMC nurture journeys on submission.

**Repo:** github.com/samcolibri/becker-rfi-agent  
**Author:** Sam Chaudhary  
**Status:** Architecture approval pending → build complete same day

---

## What it does

1. **Smart form** — 3-step wizard: intent card → conditional context fields → contact + consent
2. **Spam filter** — Hunter.io + pattern matching; rejects bots before any SF record is created
3. **SF Lead / Case creation** — Lead for all sales paths; Case for student support
4. **Confirmation email** — SFMC journey entry fires < 20 min for every path, before any rep acts
5. **B2B routing engine** — org type × employee count → 1 of 6 SF queues (Monica's Excel, verbatim)
6. **SFMC journey triggers** — program-matched nurture sequence fires in parallel with routing
7. **CommSubscriptionConsent** — CDM-compliant consent record on every consent submission

---

## Quick start

```bash
git clone https://github.com/samcolibri/becker-rfi-agent.git
cd becker-rfi-agent
npm install
cp .env.example .env      # fill in credentials
npm test                  # 27 routing engine unit tests — no credentials needed
npm start                 # server on http://localhost:3000
open http://localhost:3000/form.html
```

---

## Documentation

| Document | Audience | Purpose |
|---|---|---|
| [EXECUTIVE_SUMMARY.md](./EXECUTIVE_SUMMARY.md) | Monica, Josh, leadership | Business outcomes, Monica's goals, success metrics, timeline |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | All stakeholders | Full E2E technical architecture, approval checklist |
| [SETUP.md](./SETUP.md) | Angel, Huma, Sam | SF fields to create, SFMC keys to gather, go-live steps |
| [CLAUDE.md](./CLAUDE.md) | Sam, AI assistant | Full project brain — all decisions, field mappings, transcript intelligence |

---

## Project structure

```
becker-rfi-agent/
├── src/
│   ├── server.js            Express API — POST /api/submit
│   ├── lead-processor.js    9-step pipeline orchestrator
│   ├── routing-engine.js    B2B routing logic (pure, no network calls)
│   ├── sf-client.js         Salesforce REST API
│   ├── sfmc-client.js       SFMC Journey Builder events
│   └── email-validator.js   Spam filter + Hunter.io
├── public/
│   └── form.html            3-step wizard (standalone HTML, Drupal-embeddable)
├── data/
│   ├── routing-matrix.json  Org type × size → queue
│   ├── territories.json     NCA 2026 rep territory map
│   ├── sales-reps.json      All 6 teams + reps
│   └── dropdowns.json       All picklist values
├── tests/
│   └── routing-engine.test.js  27 unit tests
└── .env.example             All required environment variables
```

---

## Routing matrix (B2B)

| Org Type | <25 | 26–100 | 101–250 | 251+ |
|---|---|---|---|---|
| Accounting Firm | Inside Sales | Global Firms | Global Firms | Global Firms |
| Corp / Healthcare / Bank / Fin Inst | Inside Sales | NCA | NCA | NCA |
| Consulting Firm | Global Firms | Global Firms | Global Firms | Global Firms |
| CPA Alliance | Global Firms | Global Firms | Global Firms | Global Firms |
| Gov Agency / NFP | Inside Sales | NCA | NCA | NCA |
| Society / Chapter | University | University | University | University |
| Non-US | International | International | International | International |
| Other / Unknown | Inside Sales | Inside Sales | Inside Sales | Inside Sales |

Override: if existing Account Owner exists in SF → route to that owner (CS&E always wins).  
Default fallback: Inside Sales.

---

## API

### POST /api/submit

```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane@bigfirm.com",
  "intentPath": "b2b",
  "orgType": "Accounting Firm",
  "orgSize": "101-250",
  "state": "NY",
  "productInterest": "Certified Public Accountant",
  "consentGiven": true
}
```

`intentPath` values: `exploring` | `ready` | `b2b` | `support`

Response (success):
```json
{
  "success": true,
  "message": "Thank you! A Becker representative will be in touch within 48 business hours.",
  "leadId": "00Q..."
}
```

### GET /health

```json
{ "status": "ok", "ts": "2026-04-16T..." }
```

---

## Running tests

```bash
npm test
# or
node --test tests/routing-engine.test.js
```

All 27 tests run without any credentials — routing engine is pure logic.
