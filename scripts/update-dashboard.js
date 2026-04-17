#!/usr/bin/env node
/**
 * update-dashboard.js
 * Pulls live SF data + project state → writes docs/data.json
 * Then: git add docs/data.json && git push  →  dashboard updates on GitHub Pages
 *
 * Usage:
 *   node scripts/update-dashboard.js          # update data.json only
 *   node scripts/update-dashboard.js --push   # update + git commit + push
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');

// ── SF auth ────────────────────────────────────────────────────────────────

async function sfLogin() {
  const username    = process.env.SF_USERNAME;
  const password    = (process.env.SF_PASSWORD || '') + (process.env.SF_SECURITY_TOKEN || '');
  const loginUrl    = process.env.SF_LOGIN_URL || 'https://test.salesforce.com';
  const apiVersion  = process.env.SF_API_VERSION || 'v59.0';

  const soap = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com">
  <soapenv:Body><urn:login><urn:username>${username}</urn:username><urn:password>${password}</urn:password></urn:login></soapenv:Body>
</soapenv:Envelope>`;

  const res = await fetch(`${loginUrl}/services/Soap/u/${apiVersion}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml', SOAPAction: 'login' },
    body: soap,
  });
  const xml = await res.text();
  const token       = xml.match(/<sessionId>(.*?)<\/sessionId>/)?.[1];
  const instanceUrl = xml.match(/<serverUrl>(.*?)<\/serverUrl>/)?.[1]?.match(/^(https:\/\/[^\/]+)/)?.[1];
  if (!token) throw new Error('SF login failed');

  const query = async (q) => {
    const r = await fetch(`${instanceUrl}/services/data/${apiVersion}/query?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return r.json();
  };

  return { token, instanceUrl, query, apiVersion };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Connecting to Salesforce...');
  const sf = await sfLogin();
  console.log(`✓ Connected: ${sf.instanceUrl}`);

  const [wfRes, leadRes, recentRes, queueRes, fieldRes] = await Promise.all([
    sf.query('SELECT COUNT() FROM ExternalWebform__c'),
    sf.query('SELECT COUNT() FROM Lead WHERE CreatedDate = THIS_YEAR'),
    sf.query('SELECT Id,First_Name__c,Last_Name__c,Email__c,Lead_Source_Form__c,CreatedDate FROM ExternalWebform__c ORDER BY CreatedDate DESC LIMIT 8'),
    sf.query("SELECT Name,Id FROM Group WHERE Type='Queue' ORDER BY Name LIMIT 50"),
    // Describe ExternalWebform__c fields
    fetch(`${sf.instanceUrl}/services/data/${sf.apiVersion}/sobjects/ExternalWebform__c/describe`, {
      headers: { Authorization: `Bearer ${sf.token}` }
    }).then(r => r.json()),
  ]);

  const existingFieldNames = (fieldRes.fields || []).map(f => f.name);
  const requiredNewFields = [
    { name: 'IntentPath__c',       type: 'Picklist',    values: 'exploring · ready · b2b · support' },
    { name: 'OrganizationType__c', type: 'Picklist',    values: 'Accounting Firm · Corp/Healthcare/Bank · Consulting Firm · CPA Alliance · Gov/NFP · Society/Chapter · Non-US · Student · University · Other' },
    { name: 'RoleType__c',         type: 'Picklist',    values: 'Undergrad Student · Grad Student · Professor · Supervisor/Director/Manager · Partner/CEO/CFO · Administrator · Unemployed · Learning/Training Leader · Staff Accountant · Other' },
    { name: 'OrgSizeCategory__c',  type: 'Picklist',    values: '<25 · 26-100 · 101-250 · 251+' },
    { name: 'SuggestedQueue__c',   type: 'Text(100)',   values: 'Free text — routing engine output' },
    { name: 'LeadSourceDetail__c', type: 'Text(255)',   values: 'UTM params string' },
    { name: 'QueryType__c',        type: 'Picklist',    values: 'Sales Query · Support Query' },
  ];

  const confirmedFields = [
    'Email__c','First_Name__c','Last_Name__c','Phone__c','Company__c',
    'Primary_Interest__c','Address__StateCode__s','YearInSchool__c','Campaign__c',
    'Consent_Provided__c','Privacy_Consent_Status__c','Lead_Source_Form__c',
    'Lead_Source_Form_Date__c','BusinessBrand__c','If_other__c',
    'email_address_you_use_to_login_to_Becker__c','Consent_Captured_Source__c',
  ];

  const data = {
    generated:    new Date().toISOString(),
    progress:     85,
    sf: {
      connected:    true,
      org:          'Becker Professional Education',
      sandbox:      'bpedevf',
      instanceUrl:  sf.instanceUrl,
      apiVersion:   sf.apiVersion,
      wfCount:      wfRes.totalSize,
      leadsThisYear: leadRes.totalSize,
      recentForms:  (recentRes.records || []).map(r => ({
        id:     r.Id,
        name:   `${r.First_Name__c || ''} ${r.Last_Name__c || ''}`.trim(),
        email:  r.Email__c,
        source: r.Lead_Source_Form__c,
        date:   r.CreatedDate,
      })),
      queues: (queueRes.records || []).map(q => ({ id: q.Id, name: q.Name })),
    },
    fields: {
      confirmed: confirmedFields.map(name => ({
        name,
        exists: existingFieldNames.includes(name),
      })),
      newRequired: requiredNewFields.map(f => ({
        ...f,
        exists: existingFieldNames.includes(f.name),
      })),
    },
    blockers: [
      { id: 'B1', priority: 'P0', owner: 'Angel Cichy', status: 'blocked', title: 'Create 7 new fields on ExternalWebform__c', detail: 'IntentPath__c, OrganizationType__c, RoleType__c, OrgSizeCategory__c, SuggestedQueue__c, LeadSourceDetail__c, QueryType__c — all specs sent to Angel', eta: 'Awaiting' },
      { id: 'B2', priority: 'P0', owner: 'Angel / Huma', status: 'blocked', title: 'SF Connected App credentials + SFMC credentials', detail: 'Need Consumer Key + Secret for prod deployment. SFMC Client ID + Secret + Account MID for confirmation emails.', eta: 'Awaiting' },
      { id: 'B3', priority: 'P1', owner: 'Huma Yousuf', status: 'blocked', title: 'Update SF Flow (CreateCaseLeadandOpportunity.v2)', detail: 'Flow must read new fields + SuggestedQueue__c → set OwnerId + Campaign Member creation. Huma owns the Flow.', eta: 'After B1' },
      { id: 'B4', priority: 'P1', owner: 'Monica / Josh', status: 'waiting', title: 'Architecture approval', detail: 'ARCHITECTURE.md + EXECUTIVE_SUMMARY.md sent 2026-04-16. Waiting on review cycle.', eta: 'Awaiting' },
      { id: 'B5', priority: 'P2', owner: 'Dakshesh (5X)', status: 'planned', title: 'Drupal embed review', detail: 'React form needs to embed in becker.com/contact-us via Drupal block. Sam to intro Dakshesh.', eta: 'After approval' },
      { id: 'B6', priority: 'P2', owner: 'Nick Leavitt', status: 'partial', title: 'Program nurture journeys post-form', detail: 'Campaign IDs confirmed and wired. Journey event keys for post-form nurture (not post-demo) still TBD.', eta: 'Pending' },
    ],
    decisions: [
      { id: 'D1', status: 'confirmed', title: 'ExternalWebform__c as entry point', detail: 'We write one record to ExternalWebform__c. The existing SF Flow (CreateCaseLeadandOpportunity.v2) handles all dedup, Lead/Opp/Case creation, and queue assignment. We do NOT call POST /sobjects/Lead directly.' },
      { id: 'D2', status: 'confirmed', title: 'SF Flow owns dedup and record creation', detail: 'Huma Yousuf updates the existing Flow to handle: Business Account match → Lead + Opp, new fields mapping, SuggestedQueue__c → OwnerId, Campaign Member creation.' },
      { id: 'D3', status: 'confirmed', title: 'Routing engine pre-calculates queue via SuggestedQueue__c', detail: '27 unit tests. Org type × employee count → 6 SF queues. Written to SuggestedQueue__c. Flow reads it to set OwnerId. Logic in code, not in Flow.' },
      { id: 'D4', status: 'confirmed', title: 'Campaign IDs confirmed and wired', detail: 'All 8 B2C program campaigns + 1 B2B campaign confirmed. Campaign__c written on every ExternalWebform record. MC Connect syncs to SFMC for email sends.' },
      { id: 'D5', status: 'confirmed', title: 'No Concierge Day One hardcode', detail: 'B2C Ready to Enroll enters same program-matched campaign as B2C Exploring. Concierge is a CPA-specific product, not the default for all ready-to-enroll.' },
      { id: 'D6', status: 'pending', title: 'Deployment via Drupal', detail: 'Dakshesh (5X Drupal team) must confirm embed method. React form → Drupal block on becker.com/contact-us. Sam to connect.' },
    ],
    campaigns: [
      { path: 'B2C', product: 'Certified Public Accountant',       id: '7013r000001l0CwAAI' },
      { path: 'B2C', product: 'Certified Management Accountant',   id: '7013r000001l0DBAAY' },
      { path: 'B2C', product: 'Continuing Professional Education', id: '7013r000001l0D6AAI' },
      { path: 'B2C', product: 'Certified Internal Auditor',        id: '701VH00000coo8bYAA' },
      { path: 'B2C', product: 'Enrolled Agent',                    id: '701VH00000cnfxAYAQ' },
      { path: 'B2C', product: 'Certified Financial Planner',       id: '701VH00000tZNTXYA4' },
      { path: 'B2C', product: 'Staff Level Training',              id: '701VH00000tZPTiYAO' },
      { path: 'B2C', product: 'CIA Challenge Exam',                id: '701VH00000tZQ6QYAW' },
      { path: 'B2B', product: 'All products',                      id: '701VH00000tZOSqYAO' },
      { path: 'Support', product: '—',                             id: null },
    ],
    nextSteps: [
      { step: 1, action: 'Angel creates 7 fields on ExternalWebform__c in bpedevf sandbox', owner: 'Angel Cichy', unblocks: 'Live end-to-end submission test' },
      { step: 2, action: 'Confirm Consent_Provided__c value: "Commercial Marketing" vs "Email"', owner: 'Angel Cichy', unblocks: 'Consent field mapping' },
      { step: 3, action: 'Confirm Lead_Source_Form__c value for RFI form', owner: 'Angel Cichy', unblocks: 'Lead source attribution' },
      { step: 4, action: 'Huma updates SF Flow: new fields + SuggestedQueue__c → OwnerId + Campaign Member', owner: 'Huma Yousuf', unblocks: 'Automatic lead routing via Flow' },
      { step: 5, action: 'Angel + Huma provide SF Connected App credentials (Consumer Key + Secret)', owner: 'Angel / Huma', unblocks: 'Production deployment' },
      { step: 6, action: 'Monica + Josh approve architecture (docs sent 2026-04-16)', owner: 'Monica Callahan / Josh Elefante', unblocks: 'Official go-ahead to deploy' },
      { step: 7, action: 'Sam fills .env with credentials → railway up → smoke test', owner: 'Sam Chaudhary', unblocks: 'Live on Railway' },
      { step: 8, action: 'Sam intros Dakshesh (5X) for becker.com Drupal embed', owner: 'Sam Chaudhary', unblocks: 'Form live on becker.com' },
      { step: 9, action: 'E2E smoke test: submit form → verify SF record + queue assignment + email', owner: 'Sam + Huma', unblocks: 'Go live' },
    ],
    stakeholders: [
      { name: 'Angel Cichy',       role: 'SF Admin',         items: 'Create 7 fields + confirm picklist values + Connected App creds', status: 'blocked' },
      { name: 'Huma Yousuf',       role: 'SF Developer',     items: 'Update SF Flow + confirm assignment rules inactive', status: 'blocked' },
      { name: 'Monica Callahan',   role: 'Business Owner',   items: 'Architecture approval (sent 2026-04-16)', status: 'waiting' },
      { name: 'Josh Elefante',     role: 'Product Lead',     items: 'Form UX sign-off (sent 2026-04-16)', status: 'waiting' },
      { name: 'Dakshesh (5X)',     role: 'Drupal Team',      items: 'Confirm React embed method for becker.com', status: 'planned' },
      { name: 'Nick Leavitt',      role: 'SFMC / Campaigns', items: 'Define post-form nurture journeys (campaign IDs confirmed)', status: 'partial' },
    ],
  };

  const outPath = path.join(__dirname, '../docs/data.json');
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`✓ data.json written (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);

  if (process.argv.includes('--push')) {
    const { execSync } = require('child_process');
    execSync('git add docs/data.json docs/index.html', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
    execSync(`git commit -m "chore: refresh dashboard data ${new Date().toISOString().slice(0,16)}"`, { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
    execSync('git push', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
    console.log('✓ Pushed — dashboard live at https://samcolibri.github.io/becker-rfi-agent/');
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
