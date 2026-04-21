require('dotenv').config();
const fs = require('fs');

async function getSession() {
  const u = process.env.SF_USERNAME;
  const p = (process.env.SF_PASSWORD || '') + (process.env.SF_SECURITY_TOKEN || '');
  const loginUrl = process.env.SF_LOGIN_URL || 'https://test.salesforce.com';
  const soap = `<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com"><soapenv:Body><urn:login><urn:username>${u}</urn:username><urn:password>${p}</urn:password></urn:login></soapenv:Body></soapenv:Envelope>`;
  const r = await fetch(`${loginUrl}/services/Soap/u/59.0`, { method:'POST', headers:{'Content-Type':'text/xml','SOAPAction':'login'}, body:soap });
  const xml = await r.text();
  const token = xml.match(/<sessionId>(.*?)<\/sessionId>/)?.[1];
  const instanceUrl = xml.match(/<serverUrl>(.*?)<\/serverUrl>/)?.[1]?.match(/^(https:\/\/[^/]+)/)?.[1];
  if (!token) throw new Error('Login failed: ' + xml.slice(0,200));
  return { token, instanceUrl };
}

async function main() {
  const { token, instanceUrl } = await getSession();
  console.log('Connected:', instanceUrl);

  const zipBuffer = fs.readFileSync('/tmp/deploy_v21_v32_fix.zip');
  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('json', JSON.stringify({ deployOptions: { allowMissingFiles: false, autoUpdatePackage: false, checkOnly: false, ignoreWarnings: false, performRetrieve: false, purgeOnDelete: false, rollbackOnError: true, runTests: [], testLevel: 'NoTestRun', singlePackage: true } }), { contentType: 'application/json' });
  form.append('file', zipBuffer, { filename: 'deploy.zip', contentType: 'application/zip' });

  const deployRes = await fetch(`${instanceUrl}/services/data/v59.0/metadata/deployRequest`, {
    method:'POST', headers:{ Authorization:'Bearer '+token, ...form.getHeaders() }, body:form.getBuffer()
  });
  const deployData = await deployRes.json();
  if (!deployData.id) { console.error('Deploy error:', JSON.stringify(deployData)); process.exit(1); }
  console.log('Deploy ID:', deployData.id);

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const s = await (await fetch(`${instanceUrl}/services/data/v59.0/metadata/deployRequest/${deployData.id}?includeDetails=true`, { headers:{ Authorization:'Bearer '+token } })).json();
    const ds = s.deployResult;
    console.log('Status:', ds.status, '|', ds.numberComponentsDeployed, '/', ds.numberComponentsTotal);
    if (ds.done) {
      if (ds.success) console.log('✅ v21 + v32 deployed successfully!');
      else { console.error('❌ Failed:'); (ds.details?.componentFailures||[]).forEach(f => console.error(' -', f.fullName, ':', f.problem)); }
      break;
    }
  }
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
