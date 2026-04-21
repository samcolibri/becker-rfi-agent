/**
 * Test: Routing scenarios per user request (2026-04-21)
 * 1. B2B Active Account Owner (Standish Management → JoAnn Veiga)
 * 2. B2B Inactive Account Owner (Felician University BUPP → University queue)
 * 3. B2C lead → CS - Inside Sales queue
 * 4. Campaign association check
 */
require('dotenv').config();
const jsforce = require('jsforce');
const conn = new jsforce.Connection({ loginUrl: process.env.SF_LOGIN_URL || 'https://test.salesforce.com' });

const WAIT_MS = 14000;
const results = [];

function check(name, got, expected, desc = '') {
  const pass = String(got) === String(expected);
  results.push({ pass, name, got, expected, desc });
  console.log(pass ? '  ✅' : '  ❌', name + ':', got, pass ? '' : `(expected: ${expected})`, desc);
  return pass;
}

async function cleanup(leadIds, ewIds) {
  for (const id of leadIds) { try { await conn.sobject('Lead').destroy(id); } catch (_) {} }
  for (const id of ewIds) { try { await conn.sobject('ExternalWebform__c').destroy(id); } catch (_) {} }
}

async function resolveOwnerName(ownerId) {
  // Could be a User or a Group (Queue)
  try {
    const u = await conn.sobject('User').retrieve(ownerId, ['Name']);
    return { type: 'User', name: u.Name };
  } catch (_) {
    try {
      const g = await conn.sobject('Group').retrieve(ownerId, ['Name']);
      return { type: 'Queue', name: g.Name };
    } catch (_) {
      return { type: 'Unknown', name: ownerId };
    }
  }
}

async function createEW(fields) {
  const r = await conn.sobject('ExternalWebform__c').create(fields);
  if (!r.success) throw new Error('EW create failed: ' + JSON.stringify(r.errors));
  return r.id;
}

async function getLeadByEmail(email) {
  const res = await conn.query(
    `SELECT Id, OwnerId, Email, Lead_Source_Form__c, Lead_Source_Form_Date__c, Campaign__c FROM Lead WHERE Email = '${email}' AND IsConverted = false ORDER BY CreatedDate DESC LIMIT 1`
  );
  return res.records[0] || null;
}

// ─── Test 1: B2B Active Account Owner (Standish Management) ──────────────────
async function test1_standish() {
  console.log('\n━━━ Test 1: B2B Active Account Owner (Standish Management) ━━━');
  const ts = Date.now();
  const email = `standish${ts}@test-becker.test`;
  const ewIds = [], leadIds = [];

  // Routing engine: Accounting Firm + 251+ → Global Firms, but account owner JoAnn Veiga overrides
  const ewId = await createEW({
    First_Name__c: 'Test', Last_Name__c: 'Standish' + ts, Email__c: email,
    Primary_Interest__c: 'CPA', Requesting_for__c: 'My organization',
    Company__c: 'Standish Management',
    Organization_Type__c: 'Accounting Firm', Organization_Size__c: '251+',
    RFI_Suggested_Queue__c: 'Global Firms',  // what routing engine would set
    BusinessBrand__c: 'Becker', Privacy_Consent_Status__c: 'OptIn',
    Consent_Captured_Source__c: 'Becker Contact Us Form',
    Lead_Source_Form__c: 'Contact Us - Buying for Org',
  });
  ewIds.push(ewId);
  console.log('  EW created:', ewId, '| waiting for flows...');
  await new Promise(r => setTimeout(r, WAIT_MS));

  const lead = await getLeadByEmail(email);
  if (!lead) { console.log('  ❌ Lead not found'); await cleanup(leadIds, ewIds); return; }
  leadIds.push(lead.Id);

  const owner = await resolveOwnerName(lead.OwnerId);
  console.log('  Lead Owner:', owner.type, '=', owner.name);
  check('Owner type', owner.type, 'User', '(should be assigned to individual, not queue)');
  check('Owner name', owner.name, 'JoAnn Veiga', '(account owner override)');

  await cleanup(leadIds, ewIds);
}

// ─── Test 2: B2B Inactive Account Owner (Felician University BUPP) ───────────
async function test2_felician() {
  console.log('\n━━━ Test 2: B2B Inactive Account Owner (Felician University BUPP) ━━━');
  const ts = Date.now();
  const email = `felician${ts}@test-becker.test`;
  const ewIds = [], leadIds = [];

  // Routing engine: University → University queue; owner Jackie Oblinger is inactive → stays on queue
  const ewId = await createEW({
    First_Name__c: 'Test', Last_Name__c: 'Felician' + ts, Email__c: email,
    Primary_Interest__c: 'CPE', Requesting_for__c: 'My organization',
    Company__c: 'Felician University (BUPP)',
    Organization_Type__c: 'University', Organization_Size__c: '101-250',
    RFI_Suggested_Queue__c: 'University',
    BusinessBrand__c: 'Becker', Privacy_Consent_Status__c: 'OptIn',
    Consent_Captured_Source__c: 'Becker Contact Us Form',
    Lead_Source_Form__c: 'Contact Us - Buying for Org',
  });
  ewIds.push(ewId);
  console.log('  EW created:', ewId, '| waiting for flows...');
  await new Promise(r => setTimeout(r, WAIT_MS));

  const lead = await getLeadByEmail(email);
  if (!lead) { console.log('  ❌ Lead not found'); await cleanup(leadIds, ewIds); return; }
  leadIds.push(lead.Id);

  const owner = await resolveOwnerName(lead.OwnerId);
  console.log('  Lead Owner:', owner.type, '=', owner.name);
  check('Owner type', owner.type, 'Queue', '(inactive owner → falls back to queue)');
  check('Queue name', owner.name, 'University', '(University org type → University queue)');

  await cleanup(leadIds, ewIds);
}

// ─── Test 3: B2C Lead → CS - Inside Sales ────────────────────────────────────
async function test3_b2c() {
  console.log('\n━━━ Test 3: B2C Lead → CS - Inside Sales Queue ━━━');
  const ts = Date.now();
  const email = `b2c${ts}@test-becker.test`;
  const ewIds = [], leadIds = [];

  // B2C: no org type, suggestedQueue = 'CS - Inside Sales'
  const ewId = await createEW({
    First_Name__c: 'Test', Last_Name__c: 'B2C' + ts, Email__c: email,
    Primary_Interest__c: 'CPA', Requesting_for__c: 'Myself',
    RFI_Suggested_Queue__c: 'CS - Inside Sales',
    BusinessBrand__c: 'Becker', Privacy_Consent_Status__c: 'OptIn',
    Consent_Captured_Source__c: 'Becker Contact Us Form',
    Lead_Source_Form__c: 'Contact Us - Exploring',
    Campaign__c: '701U700000eyrntIAA',  // CPA campaign
  });
  ewIds.push(ewId);
  console.log('  EW created:', ewId, '| waiting for flows...');
  await new Promise(r => setTimeout(r, WAIT_MS));

  const lead = await getLeadByEmail(email);
  if (!lead) { console.log('  ❌ Lead not found'); await cleanup(leadIds, ewIds); return; }
  leadIds.push(lead.Id);

  const owner = await resolveOwnerName(lead.OwnerId);
  console.log('  Lead Owner:', owner.type, '=', owner.name);
  check('Owner type', owner.type, 'Queue', '(B2C → queue assignment)');
  check('Queue name', owner.name, 'CS - Inside Sales', '(B2C → CS - Inside Sales, not plain Inside Sales)');

  // Also check campaign membership
  const members = await conn.query(`SELECT Id, Status, CampaignId FROM CampaignMember WHERE LeadId = '${lead.Id}' LIMIT 1`);
  console.log('  Campaign members:', members.records.length);
  if (members.records.length > 0) {
    check('Campaign membership', 'created', 'created', '');
    check('Campaign ID', members.records[0].CampaignId, '701U700000eyrntIAA', '(CPA campaign)');
  } else {
    check('Campaign membership', 'MISSING', 'created', '→ campaign likely inactive in sandbox');
    // Check if campaign is active
    const camp = await conn.sobject('Campaign').retrieve('701U700000eyrntIAA', ['Name', 'IsActive', 'Status']);
    console.log('    Campaign status:', camp.Name, '| IsActive:', camp.IsActive, '| Status:', camp.Status);
    console.log('    ACTION NEEDED: Huma must activate campaigns in sandbox (set Status = "Active")');
  }

  await cleanup(leadIds, ewIds);
}

// ─── Test 4: Campaign association with B2B ────────────────────────────────────
async function test4_campaign_b2b() {
  console.log('\n━━━ Test 4: B2B Campaign Association ━━━');
  const ts = Date.now();
  const email = `b2bcampaign${ts}@test-becker.test`;
  const ewIds = [], leadIds = [];

  const ewId = await createEW({
    First_Name__c: 'Test', Last_Name__c: 'B2BCamp' + ts, Email__c: email,
    Primary_Interest__c: 'CPA', Requesting_for__c: 'My organization',
    Company__c: 'TestOrg B2B Campaign',
    Organization_Type__c: 'Accounting Firm', Organization_Size__c: '26-100',
    RFI_Suggested_Queue__c: 'Global Firms',
    Campaign__c: '701U700000eyrnzIAA',  // B2B Lead Form campaign
    BusinessBrand__c: 'Becker', Privacy_Consent_Status__c: 'OptIn',
    Consent_Captured_Source__c: 'Becker Contact Us Form',
    Lead_Source_Form__c: 'Contact Us - Buying for Org',
  });
  ewIds.push(ewId);
  console.log('  EW created:', ewId, '| waiting for flows...');
  await new Promise(r => setTimeout(r, WAIT_MS));

  const lead = await getLeadByEmail(email);
  if (!lead) { console.log('  ❌ Lead not found'); await cleanup(leadIds, ewIds); return; }
  leadIds.push(lead.Id);

  const members = await conn.query(`SELECT Id, Status, CampaignId FROM CampaignMember WHERE LeadId = '${lead.Id}' LIMIT 1`);
  if (members.records.length > 0) {
    check('B2B Campaign membership', 'created', 'created');
    check('Campaign ID', members.records[0].CampaignId, '701U700000eyrnzIAA', '(B2B Lead Form campaign)');
  } else {
    check('B2B Campaign membership', 'MISSING', 'created');
    const camp = await conn.sobject('Campaign').retrieve('701U700000eyrnzIAA', ['Name', 'IsActive', 'Status']);
    console.log(`    Campaign: ${camp.Name} | IsActive: ${camp.IsActive} | Status: ${camp.Status}`);
    console.log('    ACTION: Huma must set Status = "Active" on all 9 campaigns in sandbox');
  }

  await cleanup(leadIds, ewIds);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  await conn.login(process.env.SF_USERNAME, (process.env.SF_PASSWORD||'') + (process.env.SF_SECURITY_TOKEN||''));
  console.log('Connected to sandbox\n');

  await test1_standish();
  await test2_felician();
  await test3_b2c();
  await test4_campaign_b2b();

  console.log('\n══════════════════════════════════════');
  const passed = results.filter(r => r.pass).length;
  console.log(`RESULTS: ${passed}/${results.length} checks passed`);
  results.filter(r => !r.pass).forEach(r => {
    console.log(`  ❌ ${r.name}: got "${r.got}" expected "${r.expected}"`);
  });
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
