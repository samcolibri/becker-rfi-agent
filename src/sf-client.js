// SOAP login — no Connected App required. Uses username + password + security token.
// Returns { accessToken, instanceUrl }
const SF_API_VERSION = process.env.SF_API_VERSION || 'v59.0';
const SF_LOGIN_URL   = process.env.SF_LOGIN_URL   || 'https://test.salesforce.com'; // sandbox default

let _session = null; // { accessToken, instanceUrl }

async function getSession() {
  if (_session) return _session;

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
    headers: {
      'Content-Type': 'text/xml',
      'SOAPAction': 'login',
    },
    body: soapBody,
  });

  const xml = await res.text();
  if (!res.ok || xml.includes('<faultcode>')) {
    const fault = xml.match(/<faultstring>(.*?)<\/faultstring>/s)?.[1] || xml.slice(0, 300);
    throw new Error(`SF SOAP login failed: ${fault}`);
  }

  const token       = xml.match(/<sessionId>(.*?)<\/sessionId>/)?.[1];
  const serverUrl   = xml.match(/<serverUrl>(.*?)<\/serverUrl>/)?.[1];
  const instanceUrl = serverUrl?.match(/^(https:\/\/[^/]+)/)?.[1];

  if (!token || !instanceUrl) throw new Error('SF SOAP login: could not parse sessionId/serverUrl');

  _session = { accessToken: token, instanceUrl };
  return _session;
}

async function getAccessToken() {
  return (await getSession()).accessToken;
}

async function sfRequest(method, path, body) {
  const { accessToken: token, instanceUrl } = await getSession();
  const url = `${instanceUrl}/services/data/${SF_API_VERSION}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SF API ${method} ${path} failed (${res.status}): ${err}`);
  }

  return res.status === 204 ? null : res.json();
}

// Account name typeahead — powers org name autocomplete on the form
// Returns [{id, name}] for accounts matching the search term
async function searchAccounts(q) {
  const safe = q.replace(/'/g, "\\'").replace(/%/g, '\\%').replace(/_/g, '\\_');
  const query = `SELECT Id, Name FROM Account WHERE Name LIKE '${safe}%' ORDER BY Name LIMIT 10`;
  const result = await sfRequest('GET', `/query?q=${encodeURIComponent(query)}`);
  return (result.records || []).map(r => ({ id: r.Id, name: r.Name }));
}

// Dedup check: find existing lead/contact by email
async function findExistingRecord(email) {
  const query = `SELECT Id, OwnerId, Owner.Name, RecordType.Name FROM Lead WHERE Email = '${email.replace(/'/g, "\\'")}' AND IsConverted = false LIMIT 1`;
  const result = await sfRequest('GET', `/query?q=${encodeURIComponent(query)}`);
  return result.records?.[0] || null;
}

// Find account owner if company already exists
async function findAccountOwner(companyName) {
  if (!companyName) return null;
  const query = `SELECT Id, OwnerId, Owner.Name, Owner.Department FROM Account WHERE Name = '${companyName.replace(/'/g, "\\'")}' LIMIT 1`;
  const result = await sfRequest('GET', `/query?q=${encodeURIComponent(query)}`);
  if (!result.records?.[0]) return null;

  const account = result.records[0];
  return {
    accountId: account.Id,
    name: account.Owner?.Name,
    team: account.Owner?.Department,
  };
}

// Write form submission to ExternalWebform__c — SF Flow handles dedup, Lead/Opp/Case creation
async function createExternalWebform(fields) {
  return sfRequest('POST', '/sobjects/ExternalWebform__c', fields);
}

// Create a Lead record (kept for reference — no longer called directly by lead-processor)
async function createLead(fields) {
  return sfRequest('POST', '/sobjects/Lead', fields);
}

// Create CommSubscriptionConsent record (CDM model)
async function createCommSubscriptionConsent({ leadId, email, consentGiven }) {
  return sfRequest('POST', '/sobjects/CommSubscriptionConsent__c', {
    Lead__c: leadId,
    Email__c: email,
    ConsentGiven__c: consentGiven,
    ConsentCapturedDateTime__c: new Date().toISOString(),
    ConsentCapturedSource__c: 'Becker Contact Us Form',
    Brand__c: 'Becker',
    SubscriptionChannel__c: 'Commercial Marketing',
  });
}

// Assign lead to a SF queue
async function assignLeadToQueue(leadId, queueName) {
  const query = `SELECT Id FROM Group WHERE Name = '${queueName}' AND Type = 'Queue' LIMIT 1`;
  const result = await sfRequest('GET', `/query?q=${encodeURIComponent(query)}`);
  const queueId = result.records?.[0]?.Id;
  if (!queueId) throw new Error(`Queue not found: ${queueName}`);

  return sfRequest('PATCH', `/sobjects/Lead/${leadId}`, { OwnerId: queueId });
}

// Assign lead directly to a rep
async function assignLeadToRep(leadId, repName) {
  const query = `SELECT Id FROM User WHERE Name = '${repName.replace(/'/g, "\\'")}' AND IsActive = true LIMIT 1`;
  const result = await sfRequest('GET', `/query?q=${encodeURIComponent(query)}`);
  const userId = result.records?.[0]?.Id;
  if (!userId) throw new Error(`Rep not found: ${repName}`);

  return sfRequest('PATCH', `/sobjects/Lead/${leadId}`, { OwnerId: userId });
}

// Create a SF Case for student support path (image 12: support creates Case not Lead)
async function createCase({ firstName, lastName, email, topic, product, message, leadSource }) {
  return sfRequest('POST', '/sobjects/Case', {
    SuppliedName: `${firstName} ${lastName}`,
    SuppliedEmail: email,
    Subject: `Student Support Request — ${topic || 'General'}`,
    Description: message || '',
    Origin: leadSource || 'Web - Contact Us Form',
    Product__c: product || null,
    Brand__c: 'Becker Professional Education Corporation',
    Status: 'New',
    Priority: 'Medium',
  });
}

// Assign a Case to a queue
async function assignCaseToQueue(caseId, queueName) {
  const query = `SELECT Id FROM Group WHERE Name = '${queueName}' AND Type = 'Queue' LIMIT 1`;
  const result = await sfRequest('GET', `/query?q=${encodeURIComponent(query)}`);
  const queueId = result.records?.[0]?.Id;
  if (!queueId) throw new Error(`Queue not found: ${queueName}`);
  return sfRequest('PATCH', `/sobjects/Case/${caseId}`, { OwnerId: queueId });
}

module.exports = {
  searchAccounts,
  findExistingRecord,
  findAccountOwner,
  createExternalWebform,
  createLead,
  createCommSubscriptionConsent,
  assignLeadToQueue,
  assignLeadToRep,
  createCase,
  assignCaseToQueue,
};
