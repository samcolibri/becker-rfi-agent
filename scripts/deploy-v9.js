#!/usr/bin/env node
require('dotenv').config();
const jsforce = require('jsforce');
const fs = require('fs');
const path = require('path');

async function main() {
  const conn = new jsforce.Connection({
    loginUrl: process.env.SF_LOGIN_URL || 'https://test.salesforce.com',
    version: '59.0',
  });

  console.log('Logging in...');
  await conn.login(
    process.env.SF_USERNAME,
    (process.env.SF_PASSWORD || '') + (process.env.SF_SECURITY_TOKEN || '')
  );
  console.log('Connected:', conn.instanceUrl);

  const zipBuf = fs.readFileSync('/tmp/becker_rfi_v9.zip');
  console.log('Deploying v9 ZIP (' + zipBuf.length + ' bytes)...');

  const result = await conn.metadata.deploy(zipBuf, {
    checkOnly: false,
    ignoreWarnings: true,
    rollbackOnError: true,
    testLevel: 'NoTestRun',
  }).complete();

  console.log('Status:', result.status, '| Success:', result.success);
  if (result.success === true || result.success === 'true') {
    console.log('✅ Flow v9 deployed successfully!');
  } else {
    console.error('❌ Deploy FAILED');
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
