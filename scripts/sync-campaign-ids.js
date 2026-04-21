#!/usr/bin/env node
/**
 * Sync Becker RFI campaign IDs from Salesforce into lead-processor.js
 * Run after Huma creates campaigns in sandbox via sandbox-setup.apex
 * Usage: node scripts/sync-campaign-ids.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const SF_LOGIN_URL = process.env.SF_LOGIN_URL || 'https://test.salesforce.com';

// Maps actual SF campaign names → lead-processor.js B2C_CAMPAIGN_IDS keys (or __B2B__ sentinel)
// Confirmed against Dev sandbox campaigns created by Huma Yousuf (2026-04-21)
const CAMPAIGN_NAME_MAP = {
  'Becker.com email signup - CPA':                  'Certified Public Accountant',
  'Becker.com email signup - CMA':                  'Certified Management Accountant',
  'Becker.com email signup - CPE':                  'Continuing Professional Education',
  'Becker.com email signup - CIA':                  'Certified Internal Auditor',
  'Becker.com email signup - EA Exam Review':       'Enrolled Agent',
  'Becker.com email signup - CFP':                  'Certified Financial Planner',
  'Becker.com email signup - Staff Level Training': 'Staff Level Training',
  'Becker.com email signup - CIA Challenge':        'CIA Challenge Exam',
  'B2B Lead Form':                                  '__B2B__',
};

async function getSession() {
  const u = process.env.SF_USERNAME;
  const p = (process.env.SF_PASSWORD || '') + (process.env.SF_SECURITY_TOKEN || '');
  const soap = `<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com"><soapenv:Body><urn:login><urn:username>${u}</urn:username><urn:password>${p}</urn:password></urn:login></soapenv:Body></soapenv:Envelope>`;
  const r = await fetch(`${SF_LOGIN_URL}/services/Soap/u/59.0`, {
    method: 'POST', headers: { 'Content-Type': 'text/xml', 'SOAPAction': 'login' }, body: soap,
  });
  const xml = await r.text();
  const token = xml.match(/<sessionId>(.*?)<\/sessionId>/)?.[1];
  const serverUrl = xml.match(/<serverUrl>(.*?)<\/serverUrl>/)?.[1];
  const instanceUrl = serverUrl?.match(/^(https:\/\/[^/]+)/)?.[1];
  if (!token) throw new Error('Login failed: ' + xml.slice(0, 200));
  return { token, instanceUrl };
}

async function main() {
  console.log('🔐 Logging in to Salesforce...');
  const { token, instanceUrl } = await getSession();
  console.log('✅ Connected:', instanceUrl);

  const names = Object.keys(CAMPAIGN_NAME_MAP).map(n => `'${n}'`).join(',');
  // Note: NOT filtering by IsActive — campaigns may be inactive in sandbox but still valid to map
  const q = `SELECT Id, Name, IsActive FROM Campaign WHERE Name IN (${names}) ORDER BY Name`;
  const res = await fetch(`${instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();

  if (!data.records?.length) {
    console.error('❌ No matching campaigns found in sandbox.');
    console.error('   Expected campaign names:');
    Object.keys(CAMPAIGN_NAME_MAP).forEach(n => console.error('    -', n));
    process.exit(1);
  }

  const inactiveCampaigns = data.records.filter(c => !c.IsActive);
  if (inactiveCampaigns.length) {
    console.warn(`\n⚠  ${inactiveCampaigns.length} campaign(s) are INACTIVE — CampaignMember creation will fail until activated:`);
    inactiveCampaigns.forEach(c => console.warn(`    - ${c.Name} (${c.Id})`));
    console.warn('   Ask Huma to set Status = "Active" on these campaigns in sandbox.\n');
  }

  console.log(`\nFound ${data.records.length} campaigns:`);
  const b2cIds = {};
  let b2bId = null;

  for (const c of data.records) {
    const productInterest = CAMPAIGN_NAME_MAP[c.Name];
    if (!productInterest) {
      console.log(`  ⚠ Unmapped: ${c.Name} = ${c.Id}`);
      continue;
    }
    if (productInterest === '__B2B__') {
      b2bId = c.Id;
      console.log(`  B2B campaign: ${c.Name} = ${c.Id}`);
    } else {
      b2cIds[productInterest] = c.Id;
      console.log(`  ${productInterest}: ${c.Id}`);
    }
  }

  if (!b2bId) {
    console.error('❌ Missing B2B campaign (B2B Lead Form)');
    process.exit(1);
  }

  // Build replacement blocks for lead-processor.js
  const b2cBlock = `const B2C_CAMPAIGN_IDS = {\n${
    Object.entries(b2cIds).map(([k, v]) => `  '${k}': '${v}',`).join('\n')
  }\n};`;

  const b2bLine = `const B2B_CAMPAIGN_ID = '${b2bId}';`;

  const lpPath = path.join(__dirname, '..', 'src', 'lead-processor.js');
  let src = fs.readFileSync(lpPath, 'utf8');

  // Replace the B2C_CAMPAIGN_IDS block
  src = src.replace(
    /const B2C_CAMPAIGN_IDS = \{[\s\S]*?\};/,
    b2cBlock
  );
  // Replace the B2B_CAMPAIGN_ID line
  src = src.replace(
    /const B2B_CAMPAIGN_ID = '.*?';/,
    b2bLine
  );
  // Update the comment line with the date
  src = src.replace(
    /\/\/ Campaign IDs from.*\n/,
    `// Campaign IDs synced from SF sandbox on ${new Date().toISOString().slice(0, 10)}\n`
  );

  fs.writeFileSync(lpPath, src);
  console.log('\n✅ lead-processor.js updated with sandbox campaign IDs.');
  console.log('   Commit when ready: git add src/lead-processor.js');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
