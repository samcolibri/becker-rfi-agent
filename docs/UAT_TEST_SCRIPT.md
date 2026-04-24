# Becker RFI — UAT Test Script
**Version:** 1.0 — 2026-04-24  
**Author:** Sam Chaudhary  
**Prepared for:** Huma Yousuf, Angel Cichy, UAT team  
**Sandbox:** https://becker--bpedevf.sandbox.my.salesforce.com  
**Form URL (dev):** https://atgeacebeckernonprodacn.prod.acquia-sites.com/form/becker-rfi  

---

## HOW TO USE THIS SCRIPT

1. Submit the form using the test data in each test case.
2. Wait **45–60 seconds** after form submission before checking Salesforce (the flow needs time to fire).
3. Open Salesforce and navigate to the object listed (Leads, Contact Us Forms).
4. Compare what you see to the **Expected Result** column.
5. Mark each row ✅ PASS or ❌ FAIL and note any discrepancies.

> **Tip — finding records quickly:** In Salesforce, use the global search bar (top center) and search by the email address you used in the form.

---

## TC-01 — CPA Product Interest: Consent Fields on Lead

**Purpose:** Verify all three consent fields are correctly populated on the Lead when a B2C user selects CPA.

**Form Path:** I'm exploring → CPA → fill contact details → check all consent boxes

### Form Input

| Field | Value to Enter |
|---|---|
| I'm requesting for | **Myself** |
| Product Interest | **Certified Public Accountant (CPA)** |
| First Name | Test |
| Last Name | UAT-CPA-01 |
| Email | uat.cpa.01@becker-test.com |
| Phone | (312) 555-1001 |
| Consent: Calls & texts | ✅ Check this box |
| Consent: Emails | ✅ Check this box |
| Privacy acknowledgment | ✅ Check this box |

### How to Verify in Salesforce

1. Go to **Leads** tab → search by email `uat.cpa.01@becker-test.com`
2. Open the Lead record
3. Check the following fields:

| Field to Check | Expected Value | Actual Value | Pass/Fail |
|---|---|---|---|
| Consent Provided | Email; Phone; SMS | | |
| Privacy Consent Status | OptIn | | |
| Consent Captured Source | Becker RFI Form | | |

---

## TC-02 — All Product Interests: Lead Fields Populated

**Purpose:** Verify that all key Lead fields are correctly populated. Repeat for each product.

> **Note:** Use a different email address AND a different phone number for each product (e.g. add the product name to the email, increment the phone by 1). Same phone across tests will cause silent failures.

**Form Path:** I'm exploring → [Product] → fill contact details → submit

### Form Input Template (repeat for each row below)

| Field | Value |
|---|---|
| I'm requesting for | **Myself** |
| Product Interest | *(see product table)* |
| First Name | Test |
| Last Name | UAT-[PRODUCT]-02 |
| Email | uat.[product].02@becker-test.com |
| Phone | *(see product table — must be unique)* |
| Consent: Emails | ✅ Check |
| Privacy acknowledgment | ✅ Check |

### Products to Test

| Product | Phone to Use | Email to Use |
|---|---|---|
| Certified Public Accountant (CPA) | (312) 555-1010 | uat.cpa.02@becker-test.com |
| Certified Management Accountant (CMA) | (312) 555-1011 | uat.cma.02@becker-test.com |
| Continuing Professional Education (CPE) | (312) 555-1012 | uat.cpe.02@becker-test.com |
| Certified Internal Auditor (CIA) | (312) 555-1013 | uat.cia.02@becker-test.com |
| Enrolled Agent (EA) | (312) 555-1014 | uat.ea.02@becker-test.com |
| Certified Financial Planner (CFP) | (312) 555-1015 | uat.cfp.02@becker-test.com |

### What to Check in Salesforce (for each Lead)

Go to **Leads** → search by email → open the Lead. Check:

| Field | Expected Value | CPA | CMA | CPE | CIA | EA | CFP |
|---|---|---|---|---|---|---|---|
| Record Type | B2C Lead | | | | | | |
| Lead Owner (Queue) | CS - Inside Sales | | | | | | |
| First Name | Test | | | | | | |
| Last Name | UAT-[PRODUCT]-02 | | | | | | |
| Email | uat.[product].02@... | | | | | | |
| Phone | (312) 555-10XX | | | | | | |
| Business Brand | Becker | | | | | | |
| Lead Source Form | Contact Us - Exploring | | | | | | |
| Consent Provided | Email *(or Email;SMS;Phone)* | | | | | | |
| Privacy Consent Status | OptIn | | | | | | |

---

## TC-03a — B2B with Existing Business Account → Account Owner Assignment

**Purpose:** When a company name matches an existing Salesforce Account that has an active sales rep, the Lead should be assigned directly to that rep (not a queue).

**Test Account:** Standish Management → Account Owner: **JoAnn Veiga**

**Form Path:** I'm buying for my team → fill org details → submit

### Form Input

| Field | Value to Enter |
|---|---|
| I'm requesting for | **My organization / team** |
| Product Interest | Certified Public Accountant (CPA) |
| Company Name | **Standish Management** *(must match exactly)* |
| Organization Type | Accounting Firm |
| Team Size | 251+ |
| First Name | Test |
| Last Name | UAT-B2B-03a |
| Email | uat.b2b.03a@becker-test.com |
| Phone | (312) 555-1020 |
| Consent: Emails | ✅ Check |

### What to Check in Salesforce

Go to **Leads** → search by email → open the Lead:

| Field | Expected Value | Actual Value | Pass/Fail |
|---|---|---|---|
| Record Type | B2B Lead | | |
| Lead Owner | **JoAnn Veiga** *(a named person, not a queue)* | | |
| Owner Type | User *(not Queue)* | | |
| Company | Standish Management | | |

> **Why this matters:** Standish Management already has JoAnn Veiga as the Account Owner in Salesforce. The system should recognize this and assign the Lead directly to her, bypassing the queue.

---

## TC-03b — All B2C Leads Route to CS – Inside Sales Queue

**Purpose:** Verify that all B2C form submissions (Myself path) route to the CS – Inside Sales queue regardless of product.

**Already covered in TC-02** — if all 6 products in TC-02 show `Lead Owner = CS - Inside Sales`, this test passes.

| Check | Expected | Actual | Pass/Fail |
|---|---|---|---|
| CPA Lead Owner | CS – Inside Sales | | |
| CMA Lead Owner | CS – Inside Sales | | |
| CPE Lead Owner | CS – Inside Sales | | |
| CIA Lead Owner | CS – Inside Sales | | |
| EA Lead Owner | CS – Inside Sales | | |
| CFP Lead Owner | CS – Inside Sales | | |

---

## TC-04 — Support / Contact Us Form: Creates Contact Us Record + Case

**Purpose:** When a user selects "I need student support," verify that:
1. A **Contact Us Form** record is created in Salesforce (NOT a Lead)
2. The correct fields are populated
3. The record (or resulting Case) is routed to **CS – Contact Center Inbound**

**Form Path:** I need student support → fill details → submit

### Form Input

| Field | Value to Enter |
|---|---|
| Intent | **I need student support** |
| Product Interest | Certified Public Accountant (CPA) |
| First Name | Test |
| Last Name | UAT-Support-04 |
| Email | uat.support.04@becker-test.com |
| Phone | (312) 555-1030 |
| City | Chicago |
| State | Illinois |
| Country | United States |
| Please tell us about your question | I need help accessing my CPA course materials |
| Consent: Emails | ✅ Check |

### What to Check in Salesforce

**Step 1 — Confirm NO Lead was created:**

Go to **Leads** → search by email `uat.support.04@becker-test.com`
→ Expected: No results found (zero Leads for this email)

| Check | Expected | Actual | Pass/Fail |
|---|---|---|---|
| Lead created? | **No** — should not exist | | |

---

**Step 2 — Find the Contact Us Form record:**

Go to **App Launcher (☰)** → search for **"Contact Us Forms"** → open the record with email `uat.support.04@becker-test.com`

| Field | Expected Value | Actual Value | Pass/Fail |
|---|---|---|---|
| First Name | Test | | |
| Last Name | UAT-Support-04 | | |
| Email | uat.support.04@becker-test.com | | |
| Phone | (312) 555-1030 | | |
| City | Chicago | | |
| State | IL | | |
| I Would Like to Hear More About | CPA | | |
| Please Tell Us About Your Question | I need help accessing my CPA course materials | | |
| Form Applied | Becker Contact US | | |
| Query Type | Support | | |
| Lead Source Form | Customer Service - Contact Us | | |
| Business Brand | Becker | | |

---

**Step 3 — Check for Case record:**

From the Contact Us Form record, look for a **Case** in the related section.  
*(Or go to Cases tab → search by contact email)*

| Check | Expected | Actual | Pass/Fail |
|---|---|---|---|
| Case exists linked to Contact Us Form | Yes | | |
| Case Owner / Queue | CS – Contact Center Inbound | | |

> ⚠️ **Note for Huma / Angel:** Case creation from Contact Us Form may require additional configuration in Salesforce (process rule or flow on Contact_Us_Form__c object). If no Case is auto-created, this step needs to be set up by the SF admin team. The Contact Us Form record itself IS created correctly by the current flow.

---

## QUEUE ROUTING SUMMARY TABLE

> Use this as a quick-reference cheat sheet while running TC-03a and TC-03b.

| Submission Type | Company / Condition | Expected Owner |
|---|---|---|
| B2C – Any product | Any | CS – Inside Sales queue |
| B2B – Accounting Firm (<25 employees) | No account match | CS – Inside Sales queue |
| B2B – Accounting Firm (26+ employees) | No account match | Global Firms queue |
| B2B – Corporation / Healthcare / Bank (26+) | No account match | New Client Acquisition queue |
| B2B – Consulting Firm (any size) | No account match | Global Firms queue |
| B2B – CPA Alliance (any size) | No account match | Global Firms queue |
| B2B – Government / NFP (26+) | No account match | New Client Acquisition queue |
| B2B – Society / Chapter (any size) | No account match | University queue |
| B2B – Non-US Organization (any size) | No account match | International queue |
| B2B – University (any size) | No account match | University queue |
| B2B – **Any** | **Existing account with active rep** | **Rep directly (e.g. JoAnn Veiga)** |
| Support / Contact Us | N/A | CS – Contact Center Inbound |

---

## QUICK REFERENCE — WHERE TO FIND FIELDS IN SALESFORCE

| Object | How to Find It |
|---|---|
| Lead | Leads tab → search by email in top search bar |
| Contact Us Form | App Launcher (☰) → "Contact Us Forms" → search by email |
| Case | Cases tab → search by email or linked from Contact Us Form |
| Lead Owner (Queue or User) | Open Lead → "Lead Owner" field at top of record |
| Consent Provided | Open Lead → scroll to "Consent" section |
| Record Type | Open Lead → shown under the Lead name (B2C Lead / B2B Lead) |

---

## ISSUES TO FLAG IF SEEN

| Symptom | Likely Cause | Who to Contact |
|---|---|---|
| Lead not created after 60s | Phone format issue (must be `(312) 555-XXXX`) | Sam |
| Two tests have same phone — second Lead missing | SF duplicate rule on phone — use unique phones | Sam |
| Contact Us Form created but no Case | Case creation not yet automated | Angel Cichy / Huma Yousuf |
| Contact Us Form routed to wrong owner | Queue not yet configured for CUF object | Angel Cichy |
| Lead assigned to wrong queue | Org Type / Size combination mismatch | Sam |

---

## TEST LOG

| TC | Tester | Date | Result | Notes |
|---|---|---|---|---|
| TC-01 | | | | |
| TC-02 (CPA) | | | | |
| TC-02 (CMA) | | | | |
| TC-02 (CPE) | | | | |
| TC-02 (CIA) | | | | |
| TC-02 (EA) | | | | |
| TC-02 (CFP) | | | | |
| TC-03a | | | | |
| TC-03b | | | | |
| TC-04 | | | | |
