# Becker RFI Form — Drupal Deploy Guide
**For:** Brian  
**Time required:** ~20 minutes  
**Result:** Full RFI contact form live on dev.becker.com, submitting leads directly into Salesforce with all routing logic

---

## What you're deploying

1. **Drupal Webform** (`becker_rfi`) — multi-path contact form with B2B/B2C conditional fields, all picklists, UTM capture, consent, computed fields
2. **Salesforce Mapping** — maps every webform field to `ExternalWebform__c` in SF
3. **SF Flow v20** — already deployed to sandbox ✅. Computes the routing queue from org type × size internally (no middleware needed)

---

## STEP 1 — Import the Webform

Go to: **Admin → Structure → Webforms → Import**  
(URL: `/admin/structure/webforms/manage/import`)

Paste the contents of `drupal/config/webform.webform.becker_rfi.yml` and click **Import**.

**Or via Drush:**
```bash
drush php-eval "
\$yaml = file_get_contents('/path/to/becker-rfi-agent/drupal/config/webform.webform.becker_rfi.yml');
\$data = \Drupal\Core\Serialization\Yaml::decode(\$yaml);
\Drupal::configFactory()->getEditable('webform.webform.becker_rfi')->setData(\$data)->save();
echo 'Done';
"
```

**Verify:** Go to `/form/becker-rfi` — form should render with all fields.

---

## STEP 2 — Configure the Salesforce Mapping

Go to: **Admin → Salesforce → Mappings → Add Mapping**  
(URL: `/admin/salesforce/mappings/add`)

Fill in:

| Setting | Value |
|---|---|
| **Label** | `Becker RFI → ExternalWebform__c` |
| **Drupal Entity Type** | `Webform submission` |
| **Drupal Bundle** | `becker_rfi` (Becker - Contact Us) |
| **Salesforce Object** | `ExternalWebform__c` |
| **Salesforce Auth** | *(select your active sandbox auth)* |
| **Sync Triggers** | ✅ Drupal entity create (push only) |

Click **Save**.

---

## STEP 3 — Map the Fields

On the mapping edit page, add these field mappings one by one.  
Use the reference file `drupal/config/salesforce_field_map.yml` for the complete list.

**Webform field → Salesforce field:**

| Drupal (Webform Token) | Salesforce Field | Notes |
|---|---|---|
| `[webform_submission:values:first_name]` | `First_Name__c` | |
| `[webform_submission:values:last_name]` | `Last_Name__c` | |
| `[webform_submission:values:email]` | `Email__c` | |
| `[webform_submission:values:phone]` | `Phone__c` | |
| `[webform_submission:values:requesting_for]` | `Requesting_for__c` | "Myself" or "My organization" |
| `[webform_submission:values:product_interest]` | `Primary_Interest__c` | |
| `[webform_submission:values:company]` | `Company__c` | |
| `[webform_submission:values:org_type]` | `Organization_Type__c` | |
| `[webform_submission:values:org_size]` | `Organization_Size__c` | |
| `[webform_submission:values:hq_state]` | `HQ_State__c` | |
| `[webform_submission:values:role_type]` | `Role_Type__c` | |
| `[webform_submission:values:state_of_residence]` | `Resident_State__c` | |
| `[webform_submission:values:is_current_becker_student]` | `Is_Current_Becker_Student__c` | |
| `[webform_submission:values:becker_account_email]` | `email_address_you_use_to_login_to_Becker__c` | |
| `[webform_submission:values:graduation_year]` | `What_year_do_you_plan_to_graduate__c` | |
| `[webform_submission:values:message]` | `If_other__c` | |
| `[webform_submission:values:business_brand]` | `BusinessBrand__c` | Always "Becker" |
| `[webform_submission:values:lead_source_form]` | `Lead_Source_Form__c` | Computed field |
| `[webform_submission:values:lead_source_detail]` | `Lead_Source_Detail__c` | Computed UTM string |
| `[webform_submission:values:comm_subscription]` | `CommunicationSubscription__c` | Computed subscriptions |
| `[webform_submission:values:campaign_id]` | `Campaign__c` | Computed campaign ID |
| `[webform_submission:values:consent_provided_value]` | `Consent_Provided__c` | "Email" or blank |
| `[webform_submission:values:privacy_consent_value]` | `Privacy_Consent_Status__c` | "OptIn" or "NotSeen" |

> **Note:** Do NOT map `RFI_Suggested_Queue__c` — SF Flow v20 computes this automatically from org type × size.  
> **Note:** `Lead_Source_Form_Date__c` is also set by the SF flow (not the form).

---

## STEP 4 — Place the form on /contact-us

Option A — **Add via page editor:**
1. Go to Admin → Content → find "Contact Us" page → Edit
2. Add a component of type `atge_form`
3. Select the `becker_rfi` webform
4. Save & publish

Option B — **Replace existing form:**  
If there's already a form component on the page, swap the webform reference to `becker_rfi`.

---

## STEP 5 — Test end-to-end

Submit a B2B test:
- Requesting for: **My organization**
- Org type: **Accounting Firm**
- Size: **251+**
- Product: **CPA**
- Name/Email/Phone: any test values

Check in SF sandbox (`becker--bpedevf.sandbox.my.salesforce.com`):
1. `ExternalWebform__c` record created with all fields
2. `Lead` record created, Owner = **Global Firms** queue
3. `Lead.RecordTypeId` = B2B (`012i0000001E3hmAAC`)
4. `CampaignMember` record created

Submit a B2C test:
- Requesting for: **Myself**
- Intent: **Exploring**
- Product: **CPA**

Check in SF:
1. Lead Owner = **CS - Inside Sales** queue
2. `Lead.RecordTypeId` = B2C (`01231000000y0UoAAI`)
3. `Lead.Subscription_id__c` = `CPA Promotions;CPA Content`

---

## ⚠️ Production Notes (before go-live on becker.com)

1. **Campaign IDs are dev sandbox IDs** — update the `campaign_id` computed element in the webform with production campaign IDs before deploying to prod. Sam has the mapping.

2. **SF Record Type IDs** — the SF Flow v20 has sandbox-specific RecordTypeIds. These must be updated with prod IDs before deploying the flow to production.

3. **SF Flow v20** — already deployed to sandbox. When ready for production, Sam deploys the same flow XML to the prod org (requires prod SF credentials).

4. **Salesforce Mapping auth** — the mapping must reference the production SF auth config in the prod Drupal environment.

---

## Files in this directory

| File | Purpose |
|---|---|
| `config/webform.webform.becker_rfi.yml` | Complete Drupal webform config — import via Admin UI or Drush |
| `config/salesforce_field_map.yml` | Field mapping reference — use when configuring the SF Mapping in Admin UI |
| `BRIAN_DEPLOY.md` | This file |

---

## Questions?

- Salesforce fields / routing logic: Sam Chaudhary
- Drupal configuration / deployment: Diogo Marcos
- SF flow issues: check `STATUS.md` in the repo root for current flow versions
