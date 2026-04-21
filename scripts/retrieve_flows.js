require('dotenv').config();
const jsforce = require('jsforce');
const fs = require('fs');
const conn = new jsforce.Connection({ loginUrl: process.env.SF_LOGIN_URL || 'https://test.salesforce.com' });

async function main() {
  await conn.login(process.env.SF_USERNAME, (process.env.SF_PASSWORD||'') + (process.env.SF_SECURITY_TOKEN||''));
  
  const result = await conn.metadata.retrieve({
    apiVersion: '59.0',
    singlePackage: true,
    unpackaged: {
      types: [{ name: 'Flow', members: ['External_Web_Form_Main_Record_Triggered_Flow_After_Save', 'Create_Leads_Sub_Flow'] }],
      version: '59.0'
    }
  });
  
  // Wait for retrieval
  let status;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    status = await conn.metadata.checkRetrieveStatus(result.id, true);
    if (status.done) break;
    console.log('Retrieving...', status.status);
  }
  
  if (!status.zipFile) { console.error('No zipFile returned'); return; }
  const zipBuf = Buffer.from(status.zipFile, 'base64');
  fs.writeFileSync('/tmp/retrieved_flows.zip', zipBuf);
  console.log('ZIP saved to /tmp/retrieved_flows.zip, size:', zipBuf.length);
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
