#!/usr/bin/env node
/**
 * Deploy a Salesforce package using REST Metadata Deploy API
 * Usage: node scripts/rest-deploy.js <path-to-zip>
 */
require('dotenv').config();
const fs = require('fs');

const SF_LOGIN_URL = process.env.SF_LOGIN_URL || 'https://test.salesforce.com';

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
  if (!token) throw new Error('Login failed: ' + xml.slice(0, 300));
  return { token, instanceUrl };
}

async function main() {
  const zipPath = process.argv[2];
  if (!zipPath) { console.error('Usage: node scripts/rest-deploy.js <zip>'); process.exit(1); }

  console.log('🔐 Logging in...');
  const s = await getSession();
  console.log('✅ Connected:', s.instanceUrl);

  const zipBuf = fs.readFileSync(zipPath);
  console.log(`📦 Deploying ${zipPath} (${zipBuf.length} bytes)...`);

  const boundary = '----BeckerDeploy' + Date.now();
  const jsonPart = JSON.stringify({
    deployOptions: { checkOnly: false, ignoreWarnings: true, rollbackOnError: true, testLevel: 'NoTestRun', singlePackage: true }
  });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="json"\r\nContent-Type: application/json\r\n\r\n${jsonPart}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="deploy.zip"\r\nContent-Type: application/zip\r\n\r\n`),
    zipBuf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const r = await fetch(`${s.instanceUrl}/services/data/v59.0/metadata/deployRequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  const resp = await r.json();
  if (!resp.id) throw new Error('Deploy start failed: ' + JSON.stringify(resp));
  console.log('🚀 Deploy started:', resp.id);

  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 4000));
    const pr = await fetch(`${s.instanceUrl}/services/data/v59.0/metadata/deployRequest/${resp.id}?includeDetails=true`, {
      headers: { Authorization: `Bearer ${s.token}` },
    });
    const d = await pr.json();
    const res = d.deployResult;
    console.log(`  Status: ${res.status} | total: ${res.numberComponentsTotal} | deployed: ${res.numberComponentsDeployed} | errors: ${res.numberComponentErrors}`);

    if (res.completedDate) {
      if (res.success) {
        console.log('✅ Flow deployed successfully!');
        return;
      }
      console.error('❌ Deploy FAILED:');
      const failures = [].concat(res.details?.componentFailures || []);
      failures.forEach(f => console.error(`  [${f.fileName}] ${f.problem}`));
      process.exit(1);
    }
  }
  console.error('Deploy timed out'); process.exit(1);
}

main();
