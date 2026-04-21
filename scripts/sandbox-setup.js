#!/usr/bin/env node
/**
 * Sandbox setup: create RFI campaigns + add queue members
 * Run: node scripts/sandbox-setup.js
 */
require('dotenv').config();

const SF_API_VERSION = process.env.SF_API_VERSION || 'v59.0';
const SF_LOGIN_URL   = process.env.SF_LOGIN_URL   || 'https://test.salesforce.com';

async function getSession() {
  const username = process.env.SF_USERNAME;
  const password = (process.env.SF_PASSWORD || '') + (process.env.SF_SECURITY_TOKEN || '');

  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:urn="urn:partner.soap.sforce.com">
  <soapenv:Body>
    <urn:login>
      <urn:username>${username}</urn:username>
      <urn:password>${password}</urn:password>
    </urn:login>
  </soapenv:Body>
</soapenv:Envelope>`;

  const res = await fetch(`${SF_LOGIN_URL}/services/Soap/u/${SF_API_VERSION}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml', 'SOAPAction': 'login' },
    body: soapBody,
  });
  const xml = await res.text();
  if (!res.ok || xml.includes('<faultcode>')) {
    const fault = xml.match(/<faultstring>(.*?)<\/faultstring>/s)?.[1] || xml.slice(0, 300);
    throw new Error(`SF SOAP login failed: ${fault}`);
  }
  const token     = xml.match(/<sessionId>(.*?)<\/sessionId>/)?.[1];
  const serverUrl = xml.match(/<serverUrl>(.*?)<\/serverUrl>/)?.[1];
  const instanceUrl = serverUrl?.match(/^(https:\/\/[^/]+)/)?.[1];
  if (!token || !instanceUrl) throw new Error('Could not parse sessionId/serverUrl');
  return { token, instanceUrl };
}

async function sfReq(session, method, path, body) {
  const url = `${session.instanceUrl}/services/data/${SF_API_VERSION}${path}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SF ${method} ${path} (${res.status}): ${err}`);
  }
  return res.status === 204 ? null : res.json();
}

async function main() {
  console.log('🔐 Logging in to SF sandbox...');
  const session = await getSession();
  console.log(`✅ Connected: ${session.instanceUrl}\n`);

  // ── 1. Create campaigns ───────────────────────────────────────────────────
  const campaigns = [
    { Name: 'Becker RFI - CPA',                  Type: 'Other', Status: 'Active', Description: 'RFI form - CPA product interest (B2C)' },
    { Name: 'Becker RFI - CMA',                  Type: 'Other', Status: 'Active', Description: 'RFI form - CMA product interest (B2C)' },
    { Name: 'Becker RFI - CPE',                  Type: 'Other', Status: 'Active', Description: 'RFI form - CPE product interest (B2C)' },
    { Name: 'Becker RFI - CIA',                  Type: 'Other', Status: 'Active', Description: 'RFI form - CIA product interest (B2C)' },
    { Name: 'Becker RFI - EA',                   Type: 'Other', Status: 'Active', Description: 'RFI form - EA product interest (B2C)' },
    { Name: 'Becker RFI - CFP',                  Type: 'Other', Status: 'Active', Description: 'RFI form - CFP product interest (B2C)' },
    { Name: 'Becker RFI - Staff Level Training', Type: 'Other', Status: 'Active', Description: 'RFI form - Staff Level Training (B2C)' },
    { Name: 'Becker RFI - CIA Challenge Exam',   Type: 'Other', Status: 'Active', Description: 'RFI form - CIA Challenge Exam (B2C)' },
    { Name: 'Becker RFI - B2B',                  Type: 'Other', Status: 'Active', Description: 'RFI form - All B2B submissions' },
  ];

  const campaignIds = {};
  console.log('📣 Creating RFI campaigns...');
  for (const c of campaigns) {
    const result = await sfReq(session, 'POST', '/sobjects/Campaign', c);
    console.log(`  ✅ ${c.Name} → ${result.id}`);
    campaignIds[c.Name] = result.id;
  }

  // ── 2. Get queue IDs ──────────────────────────────────────────────────────
  console.log('\n🔍 Looking up queue IDs...');
  const queueNames = [
    'Global Firms',
    'New Client Acquisition',
    'University',
    'International',
    'Customer Success & Expansion',
    'Inside Sales',
  ];
  const queueResult = await sfReq(session, 'GET',
    `/query?q=${encodeURIComponent(`SELECT Id, Name FROM Group WHERE Type = 'Queue' AND Name IN ('${queueNames.join("','")}')`)}`,
  );
  const queueMap = {};
  for (const q of queueResult.records) {
    queueMap[q.Name] = q.Id;
    console.log(`  ${q.Name} → ${q.Id}`);
  }

  // ── 3. Look up user IDs ───────────────────────────────────────────────────
  const repNames = [
    'Andrea Jennings', 'Kristin Curcuru',          // Global Firms
    'Andrew Masiewicz', 'Ashley Griffin',           // NCA
    'Amy Johnson', 'Aaron Gocer',                   // University
    'Ben Wong', 'Eduardo Escalante',                // International
    'Alexandria Reyes', 'Ashley Stephens',          // CS&E
    'Aaron Smith', 'Glenn Proud',                   // Inside Sales (already added, but re-add is safe)
  ];
  console.log('\n👥 Looking up user IDs...');
  const userResult = await sfReq(session, 'GET',
    `/query?q=${encodeURIComponent(`SELECT Id, Name FROM User WHERE Name IN ('${repNames.join("','")}') AND IsActive = true`)}`,
  );
  const userMap = {};
  for (const u of userResult.records) {
    userMap[u.Name] = u.Id;
    console.log(`  ${u.Name} → ${u.Id}`);
  }

  // ── 4. Add members to queues ──────────────────────────────────────────────
  const queueMembers = {
    'Global Firms':                 ['Andrea Jennings', 'Kristin Curcuru'],
    'New Client Acquisition':       ['Andrew Masiewicz', 'Ashley Griffin'],
    'University':                   ['Amy Johnson', 'Aaron Gocer'],
    'International':                ['Ben Wong', 'Eduardo Escalante'],
    'Customer Success & Expansion': ['Alexandria Reyes', 'Ashley Stephens'],
  };

  console.log('\n➕ Adding queue members...');
  for (const [queueName, reps] of Object.entries(queueMembers)) {
    const queueId = queueMap[queueName];
    if (!queueId) { console.log(`  ⚠️  Queue not found: ${queueName}`); continue; }
    for (const repName of reps) {
      const userId = userMap[repName];
      if (!userId) { console.log(`  ⚠️  User not found: ${repName}`); continue; }
      try {
        const r = await sfReq(session, 'POST', '/sobjects/GroupMember', {
          GroupId: queueId,
          UserOrGroupId: userId,
        });
        console.log(`  ✅ ${queueName} ← ${repName} (${r.id})`);
      } catch (e) {
        if (e.message.includes('DUPLICATE_VALUE')) {
          console.log(`  ℹ️  ${queueName} ← ${repName} (already member)`);
        } else {
          console.log(`  ❌ ${queueName} ← ${repName}: ${e.message}`);
        }
      }
    }
  }

  // ── 5. Print campaign ID map for lead-processor.js ────────────────────────
  console.log('\n📋 Campaign IDs for lead-processor.js:');
  console.log(`B2B: '${campaignIds['Becker RFI - B2B']}'`);
  console.log(`CPA: '${campaignIds['Becker RFI - CPA']}'`);
  console.log(`CMA: '${campaignIds['Becker RFI - CMA']}'`);
  console.log(`CPE: '${campaignIds['Becker RFI - CPE']}'`);
  console.log(`CIA: '${campaignIds['Becker RFI - CIA']}'`);
  console.log(`EA:  '${campaignIds['Becker RFI - EA']}'`);
  console.log(`CFP: '${campaignIds['Becker RFI - CFP']}'`);
  console.log(`SLT: '${campaignIds['Becker RFI - Staff Level Training']}'`);
  console.log(`CIA Challenge: '${campaignIds['Becker RFI - CIA Challenge Exam']}'`);

  console.log('\n✅ Sandbox setup complete.');
  return campaignIds;
}

main().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
