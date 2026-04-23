#!/usr/bin/env node
/**
 * Becker RFI — Targeted Test Scenarios (Huma's request, 2026-04-23)
 *
 * Covers:
 *   1. CPA Product Interest — Consent Provided fields on Lead
 *   2. All Product Interests — All form fields populated on Lead
 *   3. Queue Assignment — B2B Business Account → Account Owner
 *   4. Queue Assignment — All B2C → CS - Inside Sales
 *   5. Support Form — Contact_Us_Form__c created, all fields, routes to CS - Contact Center Inbound
 *
 * Usage:
 *   node scripts/huma-test-scenarios.js
 *
 * Requires: .env with SF_USERNAME, SF_PASSWORD, SF_SECURITY_TOKEN, SF_LOGIN_URL
 */

require('dotenv').config();

const WAIT_MS = 35000;
const WAIT_MS_CAMPAIGN = 45000; // extra time when Campaign__c triggers CampaignMember DML per record

// ─── SF helpers ──────────────────────────────────────────────────────────────

async function getSession() {
  const u = process.env.SF_USERNAME;
  const p = (process.env.SF_PASSWORD || '') + (process.env.SF_SECURITY_TOKEN || '');
  const loginUrl = process.env.SF_LOGIN_URL || 'https://test.salesforce.com';
  const soap = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com">
  <soapenv:Body><urn:login>
    <urn:username>${u}</urn:username>
    <urn:password>${p}</urn:password>
  </urn:login></soapenv:Body>
</soapenv:Envelope>`;
  const r = await fetch(`${loginUrl}/services/Soap/u/59.0`, {
    method: 'POST', headers: { 'Content-Type': 'text/xml', 'SOAPAction': 'login' }, body: soap,
  });
  const xml = await r.text();
  const token = xml.match(/<sessionId>(.*?)<\/sessionId>/)?.[1];
  const instanceUrl = xml.match(/<serverUrl>(.*?)<\/serverUrl>/)?.[1]?.match(/^(https:\/\/[^/]+)/)?.[1];
  if (!token) throw new Error('SF login failed: ' + xml.slice(0, 400));
  return { token, instanceUrl };
}

let _session;
async function session() {
  if (!_session) _session = await getSession();
  return _session;
}

async function sfGet(path) {
  const { token, instanceUrl } = await session();
  const r = await fetch(`${instanceUrl}/services/data/v59.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d = await r.json();
  if (d.errorCode || (Array.isArray(d) && d[0]?.errorCode)) {
    throw new Error(`SF GET ${path}: ${JSON.stringify(d).slice(0, 200)}`);
  }
  return d;
}

async function sfPost(sobject, body) {
  const { token, instanceUrl } = await session();
  const r = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/${sobject}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!d.id) throw new Error(`SF POST ${sobject}: ${JSON.stringify(d).slice(0, 200)}`);
  return d;
}

async function sfDelete(sobject, id) {
  const { token, instanceUrl } = await session();
  await fetch(`${instanceUrl}/services/data/v59.0/sobjects/${sobject}/${id}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
  });
}

async function query(soql) {
  const d = await sfGet(`/query?q=${encodeURIComponent(soql)}`);
  return d.records || [];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function picklistMatch(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.split(';').sort().join(';') === b.split(';').sort().join(';');
}

async function resolveOwner(ownerId) {
  if (!ownerId) return { type: 'None', name: null };
  try {
    const u = await sfGet(`/sobjects/User/${ownerId}?fields=Name`);
    return { type: 'User', name: u.Name };
  } catch (_) {}
  try {
    const g = await sfGet(`/sobjects/Group/${ownerId}?fields=Name`);
    return { type: 'Queue', name: g.Name };
  } catch (_) {}
  return { type: 'Unknown', name: ownerId };
}

// ─── Result tracking ─────────────────────────────────────────────────────────

const allChecks = [];
let currentSection = '';

function check(field, actual, expected, { exact = true, notBlank = false, note = '' } = {}) {
  let pass;
  let displayExpected = expected;
  if (notBlank) {
    pass = !!actual;
    displayExpected = '(not blank)';
  } else if (exact) {
    pass = actual === expected;
  } else {
    pass = picklistMatch(String(actual || ''), String(expected || ''));
  }
  const icon = pass ? '  ✅' : '  ❌';
  const suffix = note ? ` [${note}]` : '';
  if (pass) {
    console.log(`${icon} ${field}: ${actual}${suffix}`);
  } else {
    console.log(`${icon} ${field}: GOT "${actual}" — WANT "${displayExpected}"${suffix}`);
  }
  allChecks.push({ section: currentSection, field, actual, expected: displayExpected, pass });
  return pass;
}

function section(title) {
  currentSection = title;
  console.log(`\n${'━'.repeat(60)}`);
  console.log(`${title}`);
  console.log('━'.repeat(60));
}

// ─── Scenario 1 + 2: B2C leads — Consent + All Fields ────────────────────────

const PRODUCTS = [
  // phone must be unique per run — SF duplicate rule blocks same phone on multiple leads
  { key: 'CPA', sfVal: 'CPA', sub: 'CPA Content;CPA Promotions',  phone: '(312) 555-0101' },
  { key: 'CMA', sfVal: 'CMA', sub: 'CMA Content;CMA Promotions',  phone: '(312) 555-0102' },
  { key: 'CPE', sfVal: 'CPE', sub: 'CPE Content;CPE Promotions',  phone: '(312) 555-0103' },
  { key: 'CIA', sfVal: 'CIA', sub: 'CIA Content;CIA Promotions',  phone: '(312) 555-0104' },
  { key: 'EA',  sfVal: 'EA',  sub: 'EA Content;EA Promotions',    phone: '(312) 555-0105' },
  { key: 'CFP', sfVal: 'CFP', sub: 'CPA Content;CPA Promotions',  phone: '(312) 555-0106' },
];

async function runB2CProductTests() {
  const ts = Date.now();
  const cleanup = [];

  section('SCENARIO 1+2: B2C All Products — Consent + All Lead Fields');

  // Run each product sequentially to avoid concurrent flow contention on Lead creation
  const ewMap = {}; // productKey → { ewId, email, lead }
  console.log('\nRunning each product sequentially (avoids concurrent SF flow contention)...\n');
  for (const p of PRODUCTS) {
    const email = `e2e.b2c.${p.key.toLowerCase()}.${ts}@becker-test.com`;
    const ewId = await sfPost('ExternalWebform__c', {
      First_Name__c:              'E2E',
      Last_Name__c:               `B2C-${p.key}-${ts}`,
      Email__c:                   email,
      Phone__c:                   p.phone,
      Company__c:                 `TestCo-${p.key}-${ts}`,
      Requesting_for__c:          'Myself',
      Primary_Interest__c:        p.sfVal,
      RFI_Suggested_Queue__c:     'CS - Inside Sales',
      BusinessBrand__c:           'Becker',
      CommunicationSubscription__c: p.sub,
      Consent_Provided__c:        'Email;Phone;SMS',
      Consent_Captured_Source__c: 'Becker RFI Form',
      Privacy_Consent_Status__c:  'OptIn',
      Lead_Source_Form__c:        'Contact Us - Exploring',
      Lead_Source_Form_Date__c:   new Date().toISOString(),
    });
    cleanup.push({ obj: 'ExternalWebform__c', id: ewId.id });
    console.log(`  ${p.key}: EW created, waiting ${WAIT_MS / 1000}s...`);
    await sleep(WAIT_MS);

    const [lead] = await query(
      `SELECT Id, FirstName, LastName, Email, Phone, Company,
              RecordType.Name, Owner.Name, Owner.Type,
              Business_Brand__c, Subscription_id__c,
              Consent_Provided__c, Privacy_Consent_Status__c, Consent_Captured_Source__c,
              Lead_Source_Form__c
       FROM Lead WHERE Email = '${email}' AND IsConverted = false LIMIT 1`
    );
    if (lead) cleanup.push({ obj: 'Lead', id: lead.Id });
    ewMap[p.key] = { ewId: ewId.id, email, lead };
  }

  for (const p of PRODUCTS) {
    const isCPA = p.key === 'CPA';
    const { email, ewId, lead } = ewMap[p.key];

    console.log(`\n── ${p.key} ──────────────────────────────────`);
    if (!lead) { console.log('  ❌ Lead not found'); allChecks.push({ section: currentSection, field: 'Lead exists', actual: 'NOT FOUND', expected: 'Lead', pass: false }); continue; }

    // Scenario 1 (CPA only) + Scenario 2 (all products)
    check('Lead exists',                'found',                    'found');
    check('RecordType',                 lead.RecordType?.Name,      'B2C Lead');
    check('Owner → CS - Inside Sales',  lead.Owner?.Name,           'CS - Inside Sales');
    check('FirstName',                  lead.FirstName,             'E2E');
    check('LastName',                   lead.LastName,              `B2C-${p.key}-${ts}`);
    check('Email',                      lead.Email,                 email);
    check('Phone',                      lead.Phone,                 p.phone);
    check('Company',                    lead.Company,               `TestCo-${p.key}-${ts}`);
    check('Business_Brand__c',          lead.Business_Brand__c,     'Becker');
    check('Subscription_id__c',         lead.Subscription_id__c,    p.sub, { exact: false });
    check('Lead_Source_Form__c',        lead.Lead_Source_Form__c,   null, { notBlank: true });

    // Consent fields — Scenario 1 focuses on these, run for all
    check('Consent_Provided__c',        lead.Consent_Provided__c,   'Email;Phone;SMS', { exact: false,
      note: isCPA ? 'Scenario 1 — CPA consent field focus' : undefined });
    check('Privacy_Consent_Status__c',  lead.Privacy_Consent_Status__c, 'OptIn');
    check('Consent_Captured_Source__c', lead.Consent_Captured_Source__c, null, { notBlank: true });
  }

  // Cleanup
  for (const r of cleanup.reverse()) {
    try { await sfDelete(r.obj, r.id); } catch (_) {}
  }
}

// ─── Scenario 3a: B2B Business Account → Account Owner ───────────────────────

async function runAccountOwnerTest() {
  section('SCENARIO 3a: B2B Business Account Exists → Lead Assigned to Account Owner');
  console.log('\n  Account: Standish Management  |  Expected Owner: JoAnn Veiga (active, Sales_Channel=Firm)');

  const ts = Date.now();
  const email = `e2e.standish.${ts}@becker-test.com`;
  const cleanup = [];

  const ew = await sfPost('ExternalWebform__c', {
    First_Name__c:              'E2E',
    Last_Name__c:               `Standish-${ts}`,
    Email__c:                   email,
    Primary_Interest__c:        'CPA',
    Requesting_for__c:          'My organization',
    Company__c:                 'Standish Management',
    Organization_Type__c:       'Accounting Firm',
    Organization_Size__c:       '251+',
    RFI_Suggested_Queue__c:     'Global Firms',
    BusinessBrand__c:           'Becker',
    CommunicationSubscription__c: 'B2B - News and Events;B2B - Events;B2B - New Products',
    Consent_Provided__c:        'Email',
    Consent_Captured_Source__c: 'Becker RFI Form',
    Privacy_Consent_Status__c:  'OptIn',
    Lead_Source_Form__c:        'Contact Us - Buying for Org',
    Lead_Source_Form_Date__c:   new Date().toISOString(),
  });
  cleanup.push({ obj: 'ExternalWebform__c', id: ew.id });

  console.log(`\n  EW created: ${ew.id}. Waiting ${WAIT_MS / 1000}s for flows...`);
  await sleep(WAIT_MS);

  const leads = await query(
    `SELECT Id, OwnerId, Owner.Name, Owner.Type, RecordType.Name
     FROM Lead WHERE Email = '${email}' AND IsConverted = false LIMIT 1`
  );
  const lead = leads[0];
  if (!lead) { console.log('  ❌ Lead not found'); return; }
  cleanup.push({ obj: 'Lead', id: lead.Id });

  console.log(`\n  Lead ID: ${lead.Id}`);
  console.log(`  Owner: ${lead.Owner?.Type} = ${lead.Owner?.Name}`);

  check('Owner type is User (not Queue)', lead.Owner?.Type, 'User',
    { note: 'Account owner override — Standish has active rep JoAnn Veiga' });
  check('Owner name', lead.Owner?.Name, 'JoAnn Veiga');

  for (const r of cleanup.reverse()) {
    try { await sfDelete(r.obj, r.id); } catch (_) {}
  }
}

// ─── Scenario 3b: All B2C → CS - Inside Sales ────────────────────────────────

async function runB2CQueueTest() {
  section('SCENARIO 3b: All B2C Leads → CS - Inside Sales Queue');

  const ts = Date.now();
  const cleanup = [];
  const ewMap = {};

  console.log('\nCreating B2C EW records for all 6 products...');
  for (const p of PRODUCTS) {
    const email = `e2e.b2cq.${p.key.toLowerCase()}.${ts}@becker-test.com`;
    const ew = await sfPost('ExternalWebform__c', {
      First_Name__c:              'E2E',
      Last_Name__c:               `B2CQ-${p.key}-${ts}`,
      Email__c:                   email,
      Requesting_for__c:          'Myself',
      Primary_Interest__c:        p.sfVal,
      RFI_Suggested_Queue__c:     'CS - Inside Sales',
      BusinessBrand__c:           'Becker',
      CommunicationSubscription__c: p.sub,
      Consent_Provided__c:        'Email',
      Consent_Captured_Source__c: 'Becker RFI Form',
      Privacy_Consent_Status__c:  'OptIn',
      Lead_Source_Form__c:        'Contact Us - Exploring',
      Lead_Source_Form_Date__c:   new Date().toISOString(),
    });
    ewMap[p.key] = { ewId: ew.id, email };
    cleanup.push({ obj: 'ExternalWebform__c', id: ew.id });
    process.stdout.write(`  ${p.key}.. `);
  }
  console.log(`\n  All 6 created. Waiting ${WAIT_MS / 1000}s for flows...\n`);
  await sleep(WAIT_MS);

  const emails = Object.values(ewMap).map(v => `'${v.email}'`).join(',');
  const leads = await query(
    `SELECT Id, Email, Owner.Name, Owner.Type, RecordType.Name
     FROM Lead WHERE Email IN (${emails}) AND IsConverted = false`
  );
  const leadByEmail = {};
  leads.forEach(l => { leadByEmail[l.Email] = l; cleanup.push({ obj: 'Lead', id: l.Id }); });

  for (const p of PRODUCTS) {
    const lead = leadByEmail[ewMap[p.key].email];
    console.log(`\n── ${p.key} ──────────────────────────────────`);
    if (!lead) { check('Lead exists', 'NOT FOUND', 'found'); continue; }
    check('Owner → CS - Inside Sales', lead.Owner?.Name, 'CS - Inside Sales');
    check('Owner type is Queue',       lead.Owner?.Type, 'Queue');
  }

  for (const r of cleanup.reverse()) {
    try { await sfDelete(r.obj, r.id); } catch (_) {}
  }
}

// ─── Scenario 4: Support Form ─────────────────────────────────────────────────

async function runSupportFormTest() {
  section('SCENARIO 4: Support Form → Contact_Us_Form__c + CS - Contact Center Inbound');
  console.log('\n  Creating ExternalWebform__c with support path fields...');

  const ts = Date.now();
  const email = `e2e.support.${ts}@becker-test.com`;
  const cleanup = [];

  // Create EW with support path fields
  const ew = await sfPost('ExternalWebform__c', {
    First_Name__c:              'E2E',
    Last_Name__c:               `Support-${ts}`,
    Email__c:                   email,
    Phone__c:                   '(312) 555-0200',
    Requesting_for__c:          'Myself',
    Primary_Interest__c:        'CPA',
    BusinessBrand__c:           'Becker',
    Consent_Provided__c:        'Email',
    Consent_Captured_Source__c: 'Becker RFI Form',
    Privacy_Consent_Status__c:  'OptIn',
    Lead_Source_Form__c:        'Customer Service - Contact Us',
    Lead_Source_Form_Date__c:   new Date().toISOString(),
    If_other__c:                'I need help with my CPA exam access',
    RFI_Suggested_Queue__c:     'CS - Contact Center Inbound',
  });
  cleanup.push({ obj: 'ExternalWebform__c', id: ew.id });

  console.log(`  EW created: ${ew.id}. Waiting ${WAIT_MS / 1000}s for flows...`);
  await sleep(WAIT_MS);

  // Check 1: Contact_Us_Form__c created
  const cufs = await query(
    `SELECT Id, First_Name__c, Last_Name__c, Email__c, Phone__c,
            I_would_like_to_hear_more_about__c, Query_Type__c,
            Please_tell_us_about_your_question__c,
            Lead_Source_Form__c, Business_Brand__c,
            Consent_Provided__c, Privacy_Consent_Status__c, OwnerId
     FROM Contact_Us_Form__c
     WHERE Email__c = '${email}'
     ORDER BY CreatedDate DESC LIMIT 1`
  );
  const cuf = cufs[0];

  console.log(`\n── Contact_Us_Form__c fields ───────────────`);
  if (!cuf) {
    check('Contact_Us_Form__c created', 'NOT FOUND', 'record created',
      { note: 'Support path may require Node.js middleware; EW alone may not trigger CUF creation' });
    console.log('\n  NOTE: In Drupal-native architecture, Contact_Us_Form__c creation');
    console.log('  requires SF Flow to handle support path. Check flow v20 support branch.');
  } else {
    cleanup.push({ obj: 'Contact_Us_Form__c', id: cuf.Id });
    check('Contact_Us_Form__c created',              cuf.Id,               null,                           { notBlank: true });
    check('First_Name__c',                           cuf.First_Name__c,    'E2E');
    check('Last_Name__c',                            cuf.Last_Name__c,     `Support-${ts}`);
    check('Email__c',                                cuf.Email__c,         email);
    check('Phone__c',                                cuf.Phone__c,         null,                           { notBlank: true });
    check('I_would_like_to_hear_more_about__c',      cuf.I_would_like_to_hear_more_about__c, null,         { notBlank: true });
    check('Query_Type__c',                           cuf.Query_Type__c,    'Support');
    check('Lead_Source_Form__c',                     cuf.Lead_Source_Form__c, 'Customer Service - Contact Us');
    check('Business_Brand__c',                       cuf.Business_Brand__c, 'Becker');
    check('Consent_Provided__c',                     cuf.Consent_Provided__c, null,                       { notBlank: true });
    check('Privacy_Consent_Status__c',               cuf.Privacy_Consent_Status__c, 'OptIn');

    // Routing check
    console.log('\n── Routing: CS - Contact Center Inbound ───`');
    if (cuf.OwnerId) {
      const owner = await resolveOwner(cuf.OwnerId);
      console.log(`  Owner: ${owner.type} = ${owner.name}`);
      check('Routed to CS - Contact Center Inbound', owner.name, 'CS - Contact Center Inbound');
    } else {
      check('OwnerId set on Contact_Us_Form__c', 'null', 'CS - Contact Center Inbound queue',
        { note: 'OwnerId not set — routing to CS - Contact Center Inbound not yet implemented in flow' });
    }
  }

  // Also check: was a Lead created (should NOT be for support path)
  console.log('\n── Lead should NOT be created for support path ─');
  const supportLeads = await query(
    `SELECT Id FROM Lead WHERE Email = '${email}' AND IsConverted = false LIMIT 1`
  );
  const leadCreated = supportLeads.length > 0;
  check('No Lead created (support → Contact_Us_Form__c only)', String(!leadCreated), 'true',
    { note: leadCreated ? 'Lead was created — flow does not have support branch yet' : '' });
  if (leadCreated) cleanup.push({ obj: 'Lead', id: supportLeads[0].Id });

  for (const r of cleanup.reverse()) {
    try { await sfDelete(r.obj, r.id); } catch (_) {}
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const runDate = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  console.log(`\nBecker RFI — Huma Test Scenarios`);
  console.log(`Date:    ${runDate}`);
  console.log(`Sandbox: ${(await session()).instanceUrl}`);
  console.log('─'.repeat(60));

  await runB2CProductTests();
  await runAccountOwnerTest();
  await runB2CQueueTest();
  await runSupportFormTest();

  // ─── Summary ────────────────────────────────────────────────────────────────
  const passed = allChecks.filter(c => c.pass).length;
  const failed = allChecks.filter(c => !c.pass).length;
  const allPass = failed === 0;

  console.log(`\n${'═'.repeat(60)}`);
  console.log('FINAL RESULTS');
  console.log('═'.repeat(60));
  console.log(`  Checks passed: ${passed}`);
  console.log(`  Checks failed: ${failed}`);
  console.log(allPass ? '\n✅ ALL SCENARIOS PASSED' : '\n❌ SOME SCENARIOS FAILED');

  if (failed > 0) {
    console.log('\nFailed checks:');
    allChecks.filter(c => !c.pass).forEach(c => {
      console.log(`  ❌ [${c.section.replace(/^SCENARIO \d+\w*: /, '')}] ${c.field}`);
      console.log(`       got: "${c.actual}"  want: "${c.expected}"`);
    });
  }

  console.log('═'.repeat(60));

  if (!allPass) process.exit(1);
}

main().catch(e => { console.error('\nFATAL:', e.message); process.exit(1); });
