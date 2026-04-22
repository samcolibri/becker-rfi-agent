#!/usr/bin/env node
/**
 * Deploy a Salesforce Flow via Metadata API SOAP
 * Usage: node scripts/deploy-flow.js <path-to-zip>
 */
require('dotenv').config();
const fs = require('fs');

const SF_LOGIN_URL   = process.env.SF_LOGIN_URL   || 'https://test.salesforce.com';
const SF_API_VERSION = process.env.SF_API_VERSION || 'v59.0';
const VERSION        = SF_API_VERSION.replace('v', '');

async function getSession() {
  const username = process.env.SF_USERNAME;
  const password  = (process.env.SF_PASSWORD || '') + (process.env.SF_SECURITY_TOKEN || '');
  const body = `<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com"><soapenv:Body><urn:login><urn:username>${username}</urn:username><urn:password>${password}</urn:password></urn:login></soapenv:Body></soapenv:Envelope>`;
  const r = await fetch(`${SF_LOGIN_URL}/services/Soap/u/${VERSION}`, {
    method: 'POST', headers: { 'Content-Type': 'text/xml', 'SOAPAction': 'login' }, body,
  });
  const xml = await r.text();
  const token      = xml.match(/<sessionId>(.*?)<\/sessionId>/)?.[1];
  const serverUrl  = xml.match(/<serverUrl>(.*?)<\/serverUrl>/)?.[1];
  const instanceUrl = serverUrl?.match(/^(https:\/\/[^/]+)/)?.[1];
  if (!token) throw new Error('Login failed: ' + xml.slice(0, 300));
  return { token, instanceUrl };
}

function wrapSoap(token, body) {
  return `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:met="http://soap.sforce.com/2006/04/metadata"><soapenv:Header><met:CallOptions/><met:SessionHeader><met:sessionId>${token}</met:sessionId></met:SessionHeader></soapenv:Header><soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`;
}

async function main() {
  const zipPath = process.argv[2];
  if (!zipPath) { console.error('Usage: node scripts/deploy-flow.js <path-to-zip>'); process.exit(1); }

  console.log('🔐 Logging in...');
  const session = await getSession();
  console.log('✅ Connected:', session.instanceUrl);

  const zipB64 = fs.readFileSync(zipPath).toString('base64');
  const metaUrl = `${session.instanceUrl}/services/Soap/m/${VERSION}`;

  const deployXml = wrapSoap(session.token,
    `<met:deploy><met:ZipFile>${zipB64}</met:ZipFile><met:DeployOptions><met:checkOnly>false</met:checkOnly><met:ignoreWarnings>true</met:ignoreWarnings><met:rollbackOnError>true</met:rollbackOnError><met:singlePackage>true</met:singlePackage><met:testLevel>NoTestRun</met:testLevel></met:DeployOptions></met:deploy>`
  );

  const r = await fetch(metaUrl, {
    method: 'POST', headers: { 'Content-Type': 'text/xml', 'SOAPAction': 'deploy' }, body: deployXml,
  });
  const xml = await r.text();
  const asyncId = xml.match(/<id>(.*?)<\/id>/)?.[1];
  if (!asyncId) throw new Error('Deploy start failed: ' + xml.slice(0, 400));
  console.log('🚀 Deploy started:', asyncId);

  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 4000));
    const pollXml = wrapSoap(session.token,
      `<met:checkDeployStatus><met:asyncProcessId>${asyncId}</met:asyncProcessId><met:includeDetails>true</met:includeDetails></met:checkDeployStatus>`
    );
    const pr = await fetch(metaUrl, {
      method: 'POST', headers: { 'Content-Type': 'text/xml', 'SOAPAction': 'checkDeployStatus' }, body: pollXml,
    });
    const pxml = await pr.text();
    const done    = pxml.match(/<done>(.*?)<\/done>/)?.[1];
    const success = pxml.match(/<success>(.*?)<\/success>/)?.[1];
    const status  = pxml.match(/<status>(.*?)<\/status>/)?.[1];
    console.log(`  Status: ${status} | done: ${done}`);

    if (done === 'true') {
      if (success === 'true') { console.log('✅ Flow deployed successfully!'); return; }
      const problems  = [...pxml.matchAll(/<problem>(.*?)<\/problem>/g)].map(m => m[1]);
      const fileNames = [...pxml.matchAll(/<fileName>(.*?)<\/fileName>/g)].map(m => m[1]);
      console.error('❌ Deploy FAILED:');
      problems.forEach((p, i) => console.error(`  [${fileNames[i] || '?'}] ${p}`));
      // Print raw failure section for debugging
      const cfIdx = pxml.indexOf('<componentFailures>');
      if (cfIdx !== -1) console.error('\nRaw failures:\n', pxml.slice(cfIdx, cfIdx + 800));
      process.exit(1);
    }
  }
  console.error('Deploy timed out'); process.exit(1);
}

main();
