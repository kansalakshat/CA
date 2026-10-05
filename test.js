// API test. Runs the real server against a throwaway in-memory Postgres (PGlite), so Supabase is never touched.
// Run: npm test
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');

const PORT = 3999;
const DB_PORT = 5499;
const BASE = `http://127.0.0.1:${PORT}`;
const FIXTURE_KEY = 'fixture-firm-api-key-0000000000000000';   // the other firm already in the database
const GOOGLE_PORT = 5599;
let googleUser = null;   // what the fake Google token endpoint says about the person signing in
let serverLog = '';      // server output; local runs print emails here instead of sending them

// Minimal cookie-keeping client, one per "browser". Redirects are not followed, so tests can check them.
function client() {
  const jar = {};
  return async (method, url, body, headers = {}) => {
    const cookie = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    const r = await fetch(url.startsWith('http') ? url : BASE + url, {
      method, redirect: 'manual',
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body && JSON.stringify(body),
    });
    for (const c of r.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [k, v] = [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)];
      if (/Max-Age=0/.test(c) || !v) delete jar[k]; else jar[k] = v;
    }
    return { status: r.status, location: r.headers.get('location'), data: await r.json().catch(() => null) };
  };
}

// The newest confirmation link emailed to this address (read from the server's console output).
async function emailLink(to) {
  for (let i = 0; i < 40; i++) {
    const at = serverLog.lastIndexOf('[email] to=' + to + ' ');
    const m = at >= 0 && /\/api\/auth\/verify\?token=[a-f0-9]{64}/.exec(serverLog.slice(at));
    if (m) return m[0];
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('no email found for ' + to);
}

// Sign up a firm and click the emailed confirmation link (which logs the browser in).
async function signupVerified(browser, data) {
  const r = await browser('POST', '/api/auth/signup', data);
  assert.equal(r.status, 200, 'signup ' + data.email + ': ' + JSON.stringify(r.data));
  const v = await browser('GET', await emailLink(data.email.toLowerCase()));
  assert.deepEqual([v.status, v.location], [302, '/?verified=1']);
}

async function main() {
  const anon = client();
  const partner = client();
  const staff = client();

  // ── Firm signup ──
  assert.equal((await anon('GET', '/api/state')).status, 401, 'state needs login');
  assert.equal((await anon('GET', '/api/auth/status')).data.user, null);
  assert.equal((await partner('POST', '/api/auth/signup', { firmName: 'Alpha CA', name: 'P', email: 'p@x.in', password: 'short' })).status, 400, 'short password rejected');
  assert.equal((await partner('POST', '/api/auth/signup', { name: 'P', email: 'p@x.in', password: 'partnerpass' })).status, 400, 'firm name required');
  const signup = await partner('POST', '/api/auth/signup', { firmName: 'Alpha CA', name: 'Partner', email: 'p@x.in', password: 'partnerpass' });
  assert.deepEqual([signup.status, signup.data], [200, { verify: true, email: 'p@x.in' }]);
  assert.equal((await partner('GET', '/api/state')).status, 401, 'no session until the email is confirmed');
  assert.equal((await anon('POST', '/api/auth/signup', { firmName: 'Copycat', name: 'X', email: 'P@x.in', password: 'whatever1' })).status, 400, 'email already used');

  // ── Email verification ──
  const notYet = await partner('POST', '/api/auth/login', { email: 'p@x.in', password: 'partnerpass' });
  assert.deepEqual([notYet.status, notYet.data.code], [403, 'email_not_verified'], 'cannot log in before confirming');
  const firstLink = await emailLink('p@x.in');
  assert.equal((await anon('POST', '/api/auth/resend-verification', { email: 'p@x.in' })).data.ok, true);
  assert.equal((await anon('POST', '/api/auth/resend-verification', { email: 'nobody@x.in' })).data.ok, true, 'same answer for unknown emails');
  const secondLink = await emailLink('p@x.in');
  assert.notEqual(firstLink, secondLink, 'resend sends a fresh link');
  assert.equal((await anon('GET', '/api/auth/verify?token=' + 'a'.repeat(64))).location, '/?verify_error=1', 'made-up token rejected');
  const verified = await partner('GET', secondLink);
  assert.deepEqual([verified.status, verified.location], [302, '/?verified=1']);
  assert.equal((await anon('GET', firstLink)).location, '/?verify_error=1', 'old links stop working once confirmed');
  assert.equal((await anon('GET', secondLink)).location, '/?verify_error=1', 'a link works only once');
  let s = (await partner('GET', '/api/state')).data;
  assert.equal(s.me.role, 'partner');
  assert.equal(s.settings.firmName, 'Alpha CA');
  assert(s.settings.apiKey && s.settings.apiKey !== FIXTURE_KEY, 'each firm gets its own API key');
  assert.deepEqual(s.clients, [], "a new firm sees none of the other firm's clients");
  const apiKey = s.settings.apiKey;

  assert.equal((await partner('POST', '/api/users', { name: 'Staff', email: 'S@x.in', password: 'staffpass1', role: 'staff' })).status, 200);
  assert.equal((await partner('POST', '/api/users', { name: 'Dup', email: 's@x.in', password: 'staffpass1' })).status, 400, 'duplicate email rejected');
  assert.equal((await staff('POST', '/api/auth/login', { email: 's@x.in', password: 'wrong' })).status, 401);
  assert.equal((await staff('POST', '/api/auth/login', { email: 's@x.in', password: 'staffpass1' })).status, 200, 'email is case-insensitive');
  const staffState = (await staff('GET', '/api/state')).data;
  assert.equal(staffState.settings.apiKey, null, 'staff cannot see API key');
  assert.equal((await staff('PATCH', '/api/settings', { firmName: 'Hacked' })).status, 403, 'staff cannot change settings');

  // CSRF guard: form posts are refused
  const form = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=a' });
  assert.equal(form.status, 415);

  // ── Clients ──
  const c = await partner('POST', '/api/clients', { name: 'Test Traders', phone: '+919000000099', email: 't@example.com', services: ['GST', 'ITR'] });
  assert.equal(c.status, 200);
  assert.equal((await partner('POST', '/api/clients', { name: '' })).status, 400);
  assert.equal((await partner('POST', '/api/clients', { name: 'X', phone: '1', email: 'not-an-email' })).status, 400);
  const clientId = c.data.id;

  // ── Invoices: GST math, approval rule ──
  const small = await partner('POST', '/api/invoices', { clientId, service: 'Bookkeeping', amount: 10000, gstRate: 18, dueDays: 15 });
  assert.equal(small.status, 200);
  assert.match(small.data.number, /^INV-\d{4}-001$/, 'numbering starts at 001 for a new firm');
  assert.deepEqual([small.data.approval, small.data.n8n], ['not_needed', 'off']);
  s = (await partner('GET', '/api/state')).data;
  const row = s.invoices.find(i => i.id === small.data.id);
  assert.deepEqual([row.gst_amount, row.total, row.days_overdue], [1800, 11800, -15]);

  const big = await partner('POST', '/api/invoices', { clientId, service: 'Audit', amount: 50000, gstRate: 18 });
  assert.equal(big.data.approval, 'pending', 'over 50,000 incl. GST needs approval');
  assert.equal((await staff('POST', `/api/invoices/${big.data.id}/approve`)).status, 403, 'staff cannot approve');
  assert.equal((await partner('POST', `/api/invoices/${big.data.id}/approve`)).status, 200);
  assert.equal((await partner('POST', `/api/invoices/${big.data.id}/approve`)).status, 400, 'cannot approve twice');
  assert.equal((await partner('POST', '/api/invoices', { clientId, service: 'x', amount: -5 })).status, 400);
  assert.equal((await partner('POST', '/api/invoices', { clientId: 99999, service: 'x', amount: 5 })).status, 404);

  // ── n8n endpoints need the API key ──
  const n8n = (method, url, body, key = apiKey) => anon(method, url, body, { 'x-api-key': key });
  assert.equal((await anon('GET', '/api/n8n/overdue-invoices')).status, 401);
  assert.equal((await n8n('GET', '/api/n8n/overdue-invoices', null, 'wrong')).status, 401);
  assert.match((await n8n('GET', `/api/n8n/invoice-status?number=${small.data.number}`)).data.status, /^Pending, due/);
  await partner('POST', `/api/invoices/${small.data.id}/paid`);
  assert.match((await n8n('GET', `/api/n8n/invoice-status?number=${small.data.number}`)).data.status, /^Paid on/);

  // The fixture firm's invoice is 20 days overdue (the API itself only creates future due dates).
  assert.deepEqual((await n8n('GET', '/api/n8n/overdue-invoices')).data, [], "Alpha key sees no other firm's invoices");
  const od = (await n8n('GET', '/api/n8n/overdue-invoices', null, FIXTURE_KEY)).data;
  assert.deepEqual(od.map(o => [o.invoiceNumber, o.clientName, o.amountDue, o.daysOverdue]), [['INV-FIX-001', 'Fixture Co', 1180, 20]], 'only overdue, sent invoices are chased');
  for (const o of od) {
    assert.deepEqual(Object.keys(o).sort(), ['amountDue', 'clientEmail', 'clientName', 'clientPhone', 'daysOverdue', 'invoiceNumber']);
    assert(o.daysOverdue > 0);
  }

  // ── Documents: reminders, auto task after 3 ──
  const doc = await partner('POST', '/api/documents', { clientId, name: 'Form 16' });
  for (let k = 0; k < 3; k++) await n8n('POST', '/api/n8n/documents-reminded', { clientId });
  const pend = (await n8n('GET', '/api/n8n/pending-documents')).data.find(p => p.clientId === clientId);
  assert.deepEqual([pend.missingDocuments, pend.reminderCount], ['Form 16', 3]);
  s = (await partner('GET', '/api/state')).data;
  assert.equal(s.tasks.filter(t => t.title === 'Call Test Traders for pending documents').length, 1, 'auto task created once');
  await partner('POST', '/api/documents/remind', { clientId });
  s = (await partner('GET', '/api/state')).data;
  assert.equal(s.tasks.filter(t => t.title === 'Call Test Traders for pending documents').length, 1, 'no duplicate task');
  assert.equal((await partner('PATCH', `/api/documents/${doc.data.id}`, { status: 'bogus' })).status, 400);
  await partner('PATCH', `/api/documents/${doc.data.id}`, { status: 'received' });
  assert(!(await n8n('GET', '/api/n8n/pending-documents')).data.some(p => p.clientId === clientId));

  // ── Filings ──
  const f = await partner('POST', '/api/filings', { clientId, returnType: 'GSTR-3B', period: 'Sep 2026', dueDate: '2026-10-20' });
  assert.equal((await partner('POST', '/api/filings', { clientId, returnType: 'X', period: 'Y', dueDate: '20/10/2026' })).status, 400);
  await partner('PATCH', `/api/filings/${f.data.id}`, { dataReceived: true, outputTax: 50000, inputTaxCredit: 20000 });
  const cal = (await n8n('GET', '/api/n8n/gst-calendar')).data.find(x => x.filingId === f.data.id);
  assert.deepEqual([cal.dataReceived, cal.outputTax, cal.inputTaxCredit, cal.dueDate], [true, 50000, 20000, '20 Oct 2026']);
  await partner('PATCH', `/api/filings/${f.data.id}`, { filed: true });
  assert(!(await n8n('GET', '/api/n8n/gst-calendar')).data.some(x => x.filingId === f.data.id));

  // ── Leads ──
  const l = await partner('POST', '/api/leads', { name: 'Lead X', value: 5000, score: 60 });
  await partner('PATCH', `/api/leads/${l.data.id}`, { stage: 'proposal' });
  assert.equal((await partner('PATCH', `/api/leads/${l.data.id}`, { stage: 'lost' })).status, 400);

  // ── Tasks ──
  const staffId = s.users.find(u => u.email === 's@x.in').id;
  const t = await staff('POST', '/api/tasks', { title: 'File GSTR-3B', clientId, assigneeId: staffId, dueDate: '2026-10-15', priority: 'high' });
  assert.equal(t.status, 200);
  assert.equal((await staff('POST', '/api/tasks', { title: 'x', priority: 'urgent' })).status, 400);
  await staff('PATCH', `/api/tasks/${t.data.id}`, { done: true });
  s = (await partner('GET', '/api/state')).data;
  assert(s.tasks.find(x => x.id === t.data.id).done_at);
  assert.equal((await staff('DELETE', `/api/tasks/${t.data.id}`)).status, 200);

  // ── Chat: local fallback, escalation creates a task, stats ──
  const chat = await partner('POST', '/api/chat', { clientId, text: `Status of ${small.data.number}?` });
  assert.match(chat.data.reply, /Paid on/);
  assert.equal(chat.data.escalated, false);
  const esc = await partner('POST', '/api/chat', { clientId, text: 'Can I claim HRA?' });
  assert.equal(esc.data.escalated, true);
  s = (await partner('GET', '/api/state')).data;
  assert(s.tasks.some(x => x.source === 'chat' && x.title.includes('Can I claim HRA?')));
  assert.equal(s.agentStats.queriesMonth, 2);
  assert.equal(s.agentStats.autoResolveRate, 50);
  assert.equal(s.agentStats.escalatedMonth, 1);
  assert.equal(s.agentStats.topics.find(x => x.topic === 'Invoice & payment status').count, 1);

  // ── Isolation: a second firm can't read or change Alpha's data ──
  const beta = client();
  await signupVerified(beta, { firmName: 'Beta CA', name: 'Beta', email: 'b@y.in', password: 'betapass1' });
  const bs = (await beta('GET', '/api/state')).data;
  for (const key of ['clients', 'invoices', 'documents', 'filings', 'leads', 'tasks']) assert.deepEqual(bs[key], [], 'Beta sees no ' + key);
  assert.deepEqual(bs.users.map(u => u.email), ['b@y.in'], 'Beta sees only its own users');
  assert.equal(bs.messageCount, 0);
  const alphaTask = await partner('POST', '/api/tasks', { title: 'Alpha secret task' });
  const notFound = [
    ['PATCH', '/api/documents/' + doc.data.id, { status: 'missing' }],
    ['PATCH', '/api/filings/' + f.data.id, { filed: false }],
    ['PATCH', '/api/leads/' + l.data.id, { stage: 'won' }],
    ['PATCH', '/api/tasks/' + alphaTask.data.id, { done: true }],
    ['DELETE', '/api/tasks/' + alphaTask.data.id],
    ['POST', '/api/invoices/' + small.data.id + '/paid'],
    ['POST', '/api/invoices/' + big.data.id + '/approve'],
    ['POST', '/api/invoices', { clientId, service: 'x', amount: 5 }],
    ['POST', '/api/documents', { clientId, name: 'x' }],
    ['POST', '/api/filings', { clientId, returnType: 'X', period: 'Y', dueDate: '2026-10-20' }],
    ['POST', '/api/documents/remind', { clientId }],
    ['POST', '/api/chat', { clientId, text: 'hi' }],
    ['POST', '/api/tasks', { title: 'x', clientId }],
    ['POST', '/api/tasks', { title: 'x', assigneeId: s.me.id }],
    ['DELETE', '/api/users/' + staffId],
  ];
  for (const [method, url, body] of notFound) assert.equal((await beta(method, url, body)).status, 404, 'Beta: ' + method + ' ' + url + ' must be 404');
  assert.deepEqual((await beta('GET', '/api/messages?clientId=' + clientId)).data, [], 'Beta cannot read Alpha chat');
  s = (await partner('GET', '/api/state')).data;
  assert(!s.tasks.find(x => x.id === alphaTask.data.id).done_at, 'Alpha task untouched');
  assert.equal(s.documents.find(x => x.id === doc.data.id).status, 'received', 'Alpha document untouched');
  assert.equal(s.leads.find(x => x.id === l.data.id).stage, 'proposal', 'Alpha lead untouched');
  assert.equal(s.invoices.find(x => x.id === big.data.id).approval, 'approved');
  assert.equal(s.users.length, 2, 'Alpha users untouched');
  const betaKey = bs.settings.apiKey;
  const n8nBeta = (method, url, body) => n8n(method, url, body, betaKey);
  assert.equal((await n8nBeta('GET', '/api/n8n/invoice-status?number=' + small.data.number)).data.status, 'Invoice not found', 'Beta key cannot look up Alpha invoices');
  assert.deepEqual((await n8nBeta('GET', '/api/n8n/gst-calendar')).data, []);
  assert.deepEqual((await n8nBeta('GET', '/api/n8n/pending-documents')).data, []);
  assert.equal((await n8nBeta('POST', '/api/n8n/documents-reminded', { clientId })).status, 404);
  const betaClient = await beta('POST', '/api/clients', { name: 'Beta Client', phone: '1' });
  const betaInv = await beta('POST', '/api/invoices', { clientId: betaClient.data.id, service: 'x', amount: 100 });
  assert.equal(betaInv.data.number, small.data.number, 'Beta numbers its own invoices from 001 too');
  await beta('PATCH', '/api/settings', { firmName: 'Beta Renamed' });
  assert.equal((await partner('GET', '/api/state')).data.settings.firmName, 'Alpha CA', 'settings are per firm');

  // ── Google sign-in (against a fake Google token endpoint) ──
  assert.equal((await anon('GET', '/api/auth/status')).data.googleEnabled, true);
  const g = client();
  const start = await g('GET', '/api/auth/google/start');
  assert.equal(start.status, 302);
  const auth = new URL(start.location);
  assert.equal(auth.origin + auth.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(auth.searchParams.get('redirect_uri'), BASE + '/api/auth/google/callback');
  const state = auth.searchParams.get('state');
  assert.equal((await g('GET', '/api/auth/google/callback?code=x&state=' + 'b'.repeat(64))).location, '/?google_error=1', 'wrong state rejected');
  // New person: Google identity is remembered, then they name their firm.
  googleUser = { sub: 'g-1', email: 'Gee@Gmail.com', name: 'Gee Kay', email_verified: true };
  await g('GET', '/api/auth/google/start');
  const st2 = new URL((await g('GET', '/api/auth/google/start')).location).searchParams.get('state');
  const cb = await g('GET', '/api/auth/google/callback?code=abc&state=' + st2);
  assert.deepEqual([cb.status, cb.location], [302, '/']);
  assert.deepEqual((await g('GET', '/api/auth/status')).data.pendingSignup, { email: 'gee@gmail.com', name: 'Gee Kay' });
  assert.equal((await g('GET', '/api/state')).status, 401, 'not logged in until the firm is named');
  assert.equal((await g('POST', '/api/auth/google/complete', { firmName: '' })).status, 400);
  assert.equal((await g('POST', '/api/auth/google/complete', { firmName: 'Gamma CA' })).status, 200);
  const gs = (await g('GET', '/api/state')).data;
  assert.deepEqual([gs.settings.firmName, gs.me.role, gs.me.has_password, gs.clients.length], ['Gamma CA', 'partner', false, 0]);
  assert.equal((await g('GET', '/api/auth/status')).data.pendingSignup, null, 'pending signup used up');
  assert.equal((await anon('POST', '/api/auth/login', { email: 'gee@gmail.com', password: 'anything1' })).status, 401, 'Google-only account has no password');
  // Returning Google user logs straight in.
  const g2 = client();
  const st3 = new URL((await g2('GET', '/api/auth/google/start')).location).searchParams.get('state');
  assert.equal((await g2('GET', '/api/auth/google/callback?code=abc&state=' + st3)).location, '/');
  assert.equal((await g2('GET', '/api/state')).data.settings.firmName, 'Gamma CA');
  // Google email that matches an existing password account: links to it and logs in.
  googleUser = { sub: 'g-2', email: 'p@x.in', name: 'Partner', email_verified: true };
  const g3 = client();
  const st4 = new URL((await g3('GET', '/api/auth/google/start')).location).searchParams.get('state');
  assert.equal((await g3('GET', '/api/auth/google/callback?code=abc&state=' + st4)).location, '/');
  assert.equal((await g3('GET', '/api/state')).data.settings.firmName, 'Alpha CA', 'linked to the existing Alpha account');
  // Google says the email is not verified: refused.
  googleUser = { sub: 'g-3', email: 'shady@x.in', name: 'Shady', email_verified: false };
  const g4 = client();
  const st5 = new URL((await g4('GET', '/api/auth/google/start')).location).searchParams.get('state');
  assert.equal((await g4('GET', '/api/auth/google/callback?code=abc&state=' + st5)).location, '/?google_error=1');
  // Google-only user can set a password, then log in with it.
  assert.equal((await g('POST', '/api/auth/password', { next: 'geepassword1' })).status, 200);
  assert.equal((await anon('POST', '/api/auth/login', { email: 'gee@gmail.com', password: 'geepassword1' })).status, 200);

  // ── Users: partner removes staff (who has an approval? no; partner approved) ──
  assert.equal((await partner('DELETE', `/api/users/${s.me.id}`)).status, 400, 'cannot remove yourself');
  assert.equal((await partner('DELETE', `/api/users/${staffId}`)).status, 200);
  assert.equal((await staff('GET', '/api/state')).status, 401, 'removed user is logged out');

  // ── Password change logs out ──
  assert.equal((await partner('POST', '/api/auth/password', { current: 'wrong', next: 'newpartnerpass' })).status, 400);
  assert.equal((await partner('POST', '/api/auth/password', { current: 'partnerpass', next: 'newpartnerpass' })).status, 200);
  assert.equal((await partner('GET', '/api/state')).status, 401);
  assert.equal((await partner('POST', '/api/auth/login', { email: 'p@x.in', password: 'newpartnerpass' })).status, 200);

  // ── Signup rate limit: 10 attempts per IP per hour ──
  let limited = false;
  for (let k = 0; k < 10 && !limited; k++)
    limited = (await anon('POST', '/api/auth/signup', { firmName: 'Spam', name: 'S', email: 'spam' + k + '@z.in', password: 'spampass1' })).status === 429;
  assert(limited, 'signups are rate limited');

  // ── Errors ──
  assert.equal((await partner('GET', '/api/nope')).status, 404);
  const bad = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' });
  assert.equal(bad.status, 400);

  console.log('All API checks passed.');
}

(async () => {
  // Fresh database with the real schema plus another firm that has one overdue invoice.
  const db = await PGlite.create();
  await db.exec(fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8'));
  await db.exec(`
    INSERT INTO firms (name, api_key) VALUES ('Fixture Firm', '${FIXTURE_KEY}');
    INSERT INTO clients (firm_id, name, phone, email) VALUES (1, 'Fixture Co', '+919000000001', 'fixture@example.com');
    INSERT INTO invoices (firm_id, number, client_id, service, amount, gst_rate, gst_amount, total, due_date)
    VALUES (1, 'INV-FIX-001', 1, 'GST', 1000, 18, 180, 1180, to_char((now() AT TIME ZONE 'Asia/Kolkata')::date - 20, 'YYYY-MM-DD'));`);
  const dbServer = new PGLiteSocketServer({ db, port: DB_PORT, host: '127.0.0.1', maxConnections: 10 });
  await dbServer.start();

  // Fake Google token endpoint: answers with an ID token for whoever googleUser is.
  const fakeGoogle = http.createServer((req, res) => {
    const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const claims = { iss: 'https://accounts.google.com', aud: 'test-client-id', exp: Math.floor(Date.now() / 1000) + 3600, ...googleUser };
    res.writeHead(googleUser ? 200 : 400, { 'content-type': 'application/json' });
    res.end(JSON.stringify(googleUser ? { id_token: b64({ alg: 'none' }) + '.' + b64(claims) + '.sig' } : { error: 'invalid_grant' }));
  }).listen(GOOGLE_PORT);

  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: {
      ...process.env, PORT: String(PORT), DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`,
      PG_POOL_MAX: '4', VERCEL: '', SMTP_HOST: '', APP_URL: BASE,
      GOOGLE_CLIENT_ID: 'test-client-id', GOOGLE_CLIENT_SECRET: 'test-secret', GOOGLE_TOKEN_URL: `http://127.0.0.1:${GOOGLE_PORT}/token`,
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let started = false;
  server.stdout.on('data', async chunk => {
    serverLog += chunk;
    if (started || !String(chunk).includes('Database:')) return;
    started = true;
    try { await main(); }
    catch (e) { console.error('FAILED:', e.stack || e.message); process.exitCode = 1; }
    finally { server.kill(); fakeGoogle.close(); await dbServer.stop(); await db.close(); }
  });
  server.on('exit', code => { if (!started) { console.error('Server exited early with code', code); process.exitCode = 1; dbServer.stop(); } });
})();
