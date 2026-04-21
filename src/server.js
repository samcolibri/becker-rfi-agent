require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { processSubmission } = require('./lead-processor');
const sf = require('./sf-client');

const app = express();

app.use(cors({
  origin: [
    /becker\.com$/,
    /dev\.becker\.com$/,
    /localhost(:\d+)?$/,
    /railway\.app$/,
  ],
  methods: ['GET', 'POST'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// Account name typeahead — powers org name autocomplete on the form
// Monica: "when they start typing, it will start populating with business accounts"
app.get('/api/accounts', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  try {
    const results = await sf.searchAccounts(q);
    res.json(results);
  } catch (err) {
    console.error('[RFI] Account search error:', err.message);
    res.json([]);
  }
});

// Form submission endpoint
app.post('/api/submit', async (req, res) => {
  const {
    firstName, lastName, email, phone,
    intentPath,                          // exploring | ready | b2b | support
    productInterest, supportTopic,
    orgName, orgType, orgSize, state,
    roleType, graduationYear, beckerStudentEmail,
    message, preferredLearning,
    consentGiven, privacyConsent,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
  } = req.body;

  // Basic required field validation
  if (!firstName || !lastName || !email || !intentPath || !consentGiven) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['firstName', 'lastName', 'email', 'intentPath', 'consentGiven'],
    });
  }

  if (!email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const submission = {
    firstName, lastName, email,
    phone: phone || null,
    intentPath: intentPath.toLowerCase(),
    productInterest: productInterest || null,
    supportTopic: supportTopic || null,
    orgName: orgName || null,
    orgType: orgType || null,
    orgSize: orgSize || null,
    state: state || null,
    roleType: roleType || null,
    graduationYear: graduationYear || null,
    beckerStudentEmail: beckerStudentEmail || null,
    message: message || null,
    preferredLearning: preferredLearning || null,
    consentGiven: consentGiven === 'true' || consentGiven === true,
    privacyConsent: privacyConsent === 'true' || privacyConsent === true,
    utmParams: { utm_source, utm_medium, utm_campaign, utm_content, utm_term },
  };

  console.log(`[RFI] Submission: ${email} | intent: ${intentPath}`);

  const result = await processSubmission(submission);

  if (result.status === 'error') {
    console.error(`[RFI] Error for ${email}:`, result.error);
    return res.status(500).json({ error: 'Submission failed', detail: result.error });
  }

  const slaMessages = {
    b2b: 'Thank you! A Becker Business Solutions representative will be in touch within 48 business hours.',
    support: 'Thank you! Our student support team will be in touch within 1 business day.',
    exploring: 'Thank you! A Becker advisor will be in touch within 1–4 business hours.',
    ready: 'Thank you! A Becker enrollment advisor will be in touch within 1–4 business hours.',
  };
  const slaMessage = slaMessages[submission.intentPath] || 'Thank you! A Becker representative will be in touch shortly.';

  console.log(`[RFI] Success: ${result.leadId || result.caseId} → ${result.queue || result.journey}`);
  return res.json({
    success: true,
    message: slaMessage,
    leadId: result.leadId || result.caseId || null,
    ...(process.env.NODE_ENV === 'development' ? { debug: result } : {}),
  });
});

// SPA fallback — serve React app for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Becker RFI Agent running on :${PORT}`));

module.exports = app;
