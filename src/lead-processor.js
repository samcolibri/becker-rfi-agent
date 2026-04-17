const { routeLead } = require('./routing-engine');
const sf = require('./sf-client');
const sfmc = require('./sfmc-client');
const { validateEmail } = require('./email-validator');

const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

// Campaign IDs from becker_campaign_mapping.xlsx (confirmed 2026-04-17)
const B2C_CAMPAIGN_IDS = {
  'Certified Public Accountant':       '7013r000001l0CwAAI',
  'Certified Management Accountant':   '7013r000001l0DBAAY',
  'Continuing Professional Education': '7013r000001l0D6AAI',
  'Certified Internal Auditor':        '701VH00000coo8bYAA',
  'Enrolled Agent':                    '701VH00000cnfxAYAQ',
  'Certified Financial Planner':       '701VH00000tZNTXYA4',
  'Staff Level Training':              '701VH00000tZPTiYAO',
  'CIA Challenge Exam':                '701VH00000tZQ6QYAW',
};
const B2B_CAMPAIGN_ID = '701VH00000tZOSqYAO';

function getCampaignId(intentPath, productInterest) {
  if (intentPath === 'support') return null;
  if (intentPath === 'b2b') return B2B_CAMPAIGN_ID;
  return B2C_CAMPAIGN_IDS[productInterest] || null;
}

// Maps intent path to query type expected by existing SF Flow
function mapIntentToQueryType(intentPath) {
  if (intentPath === 'support') return 'Support Query';
  return 'Sales Query';
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
    orgName, orgType, orgSize, state,
    roleType, productInterest, graduationYear,
    beckerStudentEmail, message, intentPath,
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
    Primary_Interest__c: productInterest || null,
    IntentPath__c: intentPath,
    OrganizationType__c: orgType || null,
    RoleType__c: roleType || null,
    OrgSizeCategory__c: orgSize || null,
    // Address state sub-field
    Address__StateCode__s: state || null,
    email_address_you_use_to_login_to_Becker__c: beckerStudentEmail || null,
    YearInSchool__c: graduationYear || null,
    BusinessBrand__c: 'Becker Professional Education Corporation',
    Lead_Source_Form__c: 'Web - Contact Us Form',
    Lead_Source_Form_Date__c: new Date().toISOString(),
    // Our routing engine result — SF Flow reads this to set OwnerId
    SuggestedQueue__c: suggestedQueue || null,
    LeadSourceDetail__c: utmStr || null,
    // QueryType drives the SF Flow branch (Sales Query / Support Query)
    QueryType__c: mapIntentToQueryType(intentPath),
    // Consent
    Consent_Provided__c: consentGiven ? 'Commercial Marketing' : null,
    Consent_Captured_Source__c: 'RFI Form — becker.com/contact-us',
    Privacy_Consent_Status__c: privacyConsent ? 'Accepted' : null,
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

    // Step 2: Calculate routing queue (B2B only — we pass result to ExternalWebform)
    let suggestedQueue = null;
    let routingConfidence = 1.0;
    if (submission.intentPath === 'b2b') {
      const routingResult = routeLead(submission);
      suggestedQueue = routingResult.queue || 'Inside Sales';
      routingConfidence = routingResult.confidence ?? 1.0;
      log.push(`Routing: ${suggestedQueue} (${routingResult.reason}) confidence=${routingConfidence.toFixed(2)}`);
      // arxiv:2406.03441 — low confidence leads flagged for human review
      if (routingResult.requiresHumanReview) {
        log.push(`⚠ LOW CONFIDENCE ROUTING: ${(routingResult.ambiguityFlags || []).join(', ')} — route to Inside Sales pending human review`);
        suggestedQueue = 'Inside Sales';
      }
    }

    // Step 3: Write to ExternalWebform__c
    // SF Flow (CreateCaseLeadandOpportunity.v2) fires automatically and handles:
    //   - Dedup by email (update existing Lead vs create new)
    //   - Person Account match → Opportunity
    //   - Business Account match → Lead + Opportunity (both → BA Owner)
    //   - Support Query → Case → CS&E Queue
    //   - Sales Query → Lead → assign to SuggestedQueue__c
    //   - Campaign membership (once Nick Leavitt defines campaigns)
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
      brand: 'Becker Professional Education Corporation',
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
