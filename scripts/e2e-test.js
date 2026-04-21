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

// Each scenario: { label, ew (fields to create), expect { recordType, owner, subscription } }
function buildScenarios(ts) {
  return [
    // ── B2C paths ────────────────────────────────────────────────────────────
    {
      label: 'B2C | CPA | Inside Sales',
      ew: {
        First_Name__c: 'E2E', Last_Name__c: 'B2C-CPA',
        Email__c: `e2e.b2c.cpa.${ts}@becker-test.com`,
        Requesting_for__c: 'Myself', Primary_Interest__c: 'CPA',
        Company__c: 'TestCo', RFI_Suggested_Queue__c: 'Inside Sales',
        Consent_Provided__c: 'Email;Phone', Consent_Captured_Source__c: 'Becker RFI Form',
        Privacy_Consent_Status__c: 'OptIn',
      },
      expect: { recordType: 'B2C Lead', owner: 'Inside Sales', subscription: 'CPA Content;CPA Promotions' },
    },
    {
      label: 'B2C | CMA | Inside Sales',
      ew: {
        First_Name__c: 'E2E', Last_Name__c: 'B2C-CMA',
        Email__c: `e2e.b2c.cma.${ts}@becker-test.com`,
        Requesting_for__c: 'Myself', Primary_Interest__c: 'CMA',
        Company__c: 'TestCo', RFI_Suggested_Queue__c: 'Inside Sales',
        Consent_Provided__c: 'Email', Consent_Captured_Source__c: 'Becker RFI Form',
        Privacy_Consent_Status__c: 'OptIn',
      },
      expect: { recordType: 'B2C Lead', owner: 'Inside Sales', subscription: 'CMA Content;CMA Promotions' },
    },
    {
      label: 'B2C | CPE | Inside Sales',
      ew: {
        First_Name__c: 'E2E', Last_Name__c: 'B2C-CPE',
        Email__c: `e2e.b2c.cpe.${ts}@becker-test.com`,
        Requesting_for__c: 'Myself', Primary_Interest__c: 'CPE',
        Company__c: 'TestCo', RFI_Suggested_Queue__c: 'Inside Sales',
        Consent_Provided__c: 'Email', Consent_Captured_Source__c: 'Becker RFI Form',
        Privacy_Consent_Status__c: 'OptIn',
      },
      expect: { recordType: 'B2C Lead', owner: 'Inside Sales', subscription: 'CPE Content;CPE Promotions' },
    },
    {
      label: 'B2C | CIA | Inside Sales',
      ew: {
        First_Name__c: 'E2E', Last_Name__c: 'B2C-CIA',
        Email__c: `e2e.b2c.cia.${ts}@becker-test.com`,
        Requesting_for__c: 'Myself', Primary_Interest__c: 'CIA',
        Company__c: 'TestCo', RFI_Suggested_Queue__c: 'Inside Sales',
        Consent_Provided__c: 'Email', Consent_Captured_Source__c: 'Becker RFI Form',
        Privacy_Consent_Status__c: 'OptIn',
      },
      expect: { recordType: 'B2C Lead', owner: 'Inside Sales', subscription: 'CIA Content;CIA Promotions' },
    },
    {
      label: 'B2C | EA | Inside Sales',
      ew: {
        First_Name__c: 'E2E', Last_Name__c: 'B2C-EA',
        Email__c: `e2e.b2c.ea.${ts}@becker-test.com`,
        Requesting_for__c: 'Myself', Primary_Interest__c: 'EA',
        Company__c: 'TestCo', RFI_Suggested_Queue__c: 'Inside Sales',
        Consent_Provided__c: 'Email', Consent_Captured_Source__c: 'Becker RFI Form',
        Privacy_Consent_Status__c: 'OptIn',
      },
      expect: { recordType: 'B2C Lead', owner: 'Inside Sales', subscription: 'EA Content;EA Promotions' },
    },
    {
      label: 'B2C | CFP | Inside Sales',
      ew: {
        First_Name__c: 'E2E', Last_Name__c: 'B2C-CFP',
        Email__c: `e2e.b2c.cfp.${ts}@becker-test.com`,
        Requesting_for__c: 'Myself', Primary_Interest__c: 'CFP',
        Company__c: 'TestCo', RFI_Suggested_Queue__c: 'Inside Sales',
        Consent_Provided__c: 'Email', Consent_Captured_Source__c: 'Becker RFI Form',
        Privacy_Consent_Status__c: 'OptIn',
      },
      expect: { recordType: 'B2C Lead', owner: 'Inside Sales', subscription: 'CPA Content;CPA Promotions' },
    },

    // ── B2B — Global Firms ───────────────────────────────────────────────────
    {
      label: 'B2B | Accounting Firm | 251+ → Global Firms',
      ew: {
        First_Name__c: 'E2E', Last_Name__c: 'B2B-GF-AcctFirm',
        Email__c: `e2e.b2b.gf.acct.${ts}@becker-test.com`,
        Requesting_for__c: 'My organization', Primary_Interest__c: 'CPA',
        Company__c: `E2E Accounting Firm ${ts}`,
        Organization_Type__c: 'Accounting Firm', Organization_Size__c: '251+',
        RFI_Suggested_Queue__c: 'Global Firms',
        Consent_Provided__c: 'Email', Consent_Captured_Source__c: 'Becker RFI Form',
        Privacy_Consent_Status__c: 'OptIn',
      },
      expect: { recordType: 'B2B Lead', owner: 'Global Firms', subscription: B2B_SUB },
    },
    {
      label: 'B2B | Consulting Firm | <25 → Global Firms',
      ew: {
        First_Name__c: 'E2E', Last_Name__c: 'B2B-GF-Consulting',
        Email__c: `e2e.b2b.gf.consult.${ts}@becker-test.com`,
        Requesting_for__c: 'My organization', Primary_Interest__c: 'CPE',
        Company__c: `E2E Consulting ${ts}`,
        Organization_Type__c: 'Consulting Firm', Organization_Size__c: '<25',
        RFI_Suggested_Queue__c: 'Global Firms',
        Consent_Provided__c: 'Email', Consent_Captured_Source__c: 'Becker RFI Form',
        Privacy_Consent_Status__c: 'OptIn',
      },
      expect: { recordType: 'B2B Lead', owner: 'Global Firms', subscription: B2B_SUB },
    },
    {
      label: 'B2B | CPA Alliance | 26-100 → Global Firms',
      ew: {
        First_Name__c: 'E2E', Last_Name__c: 'B2B-GF-CPA-Alliance',
        Email__c: `e2e.b2b.gf.alliance.${ts}@becker-test.com`,
        Requesting_for__c: 'My organization', Primary_Interest__c: 'CPA',
        Company__c: `E2E CPA Alliance ${ts}`,
        Organization_Type__c: 'CPA Alliance', Organization_Size__c: '26-100',
        RFI_Suggested_Queue__c: 'Global Firms',
        Consent_Provided__c: 'Email', Consent_Captured_Source__c: 'Becker RFI Form',
        Privacy_Consent_Status__c: 'OptIn',
      },
      expect: { recordType: 'B2B Lead', owner: 'Global Firms', subscription: B2B_SUB },
    },

    // ── B2B — New Client Acquisition ─────────────────────────────────────────
    {
      label: 'B2B | Corporation | 101-250 → New Client Acquisition',
      ew: {
        First_Name__c: 'E2E', Last_Name__c: 'B2B-NCA-Corp',
        Email__c: `e2e.b2b.nca.corp.${ts}@becker-test.com`,
        Requesting_for__c: 'My organization', Primary_Interest__c: 'CPE',
        Company__c: `E2E Corp ${ts}`,
        Organization_Type__c: 'Corporation/Healthcare/Bank/Financial Institution',
        Organization_Size__c: '101-250',
        RFI_Suggested_Queue__c: 'New Client Acquisition',
        Consent_Provided__c: 'Email', Consent_Captured_Source__c: 'Becker RFI Form',
        Privacy_Consent_Status__c: 'OptIn',
      },
      expect: { recordType: 'B2B Lead', owner: 'New Client Acquisition', subscription: B2B_SUB },
    },
    {
      label: 'B2B | Government Agency | 251+ → New Client Acquisition',
      ew: {
        First_Name__c: 'E2E', Last_Name__c: 'B2B-NCA-Gov',
        Email__c: `e2e.b2b.nca.gov.${ts}@becker-test.com`,
        Requesting_for__c: 'My organization', Primary_Interest__c: 'CPE',
        Company__c: `E2E Govt Agency ${ts}`,
        Organization_Type__c: 'Government Agency/Not for Profit Organization',
        Organization_Size__c: '251+',
        RFI_Suggested_Queue__c: 'New Client Acquisition',
        Consent_Provided__c: 'Email', Consent_Captured_Source__c: 'Becker RFI Form',
        Privacy_Consent_Status__c: 'OptIn',
      },
      expect: { recordType: 'B2B Lead', owner: 'New Client Acquisition', subscription: B2B_SUB },
    },

    // ── B2B — University ─────────────────────────────────────────────────────
    {
      label: 'B2B | University | 26-100 → University',
      ew: {
        First_Name__c: 'E2E', Last_Name__c: 'B2B-Uni',
        Email__c: `e2e.b2b.uni.${ts}@becker-test.com`,
        Requesting_for__c: 'My organization', Primary_Interest__c: 'CPA',
        Company__c: `E2E University ${ts}`,
        Organization_Type__c: 'University', Organization_Size__c: '26-100',
        RFI_Suggested_Queue__c: 'University',
        Consent_Provided__c: 'Email', Consent_Captured_Source__c: 'Becker RFI Form',
        Privacy_Consent_Status__c: 'OptIn',
      },
      expect: { recordType: 'B2B Lead', owner: 'University', subscription: B2B_SUB },
    },
    {
      label: 'B2B | Society/Chapter | <25 → University',
      ew: {
        First_Name__c: 'E2E', Last_Name__c: 'B2B-Uni-Society',
        Email__c: `e2e.b2b.uni.soc.${ts}@becker-test.com`,
        Requesting_for__c: 'My organization', Primary_Interest__c: 'CIA',
        Company__c: `E2E Society ${ts}`,
        Organization_Type__c: 'Society/Chapter', Organization_Size__c: '<25',
        RFI_Suggested_Queue__c: 'University',
        Consent_Provided__c: 'Email', Consent_Captured_Source__c: 'Becker RFI Form',
        Privacy_Consent_Status__c: 'OptIn',
      },
      expect: { recordType: 'B2B Lead', owner: 'University', subscription: B2B_SUB },
    },

    // ── B2B — International ──────────────────────────────────────────────────
    {
      label: 'B2B | Non-US Organization | <25 → International',
      ew: {
        First_Name__c: 'E2E', Last_Name__c: 'B2B-Intl',
        Email__c: `e2e.b2b.intl.${ts}@becker-test.com`,
        Requesting_for__c: 'My organization', Primary_Interest__c: 'CPA',
        Company__c: `E2E Non-US Org ${ts}`,
        Organization_Type__c: 'Non-US Organization', Organization_Size__c: '<25',
        RFI_Suggested_Queue__c: 'International',
        Consent_Provided__c: 'Email', Consent_Captured_Source__c: 'Becker RFI Form',
        Privacy_Consent_Status__c: 'OptIn',
      },
      expect: { recordType: 'B2B Lead', owner: 'International', subscription: B2B_SUB },
    },

    // ── B2B — Inside Sales (small/fallback) ──────────────────────────────────
    {
      label: 'B2B | Accounting Firm | <25 → Inside Sales',
      ew: {
        First_Name__c: 'E2E', Last_Name__c: 'B2B-IS-SmallFirm',
        Email__c: `e2e.b2b.is.small.${ts}@becker-test.com`,
        Requesting_for__c: 'My organization', Primary_Interest__c: 'CPA',
        Company__c: `E2E Small Firm ${ts}`,
        Organization_Type__c: 'Accounting Firm', Organization_Size__c: '<25',
        RFI_Suggested_Queue__c: 'Inside Sales',
        Consent_Provided__c: 'Email', Consent_Captured_Source__c: 'Becker RFI Form',
        Privacy_Consent_Status__c: 'OptIn',
      },
      expect: { recordType: 'B2B Lead', owner: 'Inside Sales', subscription: B2B_SUB },
    },
    {
      label: 'B2B | Other | 26-100 → Inside Sales',
      ew: {
        First_Name__c: 'E2E', Last_Name__c: 'B2B-IS-Other',
        Email__c: `e2e.b2b.is.other.${ts}@becker-test.com`,
        Requesting_for__c: 'My organization', Primary_Interest__c: 'CPE',
        Company__c: `E2E Other Org ${ts}`,
        Organization_Type__c: 'Other', Organization_Size__c: '26-100',
        RFI_Suggested_Queue__c: 'Inside Sales',
        Consent_Provided__c: 'Email', Consent_Captured_Source__c: 'Becker RFI Form',
        Privacy_Consent_Status__c: 'OptIn',
      },
      expect: { recordType: 'B2B Lead', owner: 'Inside Sales', subscription: B2B_SUB },
    },
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
    `**Flow version:** Becker_RFI_Lead_Routing v11`,
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
  lines.push('| Inside Sales | B2C (all products), B2B Accounting Firm <25, B2B Other 26-100 |');
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
