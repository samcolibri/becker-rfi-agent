const SFMC_BASE = process.env.SFMC_REST_BASE_URL;
const SFMC_CLIENT_ID = process.env.SFMC_CLIENT_ID;
const SFMC_CLIENT_SECRET = process.env.SFMC_CLIENT_SECRET;
const SFMC_ACCOUNT_ID = process.env.SFMC_ACCOUNT_ID;

let _sfmcToken = null;
let _tokenExpiry = null;

// Map program of interest → SFMC Journey entry event key
const JOURNEY_ENTRY_EVENTS = {
  'CPA Demo Journey': process.env.SFMC_EVENT_CPA || 'CPA_Demo_Entry_v1',
  'CMA Demo Journey': process.env.SFMC_EVENT_CMA || 'CMA_Demo_Entry_v1',
  'CPE Free Demo Takers': process.env.SFMC_EVENT_CPE || 'CPE_Demo_Entry_v1',
  'CIA Demo Journey': process.env.SFMC_EVENT_CIA || 'CIA_Demo_Entry_v1',
  'EA Demo Journey': process.env.SFMC_EVENT_EA || 'EA_Demo_Entry_v1',
  'CFP Demo Journey': process.env.SFMC_EVENT_CFP || 'CFP_Demo_Entry_v1',
  'General Nurture Journey': process.env.SFMC_EVENT_GENERAL || 'General_Nurture_Entry_v1',
  'B2B Nurture Journey': process.env.SFMC_EVENT_B2B || 'B2B_Nurture_Entry_v1',
};

async function getSFMCToken() {
  if (_sfmcToken && _tokenExpiry && Date.now() < _tokenExpiry) return _sfmcToken;

  const authBase = process.env.SFMC_AUTH_BASE_URL;
  const res = await fetch(`${authBase}/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: SFMC_CLIENT_ID,
      client_secret: SFMC_CLIENT_SECRET,
      account_id: SFMC_ACCOUNT_ID,
    }),
  });

  if (!res.ok) throw new Error(`SFMC auth failed: ${await res.text()}`);

  const data = await res.json();
  _sfmcToken = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _sfmcToken;
}

// Fire a Journey Builder entry event
async function fireJourneyEntry({ journey, email, firstName, lastName, programOfInterest, leadId, leadStatus, brand }) {
  const eventKey = JOURNEY_ENTRY_EVENTS[journey];
  if (!eventKey) {
    console.warn(`No SFMC entry event configured for journey: ${journey}`);
    return null;
  }

  const token = await getSFMCToken();

  const payload = {
    ContactKey: email,
    EventDefinitionKey: eventKey,
    Data: {
      EmailAddress: email,
      FirstName: firstName,
      LastName: lastName,
      ProgramOfInterest: programOfInterest,
      LeadId: leadId || '',
      LeadStatus: leadStatus || 'New',
      Brand: brand || 'Becker Professional Education Corporation',
      SubmittedAt: new Date().toISOString(),
    },
  };

  const res = await fetch(`${SFMC_BASE}/interaction/v1/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SFMC journey entry failed for ${eventKey}: ${err}`);
  }

  return res.json();
}

module.exports = { fireJourneyEntry, JOURNEY_ENTRY_EVENTS };
