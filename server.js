// CA Firm CRM backend: plain Node http + Postgres (Supabase) via `pg`. Multi-firm: each CA firm signs up
// and only ever sees its own data. Every query below is filtered by firm_id.
// Locally: npm start -> http://localhost:3000 (serves the built React app from ./dist).
// On Vercel: api/index.js uses the exported `handler`; Vercel serves the React app itself.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool, types } = require('pg');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';          // localhost only unless you choose otherwise
// Behind Vercel / Render / Nginx: trust their headers for the real visitor IP and HTTPS.
const TRUST_PROXY = process.env.TRUST_PROXY === '1' || Boolean(process.env.VERCEL);
const DIST = path.join(__dirname, 'dist');
const SESSION_DAYS = 30;
const HIGH_VALUE = 50000;                              // invoices above this need partner approval (same rule as n8n)
const TZ = 'Asia/Kolkata';                             // ponytail: one timezone for all firms; make it a firm setting if firms span zones
const SIGNUPS_PER_HOUR = 10;                           // attempts per IP, to stop mass fake firms and email probing
// Public address of the site, used in email links and the Google redirect. Never taken from the request's Host header,
// which an attacker could fake to make verification links point at their own site.
const APP_URL = (process.env.APP_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  || `http://localhost:${PORT}`).replace(/\/$/, '');
const GOOGLE = {
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  tokenUrl: process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',   // overridable only so tests can fake Google
  redirectUri: `${APP_URL}/api/auth/google/callback`,
};
const GOOGLE_ENABLED = Boolean(GOOGLE.clientId && GOOGLE.clientSecret);

// ── Database ────────────────────────────────────────────────────────────────
// Missing DATABASE_URL: locally, stop with a hint; on Vercel, every API call answers with the hint instead of crashing.
const DB_MISSING = !process.env.DATABASE_URL;
if (DB_MISSING && require.main === module) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and paste your Supabase connection string.');
  process.exit(1);
}
types.setTypeParser(20, Number);     // count(*) / sum() come back as bigint; numbers here are small
types.setTypeParser(1700, Number);   // avg() comes back as numeric
const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // ponytail: encrypted but the certificate is not verified; for full verification download
  // Supabase's CA certificate (Project Settings > Database) and pass it as `ca` here.
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
  max: Number(process.env.PG_POOL_MAX) || (process.env.VERCEL ? 1 : 5),
});

// Write SQL with ? placeholders; they become $1, $2, ... for Postgres.
const toPg = sql => { let i = 0; return sql.replace(/\?/g, () => '$' + ++i); };
const all = async (sql, ...p) => (await pool.query(toPg(sql), p)).rows;
const get = async (sql, ...p) => (await all(sql, ...p))[0];
const run = (sql, ...p) => pool.query(toPg(sql), p);
const insert = async (sql, ...p) => (await get(`${sql} RETURNING id`, ...p)).id;

const newApiKey = () => crypto.randomBytes(24).toString('hex');

// Dates are text in India time (see db/schema.sql).
const NOW_IST = `(now() AT TIME ZONE '${TZ}')`;
const TODAY = `${NOW_IST}::date`;
const TODAY_TXT = `to_char(${NOW_IST}, 'YYYY-MM-DD')`;

// Shared derived fields, so the UI and n8n see the same numbers. Wrapped as sub-selects so the
// computed columns can be used in WHERE / ORDER BY. Callers always add "WHERE i.firm_id = ?" / "f.firm_id = ?".
const INVOICE_SQL = `
  SELECT * FROM (
    SELECT i.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone,
           (${TODAY} - i.due_date::date) AS days_overdue
    FROM invoices i JOIN clients c ON c.id = i.client_id) i`;
const FILING_SQL = `
  SELECT * FROM (
    SELECT f.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone, c.gstin,
           (f.due_date::date - ${TODAY}) AS days_left
    FROM filings f JOIN clients c ON c.id = f.client_id) f`;
// First ? is the firm. Quoted aliases keep the camelCase field names the n8n workflow expects.
const PENDING_DOCS_SQL = `
  SELECT c.id AS "clientId", c.name AS "clientName", c.email AS "clientEmail", c.phone AS "clientPhone",
         string_agg(d.name, ', ' ORDER BY d.id) AS "missingDocuments",
         (${TODAY} - min(d.requested_at)::date) AS "daysPending",
         max(d.reminder_count) AS "reminderCount"
  FROM documents d JOIN clients c ON c.id = d.client_id
  WHERE d.status != 'received' AND d.firm_id = ? GROUP BY c.id`;

// "2026-10-20" -> "20 Oct 2026" (format the n8n mock data used)
const fmtDate = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const addDays = n => new Date(Date.now() + n * 86_400_000).toLocaleDateString('en-CA', { timeZone: TZ });

// ── Passwords & sessions ────────────────────────────────────────────────────
const hashPassword = pw => {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
};
const checkPassword = (pw, stored) => {
  const [salt, hash] = stored.split(':');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), crypto.scryptSync(pw, salt, 64));
};
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

const clientIp = req => (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket?.remoteAddress || 'unknown';
const isHttps = req => TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
// Our cookies only ever hold 64-character hex tokens.
const readCookie = (req, name) => new RegExp(`(?:^|;\\s*)${name}=([a-f0-9]{64})`).exec(req.headers.cookie || '')?.[1];
const sessionToken = req => readCookie(req, 'sid');
// Adds a Set-Cookie header without replacing ones set earlier in the same response.
function setCookie(req, res, name, value, maxAgeSeconds) {
  const cookie = `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${isHttps(req) ? '; Secure' : ''}`;
  res.setHeader('set-cookie', [...[].concat(res.getHeader('set-cookie') || []), cookie]);
}
const randomToken = () => crypto.randomBytes(32).toString('hex');

async function startSession(req, res, userId) {
  const token = randomToken();
  await run(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, now() + interval '${SESSION_DAYS} days')`, sha256(token), userId);
  setCookie(req, res, 'sid', token, SESSION_DAYS * 86400);
}

async function sessionUser(req) {
  const token = sessionToken(req);
  if (!token) return null;
  return (await get(`SELECT u.id, u.name, u.email, u.role, u.firm_id, (u.password_hash IS NOT NULL) AS has_password
                     FROM sessions s JOIN users u ON u.id = s.user_id
                     WHERE s.token_hash = ? AND s.expires_at > now()`, sha256(token))) || null;
}

// ── Email ───────────────────────────────────────────────────────────────────
// Sent through any SMTP service (Gmail, Resend, Brevo, Zoho...). Without SMTP settings, local runs print the email
// to the console instead (so links can be clicked during development); on Vercel that is an error.
const EMAIL_READY = Boolean(process.env.SMTP_HOST) || !process.env.VERCEL;
let mailer = null;
async function sendEmail(to, subject, text) {
  if (!process.env.SMTP_HOST) {
    if (process.env.VERCEL) throw new HttpError(500, 'Email sending is not set up yet. Please try again later.');
    console.log(`[email] to=${to} subject="${subject}"\n${text}\n[/email]`);
    return;
  }
  const port = Number(process.env.SMTP_PORT) || 465;
  mailer ||= require('nodemailer').createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  try {
    await mailer.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
  } catch (e) {
    console.error('Email failed:', e.message);
    throw new HttpError(502, 'Could not send the email right now. Please try again in a minute.');
  }
}

async function sendVerification(user) {
  const token = randomToken();
  await run(`INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, 'verify', now() + interval '24 hours')`, sha256(token), user.id);
  await sendEmail(user.email, 'Confirm your email for CA Firm CRM',
    `Hi ${user.name},\n\nPlease confirm your email address to start using CA Firm CRM:\n\n${APP_URL}/api/auth/verify?token=${token}\n\n` +
    `This link works for 24 hours. If you did not sign up, you can ignore this email.`);
}

// ── Google sign-in (OpenID Connect, authorization code flow) ────────────────
// The ID token comes straight from Google's token endpoint over HTTPS in exchange for our client secret,
// so (per Google's docs) its contents can be trusted without checking the signature. We still check
// issuer, audience, expiry and that Google verified the email.
async function googleIdentity(code) {
  const r = await fetch(GOOGLE.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: GOOGLE.clientId, client_secret: GOOGLE.clientSecret, redirect_uri: GOOGLE.redirectUri, grant_type: 'authorization_code' }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.id_token) throw new Error(`token exchange failed (${r.status})`);
  const claims = JSON.parse(Buffer.from(data.id_token.split('.')[1], 'base64url').toString('utf8'));
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss)) throw new Error('wrong issuer');
  if (claims.aud !== GOOGLE.clientId) throw new Error('wrong audience');
  if (!(claims.exp * 1000 > Date.now())) throw new Error('expired');
  if (!claims.email || claims.email_verified !== true) throw new Error('email not verified by Google');
  return { sub: String(claims.sub), email: String(claims.email).toLowerCase(), name: String(claims.name || claims.email.split('@')[0]).slice(0, 200) };
}

async function pendingSignup(req) {
  const token = readCookie(req, 'g_pending');
  return token ? (await get('SELECT * FROM pending_signups WHERE token_hash = ? AND expires_at > now()', sha256(token))) || null : null;
}

// Rate limits kept in the database so they work across serverless instances.
// Failed logins: 10 per IP, then blocked 15 minutes. Signups: SIGNUPS_PER_HOUR per IP.
const isLimited = async (key, max) => ((await get('SELECT count FROM login_attempts WHERE ip = ? AND until > now()', key))?.count || 0) >= max;
const countAttempt = (key, minutes) => run(`
  INSERT INTO login_attempts (ip, count, until) VALUES (?, 1, now() + interval '${minutes} minutes')
  ON CONFLICT (ip) DO UPDATE SET
    count = CASE WHEN login_attempts.until > now() THEN login_attempts.count + 1 ELSE 1 END,
    until = now() + interval '${minutes} minutes'`, key);

// ── Input helpers (trust boundary) ──────────────────────────────────────────
class HttpError extends Error { constructor(status, msg, code) { super(msg); this.status = status; this.code = code; } }
const str = (v, field, { required = false, max = 200 } = {}) => {
  const s = v == null ? '' : String(v).trim();
  if (required && !s) throw new HttpError(400, `${field} is required`);
  if (s.length > max) throw new HttpError(400, `${field} is too long`);
  return s;
};
const num = (v, field, { min = 0, max = 1e10 } = {}) => {
  const n = Number(v);
  if (v === '' || v == null || !Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${field} must be a number between ${min} and ${max}`);
  return n;
};
const id = (v, field) => num(v, field, { min: 1, max: 2147483647 });
// The firm check: a row from another firm looks exactly like a missing row.
const mustExist = async (table, rowId, firmId) => {
  if (!(await get(`SELECT id FROM ${table} WHERE id = ? AND firm_id = ?`, rowId, firmId))) throw new HttpError(404, `${table} ${rowId} not found`);
  return rowId;
};
const optionalId = async (v, table, field, firmId) => (v === '' || v == null ? null : mustExist(table, id(v, field), firmId));
const isoDate = (v, field, { required = true } = {}) => {
  const s = str(v, field, { required, max: 10 });
  if (!s && !required) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(new Date(s))) throw new HttpError(400, `${field} must be YYYY-MM-DD`);
  return s;
};
const email = (v, field, opts) => {
  const s = str(v, field, opts);
  if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new HttpError(400, `${field} is not a valid email`);
  return s.toLowerCase();
};
const password = v => {
  const s = String(v ?? '');
  if (s.length < 8 || s.length > 200) throw new HttpError(400, 'Password must be at least 8 characters');
  return s;
};
const oneOf = (v, field, options) => { if (!options.includes(v)) throw new HttpError(400, `${field} must be one of ${options.join(', ')}`); return v; };

async function readJson(req) {
  // On Vercel the body arrives already parsed.
  if ('body' in req) {
    try { return req.body && typeof req.body === 'object' ? req.body : {}; } catch { throw new HttpError(400, 'Invalid JSON'); }
  }
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 100_000) throw new HttpError(413, 'Body too large');
  }
  if (!body) return {};
  try { return JSON.parse(body); } catch { throw new HttpError(400, 'Invalid JSON'); }
}

// Calls the firm's n8n webhook if it set one in Settings. Returns 'off' | 'sent' | 'failed' plus any JSON reply.
async function callN8n(firmId, webhookPath, payload) {
  const base = (await get('SELECT n8n_base_url FROM firms WHERE id = ?', firmId))?.n8n_base_url;
  if (!base) return { status: 'off' };
  try {
    const r = await fetch(`${base}/${webhookPath}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return { status: 'sent', data: await r.json().catch(() => ({})) };
  } catch (e) {
    console.warn(`n8n ${webhookPath} failed for firm ${firmId}:`, e.message);
    return { status: 'failed' };
  }
}

async function invoiceStatus(firmId, number) {
  const i = await get(`${INVOICE_SQL} WHERE i.firm_id = ? AND i.number = ?`, firmId, String(number).trim().toUpperCase());
  if (!i) return 'Invoice not found';
  if (i.paid_at) return `Paid on ${fmtDate(i.paid_at)}`;
  const amount = i.total.toLocaleString('en-IN');
  return i.days_overdue > 0 ? `Overdue by ${i.days_overdue} days (Rs. ${amount})` : `Pending, due ${fmtDate(i.due_date)} (Rs. ${amount})`;
}

// Used when n8n is not connected. Same facts as the n8n agent's knowledge base.
async function localReply(firmId, text) {
  const invNo = text.match(/INV-\d{4}-\d+/i);
  if (invNo) return { text: `${invNo[0].toUpperCase()}: ${await invoiceStatus(firmId, invNo[0])}`, escalated: false };
  if (/gstr[\s-]*1\b/i.test(text)) return { text: 'GSTR-1 har mahine ki 11 tareekh tak file hota hai.', escalated: false };
  if (/gstr[\s-]*3\s*b/i.test(text)) return { text: 'GSTR-3B har mahine ki 20 tareekh tak file hota hai.', escalated: false };
  if (/fee|fees|price|charge/i.test(text)) return { text: 'Monthly bookkeeping packages Rs. 5,000 se shuru hote hain. Exact fees ke liye CA sahab aapse baat karenge.', escalated: true };
  return { text: 'Dhanyavaad! Hamari team ka member ek working day ke andar aapko reply karega. 🙏', escalated: true };
}

// Creates a high-priority task unless the same open task already exists in this firm.
async function autoTask(firmId, title, clientId, source) {
  if (!(await get('SELECT id FROM tasks WHERE firm_id = ? AND title = ? AND done_at IS NULL', firmId, title)))
    await run(`INSERT INTO tasks (firm_id, title, client_id, priority, source, due_date) VALUES (?, ?, ?, 'high', ?, ?)`, firmId, title, clientId, source, addDays(1));
}

async function remindDocuments(firmId, clientId) {
  await run(`UPDATE documents SET reminder_count = reminder_count + 1 WHERE firm_id = ? AND client_id = ? AND status != 'received'`, firmId, clientId);
  const p = await get(`${PENDING_DOCS_SQL} HAVING c.id = ?`, firmId, clientId);
  // Same rule as n8n Automation 4: after 3 reminders a person should call.
  if (p && p.reminderCount >= 3) await autoTask(firmId, `Call ${p.clientName} for pending documents`, clientId, 'documents');
}

// Topics for the "top questions" panel. First match wins.
const TOPICS = [
  ['📅', 'GST return due dates', /gstr|gst.*(date|deadline|kab|due)/i],
  ['🧾', 'Invoice & payment status', /inv-|invoice|payment|bill/i],
  ['📄', 'ITR & documents', /itr|document|form\s*16|upload/i],
  ['💰', 'Fees & pricing', /fee|price|charge|cost/i],
  ['🏢', 'Company & registration', /company|registration|pvt|llp|incorporat/i],
  ['⚠️', 'Penalties & late filing', /penalt|late|interest/i],
];

async function agentStats(firmId) {
  const month = `firm_id = ? AND created_at >= to_char(date_trunc('month', ${NOW_IST}), 'YYYY-MM-DD')`;
  const [ai, questions] = await Promise.all([
    get(`SELECT count(*) AS n, coalesce(sum(escalated), 0) AS esc, avg(response_ms) AS ms FROM messages WHERE role = 'ai' AND ${month}`, firmId),
    all(`SELECT text FROM messages WHERE role = 'client' AND ${month}`, firmId),
  ]);
  const counts = {};
  for (const { text } of questions) {
    const t = TOPICS.find(([, , re]) => re.test(text));
    const key = t ? t[1] : 'Other questions';
    counts[key] = (counts[key] || 0) + 1;
  }
  return {
    queriesMonth: ai.n,
    autoResolveRate: ai.n ? Math.round((ai.n - ai.esc) / ai.n * 100) : null,
    avgResponseSec: ai.ms == null ? null : Math.round(ai.ms / 100) / 10,
    escalatedMonth: ai.esc,
    topics: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([topic, count]) => ({ icon: TOPICS.find(t => t[1] === topic)?.[0] || '💬', topic, count })),
  };
}

// ── Routes ──────────────────────────────────────────────────────────────────
// Handlers get ctx = { body, params, url, user, firmId, req, res } and return JSON-able data.
// firmId comes from the logged-in user, or (for /api/n8n/*) from the firm's API key. Never from the request body.
// Access: PUBLIC needs nothing, PARTNER needs a partner login, /api/n8n/* needs the API key, everything else needs a login.
const PUBLIC = new Set([
  'GET /api/auth/status', 'POST /api/auth/signup', 'POST /api/auth/login', 'POST /api/auth/resend-verification', 'GET /api/auth/verify',
  'GET /api/auth/google/start', 'GET /api/auth/google/callback', 'POST /api/auth/google/complete', 'POST /api/auth/google/cancel',
]);
const PARTNER = new Set(['POST /api/invoices/:id/approve', 'POST /api/users', 'DELETE /api/users/:id', 'PATCH /api/settings']);

// A route returns { [REDIRECT]: '/path' } to send the browser somewhere instead of JSON.
const REDIRECT = Symbol('redirect');
const nowIst = () => new Date().toLocaleString('sv-SE', { timeZone: TZ });   // 'YYYY-MM-DD HH:MM:SS'

async function checkSignupLimit(req) {
  const key = 'signup:' + clientIp(req);
  if (await isLimited(key, SIGNUPS_PER_HOUR)) throw new HttpError(429, 'Too many sign-ups from this network. Please try again in an hour.');
  await countAttempt(key, 60);
}

// Creates a firm and its first partner in one statement (so there is never a firm without a partner).
async function createFirm(firmName, { name, email: e, passwordHash = null, googleSub = null, verified = false }) {
  try {
    return (await get(`
      WITH f AS (INSERT INTO firms (name, api_key) VALUES (?, ?) RETURNING id)
      INSERT INTO users (firm_id, name, email, password_hash, google_sub, email_verified_at, role)
      SELECT f.id, ?, ?, ?, ?, ?, 'partner' FROM f RETURNING id`,
      firmName, newApiKey(), name, e, passwordHash, googleSub, verified ? nowIst() : null)).id;
  } catch (err) {
    if (err.code === '23505') throw new HttpError(400, 'An account with this email already exists. Please log in.');
    throw err;
  }
}

const routes = {
  'GET /api/auth/status': async ({ req }) => {
    const pending = await pendingSignup(req);
    return {
      user: await sessionUser(req),
      googleEnabled: GOOGLE_ENABLED,
      pendingSignup: pending && { email: pending.email, name: pending.name },
    };
  },

  // A new CA firm signs up with email + password. They must click the emailed link before logging in.
  'POST /api/auth/signup': async ({ body: b, req }) => {
    if (!EMAIL_READY) throw new HttpError(500, 'Email sending is not set up yet, so new sign-ups are paused. Please try again later.');
    const firmName = str(b.firmName, 'Firm name', { required: true, max: 100 });
    const name = str(b.name, 'Your name', { required: true });
    const e = email(b.email, 'Email', { required: true });
    const passwordHash = hashPassword(password(b.password));
    await checkSignupLimit(req);
    if (await get('SELECT id FROM users WHERE email = ?', e)) throw new HttpError(400, 'An account with this email already exists. Please log in.');
    const userId = await createFirm(firmName, { name, email: e, passwordHash });
    await sendVerification({ id: userId, name, email: e });
    return { verify: true, email: e };
  },

  'POST /api/auth/login': async ({ body: b, req, res }) => {
    const ip = clientIp(req);
    if (await isLimited(ip, 10)) throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.');
    const u = await get('SELECT * FROM users WHERE email = ?', str(b.email, 'email').toLowerCase());
    if (u && !u.password_hash) throw new HttpError(401, 'This account signs in with Google. Use "Continue with Google".');
    if (!u || !checkPassword(String(b.password ?? ''), u.password_hash)) {
      await countAttempt(ip, 15);
      throw new HttpError(401, 'Wrong email or password');
    }
    await run('DELETE FROM login_attempts WHERE ip = ?', ip);
    if (!u.email_verified_at) throw new HttpError(403, 'Please confirm your email first. Check your inbox for the link.', 'email_not_verified');
    await startSession(req, res, u.id);
    return { ok: true };
  },

  // Always answers "ok", so it can't be used to find out which emails have accounts.
  'POST /api/auth/resend-verification': async ({ body: b, req }) => {
    const key = 'resend:' + clientIp(req);
    if (await isLimited(key, 5)) throw new HttpError(429, 'Too many emails requested. Please try again in an hour.');
    await countAttempt(key, 60);
    const u = await get('SELECT id, name, email FROM users WHERE email = ? AND email_verified_at IS NULL', str(b.email, 'email').toLowerCase());
    if (u) await sendVerification(u);
    return { ok: true };
  },

  // The link in the verification email. Confirms the email, logs the person in, and opens the app.
  'GET /api/auth/verify': async ({ url, req, res }) => {
    const token = url.searchParams.get('token') || '';
    const row = /^[a-f0-9]{64}$/.test(token) &&
      await get(`DELETE FROM email_tokens WHERE token_hash = ? AND purpose = 'verify' AND expires_at > now() RETURNING user_id`, sha256(token));
    if (!row) return { [REDIRECT]: '/?verify_error=1' };
    await run('UPDATE users SET email_verified_at = coalesce(email_verified_at, ?) WHERE id = ?', nowIst(), row.user_id);
    await run(`DELETE FROM email_tokens WHERE user_id = ? AND purpose = 'verify'`, row.user_id);
    await startSession(req, res, row.user_id);
    return { [REDIRECT]: '/?verified=1' };
  },

  'GET /api/auth/google/start': async ({ req, res }) => {
    if (!GOOGLE_ENABLED) throw new HttpError(404, 'Google sign-in is not set up');
    const state = randomToken();   // ties Google's answer to this browser (stops login CSRF)
    setCookie(req, res, 'g_state', state, 600);
    const params = new URLSearchParams({
      client_id: GOOGLE.clientId, redirect_uri: GOOGLE.redirectUri, response_type: 'code',
      scope: 'openid email profile', state, prompt: 'select_account',
    });
    return { [REDIRECT]: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
  },

  // Google sends the browser back here. Existing account (by Google id or email): log in.
  // New email: remember the Google identity for 30 minutes and ask for a firm name.
  'GET /api/auth/google/callback': async ({ url, req, res }) => {
    if (!GOOGLE_ENABLED) throw new HttpError(404, 'Google sign-in is not set up');
    const state = readCookie(req, 'g_state');
    setCookie(req, res, 'g_state', '', 0);
    if (!state || url.searchParams.get('state') !== state || !url.searchParams.get('code')) return { [REDIRECT]: '/?google_error=1' };
    let g;
    try { g = await googleIdentity(url.searchParams.get('code')); }
    catch (e) { console.warn('Google sign-in failed:', e.message); return { [REDIRECT]: '/?google_error=1' }; }

    const u = await get('SELECT id FROM users WHERE google_sub = ?', g.sub) || await get('SELECT id FROM users WHERE email = ?', g.email);
    if (u) {
      // Google confirmed this email, so it also counts as verified.
      await run('UPDATE users SET google_sub = coalesce(google_sub, ?), email_verified_at = coalesce(email_verified_at, ?) WHERE id = ?', g.sub, nowIst(), u.id);
      await startSession(req, res, u.id);
      return { [REDIRECT]: '/' };
    }
    const token = randomToken();
    await run(`INSERT INTO pending_signups (token_hash, email, name, google_sub, expires_at) VALUES (?, ?, ?, ?, now() + interval '30 minutes')`,
      sha256(token), g.email, g.name, g.sub);
    setCookie(req, res, 'g_pending', token, 1800);
    return { [REDIRECT]: '/' };
  },

  // Second step of signing up with Google: name the firm.
  'POST /api/auth/google/complete': async ({ body: b, req, res }) => {
    const p = await pendingSignup(req);
    if (!p) throw new HttpError(400, 'Your Google sign-in expired. Please click "Continue with Google" again.');
    const firmName = str(b.firmName, 'Firm name', { required: true, max: 100 });
    await checkSignupLimit(req);
    const userId = await createFirm(firmName, { name: p.name, email: p.email, googleSub: p.google_sub, verified: true });
    await run('DELETE FROM pending_signups WHERE token_hash = ?', p.token_hash);
    setCookie(req, res, 'g_pending', '', 0);
    await startSession(req, res, userId);
    return { ok: true };
  },

  'POST /api/auth/google/cancel': async ({ req, res }) => {
    const p = await pendingSignup(req);
    if (p) await run('DELETE FROM pending_signups WHERE token_hash = ?', p.token_hash);
    setCookie(req, res, 'g_pending', '', 0);
    return { ok: true };
  },

  'POST /api/auth/logout': async ({ req, res }) => {
    const token = sessionToken(req);
    if (token) await run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
    setCookie(req, res, 'sid', '', 0);
    return { ok: true };
  },

  // People who only use Google have no password yet; they can set one without "current".
  'POST /api/auth/password': async ({ body: b, user }) => {
    const u = await get('SELECT password_hash FROM users WHERE id = ?', user.id);
    if (u.password_hash && !checkPassword(String(b.current ?? ''), u.password_hash)) throw new HttpError(400, 'Current password is wrong');
    await run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password(b.next)), user.id);
    await run('DELETE FROM sessions WHERE user_id = ?', user.id);   // log out other devices
    return { ok: true, relogin: true };
  },

  // Everything the UI needs in one call, for the user's firm only.
  // ponytail: loads all rows; add pagination if a firm grows past a few thousand records.
  'GET /api/state': async ({ user, firmId }) => {
    const [firm, users, clients, invoices, documents, filings, leads, tasks, messages, stats] = await Promise.all([
      get('SELECT name, phone, email, n8n_base_url, setup_done FROM firms WHERE id = ?', firmId),
      all('SELECT id, name, email, role FROM users WHERE firm_id = ? ORDER BY name', firmId),
      all('SELECT * FROM clients WHERE firm_id = ? ORDER BY created_at DESC, id DESC', firmId),
      all(`${INVOICE_SQL} WHERE i.firm_id = ? ORDER BY i.paid_at IS NOT NULL, i.due_date`, firmId),
      all('SELECT * FROM documents WHERE firm_id = ? ORDER BY client_id, id', firmId),
      all(`${FILING_SQL} WHERE f.firm_id = ? ORDER BY f.due_date, f.return_type, f.client_name`, firmId),
      all('SELECT * FROM leads WHERE firm_id = ? ORDER BY created_at DESC, id DESC', firmId),
      all(`SELECT t.*, c.name AS client_name, u.name AS assignee_name FROM tasks t
           LEFT JOIN clients c ON c.id = t.client_id LEFT JOIN users u ON u.id = t.assignee_id
           WHERE t.firm_id = ?
           ORDER BY t.done_at IS NOT NULL, t.done_at DESC, t.due_date IS NULL, t.due_date, t.id`, firmId),
      get(`SELECT count(*) AS n FROM messages WHERE firm_id = ? AND role = 'client' AND left(created_at, 10) = ${TODAY_TXT}`, firmId),
      agentStats(firmId),
    ]);
    return {
      me: user, users,
      settings: { firmName: firm.name, phone: firm.phone, email: firm.email, n8nBaseUrl: firm.n8n_base_url, setupDone: firm.setup_done },
      clients, invoices, documents, filings, leads, tasks,
      messageCount: messages.n, agentStats: stats,
    };
  },

  'POST /api/clients': async ({ body: b, firmId }) => {
    const services = Array.isArray(b.services) ? b.services.map(s => str(s, 'service', { max: 40 })).filter(Boolean).join(',') : '';
    return {
      id: await insert('INSERT INTO clients (firm_id,name,type,pan,gstin,phone,email,services) VALUES (?,?,?,?,?,?,?,?)',
        firmId, str(b.name, 'name', { required: true }), str(b.type, 'type', { max: 40 }),
        str(b.pan, 'pan', { max: 10 }).toUpperCase(), str(b.gstin, 'gstin', { max: 15 }).toUpperCase(),
        str(b.phone, 'phone', { required: true, max: 20 }), email(b.email, 'email'), services),
    };
  },

  // Saves the invoice, then hands it to n8n Automation 1. Above Rs. 50,000 n8n asks the partner instead of emailing the client.
  'POST /api/invoices': async ({ body: b, firmId }) => {
    const clientId = await mustExist('clients', id(b.clientId, 'clientId'), firmId);
    const amount = num(b.amount, 'amount', { min: 1 });
    const gstRate = num(b.gstRate ?? 18, 'gstRate', { max: 28 });
    const dueDays = num(b.dueDays ?? 15, 'dueDays', { max: 365 });
    const service = str(b.service, 'service', { required: true });
    const gst = Math.round(amount * gstRate) / 100;
    const total = Math.round((amount + gst) * 100) / 100;
    const approval = total > HIGH_VALUE ? 'pending' : 'not_needed';
    // Each firm numbers its own invoices: INV-2026-001, 002, ...
    const { invoice_seq: seq } = await get('UPDATE firms SET invoice_seq = invoice_seq + 1 WHERE id = ? RETURNING invoice_seq', firmId);
    const number = `INV-${addDays(0).slice(0, 4)}-${String(seq).padStart(3, '0')}`;
    const invoiceId = await insert('INSERT INTO invoices (firm_id,number,client_id,service,amount,gst_rate,gst_amount,total,due_date,approval) VALUES (?,?,?,?,?,?,?,?,?,?)',
      firmId, number, clientId, service, amount, gstRate, gst, total, addDays(dueDays), approval);
    const c = await get('SELECT * FROM clients WHERE id = ?', clientId);
    const n8n = await callN8n(firmId, 'accounting/new-invoice', {
      invoiceNumber: number, clientName: c.name, clientEmail: c.email, clientPhone: c.phone,
      serviceDescription: service, amount, gstRate, dueDays, approved: false,
    });
    return { id: invoiceId, number, approval, n8n: n8n.status };
  },

  // Partner approves a high-value invoice; n8n then sends it to the client.
  'POST /api/invoices/:id/approve': async ({ params, user, firmId }) => {
    const i = await get(`${INVOICE_SQL} WHERE i.id = ? AND i.firm_id = ?`, await mustExist('invoices', params.id, firmId), firmId);
    if (i.approval !== 'pending') throw new HttpError(400, 'This invoice is not waiting for approval');
    await run(`UPDATE invoices SET approval = 'approved', approved_by = ? WHERE id = ? AND firm_id = ?`, user.id, i.id, firmId);
    const n8n = await callN8n(firmId, 'accounting/new-invoice', {
      invoiceNumber: i.number, clientName: i.client_name, clientEmail: i.client_email, clientPhone: i.client_phone,
      serviceDescription: i.service, amount: i.amount, gstRate: i.gst_rate,
      dueDays: Math.max(0, -i.days_overdue), approved: true,
    });
    return { ok: true, number: i.number, n8n: n8n.status };
  },

  'POST /api/invoices/:id/paid': async ({ params, firmId }) => {
    await run(`UPDATE invoices SET paid_at = ${TODAY_TXT} WHERE id = ? AND firm_id = ?`, await mustExist('invoices', params.id, firmId), firmId);
    return { ok: true };
  },

  'POST /api/documents': async ({ body: b, firmId }) => ({
    id: await insert('INSERT INTO documents (firm_id,client_id,name) VALUES (?,?,?)',
      firmId, await mustExist('clients', id(b.clientId, 'clientId'), firmId), str(b.name, 'name', { required: true, max: 80 })),
  }),

  'PATCH /api/documents/:id': async ({ body: b, params, firmId }) => {
    const status = oneOf(b.status, 'status', ['missing', 'pending', 'received']);
    await run('UPDATE documents SET status = ? WHERE id = ? AND firm_id = ?', status, await mustExist('documents', params.id, firmId), firmId);
    return { ok: true };
  },

  // Called when someone sends a manual reminder from the UI.
  'POST /api/documents/remind': async ({ body: b, firmId }) => {
    await remindDocuments(firmId, await mustExist('clients', id(b.clientId, 'clientId'), firmId));
    return { ok: true };
  },

  'POST /api/filings': async ({ body: b, firmId }) => {
    const clientId = await mustExist('clients', id(b.clientId, 'clientId'), firmId);
    return {
      id: await insert('INSERT INTO filings (firm_id,client_id,return_type,period,due_date) VALUES (?,?,?,?,?)',
        firmId, clientId, str(b.returnType, 'returnType', { required: true, max: 60 }),
        str(b.period, 'period', { required: true, max: 30 }), isoDate(b.dueDate, 'dueDate')),
    };
  },

  'PATCH /api/filings/:id': async ({ body: b, params, firmId }) => {
    const f = await get('SELECT * FROM filings WHERE id = ? AND firm_id = ?', await mustExist('filings', params.id, firmId), firmId);
    await run('UPDATE filings SET data_received = ?, output_tax = ?, input_tax_credit = ?, filed_at = ? WHERE id = ? AND firm_id = ?',
      'dataReceived' in b ? (b.dataReceived ? 1 : 0) : f.data_received,
      'outputTax' in b ? num(b.outputTax, 'outputTax') : f.output_tax,
      'inputTaxCredit' in b ? num(b.inputTaxCredit, 'inputTaxCredit') : f.input_tax_credit,
      'filed' in b ? (b.filed ? addDays(0) : null) : f.filed_at,
      f.id, firmId);
    return { ok: true };
  },

  'POST /api/leads': async ({ body: b, firmId }) => ({
    id: await insert('INSERT INTO leads (firm_id,name,service,source,value,score) VALUES (?,?,?,?,?,?)',
      firmId, str(b.name, 'name', { required: true }), str(b.service, 'service'), str(b.source, 'source', { max: 40 }),
      num(b.value ?? 0, 'value'), num(b.score ?? 0, 'score', { max: 100 })),
  }),

  'PATCH /api/leads/:id': async ({ body: b, params, firmId }) => {
    const stage = oneOf(b.stage, 'stage', ['new', 'qualifying', 'proposal', 'won']);
    await run('UPDATE leads SET stage = ? WHERE id = ? AND firm_id = ?', stage, await mustExist('leads', params.id, firmId), firmId);
    return { ok: true };
  },

  'POST /api/tasks': async ({ body: b, firmId }) => {
    const title = str(b.title, 'title', { required: true, max: 300 });
    const priority = oneOf(b.priority || 'normal', 'priority', ['low', 'normal', 'high']);
    const dueDate = isoDate(b.dueDate, 'dueDate', { required: false });
    return {
      id: await insert('INSERT INTO tasks (firm_id, title, client_id, assignee_id, due_date, priority) VALUES (?,?,?,?,?,?)',
        firmId, title, await optionalId(b.clientId, 'clients', 'clientId', firmId),
        await optionalId(b.assigneeId, 'users', 'assigneeId', firmId), dueDate, priority),
    };
  },

  'PATCH /api/tasks/:id': async ({ body: b, params, firmId }) => {
    const t = await get('SELECT * FROM tasks WHERE id = ? AND firm_id = ?', await mustExist('tasks', params.id, firmId), firmId);
    await run('UPDATE tasks SET done_at = ?, assignee_id = ? WHERE id = ? AND firm_id = ?',
      'done' in b ? (b.done ? addDays(0) : null) : t.done_at,
      'assigneeId' in b ? await optionalId(b.assigneeId, 'users', 'assigneeId', firmId) : t.assignee_id,
      t.id, firmId);
    return { ok: true };
  },

  'DELETE /api/tasks/:id': async ({ params, firmId }) => {
    await run('DELETE FROM tasks WHERE id = ? AND firm_id = ?', await mustExist('tasks', params.id, firmId), firmId);
    return { ok: true };
  },

  'GET /api/messages': ({ url, firmId }) =>
    all('SELECT * FROM messages WHERE firm_id = ? AND client_id = ? ORDER BY id', firmId, id(url.searchParams.get('clientId'), 'clientId')),

  // Web chat. Uses the firm's n8n AI agent (Automation 5, via its JSON-reply voice webhook) when connected.
  'POST /api/chat': async ({ body: b, firmId }) => {
    const clientId = await mustExist('clients', id(b.clientId, 'clientId'), firmId);
    const text = str(b.text, 'text', { required: true, max: 2000 });
    const c = await get('SELECT name, phone FROM clients WHERE id = ?', clientId);
    const started = Date.now();
    await run(`INSERT INTO messages (firm_id,client_id,role,text) VALUES (?,?,'client',?)`, firmId, clientId, text);
    const ai = await callN8n(firmId, 'accounting/voice-in', { question: text, phone: c.phone });
    let reply;
    if (ai.data?.answer) {
      // ponytail: escalation detected from the agent's own wording (its prompt says "a team member will follow up").
      reply = { text: String(ai.data.answer), escalated: /team member|follow up|CA sahab/i.test(ai.data.answer) };
    } else reply = await localReply(firmId, text);
    await run(`INSERT INTO messages (firm_id,client_id,role,text,escalated,response_ms) VALUES (?,?,'ai',?,?,?)`,
      firmId, clientId, reply.text, reply.escalated ? 1 : 0, Date.now() - started);
    if (reply.escalated) await autoTask(firmId, `Reply to ${c.name}: "${text.slice(0, 80)}"`, clientId, 'chat');
    return { reply: reply.text, escalated: reply.escalated, source: ai.data?.answer ? 'n8n' : 'local' };
  },

  // Partner adds a colleague to their own firm.
  'POST /api/users': async ({ body: b, firmId }) => {
    const e = email(b.email, 'email', { required: true });
    const name = str(b.name, 'name', { required: true });
    const role = oneOf(b.role || 'staff', 'role', ['partner', 'staff']);
    const hash = hashPassword(password(b.password));
    if (await get('SELECT id FROM users WHERE email = ?', e)) throw new HttpError(400, 'A user with this email already exists');
    // The partner vouches for a colleague's email, so it counts as verified.
    return { id: await insert('INSERT INTO users (firm_id, name, email, password_hash, role, email_verified_at) VALUES (?,?,?,?,?,?)', firmId, name, e, hash, role, nowIst()) };
  },

  'DELETE /api/users/:id': async ({ params, user, firmId }) => {
    if (params.id === user.id) throw new HttpError(400, 'You cannot remove yourself');
    await run('DELETE FROM users WHERE id = ? AND firm_id = ?', await mustExist('users', params.id, firmId), firmId);   // invoices keep history (approved_by -> NULL)
    return { ok: true };
  },

  // Firm details. Everything is checked first, so a bad field never leaves a half-saved update.
  'PATCH /api/settings': async ({ body: b, firmId }) => {
    const changes = {};
    if ('firmName' in b) changes.name = str(b.firmName, 'Firm name', { required: true, max: 100 });
    if ('phone' in b) {
      changes.phone = str(b.phone, 'Phone', { max: 20 });
      if (changes.phone && !/^\+?[\d\s-]{7,20}$/.test(changes.phone)) throw new HttpError(400, 'Phone should be a number like +91 98765 43210');
    }
    if ('email' in b) changes.email = email(b.email, 'Firm email', { max: 200 });
    if ('n8nBaseUrl' in b) {
      changes.n8n_base_url = str(b.n8nBaseUrl, 'n8nBaseUrl', { max: 300 }).replace(/\/$/, '');
      if (changes.n8n_base_url && !/^https?:\/\/[^\s]+$/i.test(changes.n8n_base_url)) throw new HttpError(400, 'n8n URL must start with http:// or https://');
    }
    if (b.setupDone === true) changes.setup_done = true;   // the one-time "Set up your firm" screen was saved or skipped
    for (const [column, value] of Object.entries(changes)) await run(`UPDATE firms SET ${column} = ? WHERE id = ?`, value, firmId);
    return { ok: true };
  },

  // ── For n8n: these replace the "Mock ..." nodes. Field names match the mock data exactly. ──
  // Invoices still waiting for partner approval were never sent, so they are not chased.
  'GET /api/n8n/overdue-invoices': async ({ firmId }) =>
    (await all(`${INVOICE_SQL} WHERE i.firm_id = ? AND i.paid_at IS NULL AND i.approval != 'pending' AND i.days_overdue > 0 ORDER BY i.days_overdue DESC`, firmId))
      .map(i => ({ clientName: i.client_name, clientEmail: i.client_email, clientPhone: i.client_phone,
        invoiceNumber: i.number, amountDue: i.total, daysOverdue: i.days_overdue })),

  'GET /api/n8n/gst-calendar': async ({ firmId }) =>
    (await all(`${FILING_SQL} WHERE f.firm_id = ? AND f.filed_at IS NULL ORDER BY f.due_date`, firmId))
      .map(f => ({ filingId: f.id, clientName: f.client_name, clientEmail: f.client_email, clientPhone: f.client_phone,
        gstin: f.gstin, returnType: f.return_type, period: f.period, dueDate: fmtDate(f.due_date),
        dataReceived: Boolean(f.data_received), outputTax: f.output_tax, inputTaxCredit: f.input_tax_credit })),

  'GET /api/n8n/pending-documents': ({ firmId }) => all(PENDING_DOCS_SQL, firmId),

  // Replaces "Update Reminder Count in Tracker".
  'POST /api/n8n/documents-reminded': async ({ body: b, firmId }) => {
    await remindDocuments(firmId, await mustExist('clients', id(b.clientId, 'clientId'), firmId));
    return { ok: true };
  },

  // Replaces the "Check Invoice Status" tool's mock lookup.
  'GET /api/n8n/invoice-status': async ({ url, firmId }) => ({ status: await invoiceStatus(firmId, url.searchParams.get('number') || '') }),
};

// Build matchers from route keys like "PATCH /api/leads/:id".
const matchers = Object.entries(routes).map(([key, handler]) => {
  const [method, pattern] = key.split(' ');
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>\\d+)') + '$');
  return { key, method, re, handler };
});

const send = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
};

// Serves the built React app (./dist) when running locally. Unknown paths get index.html so the app can load.
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2' };
function serveStatic(res, pathname) {
  let file = path.resolve(DIST, '.' + decodeURIComponent(pathname));
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(503, { 'content-type': 'text/plain' });
    return res.end('Frontend not built yet. Run "npm run build", then restart.');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  try {
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
      return serveStatic(res, url.pathname);
    }

    const m = matchers.find(m => req.method === m.method && m.re.test(url.pathname));
    if (!m) throw new HttpError(404, 'Not found');

    // Browsers can't send a cross-site JSON request without permission, so this blocks CSRF.
    if (req.method !== 'GET' && req.headers['content-type'] && !req.headers['content-type'].startsWith('application/json'))
      throw new HttpError(415, 'Send JSON');

    if (DB_MISSING) throw new HttpError(500, 'DATABASE_URL is not set. Add it in Vercel > Project > Settings > Environment Variables, then redeploy.');

    let user = null;
    let firmId = null;
    if (url.pathname.startsWith('/api/n8n/')) {
      // The API key identifies the firm. Unique random 48-character keys, so a plain lookup is safe.
      const key = String(req.headers['x-api-key'] || '');
      const firm = key.length >= 32 && await get('SELECT id FROM firms WHERE api_key = ?', key);
      if (!firm) throw new HttpError(401, 'Missing or wrong x-api-key');
      firmId = firm.id;
    } else if (!PUBLIC.has(m.key)) {
      user = await sessionUser(req);
      if (!user) throw new HttpError(401, 'Please log in');
      if (PARTNER.has(m.key) && user.role !== 'partner') throw new HttpError(403, 'Only partners can do this');
      firmId = user.firm_id;
    }

    const params = Object.fromEntries(Object.entries(url.pathname.match(m.re).groups || {}).map(([k, v]) => [k, id(v, k)]));
    const body = ['POST', 'PATCH'].includes(req.method) ? await readJson(req) : {};
    const result = await m.handler({ body, params, url, user, firmId, req, res });
    if (result?.[REDIRECT]) { res.writeHead(302, { location: result[REDIRECT] }); return res.end(); }
    send(res, 200, result);
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    // Connection problems (wrong password, unreachable host) get a readable hint; other details stay in the server log.
    const dbDown = !(e instanceof HttpError) && (['28P01', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'].includes(e.code) || /Tenant or user not found|password authentication|connect/i.test(e.message));
    const message = e instanceof HttpError ? e.message
      : dbDown ? 'Cannot connect to the database. Check DATABASE_URL (Supabase Transaction pooler string with the right password).'
      : 'Server error';
    send(res, e.status || (dbDown ? 503 : 500), { error: message, ...(e instanceof HttpError && e.code ? { code: e.code } : {}) });
  }
}

module.exports = { handler };

if (require.main === module) {
  http.createServer(handler).listen(PORT, HOST, async () => {
    console.log(`CA CRM running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    try {
      const { n } = await get('SELECT count(*) AS n FROM firms');
      console.log(`Database: connected (${n} firm${n === 1 ? '' : 's'}).`);
    } catch (e) {
      console.error(`Database: cannot connect (${e.message}). Check DATABASE_URL, and run "npm run db:setup" once.`);
    }
    if (HOST !== '127.0.0.1' && HOST !== 'localhost') console.warn('NOTE: reachable from other computers. Use HTTPS (e.g. a reverse proxy) before exposing it to the internet.');
  });
}
