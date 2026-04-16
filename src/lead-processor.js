const { routeLead, mapProgramToJourney } = require('./routing-engine');
const sf = require('./sf-client');
const sfmc = require('./sfmc-client');
const { validateEmail } = require('./email-validator');

// UTM fields to capture
const UTM_FIELDS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];

function buildLeadRecord(submission, routingResult, existingAccountId) {
  const {
    firstName, lastName, email, phone,
    orgName, orgType, orgSize, state,
    roleType, productInterest, graduationYear,
    beckerStudentEmail, message, preferredLearning,
    intentPath, utmParams, consentGiven,
  } = submission;

  const isB2B = intentPath === 'b2b';

  const record = {
    FirstName: firstName,
    LastName: lastName,
    Email: email,
    Phone: phone || null,
    Company: orgName || (isB2B ? 'Unknown' : lastName),
    // LeadSource = WHERE they came from (channel), not B2B/B2C (per Angel + Josh 2026-04-16)
    LeadSource: submission.leadSource || 'Web - Contact Us Form',
    Brand__c: 'Becker Professional Education Corporation',
    Organization_Type__c: orgType || null,
    Organization_Size__c: orgSize || null,
    HQ_State__c: state || null,
    Role_Type__c: roleType || null,
    Program_of_Interest__c: productInterest || null,
    Lead_Status__c: mapIntentToStatus(intentPath),
    Description: message || null,
    lms__Preferred_Learning_Modality__c: preferredLearning || null,
    Graduation_Year__c: graduationYear || null,
    Becker_Student_Email__c: beckerStudentEmail || null,
    CreatedDate_RFI__c: new Date().toISOString(),
  };

  // UTM tracking
  if (utmParams) {
    const utmStr = UTM_FIELDS
      .filter(k => utmParams[k])
      .map(k => `${k}=${utmParams[k]}`)
      .join(' | ');
    record.LeadSource_Detail__c = utmStr || null;
  }

  // Link to existing account if found
  if (existingAccountId) {
    record.Account__c = existingAccountId;
  }

  return record;
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

async function processSubmission(submission) {
  const log = [];

  try {
    // Step 1: Email validation + spam/bot detection (Monica flagged spam as major issue)
    const emailCheck = await validateEmail(
      submission.email, submission.firstName, submission.lastName, submission.message
    );
    if (!emailCheck.valid) {
      log.push(`REJECTED: ${emailCheck.reason}`);
      return { status: 'rejected', reason: emailCheck.reason, log };
    }
    log.push(`Email valid: ${emailCheck.action} | business: ${emailCheck.isBusiness}`);

    // Step 2: SUPPORT PATH → creates SF Case, not Lead (per image 12 architecture)
    if (submission.intentPath === 'support') {
      const sfCase = await sf.createCase({
        firstName: submission.firstName,
        lastName: submission.lastName,
        email: submission.email,
        topic: submission.supportTopic,
        product: submission.productInterest,
        message: submission.message,
        leadSource: submission.leadSource || 'Web - Contact Us Form',
      }).catch(err => { log.push(`Case create error: ${err.message}`); return null; });

      if (sfCase) {
        await sf.assignCaseToQueue(sfCase.id, 'Support Tier 1').catch(() => null);
        log.push(`SF Case created: ${sfCase.id} → Support queue`);
      }

      // Confirmation email fires on ALL paths (image 12: <20 min automated)
      await sfmc.fireJourneyEntry({
        journey: 'Confirmation Email',
        email: submission.email,
        firstName: submission.firstName,
        lastName: submission.lastName,
        programOfInterest: submission.productInterest,
        leadId: sfCase?.id || '',
        leadStatus: 'Support',
        brand: 'Becker Professional Education Corporation',
      }).catch(() => null);

      return { status: 'created', type: 'case', caseId: sfCase?.id, log };
    }

    // Step 3: Dedup check (SF already has native email duplicate rules — Huma confirmed 2026-04-16)
    const existing = await sf.findExistingRecord(submission.email).catch(() => null);
    if (existing) {
      log.push(`Existing lead found: ${existing.Id} — updating instead of creating`);
      return { status: 'updated', leadId: existing.Id, log };
    }

    // Step 4: Account owner lookup (B2B only)
    let existingAccountOwner = null;
    let existingAccountId = null;
    if (submission.intentPath === 'b2b' && submission.orgName) {
      const account = await sf.findAccountOwner(submission.orgName).catch(() => null);
      if (account) {
        existingAccountOwner = account;
        existingAccountId = account.accountId;
        log.push(`Existing account found: ${submission.orgName} — owner: ${account.name}`);
      }
    }

    // Step 5: Route the lead
    const routingResult = routeLead({
      ...submission,
      existingAccountOwner,
    });
    log.push(`Routing decision: ${JSON.stringify(routingResult)}`);

    // Step 6: Build and create SF Lead record
    const leadRecord = buildLeadRecord(submission, routingResult, existingAccountId);
    const created = await sf.createLead(leadRecord);
    const leadId = created.id;
    log.push(`Lead created: ${leadId}`);

    // Step 6a: SFMC confirmation email — ALL paths · <20 min · automated (image 12)
    await sfmc.fireJourneyEntry({
      journey: 'Confirmation Email',
      email: submission.email,
      firstName: submission.firstName,
      lastName: submission.lastName,
      programOfInterest: submission.productInterest,
      leadId,
      leadStatus: mapIntentToStatus(submission.intentPath),
      brand: 'Becker Professional Education Corporation',
    }).catch(err => log.push(`Confirmation email error (non-fatal): ${err.message}`));
    log.push('SFMC confirmation email triggered (<20 min)');

    // Step 7: CommSubscriptionConsent record (CDM model)
    if (submission.consentGiven) {
      await sf.createCommSubscriptionConsent({
        leadId,
        email: submission.email,
        consentGiven: true,
      });
      log.push('CommSubscriptionConsent created');
    }

    // Step 8: Assign to queue or rep
    if (routingResult.leadType === 'B2B') {
      if (routingResult.rep) {
        await sf.assignLeadToRep(leadId, routingResult.rep);
        log.push(`Assigned to rep: ${routingResult.rep}`);
      } else if (routingResult.queue) {
        await sf.assignLeadToQueue(leadId, routingResult.queue);
        log.push(`Assigned to queue: ${routingResult.queue}`);
      }
    }

    // Step 9: Fire SFMC journey entry (separate from confirmation email)
    const journey = routingResult.journey || mapProgramToJourney(submission.productInterest);
    if (journey) {
      // Ready to enroll = "Concierge day one" journey (per image 12)
      const sfmcJourney = submission.intentPath === 'ready'
        ? 'Concierge Day One'
        : routingResult.leadType === 'B2B'
          ? 'B2B Nurture Journey'
          : journey;

      await sfmc.fireJourneyEntry({
        journey: sfmcJourney,
        email: submission.email,
        firstName: submission.firstName,
        lastName: submission.lastName,
        programOfInterest: submission.productInterest,
        leadId,
        leadStatus: mapIntentToStatus(submission.intentPath),
        brand: 'Becker Professional Education Corporation',
      });
      log.push(`SFMC journey fired: ${sfmcJourney}`);
    }

    return {
      status: 'created',
      leadId,
      queue: routingResult.queue,
      rep: routingResult.rep,
      journey,
      reason: routingResult.reason,
      log,
    };

  } catch (err) {
    log.push(`ERROR: ${err.message}`);
    return { status: 'error', error: err.message, log };
  }
}

module.exports = { processSubmission };
