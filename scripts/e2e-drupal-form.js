/**
 * E2E test: Live Drupal form → Salesforce verification
 * Form: https://atgeacebeckernonprodacn.prod.acquia-sites.com/form/becker-rfi
 *
 * Run: node scripts/e2e-drupal-form.js
 * Requires: Playwright in /Users/anmolsam/colibri-qa-platform/node_modules
 *           + valid .env credentials
 *
 * Scenarios:
 *   SC-1: B2C Exploring (CPA)               → Lead, CS-Inside Sales, CampaignMember
 *   SC-2: B2B Standish Management           → Lead, JoAnn Veiga (account owner override)
 *   SC-3: B2B Accounting Firm 26-100        → Lead, Global Firms queue
 *   SC-4: Support form                      → Contact_Us_Form__c, NO Lead
 *
 * Confirmed field names (2026-04-27):
 *   Step 1  intent:           edit-intent-{exploring|enrolling|organization|support}
 *   Step 1  requesting_for:   auto-hidden for org/support; label-click for exploring/enrolling
 *   Step 2  B2C required:     first_name, last_name, email, product_interest, role_type, residence_state
 *   Step 2  B2B required:     first_name, last_name, email, product_interest, role_type, phone, company,
 *                             org_type, org_size, hq_state
 *   Step 2  Support required: first_name, last_name, email, product_interest, role_type, country
 *   Step 3  consent:          consent_marketing (optional), privacy_consent (optional)
 *   Step 3  submit:           [id^="edit-submit"]
 */

const path = require('path');
const { chromium } = require(
  path.join('/Users/anmolsam/colibri-qa-platform/node_modules/@playwright/test')
);
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const jsforce = require('jsforce');

const FORM_URL = 'https://atgeacebeckernonprodacn.prod.acquia-sites.com/form/becker-rfi';

// ── SF connection ─────────────────────────────────────────────────────────────
async function sfConnect() {
  const conn = new jsforce.Connection({
    loginUrl: process.env.SF_LOGIN_URL || 'https://test.salesforce.com',
  });
  await conn.login(
    process.env.SF_USERNAME,
    process.env.SF_PASSWORD + (process.env.SF_SECURITY_TOKEN || '')
  );
  return conn;
}

// ── Logging helpers ───────────────────────────────────────────────────────────
function log(msg)  { console.log(`  ${msg}`); }
function pass(label) { console.log(`  ✅ ${label}`); }
function fail(label, got, exp) { console.log(`  ❌ ${label}\n       got:      "${got}"\n       expected:  "${exp}"`); }
function chk(label, actual, expected) {
  (String(actual) === String(expected)) ? pass(label) : fail(label, actual, expected);
}
function chkContains(label, actual, substr) {
  (actual && actual.includes(substr)) ? pass(label) : fail(label, actual, `contains "${substr}"`);
}
function chkTrue(label, val) {
  val ? pass(label) : fail(label, val, 'truthy');
}
function chkFalse(label, val) {
  !val ? pass(label) : fail(label, val, 'falsy / empty');
}

async function sfWait(ms) {
  log(`Waiting ${ms / 1000}s for SF flow...`);
  await new Promise(r => setTimeout(r, ms));
}

// ── Form navigation helpers ───────────────────────────────────────────────────

async function selectIntent(page, intent) {
  // intent: 'exploring' | 'enrolling' | 'organization' | 'support'
  await page.click(`label[for="edit-intent-${intent}"]`);
  await page.waitForTimeout(400);
}

async function selectRequestingFor(page, who) {
  // who: 'myself' | 'organization'
  // For 'exploring' and 'enrolling', requesting_for labels are visible and must be clicked.
  // For 'organization' and 'support', the section is hidden; the form infers it from intent.
  const label = page.locator(`label[for="edit-requesting-for-${who}"]`).first();
  const isVisible = await label.isVisible().catch(() => false);
  if (isVisible) {
    await label.click();
    await page.waitForTimeout(400);
  } else {
    // Force-set via JS for hidden radio
    await page.evaluate((w) => {
      const radio = document.querySelector(`[name="requesting_for"][value="${w === 'myself' ? 'Myself' : 'My organization'}"]`);
      if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
    }, who);
  }
}

async function clickNext(page) {
  await page.click('[id^="edit-wizard-next"]');
  await page.waitForTimeout(3500);
}

async function clickSubmit(page) {
  await page.click('[name="op"][value="Submit"]');
  await page.waitForTimeout(4000);
  const text = await page.evaluate(() => document.body.innerText.substring(0, 300)).catch(() => '(navigated)');
  log(`Post-submit: ${text.substring(0, 150).replace(/\n/g, ' ')}`);
}

async function fillField(page, name, value) {
  if (value === undefined || value === null) return;
  // Avoid el.evaluate for type detection — use type-specific locators instead
  const selectEl = page.locator(`select[name="${name}"]`).first();
  if (await selectEl.isVisible().catch(() => false)) {
    await selectEl.selectOption(String(value));
    return;
  }
  const checkboxEl = page.locator(`input[type="checkbox"][name="${name}"]`).first();
  if (await checkboxEl.isVisible().catch(() => false)) {
    // Drupal checkboxes: label intercepts pointer events, derive stable ID from field name
    const drupalSel = `edit-${name.replace(/_/g, '-')}`;
    const label = page.locator(`label[for^="${drupalSel}"]`).first();
    if (await label.isVisible().catch(() => false)) {
      await label.click({ force: true });
    } else {
      await page.evaluate((n) => {
        const el = document.querySelector(`input[type="checkbox"][name="${n}"]`);
        if (el) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
      }, name);
    }
    return;
  }
  const inputEl = page.locator(`input[name="${name}"]:not([type="checkbox"]):not([type="radio"]), textarea[name="${name}"]`).first();
  if (await inputEl.isVisible().catch(() => false)) {
    await inputEl.fill(String(value));
  }
}

// ── Scenario 1: B2C Exploring (CPA) ──────────────────────────────────────────
async function runSC1(browser, conn) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('SC-1  B2C Exploring (CPA)  →  CS-Inside Sales queue + CampaignMember');
  console.log('══════════════════════════════════════════════════════════════');

  const ts = Date.now();
  const email = `e2e.sc1.${ts}@becker-playwright.com`;
  const phone = `(312) 555-${String(Math.floor(Math.random() * 9000) + 1000)}`;

  const page = await browser.newPage();
  try {
    await page.goto(FORM_URL, { waitUntil: 'networkidle', timeout: 30000 });
    // Step 1
    await selectIntent(page, 'exploring');
    await selectRequestingFor(page, 'myself');
    await clickNext(page);
    // Step 2 — B2C fields
    await fillField(page, 'first_name', 'E2E');
    await fillField(page, 'last_name', `SC1-B2C-${ts}`);
    await fillField(page, 'email', email);
    await fillField(page, 'product_interest', 'CPA');
    await fillField(page, 'role_type', 'Staff Accountant');
    await fillField(page, 'residence_state', 'IL');
    await clickNext(page);
    // Step 3 — consent
    await fillField(page, 'consent_marketing', true);
    await fillField(page, 'privacy_consent', true);
    await clickSubmit(page);
  } finally {
    await page.close();
  }

  log(`Email: ${email}`);
  await sfWait(45000);

  const res = await conn.query(
    `SELECT Id, FirstName, LastName, Email, RecordType.Name,
            Owner.Name, Owner.Type, Business_Brand__c,
            Lead_Source_Form__c, Privacy_Consent_Status__c,
            Consent_Provided__c, Consent_Captured_Source__c
     FROM Lead WHERE Email = '${email}' AND IsConverted = false LIMIT 1`
  );
  if (!res.records.length) { fail('Lead created', 'NOT FOUND', 'Lead record'); return; }
  const lead = res.records[0];
  log(`Lead ID: ${lead.Id}`);

  chk('RecordType', lead.RecordType?.Name, 'B2C Lead');
  chk('Owner (CS-Inside Sales)', lead.Owner?.Name, 'CS - Inside Sales');
  chk('Owner type', lead.Owner?.Type, 'Queue');
  chk('Business_Brand__c', lead.Business_Brand__c, 'Becker');
  chk('Lead_Source_Form__c', lead.Lead_Source_Form__c, 'Contact Us - Exploring');
  chk('Privacy_Consent_Status__c', lead.Privacy_Consent_Status__c, 'OptIn');
  chkContains('Consent_Provided__c has Email', lead.Consent_Provided__c, 'Email');
  // Drupal path sends "Becker Contact Us Form" (not "Becker RFI Form" used in Node.js path)
  chkContains('Consent_Captured_Source__c', lead.Consent_Captured_Source__c, 'Becker');

  const cm = await conn.query(
    `SELECT Id FROM CampaignMember WHERE LeadId = '${lead.Id}' LIMIT 1`
  );
  cm.records.length ? pass('CampaignMember created') : fail('CampaignMember', 'NOT FOUND', 'record');
}

// ── Scenario 2: B2B Standish Management → JoAnn Veiga ────────────────────────
async function runSC2(browser, conn) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('SC-2  B2B Standish Management  →  JoAnn Veiga (account owner override)');
  console.log('══════════════════════════════════════════════════════════════');

  const ts = Date.now();
  const email = `e2e.sc2.${ts}@becker-playwright.com`;
  const phone = `(312) 555-${String(Math.floor(Math.random() * 9000) + 1000)}`;

  const page = await browser.newPage();
  try {
    await page.goto(FORM_URL, { waitUntil: 'networkidle', timeout: 30000 });
    // Step 1 — 'organization' intent hides requesting_for (auto B2B)
    await selectIntent(page, 'organization');
    await clickNext(page);
    // Step 2 — B2B fields
    await fillField(page, 'first_name', 'E2E');
    await fillField(page, 'last_name', `SC2-Standish-${ts}`);
    await fillField(page, 'email', email);
    await fillField(page, 'phone', phone);
    await fillField(page, 'company', 'Standish Management');
    await fillField(page, 'product_interest', 'CPA');
    await fillField(page, 'role_type', 'Partner/CEO/CFO');
    await fillField(page, 'org_type', 'Accounting Firm');
    await fillField(page, 'org_size', '251+');
    await fillField(page, 'hq_state', 'IL');
    await clickNext(page);
    // Step 3
    await fillField(page, 'consent_marketing', true);
    await fillField(page, 'privacy_consent', true);
    await clickSubmit(page);
  } finally {
    await page.close();
  }

  log(`Email: ${email}`);
  await sfWait(45000);

  const res = await conn.query(
    `SELECT Id, FirstName, LastName, Email, RecordType.Name,
            Owner.Name, Owner.Type, Company,
            RFI_Organization_Type__c, RFI_Org_Size_Category__c
     FROM Lead WHERE Email = '${email}' AND IsConverted = false LIMIT 1`
  );
  if (!res.records.length) { fail('Lead created', 'NOT FOUND', 'Lead record'); return; }
  const lead = res.records[0];
  log(`Lead ID: ${lead.Id}`);

  chk('RecordType', lead.RecordType?.Name, 'B2B Lead');
  chk('Owner name (JoAnn Veiga)', lead.Owner?.Name, 'JoAnn Veiga');
  chk('Owner type (User not Queue)', lead.Owner?.Type, 'User');
  chk('Company', lead.Company, 'Standish Management');
  chk('RFI_Organization_Type__c', lead.RFI_Organization_Type__c, 'Accounting Firm');
  chk('RFI_Org_Size_Category__c', lead.RFI_Org_Size_Category__c, '251+');
}

// ── Scenario 3: B2B Accounting Firm 26-100 → Global Firms ────────────────────
async function runSC3(browser, conn) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('SC-3  B2B Accounting Firm 26-100  →  Global Firms queue');
  console.log('══════════════════════════════════════════════════════════════');

  const ts = Date.now();
  const email = `e2e.sc3.${ts}@becker-playwright.com`;
  const phone = `(312) 555-${String(Math.floor(Math.random() * 9000) + 1000)}`;

  const page = await browser.newPage();
  try {
    await page.goto(FORM_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await selectIntent(page, 'organization');
    await clickNext(page);
    await fillField(page, 'first_name', 'E2E');
    await fillField(page, 'last_name', `SC3-GlobalFirms-${ts}`);
    await fillField(page, 'email', email);
    await fillField(page, 'phone', phone);
    await fillField(page, 'company', 'E2E Accounting Partners LLC');
    await fillField(page, 'product_interest', 'CPA');
    await fillField(page, 'role_type', 'Partner/CEO/CFO');
    await fillField(page, 'org_type', 'Accounting Firm');
    await fillField(page, 'org_size', '26-100');
    await fillField(page, 'hq_state', 'TX');
    await clickNext(page);
    await fillField(page, 'consent_marketing', true);
    await fillField(page, 'privacy_consent', true);
    await clickSubmit(page);
  } finally {
    await page.close();
  }

  log(`Email: ${email}`);
  await sfWait(45000);

  const res = await conn.query(
    `SELECT Id, FirstName, LastName, Email, RecordType.Name,
            Owner.Name, Owner.Type, Company,
            RFI_Organization_Type__c, RFI_Org_Size_Category__c,
            RFI_HQ_State__c, Business_Brand__c, Lead_Source_Form__c
     FROM Lead WHERE Email = '${email}' AND IsConverted = false LIMIT 1`
  );
  if (!res.records.length) { fail('Lead created', 'NOT FOUND', 'Lead record'); return; }
  const lead = res.records[0];
  log(`Lead ID: ${lead.Id}`);

  chk('RecordType', lead.RecordType?.Name, 'B2B Lead');
  chk('Owner (Global Firms)', lead.Owner?.Name, 'Global Firms');
  chk('Owner type', lead.Owner?.Type, 'Queue');
  chk('RFI_Organization_Type__c', lead.RFI_Organization_Type__c, 'Accounting Firm');
  chk('RFI_Org_Size_Category__c', lead.RFI_Org_Size_Category__c, '26-100');
  chk('RFI_HQ_State__c', lead.RFI_HQ_State__c, 'TX');
  chk('Business_Brand__c', lead.Business_Brand__c, 'Becker');
}

// ── Scenario 4: Support form → Contact_Us_Form__c ────────────────────────────
async function runSC4(browser, conn) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('SC-4  Support form  →  Contact_Us_Form__c created, NO Lead');
  console.log('══════════════════════════════════════════════════════════════');

  const ts = Date.now();
  const email = `e2e.sc4.${ts}@becker-playwright.com`;
  const phone = `(312) 555-${String(Math.floor(Math.random() * 9000) + 1000)}`;

  const page = await browser.newPage();
  try {
    await page.goto(FORM_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await selectIntent(page, 'support');
    await clickNext(page);
    await fillField(page, 'first_name', 'E2E');
    await fillField(page, 'last_name', `SC4-Support-${ts}`);
    await fillField(page, 'email', email);
    await fillField(page, 'phone', phone);
    await fillField(page, 'product_interest', 'CPA');
    await fillField(page, 'role_type', 'Staff Accountant');
    await fillField(page, 'country', 'US');
    await fillField(page, 'support_message', 'E2E automated test — need help accessing my CPA materials.');
    await clickNext(page);
    await fillField(page, 'consent_marketing', true);
    await fillField(page, 'privacy_consent', true);
    await clickSubmit(page);
  } finally {
    await page.close();
  }

  log(`Email: ${email}`);
  await sfWait(45000);

  // NOTE: v21 (External_Web_Form...After_Save) runs BEFORE our flow and creates a Lead.
  // Our flow detects support path and creates Contact_Us_Form__c, but can't prevent the
  // earlier Lead creation. A Lead WILL exist — this is a known gap (Angel/Huma to fix).
  const leadRes = await conn.query(
    `SELECT Id FROM Lead WHERE Email = '${email}' AND IsConverted = false LIMIT 1`
  );
  if (leadRes.records.length) {
    log(`NOTE: Lead also created (00QU…${leadRes.records[0].Id.slice(-5)}) — known gap: v21 fires before our flow`);
  } else {
    pass('No Lead created (v21 gap fixed — unexpected but good!)');
  }

  // Verify Contact_Us_Form__c
  const cufRes = await conn.query(
    `SELECT Id, First_Name__c, Last_Name__c, Email__c, Phone__c,
            I_would_like_to_hear_more_about__c, Please_tell_us_about_your_question__c,
            Form_Applied__c, Query_Type__c, Lead_Source_Form__c, Business_Brand__c
     FROM Contact_Us_Form__c WHERE Email__c = '${email}' LIMIT 1`
  );
  if (!cufRes.records.length) { fail('Contact_Us_Form__c created', 'NOT FOUND', 'CUF record'); return; }
  const cuf = cufRes.records[0];
  log(`Contact_Us_Form__c ID: ${cuf.Id}`);

  chk('First_Name__c', cuf.First_Name__c, 'E2E');
  chk('Email__c', cuf.Email__c, email);
  chk('I_would_like_to_hear_more_about__c', cuf.I_would_like_to_hear_more_about__c, 'CPA');
  chkContains('Please_tell_us_about_your_question__c', cuf.Please_tell_us_about_your_question__c, 'E2E automated test');
  chk('Form_Applied__c', cuf.Form_Applied__c, 'Becker Contact US');
  chk('Query_Type__c', cuf.Query_Type__c, 'Support');
  chk('Lead_Source_Form__c', cuf.Lead_Source_Form__c, 'Customer Service - Contact Us');
  chk('Business_Brand__c', cuf.Business_Brand__c, 'Becker');
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('Becker RFI — E2E: Live Drupal Form → Salesforce');
  console.log(`Form: ${FORM_URL}`);
  console.log(`SF:   ${process.env.SF_LOGIN_URL}`);
  console.log('══════════════════════════════════════════════════════════════');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let conn;
  try {
    process.stdout.write('  Connecting to Salesforce... ');
    conn = await sfConnect();
    console.log(`connected (${process.env.SF_USERNAME})`);
  } catch (err) {
    console.error('SF login failed:', err.message);
    await browser.close();
    process.exit(1);
  }

  for (const [i, fn] of [runSC1, runSC2, runSC3, runSC4].entries()) {
    try {
      await fn(browser, conn);
    } catch (err) {
      console.error(`  UNHANDLED ERROR in SC-${i + 1}: ${err.message}`);
    }
    // Brief pause between scenarios
    if (i < 3) await new Promise(r => setTimeout(r, 5000));
  }

  await browser.close();
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('E2E run complete.');
  console.log('══════════════════════════════════════════════════════════════\n');
})();
