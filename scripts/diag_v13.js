require('dotenv').config();
const jsforce = require('jsforce');
const conn = new jsforce.Connection({ loginUrl: process.env.SF_LOGIN_URL || 'https://test.salesforce.com' });

async function main() {
  await conn.login(process.env.SF_USERNAME, (process.env.SF_PASSWORD || '') + (process.env.SF_SECURITY_TOKEN || ''));
  const ts = Date.now();
  const email = `v13diag${ts}@diag-becker.test`;

  const ewResult = await conn.sobject('ExternalWebform__c').create({
    First_Name__c: 'V13', Last_Name__c: 'Diag', Email__c: email,
    Primary_Interest__c: 'CPA', Requesting_for__c: 'Myself',
    Lead_Source_Form__c: 'Contact Us - Exploring',
    Lead_Source_Form_Date__c: new Date().toISOString(),
    Consent_Captured_Source__c: 'Becker Contact Us Form',
    Privacy_Consent_Status__c: 'OptIn',
    RFI_Suggested_Queue__c: 'Inside Sales',
  });
  if (!ewResult.success) { console.error('EW create failed:', ewResult.errors); return; }
  console.log('EW created:', ewResult.id);

  await new Promise(r => setTimeout(r, 14000));

  // Check ALL leads for this email (no LIMIT)
  const leads = await conn.query(`SELECT Id, CreatedDate, Lead_Source_Form__c, Lead_Source_Form_Date__c, Product_Line__c, OwnerId, Business_Brand__c FROM Lead WHERE Email = '${email}' AND IsConverted = false ORDER BY CreatedDate ASC`);
  console.log(`\nFound ${leads.records.length} lead(s):`);
  leads.records.forEach((l, i) => {
    console.log(`\n  Lead ${i+1}: ${l.Id} (created ${l.CreatedDate})`);
    console.log(`    Lead_Source_Form__c:      ${l.Lead_Source_Form__c}`);
    console.log(`    Lead_Source_Form_Date__c: ${l.Lead_Source_Form_Date__c}`);
    console.log(`    Product_Line__c:          ${l.Product_Line__c}`);
    console.log(`    Business_Brand__c:        ${l.Business_Brand__c}`);
  });

  // Also check EW record
  const ew = await conn.sobject('ExternalWebform__c').retrieve(ewResult.id, ['Lead_Source_Form__c', 'Consent_Captured_Source__c']);
  console.log(`\nEW.Lead_Source_Form__c: ${ew.Lead_Source_Form__c}`);
  console.log(`EW.Consent_Captured_Source__c: ${ew.Consent_Captured_Source__c}`);

  // Cleanup all
  for (const l of leads.records) await conn.sobject('Lead').destroy(l.Id);
  await conn.sobject('ExternalWebform__c').destroy(ewResult.id);
  console.log('\nCleaned up');
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
