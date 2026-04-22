#!/usr/bin/env node
/**
 * Becker RFI — End-to-End Integration Test
 *
 * Tests the full flow: ExternalWebform__c create → SF Flow v11 → Lead with
 * correct RecordType, Owner (queue), Subscription_id__c, and field mapping.
 *
 * Usage:
 *   node scripts/e2e-test.js              # prints results + saves docs/e2e-results-<date>.md
 *   node scripts/e2e-test.js --dry-run    # shows scenarios without creating EW records
 *
 * Requires: .env with SF_USERNAME, SF_PASSWORD, SF_SECURITY_TOKEN, SF_LOGIN_URL
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// ─── helpers ────────────────────────────────────────────────────────────────

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
  const serverUrl = xml.match(/<serverUrl>(.*?)<\/serverUrl>/)?.[1];
  const instanceUrl = serverUrl?.match(/^(https:\/\/[^/]+)/)?.[1];
  if (!token) throw new Error('SF login failed: ' + xml.slice(0, 300));
  return { token, instanceUrl };
}

async function sfQuery(instanceUrl, token, soql) {
  const r = await fetch(
    `${instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(soql)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const d = await r.json();
  if (d.errorCode) throw new Error(`SOQL error: ${d.message}`);
  return d.records || [];
}

async function createEW(instanceUrl, token, data) {
  const r = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/ExternalWebform__c`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await r.json();
  if (!body.id) throw new Error(`EW create failed: ${JSON.stringify(body)}`);
  return body.id;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Order-insensitive comparison for multipicklist fields
function picklistMatch(actual, expected) {
  if (!actual && !expected) return true;
  if (!actual || !expected) return false;
  return actual.split(';').sort().join(';') === expected.split(';').sort().join(';');
}

// ─── test scenarios ──────────────────────────────────────────────────────────

const B2B_SUB = 'B2B - News and Events;B2B - Events;B2B - New Products';
const B2B_COMM_SUB = 'B2B - News and Events;B2B - Events;B2B - New Products';

const B2C_COMM_SUB = {
  CPA: 'CPA Content;CPA Promotions',
  CMA: 'CMA Content;CMA Promotions',
  CPE: 'CPE Content;CPE Promotions',
  CIA: 'CIA Content;CIA Promotions',
  EA:  'EA Content;EA Promotions',
  CFP: 'CPA Content;CPA Promotions',
};

function b2c(ts, slug, product, consentVal, subExpected) {
  return {
    label: `B2C | ${product} | CS - Inside Sales`,
    ew: {
      First_Name__c: 'E2E', Last_Name__c: `B2C-${product}`,
      Email__c: `e2e.b2c.${slug}.${ts}@becker-test.com`,
      Requesting_for__c: 'Myself', Primary_Interest__c: product,
      Company__c: 'TestCo', RFI_Suggested_Queue__c: 'CS - Inside Sales',
      BusinessBrand__c: 'Becker',
      CommunicationSubscription__c: B2C_COMM_SUB[product],
      Consent_Provided__c: consentVal, Consent_Captured_Source__c: 'Becker RFI Form',
      Privacy_Consent_Status__c: 'OptIn',
    },
    expect: { recordType: 'B2C Lead', owner: 'CS - Inside Sales', subscription: subExpected },
  };
}

function b2b(ts, slug, lastName, product, orgType, orgSize, queue) {
  return {
    label: `B2B | ${orgType} | ${orgSize} → ${queue}`,
    ew: {
      First_Name__c: 'E2E', Last_Name__c: lastName,
      Email__c: `e2e.b2b.${slug}.${ts}@becker-test.com`,
      Requesting_for__c: 'My organization', Primary_Interest__c: product,
      Company__c: `E2E ${orgType} ${ts}`,
      Organization_Type__c: orgType, Organization_Size__c: orgSize,
      RFI_Suggested_Queue__c: queue,
      BusinessBrand__c: 'Becker',
      CommunicationSubscription__c: B2B_COMM_SUB,
      Consent_Provided__c: 'Email', Consent_Captured_Source__c: 'Becker RFI Form',
      Privacy_Consent_Status__c: 'OptIn',
    },
    expect: { recordType: 'B2B Lead', owner: queue, subscription: B2B_SUB },
  };
}

// Each scenario: { label, ew (fields to create), expect { recordType, owner, subscription } }
function buildScenarios(ts) {
  return [
    // ── B2C paths ────────────────────────────────────────────────────────────
    b2c(ts, 'cpa', 'CPA', 'Email;Phone', 'CPA Content;CPA Promotions'),
    b2c(ts, 'cma', 'CMA', 'Email',       'CMA Content;CMA Promotions'),
    b2c(ts, 'cpe', 'CPE', 'Email',       'CPE Content;CPE Promotions'),
    b2c(ts, 'cia', 'CIA', 'Email',       'CIA Content;CIA Promotions'),
    b2c(ts, 'ea',  'EA',  'Email',       'EA Content;EA Promotions'),
    b2c(ts, 'cfp', 'CFP', 'Email',       'CPA Content;CPA Promotions'),

    // ── B2B — Global Firms ───────────────────────────────────────────────────
    b2b(ts, 'gf.acct',    'B2B-GF-AcctFirm',   'CPA', 'Accounting Firm',                                      '251+',   'Global Firms'),
    b2b(ts, 'gf.consult', 'B2B-GF-Consulting',  'CPE', 'Consulting Firm',                                      '<25',    'Global Firms'),
    b2b(ts, 'gf.alliance','B2B-GF-CPA-Alliance','CPA', 'CPA Alliance',                                         '26-100', 'Global Firms'),

    // ── B2B — New Client Acquisition ─────────────────────────────────────────
    b2b(ts, 'nca.corp', 'B2B-NCA-Corp', 'CPE', 'Corporation/Healthcare/Bank/Financial Institution', '101-250', 'New Client Acquisition'),
    b2b(ts, 'nca.gov',  'B2B-NCA-Gov',  'CPE', 'Government Agency/Not for Profit Organization',     '251+',    'New Client Acquisition'),

    // ── B2B — University ─────────────────────────────────────────────────────
    b2b(ts, 'uni',     'B2B-Uni',        'CPA', 'University',      '26-100', 'University'),
    b2b(ts, 'uni.soc', 'B2B-Uni-Society','CIA', 'Society/Chapter', '<25',    'University'),

    // ── B2B — International ──────────────────────────────────────────────────
    b2b(ts, 'intl', 'B2B-Intl', 'CPA', 'Non-US Organization', '<25', 'International'),

    // ── B2B — CS - Inside Sales (small/fallback) ─────────────────────────────
    b2b(ts, 'is.small', 'B2B-IS-SmallFirm', 'CPA', 'Accounting Firm', '<25',    'CS - Inside Sales'),
    b2b(ts, 'is.other', 'B2B-IS-Other',     'CPE', 'Other',           '26-100', 'CS - Inside Sales'),
  ];
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const ts = Date.now();
  const runDate = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const scenarios = buildScenarios(ts);

  console.log(`\nBecker RFI — E2E Test Run`);
  console.log(`Date:      ${runDate}`);
  console.log(`Scenarios: ${scenarios.length}`);
  if (dryRun) { console.log('MODE: dry-run (no EW records created)\n'); }
  console.log('─'.repeat(60));

  if (dryRun) {
    scenarios.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.label}`);
      console.log(`     → expect: ${s.expect.recordType} | ${s.expect.owner}`);
    });
    return;
  }

  const { token, instanceUrl } = await getSession();
  console.log(`Sandbox:   ${instanceUrl}\n`);

  // Create all EW records
  console.log('Creating ExternalWebform records...');
  const ewIds = {};
  for (const s of scenarios) {
    try {
      const id = await createEW(instanceUrl, token, s.ew);
      ewIds[s.ew.Email__c] = id;
      process.stdout.write('  .');
    } catch (err) {
      console.error(`\n  FAILED to create EW for "${s.label}": ${err.message}`);
      process.exit(1);
    }
  }
  console.log(`\n  Created ${scenarios.length} EW records. Waiting 12s for flows...\n`);
  await sleep(12000);

  // Query all resulting leads
  const emails = scenarios.map(s => `'${s.ew.Email__c}'`).join(',');
  const leads = await sfQuery(instanceUrl, token,
    `SELECT Id, Email, RecordType.Name, Owner.Name, Owner.Type,
            Subscription_id__c, Business_Brand__c, Consent_Provided__c,
            Privacy_Consent_Status__c, Consent_Captured_Source__c,
            CreatedDate, LastModifiedDate
     FROM Lead
     WHERE Email IN (${emails}) AND IsConverted = false
     ORDER BY CreatedDate ASC`
  );
  const leadByEmail = {};
  leads.forEach(l => { leadByEmail[l.Email] = l; });

  // Evaluate results
  const results = [];
  let totalPassed = 0, totalFailed = 0;

  for (const s of scenarios) {
    const lead = leadByEmail[s.ew.Email__c];
    const row = { label: s.label, email: s.ew.Email__c, ewId: ewIds[s.ew.Email__c], checks: [] };

    if (!lead) {
      row.checks.push({ field: 'Lead exists', pass: false, actual: 'NOT FOUND', expected: 'Lead record' });
      totalFailed++;
      results.push(row);
      continue;
    }

    row.leadId = lead.Id;

    const checks = [
      { field: 'Record Type',         actual: lead.RecordType?.Name,       expected: s.expect.recordType, exact: true },
      { field: 'Owner (queue)',        actual: lead.Owner?.Name,            expected: s.expect.owner,      exact: true },
      { field: 'Subscription_id__c',  actual: lead.Subscription_id__c,     expected: s.expect.subscription, exact: false },
      { field: 'Business_Brand__c',   actual: lead.Business_Brand__c,      expected: 'Becker',            exact: true },
      { field: 'Consent_Provided__c', actual: lead.Consent_Provided__c,    expected: null /* not blank */, exact: false },
      { field: 'Privacy_Consent_Status__c', actual: lead.Privacy_Consent_Status__c, expected: 'OptIn', exact: true },
    ];

    for (const c of checks) {
      let pass;
      if (c.expected === null) {
        pass = !!c.actual;
      } else if (c.exact) {
        pass = c.actual === c.expected;
      } else {
        pass = picklistMatch(c.actual, c.expected);
      }
      row.checks.push({ ...c, pass });
      if (pass) totalPassed++; else totalFailed++;
    }
    results.push(row);
  }

  // Print results
  const allPass = totalFailed === 0;
  console.log('═'.repeat(60));
  console.log('RESULTS');
  console.log('═'.repeat(60));

  for (const row of results) {
    const rowPass = row.checks.every(c => c.pass);
    console.log(`\n${rowPass ? '✅' : '❌'} ${row.label}`);
    for (const c of row.checks) {
      const icon = c.pass ? '  ✅' : '  ❌';
      if (c.pass) {
        console.log(`${icon} ${c.field}: ${c.actual}`);
      } else {
        console.log(`${icon} ${c.field}: GOT "${c.actual}" — WANT "${c.expected}"`);
      }
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`TOTAL: ${totalPassed} checks passed, ${totalFailed} failed`);
  console.log(allPass ? '✅ ALL SCENARIOS PASSED' : '❌ SOME SCENARIOS FAILED');
  console.log('═'.repeat(60));

  // Save markdown results
  const dateStr = new Date().toISOString().slice(0, 10);
  const mdPath = path.join(__dirname, '..', 'docs', `e2e-results-${dateStr}.md`);
  const md = buildMarkdown(results, runDate, instanceUrl, totalPassed, totalFailed, scenarios.length);
  fs.writeFileSync(mdPath, md);
  console.log(`\nResults saved → docs/e2e-results-${dateStr}.md`);

  if (!allPass) process.exit(1);
}

function buildMarkdown(results, runDate, instanceUrl, passed, failed, total) {
  const allPass = failed === 0;
  const lines = [
    `# Becker RFI — E2E Test Results`,
    ``,
    `**Date:** ${runDate}`,
    `**Sandbox:** ${instanceUrl}`,
    `**Flow version:** Becker_RFI_Lead_Routing v18`,
    `**Result:** ${allPass ? '✅ ALL PASSED' : `❌ ${failed} FAILED`} — ${passed} checks passed, ${failed} failed across ${total} scenarios`,
    ``,
    `---`,
    ``,
    `## Scenario Results`,
    ``,
  ];

  // Summary table
  lines.push('| # | Scenario | Record Type | Owner | Subscription | Brand | Consent | Result |');
  lines.push('|---|---|---|---|---|---|---|---|');
  results.forEach((row, i) => {
    const byField = {};
    row.checks.forEach(c => { byField[c.field] = c; });
    const icon = row.checks.every(c => c.pass) ? '✅' : '❌';
    const rt  = byField['Record Type']?.pass        ? '✅' : `❌ ${byField['Record Type']?.actual}`;
    const own = byField['Owner (queue)']?.pass       ? '✅' : `❌ ${byField['Owner (queue)']?.actual}`;
    const sub = byField['Subscription_id__c']?.pass  ? '✅' : `❌ ${byField['Subscription_id__c']?.actual}`;
    const brd = byField['Business_Brand__c']?.pass   ? '✅' : '❌';
    const con = byField['Consent_Provided__c']?.pass ? '✅' : '❌';
    lines.push(`| ${i + 1} | ${row.label} | ${rt} | ${own} | ${sub} | ${brd} | ${con} | ${icon} |`);
  });

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Detailed Results');
  lines.push('');

  results.forEach((row, i) => {
    const rowPass = row.checks.every(c => c.pass);
    lines.push(`### ${i + 1}. ${rowPass ? '✅' : '❌'} ${row.label}`);
    lines.push('');
    lines.push(`- **EW Record:** \`${row.ewId || 'n/a'}\``);
    lines.push(`- **Lead ID:** \`${row.leadId || 'NOT CREATED'}\``);
    lines.push('');
    lines.push('| Field | Expected | Actual | Pass |');
    lines.push('|---|---|---|---|');
    row.checks.forEach(c => {
      const exp = c.expected === null ? '(not blank)' : c.expected;
      lines.push(`| ${c.field} | ${exp} | ${c.actual || '—'} | ${c.pass ? '✅' : '❌'} |`);
    });
    lines.push('');
  });

  lines.push('---');
  lines.push('');
  lines.push('## Routing Matrix Covered');
  lines.push('');
  lines.push('| Queue | Scenarios Tested |');
  lines.push('|---|---|');
  lines.push('| CS - Inside Sales | B2C (all products), B2B Accounting Firm <25, B2B Other 26-100 |');
  lines.push('| Global Firms | B2B Accounting Firm 251+, Consulting Firm <25, CPA Alliance 26-100 |');
  lines.push('| New Client Acquisition | B2B Corporation 101-250, Government Agency 251+ |');
  lines.push('| University | B2B University 26-100, Society/Chapter <25 |');
  lines.push('| International | B2B Non-US Organization <25 |');
  lines.push('| Customer Success & Expansion | (account-owner override — tested via account match) |');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- `Subscription_id__c` is a non-restricted multipicklist. SF may reorder values per picklist definition.');
  lines.push('  Comparison is order-insensitive (values sorted before comparing).');
  lines.push('- `Customer Success & Expansion` queue assignment is triggered by the account-owner override logic,');
  lines.push('  not by `RFI_Suggested_Queue__c`. Covered separately when CS&E rep owns the matching Account.');
  lines.push('- Support path (CSR Record) intentionally has no campaign or Lead — creates a Case instead.');
  lines.push('  Not tested here as it requires separate Case object verification.');
  lines.push('- All campaign IDs are sandbox-specific. Re-run `node scripts/sync-campaign-ids.js` before prod deploy.');
  lines.push('');

  return lines.join('\n');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
