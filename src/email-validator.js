// Email validation using Hunter.io API (Sam committed to this on 2026-04-16 call)
// "hunter.io gives you API and I can link that API here and it will just do your email checks"
// Works best with business emails; Gmail/personal = check format + MX only

const HUNTER_KEY = process.env.HUNTER_API_KEY;

// Basic spam/bot patterns (Monica flagged as major issue with current Contact Us form)
const SPAM_PATTERNS = [
  /test@test/i,
  /example\.(com|org|net)$/i,
  /\d{5,}@/,                     // lots of numbers before @
  /[<>{}|\\^`]/,                 // special chars not valid in email
  /^\s*$/,
];

const DISPOSABLE_DOMAINS = [
  'mailinator.com','guerrillamail.com','tempmail.com','throwaway.email',
  'yopmail.com','sharklasers.com','guerrillamailblock.com','grr.la',
  '10minutemail.com','trashmail.com','maildrop.cc','dispostable.com',
];

function isLikelySpam(email, firstName, lastName, message) {
  if (!email) return true;

  // Check spam email patterns
  if (SPAM_PATTERNS.some(p => p.test(email))) return true;

  // Check disposable domains
  const domain = email.split('@')[1]?.toLowerCase();
  if (DISPOSABLE_DOMAINS.includes(domain)) return true;

  // Check for bot-like name patterns
  if (firstName && /^\d+$/.test(firstName)) return true;
  if (lastName && /^\d+$/.test(lastName)) return true;

  // Suspicious message content
  if (message && (
    message.includes('http://') ||
    message.includes('https://') ||
    message.length < 2 ||
    /(.)\1{8,}/.test(message)   // repeated character spam
  )) return true;

  return false;
}

function isBusinessEmail(email) {
  if (!email) return false;
  const domain = email.split('@')[1]?.toLowerCase();
  const personal = ['gmail.com','yahoo.com','hotmail.com','outlook.com',
    'aol.com','icloud.com','protonmail.com','live.com','me.com'];
  return !personal.includes(domain);
}

// Hunter.io email verification (async — skipped if no API key)
async function verifyWithHunter(email) {
  if (!HUNTER_KEY) {
    return { status: 'skipped', reason: 'No Hunter API key configured' };
  }

  try {
    const res = await fetch(
      `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${HUNTER_KEY}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!res.ok) return { status: 'error', reason: `Hunter returned ${res.status}` };

    const data = await res.json();
    const result = data.data;

    return {
      status: result.status,            // valid / invalid / accept_all / unknown
      score: result.score,
      isDisposable: result.disposable,
      isCatchAll: result.accept_all,
      isBusiness: isBusinessEmail(email),
    };
  } catch (err) {
    return { status: 'error', reason: err.message };
  }
}

async function validateEmail(email, firstName, lastName, message) {
  const spamCheck = isLikelySpam(email, firstName, lastName, message);
  if (spamCheck) {
    return { valid: false, reason: 'Spam/bot detected', action: 'reject' };
  }

  const hunterResult = await verifyWithHunter(email);

  if (hunterResult.status === 'invalid') {
    return { valid: false, reason: 'Email address is invalid', action: 'reject', hunter: hunterResult };
  }

  if (hunterResult.isDisposable) {
    return { valid: false, reason: 'Disposable email address', action: 'reject', hunter: hunterResult };
  }

  return {
    valid: true,
    isBusiness: isBusinessEmail(email),
    hunter: hunterResult,
    action: 'accept',
  };
}

module.exports = { validateEmail, isLikelySpam, isBusinessEmail, verifyWithHunter };
