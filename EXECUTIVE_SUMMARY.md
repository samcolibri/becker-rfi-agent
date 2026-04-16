# Becker RFI Agent — Executive Summary

**Project:** Smart Lead Intake & Routing — Contact Us / RFI Form  
**Date:** April 16, 2026  
**Author:** Sam Chaudhary  
**Stakeholders:** Monica Callahan · Josh Elefante · Angel Cichy · Shar Ceci · Huma Yousuf  
**Repo:** github.com/samcolibri/becker-rfi-agent

---

## The Problem We're Solving

Becker's current Contact Us form routes every submission — B2B, B2C, and student support — to a single inbox with zero intelligence. Monica Callahan: *"We really haven't had B2B leads — we can only go up."* Josh Elefante: *"We have not had proper B2B lead conversion for a long time."*

Three failure modes today:
1. **No segmentation** — B2B firm inquiries and individual course questions land in the same bucket
2. **Manual routing** — every lead requires a human to read it and decide where it goes
3. **No data** — the form doesn't capture org type, company size, or role, so marketing can't segment and reps can't qualify

---

## What We're Building

A smart 3-step intake form that replaces the current Contact Us form and does three things automatically:

| What | How | Why it matters |
|---|---|---|
| Segments intent immediately | Step 1 asks one question: exploring / ready to buy / buying for my team / student support | Sales and marketing get pre-sorted leads before anyone touches a CRM |
| Captures the right data | 7 required fields including org type, org size, role, and program of interest | Reps qualify faster; marketing personalizes nurture automatically |
| Routes automatically | B2B → org type × employee count → correct SF queue; B2C → SFMC journey | Zero manual intervention; human SLA clock starts at the right queue |

---

## Monica's Three Outcomes (verbatim from the call)

> **"Additional leads coming into SF."**  
More volume, immediately visible in pipeline. Every Contact Us submission becomes a structured SF Lead or Case — nothing falls into an inbox.

> **"Those leads have better segmentation data so we can market to them more effectively."**  
Organization Type, Organization Size, Role Type, Program of Interest, HQ State — all captured and stored on the Lead record. SFMC fires the right nurture journey automatically on submit.

> **"I'd like the leads to be distributed via automation, not manual effort."**  
B2B leads route to one of 6 SF queues based on a hard-coded matrix (Monica's Excel, translated to code). If an Account Owner already exists for the company, it goes directly to them. No human reads and re-routes.

---

## The Full E2E Journey (high level)

```
User submits form
       ↓
  [Simultaneous — before any branching]
  • SF Lead or Case created
  • Confirmation email fires (SFMC, < 20 min, ALL paths)
       ↓
  [Parallel — human SLA clock starts]
  • SF routing → correct queue or rep
  • SFMC nurture journey entry → personalized sequence
       ↓
  B2C Exploring     → CPA / CMA / CIA / EA / CPE / CFP Demo Journey
  B2C Ready         → Concierge Day One Journey
  B2B               → B2B Nurture + Queue Assignment (6 teams)
  Student Support   → SF Case → CS&E Queue (no nurture)
       ↓
  [All paths] First sales or support activity
       ↓
  [All paths] CSAT survey fires via Qualtrics/SFMC
              (measures first impression, not just purchase)
```

---

## Phase 1 Scope (what ships first)

- Smart 3-step wizard — live on becker.com/contact-us
- SF Lead and Case creation with all new custom fields
- Routing engine (full B2B matrix, account owner override, fallback to Inside Sales)
- SFMC confirmation email (<20 min, all paths)
- SFMC journey entries per program / intent
- Email spam/bot filter (Hunter.io)
- CommSubscriptionConsent CDM record on every submission
- 27 unit tests — routing engine fully covered

## Phase 2 (out of scope today, designed to extend)

- Same intake model applied to: webinars, events, conferences, flipbook offers
- NCA territory-based rep assignment (5 reps × state/account-type matrix)
- SLA breach alerts to queue managers
- Clay + 6sense enrichment waterfall
- Floating RFI widget on every page (Josh's idea)

---

## SLA Commitments (agreed on call)

| Path | SLA | Note |
|---|---|---|
| B2C | 1–4 business hours | Aspirational; Huma to run SF report to establish baseline |
| B2B | 48 business hours | Monica corrected: outside sales travels, can't do 1 hour |
| Support | 1 business day | Routes to CS&E queue |

---

## What Each Stakeholder Needs to Provide

| Person | Action needed | Blocks |
|---|---|---|
| **Angel Cichy** | Activate 8 custom SF fields (see SETUP.md) | Lead record creation |
| **Angel Cichy** | Confirm exact SF queue object names | B2B routing (queue name mismatch between diagram and Excel) |
| **Angel Cichy** | Add Org_Type__c to Farside CDM | Data model alignment |
| **SFMC admin** | Provide 9 journey entry event API keys | All SFMC journey triggers |
| **Sam** | Connect with Dakshesh (5X Drupal) | Form embed on becker.com |
| **Monica / Josh** | Confirm routing matrix and picklist values | Routing accuracy |
| **Huma** | Run SF report (lead → first activity) | SLA baseline |
| **Haley** | Get sandbox access set up | UAT |

---

## Success Metrics (to measure after launch)

1. Lead volume from Contact Us (baseline: currently ~0 structured B2B leads)
2. % of leads auto-routed (target: 100% — zero manual re-routing)
3. Lead segmentation completeness (Org Type, Org Size, Program filled on % of records)
4. Time from lead creation to first rep activity (vs. baseline from Huma's report)
5. SFMC journey entry rate (% of leads that fire a nurture sequence)
6. CSAT score at first touch (new metric — not currently measured)

---

## Timeline

```
Today (Apr 16)  → Architecture approval from Monica / Angel / Josh
This week       → Sam + Huma working session: SF field activation + API credential exchange
Wednesday       → Release cycle: dev → Huma smoke test → stage → UAT
UAT             → Monica, Aaron (B2C), Haley (sandbox)
Go-live         → Next Wednesday release after UAT sign-off
```

---

*"Progress over perfection was explicitly endorsed."* — 2026-04-16 requirements call
