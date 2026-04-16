const https = require('https');

const SF_BASE = process.env.SF_INSTANCE_URL;
const SF_API_VERSION = process.env.SF_API_VERSION || 'v59.0';

let _accessToken = null;

async function getAccessToken() {
  if (_accessToken) return _accessToken;

  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: process.env.SF_CLIENT_ID,
    client_secret: process.env.SF_CLIENT_SECRET,
    username: process.env.SF_USERNAME,
    password: process.env.SF_PASSWORD + (process.env.SF_SECURITY_TOKEN || ''),
  });

  const res = await fetch(`${SF_BASE}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SF auth failed: ${err}`);
  }

  const data = await res.json();
  _accessToken = data.access_token;
  return _accessToken;
}

async function sfRequest(method, path, body) {
  const token = await getAccessToken();
  const url = `${SF_BASE}/services/data/${SF_API_VERSION}${path}`;

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

// Create a Lead record
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
    ConsentCapturedSource__c: 'RFI Form — becker.com/contact-us',
    Brand__c: 'Becker Professional Education Corporation',
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
  createLead,
  createCommSubscriptionConsent,
  assignLeadToQueue,
  assignLeadToRep,
  createCase,
  assignCaseToQueue,
};
