# Drupal Embed Guide — Becker RFI Form
## For: Dakshesh (5X Drupal Team)
## Last updated: 2026-04-20

---

## What This Is

The Becker RFI multi-step contact routing form is a pre-built React application
hosted on Railway. To add it to any Drupal page, Dakshesh pastes a two-line
HTML snippet into a Custom Block. No Drupal module installation required.

---

## Step 1 — Get the Production API URL from Sam

Before going live, Sam will provide the Railway deployment URL, e.g.:

```
https://becker-rfi-agent.up.railway.app
```

Replace `YOUR_API_URL` in the snippet below with that URL.

---

## Step 2 — Paste This Snippet Into a Drupal Custom Block

In Drupal admin:
1. Go to **Structure → Block Layout → Add Custom Block**
2. Set the body format to **Full HTML** or **Raw HTML**
3. Paste the snippet below
4. Place the block on the desired page (e.g. `/contact-us`)

```html
<!-- Becker RFI Form — do not modify -->
<div id="becker-rfi-root"></div>
<script
  src="YOUR_API_URL/static/js/main.js"
  data-api="YOUR_API_URL"
  defer>
</script>
```

**Example with live URL:**
```html
<div id="becker-rfi-root"></div>
<script
  src="https://becker-rfi-agent.up.railway.app/static/js/main.js"
  data-api="https://becker-rfi-agent.up.railway.app"
  defer>
</script>
```

---

## Step 3 — Whitelist the Domain (Sam's side)

Sam needs the exact Drupal domain to add to the API CORS allowlist.
Provide Sam with:

- Production domain: e.g. `https://www.becker.com`
- Staging domain: e.g. `https://staging.becker.com`

Sam adds these to `ALLOWED_ORIGINS` in the Railway environment variables.
No code change required — just an env var update.

---

## Step 4 — Confirm CSP Headers (Charlene / DevOps)

Drupal typically sets a `Content-Security-Policy` header that can block
external scripts. Charlene or the DevOps team needs to add the Railway
domain to the CSP `script-src` directive:

```
Content-Security-Policy: script-src 'self' https://becker-rfi-agent.up.railway.app;
```

Without this, the form script will be blocked by the browser silently.

---

## UTM Parameter Capture

The form automatically reads UTM params from the page URL on load.
No Drupal configuration needed. Example:

```
https://www.becker.com/contact-us?utm_source=google&utm_medium=cpc&utm_campaign=cpa-q2
```

These are passed directly to Salesforce on form submission.

---

## Floating Widget (Future — Josh's Request)

To show the form as a floating button on every page, add the snippet to
a block in the **global footer region** in Drupal's Block Layout.
The form renders inline or as a modal — Sam configures the display mode.

---

## What Dakshesh Does NOT Need to Do

- Install any Drupal module
- Touch the Salesforce or SFMC configuration
- Handle form submissions — all routing happens server-side on Railway
- Rebuild or modify the form — design changes go through Sam

---

## Contacts

| Person | Role | For |
|---|---|---|
| Sam Chaudhary | Developer | API URL, CORS, form changes |
| Dakshesh | Drupal Team Lead | Block placement, CSP coordination |
| Charlene Ceci | DevOps / Drupal | CSP header update, release window |
| Josh Elefante | Product Lead | Page placement approval |
