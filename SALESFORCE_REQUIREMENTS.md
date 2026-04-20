# Salesforce Requirements — Post-ExternalWebform Processing
## Source: RFI Mapping 2.23.26 (1).xlsx
## Last updated: 2026-04-20

---

## 1. New Custom Fields Required on Lead Object

Huma Yousuf needs to create all of these. None exist today per sheet 1 of source file.

| Field Label | Suggested API Name | Type | Picklist Values | Who Uses It |
|---|---|---|---|---|
| Requesting For | `Requesting_For__c` | Picklist | `Myself` / `My organization` | Flow branch selector — sets B2B or B2C Record Type |
| Organization Type | `Organization_Type__c` | Picklist | See Section 3 | Routing matrix input |
| Org Size Category | `Org_Size_Category__c` | Picklist | `<25` / `26-100` / `101-250` / `251+` | Routing matrix input. Confirm vs existing `Training_Audience_Size__c` |
| HQ State / Province | `HQ_State__c` | Text(2) | — | B2B leads. State is NOT on Lead record today — only on Contact Form object |
| Resident State | `Resident_State__c` | Text(2) | — | B2C leads. Same gap — not on Lead record |
| Role Type | `Role_Type__c` | Picklist | See Section 3 | Rep context before first call |
| Graduation Year | `Graduation_Year__c` | Text(4) | Year range + `0000` (already graduated) | B2C students only |
| Is Current Becker Student | `Is_Current_Becker_Student__c` | Checkbox | — | B2C — gates Becker login email field |
| Becker Student Email | `Becker_Student_Email__c` | Email | — | B2C — secondary email for existing students |

---

## 2. Lead Record Type Assignment

Flow must set `RecordType` on every new Lead based on `Requesting_For__c`:

| `Requesting_For__c` value | Lead Record Type | Intent Paths |
|---|---|---|
| `My organization` | **B2B Lead** | Exploring (B2B), Buying for My Organization |
| `Myself` | **B2C Lead** | Exploring (B2C), Ready to Enroll |

> **Open item:** Confirm exact Record Type API names with Huma. Sheet 1 asks: "can we use B2B or B2C record type here?"

---

## 3. Picklist Values

### Organization Type (`Organization_Type__c`)

| Value | B2B | B2C |
|---|---|---|
| Accounting Firm | ✓ | ✓ |
| Corporation/Healthcare/Bank/Financial Institution | ✓ | ✓ |
| Consulting Firm | ✓ | ✓ |
| CPA Alliance | ✓ | ✓ |
| Government Agency/Not for Profit Organization | ✓ | ✓ |
| Society/Chapter | ✓ | ✓ |
| Non-US Organization | ✓ | ✓ |
| Student | ✓ | ✓ |
| University | ✓ | ✓ |
| Other | ✓ | ✓ |
| **None** | — | ✓ B2C only |

### Role Type (`Role_Type__c`)

| Value |
|---|
| Undergrad Student |
| Grad Student |
| Professor |
| Supervisor/Director/Manager |
| Partner/CEO/CFO |
| Administrator |
| Unemployed |
| Learning/Training Leader |
| Staff Accountant |
| Other |

> **Open item:** Single shared picklist for B2B and B2C, or two separate fields? Confirm with Monica Callahan.

### Org Size Category (`Org_Size_Category__c`)

`<25` / `26-100` / `101-250` / `251+`

---

## 4. B2B Routing Matrix

**Input:** `Organization_Type__c` + `Org_Size_Category__c`
**Output:** Queue assignment written to `Suggested_Queue__c` by the routing engine

| Organization Type | <25 | 26-100 | 101-250 | 251+ |
|---|---|---|---|---|
| Accounting Firm | Inside Sales | Global Firms | Global Firms | Global Firms |
| Corporation / Healthcare / Bank / Fin. Inst. | Inside Sales | New Client Acquisition | New Client Acquisition | New Client Acquisition |
| Consulting Firm | Global Firms | Global Firms | Global Firms | Global Firms |
| CPA Alliance | Global Firms | Global Firms | Global Firms | Global Firms |
| Government Agency / Not for Profit Org | Inside Sales | New Client Acquisition | New Client Acquisition | New Client Acquisition |
| Society / Chapter | University | University | University | University |
| Non-US Organization | International | International | International | International |
| Student | Inside Sales | Inside Sales | Inside Sales | Inside Sales |
| University | University | University | University | University |
| Other | Inside Sales | Inside Sales | Inside Sales | Inside Sales |

**Override rules — evaluated first, in order:**

1. Existing Account Owner is **CS&E team** → assign to Customer Success & Expansion queue regardless of matrix
2. Existing Account Owner is **any other team** → assign to that team's queue
3. No matrix match → default to **Inside Sales**

---

## 5. Lead Assignment — Phase 1 (Current Scope)

1. Match submitted `Company__c` against existing `Account.Name`
   - Match found + Account has Owner → assign Lead to Account Owner
   - Match found + CS&E owns the account → assign to CS&E queue
2. No account match → apply routing matrix (Section 4) → assign Lead to resolved queue

---

## 6. Lead Assignment — Phase 2 (Future, NCA Only)

When matrix resolves to **New Client Acquisition**, match `HQ_State__c` + account type to a specific rep:

| Rep | States | Account Types |
|---|---|---|
| Stephanie Anastasio | OH, ID, WV, DC, MD, NY, PA, NJ, CT, VA, RI, DE, NH, MA, ME | F1000, Banks, Insurance |
| Jill Kirkpatrick | OK, KS, MO, IL, MI, WI, East TX, NE, IA, MN, SD, ND, AR, NV | F1000, Banks, Insurance |
| Sharice Jessup | Nor CAL, AZ, UT, CO, WY, MT, ID, HI | F1000, Banks, Insurance |
| Henry Quinones | NM, West TX, AL, GA, NC, SC, FL, TN, KY, LA, MS | F1000, Banks, Insurance |
| Nahal Safagh | So CAL, OR, WA, AK, 150–350 employee firms (nationwide) | Firms 150-350, F1000, Banks |

> CA and TX are split territories — zip code or sub-region logic required. **Phase 2 only.**

---

## 7. Campaign Membership

Flow must create a `CampaignMember` record linking the Lead to `Campaign__c` on the webform record.
Campaign IDs are pre-resolved by the Node.js routing engine before ExternalWebform__c is written.

### B2C — per Product Interest

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

### B2B — all org types, all products

Single campaign: `701VH00000tZOSqYAO`

> **Open item:** Sales to confirm whether Exploring→B2B and Buying→B2B should use different campaign IDs. Currently both map to the same B2B campaign.

---

## 8. Deduplication Rules

SF native duplicate rules handle this — no custom code required (confirmed in meeting transcript).

- Same email as existing unconverted Lead → **update** existing record, do not create duplicate
- Same email as existing Contact (Person Account) → create **Opportunity** under Person Account
- No match → create **new Lead**

> **Open item:** Huma Yousuf must confirm existing SF email-based Lead duplicate rules are **inactive** so the Flow is the sole dedup logic.

---

## 9. Salesforce Flow — Lead Routing (Phase 1)

**Trigger:** Record-Triggered Flow on `ExternalWebform__c`, After Insert
**Scope:** Phase 1 only — no territory matching, no Phase 2 rep assignment

### Flow Decision Tree

```
ExternalWebform__c INSERT
│
├── STEP 1: Does a Lead exist with Email__c = Email? (IsConverted = false)
│   ├── YES → Update existing Lead fields → Skip to Step 4
│   └── NO  → Continue to Step 2
│
├── STEP 2: Does an Account exist with Name = Company__c?
│   ├── YES → Get Account Owner
│   │         If Account Owner team = CS&E → force CS&E queue
│   │         Else → use Account Owner's team queue
│   └── NO  → Use SuggestedQueue__c from webform as-is
│
├── STEP 3: Create Lead record (field mapping below)
│
├── STEP 4: Assign Lead.OwnerId
│   ├── Account Owner found in Step 2 → assign Lead.OwnerId = that User
│   └── No Account Owner → assign Lead.OwnerId = Queue matching SuggestedQueue__c
│       └── SuggestedQueue__c is blank → assign to Inside Sales queue
│
└── STEP 5: Is Campaign__c populated?
    ├── YES → Create CampaignMember (Lead + Campaign__c)
    └── NO  → STOP
```

### Step 3 — Lead Field Mapping (ExternalWebform__c → Lead)

| Lead Field | Source on ExternalWebform__c | Notes |
|---|---|---|
| `FirstName` | `First_Name__c` | |
| `LastName` | `Last_Name__c` | |
| `Email` | `Email__c` | |
| `Phone` | `Phone__c` | |
| `Company` | `Company__c` | |
| `RecordTypeId` | If `Requesting_For__c = 'My organization'` → B2B Record Type ID; else → B2C Record Type ID | Hardcode both IDs after Huma creates them |
| `LeadSource` | `Lead_Source_Form__c` | Always: `Web - Contact Us Form` |
| `Product_Line_MS__c` | `Primary_Interest__c` | Existing SF field |
| `Organization_Type__c` | `Organization_Type__c` | New field — Huma must create first |
| `Org_Size_Category__c` | `Org_Size_Category__c` | New field — confirm vs `Training_Audience_Size__c` |
| `Role_Type__c` | `Role_Type__c` | New field |
| `HQ_State__c` | `HQ_State__c` | New field — B2B only |
| `Resident_State__c` | `Address__StateCode__s` | New field — B2C only |
| `Graduation_Year__c` | `YearInSchool__c` | New field — B2C only |
| `Becker_Student_Email__c` | `email_address_you_use_to_login_to_Becker__c` | New field — B2C only |
| `LeadSource_Detail__c` | `Lead_Source_Detail__c` | UTM params |
| `Brand__c` | `Business_Brand__c` | Always: `Becker Professional Education Corporation` |
| `Description` | `Message__c` | |

### Step 4 — Queue ID Lookup

Flow needs one `Get Records` element on the `Group` object. Query dynamically:

```sql
SELECT Id FROM Group
WHERE Type = 'Queue'
AND Name = {SuggestedQueue__c}
LIMIT 1
```

Fallback if no match:

```sql
SELECT Id FROM Group
WHERE Type = 'Queue'
AND Name = 'Inside Sales'
LIMIT 1
```

### Step 5 — CampaignMember Record

```
CampaignMember:
  CampaignId = ExternalWebform__c.Campaign__c
  LeadId     = newly created Lead.Id
  Status     = 'Sent'
```

Only fire if `Campaign__c` is not null **and** Lead was newly created (not updated in Step 1).

### What the Flow Does NOT Handle (Phase 1)

- Territory matching → Phase 2, skip entirely
- CommSubscriptionConsent CDM record → separate flow, Angel builds independently
- SFMC journey triggers → handled by Node.js before webform is written
- Opportunity creation → Phase 2 (Person Account path)

---

## 10. Minimum Fields Angel Must Create Before Flow Can Be Built

The Flow **cannot be built** until these 4 exist in SF:

| # | Field | Type |
|---|---|---|
| 1 | `Organization_Type__c` on Lead | Picklist — 10 values (Section 3) |
| 2 | `Org_Size_Category__c` on Lead | Picklist — `<25`, `26-100`, `101-250`, `251+` |
| 3 | `HQ_State__c` on Lead | Text(2) |
| 4 | `Role_Type__c` on Lead | Picklist — 10 values (Section 3) |

The remaining 5 new fields (`Resident_State__c`, `Graduation_Year__c`, `Becker_Student_Email__c`, `Is_Current_Becker_Student__c`, `Requesting_For__c`) can be added post-launch — they do not affect routing logic.

---

## 11. Open Items Blocking Go-Live

| # | Blocker | Owner |
|---|---|---|
| 1 | Create 4 minimum Lead custom fields (Section 10) | Huma Yousuf |
| 2 | Confirm exact B2B / B2C Lead Record Type API names | Huma Yousuf |
| 3 | Confirm `Training_Audience_Size__c` vs new `Org_Size_Category__c` | Huma Yousuf |
| 4 | Confirm 14 CommSubscriptionConsent channel types are configured | Huma Yousuf |
| 5 | Confirm existing email-based Lead duplicate rules are inactive | Huma Yousuf |
| 6 | Role Type — single shared picklist or separate B2B / B2C picklists? | Monica Callahan |
| 7 | Graduation Year — exact year range for dropdown | Monica Callahan |
| 8 | "Other" org name — affiliation list fallback or free-text? | Josh Elefante |
| 9 | Confirm whether Exploring→B2B and Buying→B2B use different campaign IDs | Sales team |
