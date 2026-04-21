require('dotenv').config();
const jsforce = require('jsforce');

const conn = new jsforce.Connection({ loginUrl: process.env.SF_LOGIN_URL || 'https://test.salesforce.com' });

async function main() {
  await conn.login(process.env.SF_USERNAME, (process.env.SF_PASSWORD || '') + (process.env.SF_SECURITY_TOKEN || ''));
  console.log('Connected');

  const ts = Date.now();
  const email = `v13smoke${ts}@smoke-becker.test`;

  // Create EW record simulating a B2C Exploring CPA submission
  const ewResult = await conn.sobject('ExternalWebform__c').create({
    First_Name__c: 'V13',
    Last_Name__c: 'Smoke',
    Email__c: email,
    Primary_Interest__c: 'CPA',
    Requesting_for__c: 'Myself',
    Lead_Source_Form__c: 'Contact Us - Exploring',
    Lead_Source_Form_Date__c: new Date().toISOString(),
    BusinessBrand__c: 'Becker',
    Privacy_Consent_Status__c: 'OptIn',
    Consent_Captured_Source__c: 'Becker Contact Us Form',
    RFI_Suggested_Queue__c: 'Inside Sales',
  });
  console.log('EW created:', ewResult.id);

  // Wait for flow to fire
  await new Promise(r => setTimeout(r, 12000));

  // Query the lead
  const leads = await conn.query(`SELECT Id, Email, Lead_Source_Form__c, Lead_Source_Form_Date__c, Product_Line__c, What_year_do_you_plan_to_graduate__c, Business_Brand__c, RecordTypeId FROM Lead WHERE Email = '${email}' AND IsConverted = false LIMIT 1`);
  
  if (!leads.records.length) {
    console.error('❌ Lead NOT FOUND');
    return;
  }
  const lead = leads.records[0];
  console.log('\nLead found:', lead.Id);
  console.log('Lead_Source_Form__c:       ', lead.Lead_Source_Form__c || '❌ BLANK');
  console.log('Lead_Source_Form_Date__c:  ', lead.Lead_Source_Form_Date__c || '❌ BLANK');
  console.log('Product_Line__c:           ', lead.Product_Line__c || '❌ BLANK');
  console.log('What_year_do_you_plan...:  ', lead.What_year_do_you_plan_to_graduate__c || '(null — expected, no year sent)');
  console.log('Business_Brand__c:         ', lead.Business_Brand__c || '❌ BLANK');

  const pass = lead.Lead_Source_Form__c === 'Contact Us - Exploring' &&
               lead.Lead_Source_Form_Date__c &&
               lead.Product_Line__c === 'CPA';
  console.log(pass ? '\n✅ All new mappings verified!' : '\n❌ Some fields missing — check flow');

  // Cleanup
  await conn.sobject('Lead').destroy(lead.Id);
  await conn.sobject('ExternalWebform__c').destroy(ewResult.id);
  console.log('Cleaned up test records');
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
