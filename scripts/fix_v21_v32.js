require('dotenv').config();
const fs = require('fs');
const jsforce = require('jsforce');
const conn = new jsforce.Connection({ loginUrl: process.env.SF_LOGIN_URL || 'https://test.salesforce.com' });

async function main() {
  await conn.login(process.env.SF_USERNAME, (process.env.SF_PASSWORD || '') + (process.env.SF_SECURITY_TOKEN || ''));
  console.log('Connected');

  const flows = [
    { name: 'External_Web_Form_Main_Record_Triggered_Flow_After_Save', file: '/tmp/External_Web_Form_Main_Record_Triggered_Flow_After_Save_fixed.json', label: 'v21' },
    { name: 'Create_Leads_Sub_Flow', file: '/tmp/Create_Leads_Sub_Flow_fixed.json', label: 'v32' },
  ];

  for (const { name, file, label } of flows) {
    console.log(`\nDeploying ${label} (${name})...`);
    const fixed = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Add fullName for metadata.update
    fixed.fullName = name;
    try {
      const result = await conn.metadata.update('Flow', fixed);
      if (result.success) {
        console.log(`✅ ${label} deployed successfully`);
      } else {
        console.error(`❌ ${label} failed:`, result.errors);
      }
    } catch (e) {
      console.error(`❌ ${label} error:`, e.message);
    }
  }
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
