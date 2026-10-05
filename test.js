// API test. Runs the real server against a throwaway in-memory Postgres (PGlite), so Supabase is never touched.
// Run: npm test
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');

const PORT = 3999;
const DB_PORT = 5499;
const BASE = `http://127.0.0.1:${PORT}`;

// Minimal cookie-keeping client, one per "browser".
function client() {
  let cookie = '';
  return async (method, url, body, headers = {}) => {
    const r = await fetch(BASE + url, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body && JSON.stringify(body),
    });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: r.status, data: await r.json().catch(() => null) };
  };
}

async function main() {
  const anon = client();
  const partner = client();
  const staff = client();

  // ── Auth ──
  assert.equal((await anon('GET', '/api/state')).status, 401, 'state needs login');
  assert.equal((await anon('GET', '/api/auth/status')).data.needsSetup, true);
  assert.equal((await partner('POST', '/api/auth/setup', { name: 'P', email: 'p@x.in', password: 'short' })).status, 400, 'short password rejected');
  assert.equal((await partner('POST', '/api/auth/setup', { name: 'Partner', email: 'p@x.in', password: 'partnerpass' })).status, 200);
  assert.equal((await anon('POST', '/api/auth/setup', { name: 'X', email: 'x@x.in', password: 'whatever1' })).status, 403, 'setup only once');
  let s = (await partner('GET', '/api/state')).data;
  assert.equal(s.me.role, 'partner');
  assert(s.settings.apiKey);
  assert.deepEqual(s.clients.map(c => c.name), ['Fixture Co'], 'only the test fixture exists');
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
  assert.match(small.data.number, /^INV-\d{4}-\d{3,}$/);
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

  // The fixture invoice is 20 days overdue (the API itself only creates future due dates).
  const od = (await n8n('GET', '/api/n8n/overdue-invoices')).data;
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

  // ── Users: partner removes staff (who has an approval? no; partner approved) ──
  assert.equal((await partner('DELETE', `/api/users/${s.me.id}`)).status, 400, 'cannot remove yourself');
  assert.equal((await partner('DELETE', `/api/users/${staffId}`)).status, 200);
  assert.equal((await staff('GET', '/api/state')).status, 401, 'removed user is logged out');

  // ── Password change logs out ──
  assert.equal((await partner('POST', '/api/auth/password', { current: 'wrong', next: 'newpartnerpass' })).status, 400);
  assert.equal((await partner('POST', '/api/auth/password', { current: 'partnerpass', next: 'newpartnerpass' })).status, 200);
  assert.equal((await partner('GET', '/api/state')).status, 401);
  assert.equal((await partner('POST', '/api/auth/login', { email: 'p@x.in', password: 'newpartnerpass' })).status, 200);

  // ── Errors ──
  assert.equal((await partner('GET', '/api/nope')).status, 404);
  const bad = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' });
  assert.equal(bad.status, 400);

  console.log('All API checks passed.');
}

(async () => {
  // Fresh database with the real schema plus one overdue invoice.
  const db = await PGlite.create();
  await db.exec(fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8'));
  await db.exec(`
    INSERT INTO clients (name, phone, email) VALUES ('Fixture Co', '+919000000001', 'fixture@example.com');
    INSERT INTO invoices (number, client_id, service, amount, gst_rate, gst_amount, total, due_date)
    VALUES ('INV-FIX-001', 1, 'GST', 1000, 18, 180, 1180, to_char((now() AT TIME ZONE 'Asia/Kolkata')::date - 20, 'YYYY-MM-DD'));`);
  const dbServer = new PGLiteSocketServer({ db, port: DB_PORT, host: '127.0.0.1', maxConnections: 10 });
  await dbServer.start();

  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`, N8N_BASE_URL: '', PG_POOL_MAX: '4', VERCEL: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let started = false;
  server.stdout.on('data', async chunk => {
    if (started || !String(chunk).includes('Database:')) return;
    started = true;
    try { await main(); }
    catch (e) { console.error('FAILED:', e.stack || e.message); process.exitCode = 1; }
    finally { server.kill(); await dbServer.stop(); await db.close(); }
  });
  server.on('exit', code => { if (!started) { console.error('Server exited early with code', code); process.exitCode = 1; dbServer.stop(); } });
})();
