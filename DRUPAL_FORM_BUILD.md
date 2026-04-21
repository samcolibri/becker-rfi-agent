# Becker RFI Form — Drupal Build Guide
## For: Dakshesh (5X Drupal Team)
## Last updated: 2026-04-21
## Contact: Sam Chaudhary (sam.chaudhary@colibrigroup.com) for questions

---

## Overview

The Becker RFI form collects lead data and sends it directly to Salesforce.
There are **two ways** to deliver this on becker.com:

| Option | What it is | Time to ship | Recommended? |
|---|---|---|---|
| **A — Embed React app** | Drop a `<script>` tag into a Drupal block | 30 min | ✅ **Ship now** |
| **B — Native Drupal Webform** | Build the form in Drupal Webform module | 3–5 days | Phase 2 |

**Start with Option A.** It's live and fully tested. Option B can replace it later without any SF changes.

---

## Option A — Embed the Standalone React App (30 minutes)

The React form is already built, tested, and deployed. It connects to Salesforce directly.

### Step 1 — Get the live URL from Sam

The form is deployed on Railway. Sam will provide the URL (e.g. `https://becker-rfi.railway.app`).
The form lives at the root path `/`.

### Step 2 — Add to Drupal as a block

1. Drupal admin → **Structure → Block Layout → Custom Block Library → Add custom block**
2. Set body format to **Full HTML**
3. Paste this HTML:

```html
<!-- Becker RFI Form Embed -->
<div id="becker-rfi-container" style="max-width:640px; margin:0 auto;">
  <iframe
    src="https://becker-rfi.railway.app"
    title="Becker Contact Us"
    width="100%"
    height="750"
    frameborder="0"
    scrolling="no"
    style="border:none; overflow:hidden;"
    allow="forms"
    id="becker-rfi-frame"
  ></iframe>
</div>

<script>
  // Auto-resize iframe height as content changes
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'becker-rfi-resize') {
      document.getElementById('becker-rfi-frame').style.height = e.data.height + 'px';
    }
    // Pass UTM params into iframe on load
    if (e.data && e.data.type === 'becker-rfi-ready') {
      var params = new URLSearchParams(window.location.search).toString();
      document.getElementById('becker-rfi-frame').contentWindow.postMessage(
        { type: 'becker-rfi-utm', params: params }, '*'
      );
    }
  });
</script>
```

4. Place the block on the `/contact-us` page (or any page where the form should appear)
5. Save — done

### Step 3 — Pass UTM params (important for attribution)

The embed script above already handles this. UTM params on the parent page URL
(`?utm_source=google&utm_medium=cpc`) are forwarded into the iframe automatically.

### Step 4 — Test

Submit the form. Check Salesforce → Leads → filter by Created Date = Today.
A lead should appear within 30 seconds with the correct queue assignment.

---

## Option B — Native Drupal Webform (Full Build Spec)

Use this when Drupal resources are available. This replicates the React form
natively in Drupal and posts directly to Salesforce via the Salesforce Suite module.

### Prerequisites

- [ ] Drupal Salesforce Suite module installed and connected to SF
- [ ] `SF_CLIENT_ID` and `SF_CLIENT_SECRET` from the existing **Drupal B2B Commerce Integration** Connected App (get from Huma Yousuf)
- [ ] Huma to confirm all `ExternalWebform__c` field API names (listed below)

---

### SF Connection Setup

In Drupal: **Configuration → Salesforce → Authorize**

| Setting | Value |
|---|---|
| Consumer Key | `SF_CLIENT_ID` (from Huma) |
| Consumer Secret | `SF_CLIENT_SECRET` (from Huma) |
| Login URL | `https://login.salesforce.com` (production) |
| Callback URL | `https://www.becker.com/salesforce/oauth_callback` |

---

### Webform Structure — Fields to Create

Create a single webform with conditional visibility per step.

#### Step 1 — Intent (4 radio tiles)

| Field name | Type | Values |
|---|---|---|
| `intent` | Radio | exploring, enrolling, organization, support |

Show secondary question when `intent = exploring`:

| Field name | Type | Values |
|---|---|---|
| `requesting_for` | Radio | myself, organization |

#### Step 2 — Context (conditional per intent)

**Always visible:**

| Field name | Type | Required | Notes |
|---|---|---|---|
| `first_name` | Text | Yes | |
| `last_name` | Text | Yes | |
| `email` | Email | Yes | |
| `phone` | Tel | B2B only | |
| `product_interest` | Select | Yes | See picklist values below |
| `role_type` | Select | Yes | See picklist values below |

**B2B only** (show when `requesting_for = organization` OR `intent = organization`):

| Field name | Type | Required | Notes |
|---|---|---|---|
| `company` | Text + autocomplete | Yes | Typeahead from SF Accounts |
| `org_type` | Select | Yes | See picklist values below |
| `org_size` | Select | Yes | See picklist values below |
| `hq_state` | Select | Yes | US states |

**B2C only** (show when `requesting_for = myself` OR `intent = enrolling`):

| Field name | Type | Required | Notes |
|---|---|---|---|
| `residence_state` | Select | Yes | US states |
| `graduation_year` | Select | No | See values below |
| `is_current_student` | Checkbox | No | |
| `becker_student_email` | Email | No | Show when `is_current_student = true` |

**Support only** (show when `intent = support`):

| Field name | Type | Required |
|---|---|---|
| `country` | Select | Yes |
| `support_message` | Textarea | No |

#### Step 3 — Consent

| Field name | Type | Required | Notes |
|---|---|---|---|
| `consent_marketing` | Checkbox | Yes | "I agree to receive marketing communications from Becker" |
| `privacy_consent` | Checkbox | Yes | Link to Privacy Policy |

#### Hidden / System fields (set by Drupal on submit, not shown to user)

| Field name | Value |
|---|---|
| `business_brand` | `Becker` |
| `consent_captured_source` | `Becker Contact Us Form` |
| `lead_source_form` | Computed — see mapping table below |
| `suggested_queue` | Computed by routing logic — see below |
| `utm_source` | Captured from URL param |
| `utm_medium` | Captured from URL param |
| `utm_campaign` | Captured from URL param |
| `utm_content` | Captured from URL param |
| `utm_term` | Captured from URL param |

---

### Picklist Values

#### Product Interest (`product_interest`)

| Display label | SF value |
|---|---|
| CPA Exam Review | `CPA` |
| CMA Exam Review | `CMA` |
| CPE Continuing Education | `CPE` |
| CIA Exam Review | `CIA` |
| CIA Challenge Exam | `CIA` |
| Enrolled Agent | `EA` |
| Certified Financial Planner | `CFP` |
| Staff Level Training | `CPA` |

#### Organization Type (`org_type`) — B2B

| Display label | SF value |
|---|---|
| Accounting Firm | `Accounting Firm` |
| Corporation / Healthcare / Bank / Financial Institution | `Corporation/Healthcare/Bank/Financial Institution` |
| Consulting Firm | `Consulting Firm` |
| CPA Alliance | `CPA Alliance` |
| Government Agency / Not for Profit Organization | `Government Agency/Not for Profit Organization` |
| Society / Chapter | `Society/Chapter` |
| Non-US Organization | `Non-US Organization` |
| Student | `Student` |
| University | `University` |
| Other | `Other` |

#### Organization Type — B2C (add "None" at top)

Same list as B2B, plus:

| Display label | SF value |
|---|---|
| None | *(empty/null)* |

#### Number of Employees (`org_size`) — B2B only

| Display label | SF value |
|---|---|
| Fewer than 25 | `<25` |
| 26–100 | `26-100` |
| 101–250 | `101-250` |
| 251 or more | `251+` |

#### Role Type (`role_type`)

| Display label | SF value |
|---|---|
| Undergraduate Student | `Undergrad Student` |
| Graduate Student | `Grad Student` |
| Professor | `Professor` |
| Supervisor / Director / Manager | `Supervisor/Director/Manager` |
| Partner / CEO / CFO | `Partner/CEO/CFO` |
| Administrator | `Administrator` |
| Unemployed | `Unemployed` |
| Learning / Training Leader | `Learning/Training Leader` |
| Staff Accountant | `Staff Accountant` |
| Other | `Other` |

#### Graduation Year (`graduation_year`) — B2C only

`2024, 2025, 2026, 2027, 2028, 2029, 2030` + `Already graduated` (value: `0000`)

---

### Salesforce Field Mapping (`ExternalWebform__c`)

This is the exact mapping Drupal Salesforce Suite must send on submit:

| Drupal field | ExternalWebform__c API name | Notes |
|---|---|---|
| `first_name` | `First_Name__c` | |
| `last_name` | `Last_Name__c` | |
| `email` | `Email__c` | |
| `phone` | `Phone__c` | |
| `company` | `Company__c` | |
| `org_type` | `Organization_Type__c` | |
| `org_size` | `Organization_Size__c` | |
| `role_type` | `Role_Type__c` | |
| `hq_state` | `Address__StateCode__s` | B2B HQ state |
| `product_interest` | `Primary_Interest__c` | |
| `consent_marketing` (bool→string) | `Consent_Provided__c` | Send `Email;Phone;SMS` when true, null when false |
| `privacy_consent` (bool→string) | `Privacy_Consent_Status__c` | Send `OptIn` when true, `NotSeen` when false |
| `business_brand` | `BusinessBrand__c` | Always `Becker` |
| `consent_captured_source` | `Consent_Captured_Source__c` | Always `Becker Contact Us Form` |
| `lead_source_form` | `Lead_Source_Form__c` | See computed values below |
| `suggested_queue` | `RFI_Suggested_Queue__c` | See routing logic below |
| `utm_source` + others | `Lead_Source_Detail__c` | Format: `utm_source=X \| utm_medium=Y \| utm_campaign=Z` |
| `support_message` | `If_other__c` | Support path only |
| `is_current_student` | `Is_Current_Becker_Student__c` | true/false |
| `becker_student_email` | `email_address_you_use_to_login_to_Becker__c` | |
| `graduation_year` | `YearInSchool__c` | |
| Campaign ID (computed) | `Campaign__c` | See campaign IDs below |
| `requesting_for` (computed) | `Requesting_for__c` | `My organization` (B2B) or `Myself` (B2C) |

#### `Lead_Source_Form__c` computed values

| Intent path | Value |
|---|---|
| B2B (`requesting_for = organization`) | `Contact Us - Buying for Org` |
| Exploring B2C | `Contact Us - Exploring` |
| Ready to enroll | `Contact Us - Enrolling` |
| Support | `Customer Service - Contact Us` |

---

### Campaign ID Mapping (`Campaign__c`)

B2B (all products): `701VH00000tZOSqYAO`

| Product | B2C Campaign ID |
|---|---|
| CPA / Certified Public Accountant | `7013r000001l0CwAAI` |
| CMA / Certified Management Accountant | `7013r000001l0DBAAY` |
| CPE / Continuing Professional Education | `7013r000001l0D6AAI` |
| CIA / Certified Internal Auditor | `701VH00000coo8bYAA` |
| EA / Enrolled Agent | `701VH00000cnfxAYAQ` |
| CFP / Certified Financial Planner | `701VH00000tZNTXYA4` |
| Staff Level Training | `701VH00000tZPTiYAO` |
| CIA Challenge Exam | `701VH00000tZQ6QYAW` |

---

### Routing Logic — `RFI_Suggested_Queue__c`

Drupal must compute this before sending to SF. The queue is based on `org_type` × `org_size`:

| Org Type | `<25` | `26-100` | `101-250` | `251+` |
|---|---|---|---|---|
| Accounting Firm | Inside Sales | Global Firms | Global Firms | Global Firms |
| Corp/Healthcare/Bank/Fin. Inst. | Inside Sales | New Client Acquisition | New Client Acquisition | New Client Acquisition |
| Consulting Firm | Global Firms | Global Firms | Global Firms | Global Firms |
| CPA Alliance | Global Firms | Global Firms | Global Firms | Global Firms |
| Gov Agency/Not-for-Profit | Inside Sales | New Client Acquisition | New Client Acquisition | New Client Acquisition |
| Society/Chapter | University | University | University | University |
| Non-US Organization | International | International | International | International |
| Student | Inside Sales | Inside Sales | Inside Sales | Inside Sales |
| University | University | University | University | University |
| Other | Inside Sales | Inside Sales | Inside Sales | Inside Sales |

**B2C: leave `RFI_Suggested_Queue__c` empty/null** — SF flow assigns Inside Sales automatically.

PHP helper to compute queue (add to a custom Drupal module or webform handler):

```php
function becker_get_suggested_queue(string $org_type, string $org_size): string {
  $matrix = [
    'Accounting Firm' => ['<25' => 'Inside Sales', '26-100' => 'Global Firms', '101-250' => 'Global Firms', '251+' => 'Global Firms'],
    'Corporation/Healthcare/Bank/Financial Institution' => ['<25' => 'Inside Sales', '26-100' => 'New Client Acquisition', '101-250' => 'New Client Acquisition', '251+' => 'New Client Acquisition'],
    'Consulting Firm' => ['<25' => 'Global Firms', '26-100' => 'Global Firms', '101-250' => 'Global Firms', '251+' => 'Global Firms'],
    'CPA Alliance' => ['<25' => 'Global Firms', '26-100' => 'Global Firms', '101-250' => 'Global Firms', '251+' => 'Global Firms'],
    'Government Agency/Not for Profit Organization' => ['<25' => 'Inside Sales', '26-100' => 'New Client Acquisition', '101-250' => 'New Client Acquisition', '251+' => 'New Client Acquisition'],
    'Society/Chapter' => ['<25' => 'University', '26-100' => 'University', '101-250' => 'University', '251+' => 'University'],
    'Non-US Organization' => ['<25' => 'International', '26-100' => 'International', '101-250' => 'International', '251+' => 'International'],
    'Student' => ['<25' => 'Inside Sales', '26-100' => 'Inside Sales', '101-250' => 'Inside Sales', '251+' => 'Inside Sales'],
    'University' => ['<25' => 'University', '26-100' => 'University', '101-250' => 'University', '251+' => 'University'],
    'Other' => ['<25' => 'Inside Sales', '26-100' => 'Inside Sales', '101-250' => 'Inside Sales', '251+' => 'Inside Sales'],
  ];
  return $matrix[$org_type][$org_size] ?? 'Inside Sales';
}
```

---

### Drupal Salesforce Mapping Configuration

In Drupal: **Configuration → Salesforce → Object Mappings → Add mapping**

| Setting | Value |
|---|---|
| Drupal entity type | Webform submission |
| Webform | becker_rfi (your webform machine name) |
| Salesforce object | `ExternalWebform__c` |
| Sync direction | Drupal → Salesforce only |
| Trigger | On webform submit |

Then add each field mapping row per the table in the previous section.

---

### UTM Capture (JavaScript — add to theme or webform JS)

Add to the page template or as a webform JS behaviour:

```javascript
(function() {
  var params = new URLSearchParams(window.location.search);
  var utmFields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  utmFields.forEach(function(key) {
    var val = params.get(key);
    if (val) {
      var el = document.querySelector('[name="' + key + '"]');
      if (el) el.value = val;
    }
  });
})();
```

---

### Conditional Field Logic (Drupal Webform States)

In Webform field settings → Conditions tab:

**Show `org_type`, `org_size`, `company`, `hq_state`, `phone`** when:
- `requesting_for` is `organization`
- OR `intent` is `organization`

**Show `residence_state`, `graduation_year`, `is_current_student`** when:
- `requesting_for` is `myself`
- OR `intent` is `enrolling`

**Show `becker_student_email`** when:
- `is_current_student` is checked

**Show support fields** when:
- `intent` is `support`

**Hide org fields on support path.**

---

### Organization Name Autocomplete (optional — Phase 2)

The React form has live typeahead from SF Accounts. To replicate in Drupal:

```
GET https://becker-rfi.railway.app/api/accounts?q=<search_term>
```

Returns: `[{ "id": "001...", "name": "Smith & Associates" }]`

Wire this to a Drupal autocomplete field using a custom callback or the Views module.

---

### Round Robin Rep Assignment

After a lead is assigned to a queue, Salesforce can distribute it to individual reps via round-robin.

**Option 1 — Native SF Assignment Rules (recommended, no code):**
1. SF Setup → **Lead Assignment Rules** → New Rule
2. Rule Name: `Becker RFI Round Robin`
3. Add rule entries — one per queue, set "Assign To" = each rep in the queue in order
4. SF natively cycles through them in the order listed

**Option 2 — Node.js round-robin (already coded):**
The routing engine exports `pickRoundRobinRep(queueName)` which rotates reps in 15-minute slots.
Sam can activate this in `lead-processor.js` once queue members are added in SF.

**Required first step (Angel/Huma):**
In SF Setup → Queues → each queue below → click **Edit** → Add Members:

| Queue | Reps to add |
|---|---|
| Global Firms | Andrea Jennings, Kristin Curcuru, Moira Gordon, Richard Slusz |
| New Client Acquisition | Angelique Watson, Henry Quinones, Jill Kirkpatrick, Nahal Shafagh, Sara DiGello, Sharice Jessup, Stephanie Anastasio |
| University | Aaron Gocer, Addie Mitchell, Amy Johnson, Amy Napolski, Angela White, Anthony Quintero, Chandler Lackey, Chantel Garrone, Christian Santiago, Diego Mansilla, Ellen Garner Crawford, Hayley Bales, Jackie Oblinger, Jeffrey Sampson, Kim Holland, Kristine Snyder, Kurtis Williams, Lindsay Sauter, Lisa Easley, Lupe Casillas, Michael Ceglie, Moyrali Roig, Natasha Nurse, Robyn Hampton Peers, Sandy Broadbent, Sharrieff Hazim, Stephen McIntosh |
| International | Ben Wong, Digvijay Singh, Eduardo Escalante, Manmeet Anand |
| Inside Sales | Aaron Smith, Andrew Masiewicz, Ashley Griffin, Austin Shields, Brock Batchko, Catalina Gamez, Glenn Proud, Matt Anklam, Matthew Clark, Michelle Mazurek, Ruben Munoz, Sarah Lunday, Stacey Bachara, Tim Carpenter, Zina Fitzgerald |
| Customer Success & Expansion | Alexandria Reyes, Ashley Stephens, Jenae Klinke, JoAnn Veiga, Laura Copley, Melissa VanFossen, Shaida Hong |

---

### Campaign Association

Campaigns are automatically set per product interest when the form submits. No Drupal action needed — the `Campaign__c` field is populated by the routing engine and the Salesforce flow creates the `CampaignMember` record automatically.

| Product | Campaign ID |
|---|---|
| CPA Exam Review | `7013r000001l0CwAAI` |
| CMA Exam Review | `7013r000001l0DBAAY` |
| Continuing Professional Education | `7013r000001l0D6AAI` |
| CIA Exam Review | `701VH00000coo8bYAA` |
| Enrolled Agent | `701VH00000cnfxAYAQ` |
| Certified Financial Planner | `701VH00000tZNTXYA4` |
| Staff Level Training | `701VH00000tZPTiYAO` |
| CIA Challenge Exam | `701VH00000tZQ6QYAW` |
| B2B (all products) | `701VH00000tZOSqYAO` |

To add new campaigns: update `B2C_CAMPAIGN_IDS` in `src/lead-processor.js` and add the new Campaign ID.

---

### Testing Checklist

After build, submit one of each and verify in Salesforce Leads:

- [ ] **B2B — Accounting Firm, 26-100** → Lead RecordType = B2B, OwnerId = Global Firms queue
- [ ] **B2B — Corporation, 251+** → Lead RecordType = B2B, OwnerId = New Client Acquisition queue
- [ ] **B2C — Exploring (myself)** → Lead RecordType = B2C, OwnerId = Inside Sales queue
- [ ] **Support path** → No Lead created (goes to Case)
- [ ] UTM params appear in `Lead_Source_Detail__c`
- [ ] `Subscription_id__c` populated based on product interest
- [ ] `Business_Brand__c` = `Becker`
- [ ] `Consent_Provided__c` = `Email;Phone;SMS`

---

## Contacts

| Person | Role | For |
|---|---|---|
| Sam Chaudhary | AI Architect | Field mapping questions, routing logic, SF API |
| Huma Yousuf | SF Developer | Connected App credentials, ExternalWebform__c field names |
| Angel Cichy | SF Admin | SF field creation, record type assignments |
| Charlene Ceci | DevOps | Acquia deployment, release windows |
