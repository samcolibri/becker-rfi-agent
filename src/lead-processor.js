const { routeLead } = require('./routing-engine');
const sf = require('./sf-client');
const sfmc = require('./sfmc-client');
const { validateEmail } = require('./email-validator');

const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

// Campaign IDs synced from SF sandbox on 2026-04-21
// Source: becker_campaign_mapping.xlsx (Josh Elefante) cross-referenced with Dev sandbox campaigns (Huma Yousuf)
// B2C: product-specific per Josh's mapping; B2B: single "B2B Lead Form" campaign regardless of product
// IMPORTANT: these IDs are sandbox-specific — re-run scripts/sync-campaign-ids.js before deploying to prod
const B2C_CAMPAIGN_IDS = {
  'Certified Financial Planner': '701U700000eyrnyIAA',
  'Certified Internal Auditor': '701U700000eyrnxIAA',
  'CIA Challenge Exam': '701U700000eyro1IAA',
  'Certified Management Accountant': '701U700000eyrnvIAA',
  'Certified Public Accountant': '701U700000eyrntIAA',
  'Continuing Professional Education': '701U700000eyrnuIAA',
  'Enrolled Agent': '701U700000eyrnwIAA',
  'Staff Level Training': '701U700000eyro0IAA',
};
const B2B_CAMPAIGN_ID = '701U700000eyrnzIAA'; // B2B Lead Form

// ExternalWebform__c.Primary_Interest__c uses abbreviated picklist values
const PRODUCT_INTEREST_MAP = {
  'Certified Public Accountant':       'CPA',
  'Certified Management Accountant':   'CMA',
  'Continuing Professional Education': 'CPE',
  'Certified Internal Auditor':        'CIA',
  'CIA Challenge Exam':                'CIA',
  'Enrolled Agent':                    'EA',
  'Certified Financial Planner':       'CFP',
  'Staff Level Training':              'CPA',
};

// Maps to EW.CommunicationSubscription__c — v21 reads this to create CDM subscription records
// CDM - Lead Trigger Flow then reads CDM records and sets Lead.Subscription_id__c
const SUBSCRIPTION_MAP = {
  b2b: 'B2B - News and Events;B2B - Events;B2B - New Products',
  'Certified Public Accountant':       'CPA Content;CPA Promotions',
  'Certified Management Accountant':   'CMA Content;CMA Promotions',
  'Continuing Professional Education': 'CPE Content;CPE Promotions',
  'Certified Internal Auditor':        'CIA Content;CIA Promotions',
  'CIA Challenge Exam':                'CIA Content;CIA Promotions',
  'Enrolled Agent':                    'EA Content;EA Promotions',
  'Certified Financial Planner':       'CPA Content;CPA Promotions',
  'Staff Level Training':              'CPE Content;CPE Promotions',
};

function toSfProductInterest(productInterest) {
  return PRODUCT_INTEREST_MAP[productInterest] || productInterest || null;
}

function getCampaignId(intentPath, productInterest) {
  if (intentPath === 'support') return null;
  if (intentPath === 'b2b') return B2B_CAMPAIGN_ID;
  return B2C_CAMPAIGN_IDS[productInterest] || null;
}

function mapIntentToStatus(intentPath) {
  const map = {
    exploring: 'Exploring',
    ready: 'Ready to Enroll',
    b2b: 'B2B',
    support: 'Support',
  };
  return map[intentPath] || 'New';
}

function buildWebformRecord(submission, suggestedQueue) {
  const {
    firstName, lastName, email, phone,
    orgName, orgType, orgSize, state, city, country,
    roleType, productInterest, graduationYear,
    beckerStudentEmail, isCurrentBeckerStudent, message, intentPath,
    utmParams, consentGiven, privacyConsent,
  } = submission;

  const utmStr = utmParams
    ? UTM_FIELDS.filter(k => utmParams[k]).map(k => `${k}=${utmParams[k]}`).join(' | ')
    : null;

  return {
    First_Name__c: firstName,
    Last_Name__c: lastName,
    Email__c: email,
    Phone__c: phone || null,
    Company__c: orgName || null,
    Primary_Interest__c: toSfProductInterest(productInterest),
    Requesting_for__c: intentPath === 'b2b' ? 'My organization' : 'Myself',
    Organization_Type__c: orgType || null,
    Role_Type__c: roleType || null,
    Organization_Size__c: orgSize || null,
    Address__StateCode__s: state || null,
    Address__City__s: city || null,
    Address__CountryCode__s: country || null,
    HQ_State__c: intentPath === 'b2b' ? (state || null) : null,
    Resident_State__c: intentPath !== 'b2b' ? (state || null) : null,
    Is_Current_Becker_Student__c: isCurrentBeckerStudent || false,
    email_address_you_use_to_login_to_Becker__c: beckerStudentEmail || null,
    What_year_do_you_plan_to_graduate__c: graduationYear || null,
    BusinessBrand__c: 'Becker',
    Lead_Source_Form__c: {
      b2b: 'Contact Us - Buying for Org',
      exploring: 'Contact Us - Exploring',
      ready: 'Contact Us - Enrolling',
      support: 'Customer Service - Contact Us',
    }[intentPath] || 'Contact Us - Exploring',
    Lead_Source_Form_Date__c: new Date().toISOString(),
    RFI_Suggested_Queue__c: suggestedQueue || null,
    Lead_Source_Detail__c: utmStr || null,
    // Consent — multipicklist; all three channels when user opts in
    Consent_Provided__c: consentGiven ? 'Email;Phone;SMS' : null,
    Consent_Captured_Source__c: 'Becker Contact Us Form',
    Privacy_Consent_Status__c: privacyConsent ? 'OptIn' : 'NotSeen',
    // CDM subscription IDs — v21 reads this to create CommSubscriptionConsent records
    // CDM - Lead Trigger Flow then reads those records and sets Lead.Subscription_id__c
    CommunicationSubscription__c: intentPath === 'b2b'
      ? SUBSCRIPTION_MAP.b2b
      : (intentPath !== 'support' ? (SUBSCRIPTION_MAP[productInterest] || null) : null),
    // Free-text message for support path
    If_other__c: message || null,
    // Campaign membership — drives SFMC email sends via MC Connect
    Campaign__c: getCampaignId(intentPath, productInterest) || null,
  };
}

async function processSubmission(submission) {
  const log = [];

  try {
    // Step 1: Spam / bot detection
    const emailCheck = await validateEmail(
      submission.email, submission.firstName, submission.lastName, submission.message
    );
    if (!emailCheck.valid) {
      log.push(`REJECTED: ${emailCheck.reason}`);
      return { status: 'rejected', reason: emailCheck.reason, log };
    }
    log.push(`Email valid | business: ${emailCheck.isBusiness}`);

    // Step 2: Calculate routing queue and pass to ExternalWebform
    let suggestedQueue = null;
    let routingConfidence = 1.0;
    if (submission.intentPath === 'b2b') {
      const routingResult = routeLead(submission);
      suggestedQueue = routingResult.queue || 'CS - Inside Sales';
      routingConfidence = routingResult.confidence ?? 1.0;
      log.push(`Routing: ${suggestedQueue} (${routingResult.reason}) confidence=${routingConfidence.toFixed(2)}`);
      // arxiv:2406.03441 — low confidence leads flagged for human review
      if (routingResult.requiresHumanReview) {
        log.push(`⚠ LOW CONFIDENCE ROUTING: ${(routingResult.ambiguityFlags || []).join(', ')} — route to CS - Inside Sales pending human review`);
        suggestedQueue = 'CS - Inside Sales';
      }
    } else if (submission.intentPath !== 'support') {
      // B2C paths (exploring, ready) → CS - Inside Sales
      suggestedQueue = 'CS - Inside Sales';
      log.push('Routing: CS - Inside Sales (B2C path)');
    }

    // Step 3a: Support path → also write to Contact_Us_Form__c (existing support form object)
    if (submission.intentPath === 'support') {
      const cuf = await sf.createContactUsForm({
        firstName: submission.firstName,
        lastName: submission.lastName,
        email: submission.email,
        phone: submission.phone,
        country: submission.country,
        city: submission.city,
        state: submission.state,
        productInterest: submission.productInterest,
        message: submission.message,
        consentGiven: submission.consentGiven,
        privacyConsent: submission.privacyConsent,
      });
      log.push(`Contact_Us_Form__c created: ${cuf.id}`);
    }

    // Step 3b: Write to ExternalWebform__c — SF Flow handles dedup, Lead/Case creation, queue assign
    const webformRecord = buildWebformRecord(submission, suggestedQueue);
    const created = await sf.createExternalWebform(webformRecord);
    log.push(`ExternalWebform__c created: ${created.id} — SF Flow will process`);

    // Record routing decision to Graphiti (non-fatal)
    if (submission.intentPath === 'b2b' && suggestedQueue) {
      try {
        const { execFileSync } = require('child_process');
        const path = require('path');
        const os = require('os');
        const graphitiScript = path.join(os.homedir(), '.claude', 'control-tower', 'graphiti_brain.py');
        execFileSync('python3', [
          graphitiScript, 'record-routing',
          submission.organizationType || 'unknown',
          submission.employeeCount    || 'unknown',
          submission.productInterest  || 'unknown',
          suggestedQueue,
        ], { timeout: 5000 });
      } catch (_e) { /* non-fatal */ }
    }

    // Step 4: Confirmation email via SFMC — fires on ALL paths < 20 min
    await sfmc.fireJourneyEntry({
      journey: 'Confirmation Email',
      email: submission.email,
      firstName: submission.firstName,
      lastName: submission.lastName,
      programOfInterest: submission.productInterest,
      leadId: created.id,
      leadStatus: mapIntentToStatus(submission.intentPath),
      brand: 'Becker',
    }).catch(err => log.push(`Confirmation email error (non-fatal): ${err.message}`));
    log.push('SFMC confirmation email triggered');

    // Step 5: Program nurture journey — PENDING Nick Leavitt defining correct journeys
    // Will be wired once Nick confirms which journeys fire on form submission
    // (Angel flagged: current journey list fires post-demo, not post-form — 2026-04-17)

    return {
      status: 'created',
      webformId: created.id,
      queue: suggestedQueue,
      log,
    };

  } catch (err) {
    log.push(`ERROR: ${err.message}`);
    return { status: 'error', error: err.message, log };
  }
}

module.exports = { processSubmission };
