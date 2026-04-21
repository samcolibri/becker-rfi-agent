# Drupal → Salesforce Integration Guide
## For: Dakshesh (5X Drupal Team)
## Last updated: 2026-04-20

---

## Overview

The Becker RFI form collects lead data in Drupal and submits it **directly to Salesforce**.
Salesforce handles all routing, lead creation, queue assignment, and campaign membership
via a Flow triggered on `ExternalWebform__c` insert.

```
Drupal Form → Salesforce REST API → ExternalWebform__c → SF Flow → Lead + Queue Assignment
```

No middleware server. No Railway. Pure Drupal → Salesforce.

---

## Credentials Dakshesh Needs (from Huma Yousuf)

| Credential | What It Is | Notes |
|---|---|---|
| `SF_CLIENT_ID` | Consumer key from the existing Drupal API Connected App | **No new app needed** — use existing `Drupal B2B Commerce Integration` app already in SF Setup |
| `SF_CLIENT_SECRET` | Consumer secret | Same existing app |
| `SF_LOGIN_URL` | Auth endpoint | `https://login.salesforce.com` (prod) / `https://test.salesforce.com` (sandbox) |
| `SF_INSTANCE_URL` | Org base URL | e.g. `https://colibri.my.salesforce.com` |
| `ExternalWebform__c` field API names | All custom field names | Huma provides after creating fields |

> **Note for Huma:** No new Connected App is needed. The existing `Drupal B2B Commerce Integration DEVF JWT`
> Connected App (used by the Drupal Salesforce Suite module today) already has the right OAuth scopes.
> Dakshesh just needs the Consumer Key and Secret from that app's detail page in SF Setup.

---

## Step 1 — Huma Shares Existing Connected App Credentials

In Salesforce Setup → App Manager → find `Drupal B2B Commerce Integration`:

- Click **View** → copy `Consumer Key` and `Consumer Secret`
- Send to Dakshesh securely (do not send via email — use a password manager share or Vault)

---

## Step 2 — Authenticate from Drupal (OAuth2 Client Credentials)

Drupal calls SF OAuth endpoint to get an access token before each submission
(or cache the token until it expires):

```
POST https://login.salesforce.com/services/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=YOUR_CLIENT_ID
&client_secret=YOUR_CLIENT_SECRET
```

Response:
```json
{
  "access_token": "00D...",
  "instance_url": "https://colibri.my.salesforce.com",
  "token_type": "Bearer"
}
```

---

## Step 3 — Submit Form Data to ExternalWebform__c  <!-- Steps 3-6 unchanged -->

On form submit, Drupal POSTs to the Salesforce REST API:

```
POST https://colibri.my.salesforce.com/services/data/v59.0/sobjects/ExternalWebform__c
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "First_Name__c": "Jane",
  "Last_Name__c": "Smith",
  "Email__c": "jane@example.com",
  "Phone__c": "312-555-0100",
  "Requesting_For__c": "My organization",
  "Primary_Interest__c": "CPA",
  "Organization_Type__c": "Accounting Firm",
  "Org_Size_Category__c": "26-100",
  "HQ_State__c": "IL",
  "Role_Type__c": "Partner/CEO/CFO",
  "Company__c": "Smith & Associates CPA",
  "IntentPath__c": "b2b",
  "Business_Brand__c": "Becker Professional Education Corporation",
  "Lead_Source_Form__c": "Web - Contact Us Form",
  "Lead_Source_Form_Date__c": "2026-04-20T14:30:00Z",
  "Lead_Source_Detail__c": "utm_source=google | utm_medium=cpc | utm_campaign=b2b-cpa",
  "Consent_Provided__c": "Email",
  "Consent_Captured_Source__c": "RFI Form — becker.com/contact-us",
  "Privacy_Consent_Status__c": "OptIn",
  "Campaign__c": "701VH00000tZOSqYAO"
}
```

Salesforce responds with the new record ID:
```json
{ "id": "a0B...", "success": true }
```

The SF Flow fires automatically on insert — no further API calls needed.

---

## Step 4 — Field Reference (ExternalWebform__c)

All fields Drupal must populate on submission:

### Required for All Submissions
| Field API Name | Form Field | Example Value |
|---|---|---|
| `First_Name__c` | First Name | `Jane` |
| `Last_Name__c` | Last Name | `Smith` |
| `Email__c` | Email | `jane@firm.com` |
| `Requesting_For__c` | Requesting For | `Myself` or `My organization` |
| `Primary_Interest__c` | Product Interest | `Certified Public Accountant` |
| `IntentPath__c` | Intent (Step 1 card) | `exploring` / `ready` / `b2b` / `support` |
| `Consent_Provided__c` | Marketing opt-in | `Commercial Marketing` or blank |
| `Privacy_Consent_Status__c` | Privacy checkbox | `Accepted` |
| `Consent_Captured_Source__c` | Auto | `RFI Form — becker.com/contact-us` |
| `Business_Brand__c` | Auto | `Becker Professional Education Corporation` |
| `Lead_Source_Form__c` | Auto | `Web - Contact Us Form` |
| `Lead_Source_Form_Date__c` | Auto | ISO timestamp at submit |

### B2B Only (`Requesting_For__c = 'My organization'`)
| Field API Name | Form Field | Example Value |
|---|---|---|
| `Company__c` | Organization Name | `Smith & Associates CPA` |
| `Organization_Type__c` | Organization Type | `Accounting Firm` |
| `Org_Size_Category__c` | # of Employees | `26-100` |
| `HQ_State__c` | HQ State / Province | `IL` |
| `Phone__c` | Phone | `312-555-0100` |
| `Role_Type__c` | Role Type | `Partner/CEO/CFO` |

### B2C Only (`Requesting_For__c = 'Myself'`)
| Field API Name | Form Field | Example Value |
|---|---|---|
| `Resident_State__c` | State of Residence | `IL` |
| `Role_Type__c` | Role Type | `Grad Student` |
| `Graduation_Year__c` | Graduation Year | `2026` or `0000` |
| `Is_Current_Becker_Student__c` | Current Becker student? | `true` / `false` |
| `Becker_Student_Email__c` | Becker login email | `jane@becker.com` |

### Optional (All Paths)
| Field API Name | Form Field | Notes |
|---|---|---|
| `Campaign__c` | Auto | SF Campaign ID — see campaign mapping below |
| `Lead_Source_Detail__c` | Auto | UTM params from page URL |
| `Message__c` | Notes / Message | Free text |

---

## Step 5 — Campaign ID Mapping

Drupal must resolve the correct Campaign ID based on `Requesting_For__c` + `Primary_Interest__c`
and pass it in `Campaign__c`:

### B2C Campaign IDs (per Product Interest)
| Product Interest | Campaign ID |
|---|---|
| Certified Public Accountant | `7013r000001l0CwAAI` |
| Certified Management Accountant | `7013r000001l0DBAAY` |
| Continuing Professional Education | `7013r000001l0D6AAI` |
| Certified Internal Auditor | `701VH00000coo8bYAA` |
| Enrolled Agent | `701VH00000cnfxAYAQ` |
| Certified Financial Planner | `701VH00000tZNTXYA4` |
| Staff Level Training | `701VH00000tZPTiYAO` |
| CIA Challenge Exam | `701VH00000tZQ6QYAW` |

### B2B Campaign ID (all products)
`701VH00000tZOSqYAO`

---

## Step 6 — UTM Parameter Capture

Drupal should read UTM params from the page URL on form load and populate
`Lead_Source_Detail__c` as a pipe-separated string:

```
utm_source=google | utm_medium=cpc | utm_campaign=b2b-cpa-q2
```

---

## What Happens After Drupal Submits

Drupal's job ends after the POST. Salesforce takes over:

1. SF Flow fires on `ExternalWebform__c` insert
2. Flow checks for existing Lead by email (dedup)
3. Flow checks for existing Account by company name
4. Flow creates Lead with B2B or B2C Record Type
5. Flow assigns Lead to the correct queue based on routing matrix
6. Flow creates CampaignMember linking Lead to Campaign
7. SFMC confirmation email triggers automatically

---

## Contacts

| Person | Role | For |
|---|---|---|
| Huma Yousuf | Salesforce Developer | Connected App credentials, field API names, Flow |
| Dakshesh | Drupal Team Lead | Form build, API integration, token caching |
| Charlene Ceci | DevOps | Release window coordination |
| Sam Chaudhary | AI Architect | Field mapping questions, campaign IDs |
