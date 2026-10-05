// Turns the Notion template into a CRM-connected n8n workflow.
// Run: node n8n/make-workflow.js   ->   writes n8n/n8n-workflow.json
// Edit CRM_URL if n8n reaches the CRM at a different address (e.g. http://host.docker.internal:3000 from Docker).
const fs = require('node:fs');
const path = require('node:path');

const CRM_URL = process.argv[2] || 'http://localhost:3000';
const API_KEY = 'YOUR_CRM_API_KEY';   // paste the key from the CRM Settings page in n8n
const SRC = path.join(__dirname, 'template.json');   // the original Notion template
const OUT = path.join(__dirname, 'n8n-workflow.json');

const RENAMES = {
  'Mock Invoice Input': 'Read Invoice Request',
  'Mock Overdue Invoices': 'CRM: Overdue Invoices',
  'Mock Client GST Calendar': 'CRM: GST Calendar',
  'Mock Pending Document Checklist': 'CRM: Pending Documents',
  'Update Reminder Count in Tracker (Sheet / Data Table)': 'CRM: Update Reminder Count',
  'Check Invoice Status': 'CRM: Check Invoice Status',
  'Log Invoice (Google Sheet / Data Table)': 'Already Saved in CRM',
};

// Rename everywhere (node names, connections, and $('Name') references) with one text replace.
let text = fs.readFileSync(SRC, 'utf8');
for (const [from, to] of Object.entries(RENAMES)) text = text.split(JSON.stringify(from).slice(1, -1)).join(to);
const w = JSON.parse(text);
w.name = 'Accounting Services - 5 Automation Suite (CRM connected)';

const node = name => {
  const n = w.nodes.find(n => n.name === name);
  if (!n) throw new Error(`Node not found: ${name}`);
  return n;
};
const apiKeyHeader = { sendHeaders: true, headerParameters: { parameters: [{ name: 'x-api-key', value: API_KEY }] } };
const toHttp = (name, method, urlPath, extra = {}) => {
  const n = node(name);
  n.type = 'n8n-nodes-base.httpRequest';
  n.typeVersion = 4.3;
  n.parameters = { ...(method === 'POST' ? { method: 'POST' } : {}), url: CRM_URL + urlPath, ...apiKeyHeader, ...extra, options: {} };
};

// Real data instead of mock Code nodes. The CRM returns the same field names the mocks used.
toHttp('CRM: Overdue Invoices', 'GET', '/api/n8n/overdue-invoices');
toHttp('CRM: GST Calendar', 'GET', '/api/n8n/gst-calendar');
toHttp('CRM: Pending Documents', 'GET', '/api/n8n/pending-documents');
toHttp('CRM: Update Reminder Count', 'POST', '/api/n8n/documents-reminded', {
  sendBody: true, specifyBody: 'json',
  jsonBody: "={{ { clientId: $('CRM: Pending Documents').item.json.clientId } }}",
});

// AI agent tool: look up invoice status in the CRM.
Object.assign(node('CRM: Check Invoice Status'), {
  type: 'n8n-nodes-base.httpRequestTool',
  typeVersion: 4.2,
  parameters: {
    toolDescription: 'Look up the payment status of an invoice. Use when the client mentions an invoice number like INV-2026-001.',
    url: CRM_URL + '/api/n8n/invoice-status',
    sendQuery: true,
    queryParameters: { parameters: [{ name: 'number', value: "={{ $fromAI('invoiceNumber', 'The invoice number, for example INV-2026-001', 'string') }}" }] },
    ...apiKeyHeader,
    options: {},
  },
});

// Keep the CRM's invoice number instead of generating "INV-<date>-001".
const calc = node('Calculate GST and Totals').parameters.assignments.assignments.find(a => a.name === 'invoiceNumber');
calc.value = "={{ $('New Invoice Request').item.json.body?.invoiceNumber ?? ('INV-' + $now.toFormat('yyyyMMdd') + '-001') }}";

// High-value invoices go to the partner only until the partner approves them in the CRM.
const ifNode = node('High Value Invoice (above 50,000)?');
ifNode.parameters.conditions.conditions.push({
  leftValue: "={{ $('New Invoice Request').item.json.body?.approved === true }}",
  rightValue: '',
  operator: { type: 'boolean', operation: 'false', singleValue: true },
});
const agent = node('Accounting Support Agent');
agent.parameters.options.systemMessage = agent.parameters.options.systemMessage.replace('Mock knowledge base:', 'Knowledge base:');

const approvalMail = node('Request Partner Approval');
approvalMail.parameters.message += '\n\nApprove it in the CRM (Invoices page). Once approved, it is sent to the client automatically.';

// ── Checks: every connection and $('Name') reference points to a real node ──
const names = new Set(w.nodes.map(n => n.name));
const problems = [];
for (const [from, outputs] of Object.entries(w.connections)) {
  if (!names.has(from)) problems.push(`connection from missing node "${from}"`);
  for (const list of Object.values(outputs)) for (const branch of list) for (const c of branch || [])
    if (!names.has(c.node)) problems.push(`connection to missing node "${c.node}"`);
}
for (const [, ref] of JSON.stringify(w).matchAll(/\$\('([^']+)'\)/g)) if (!names.has(ref)) problems.push(`reference to missing node "${ref}"`);
if (/Mock /.test(JSON.stringify(w.nodes.filter(n => !n.type.includes('stickyNote'))))) problems.push('a Mock node is still present');
if (problems.length) { console.error('Workflow check failed:\n' + problems.join('\n')); process.exit(1); }

fs.writeFileSync(OUT, JSON.stringify(w, null, 2));
console.log(`Wrote ${path.relative(process.cwd(), OUT)} (CRM at ${CRM_URL}). All ${w.nodes.length} nodes and references check out.`);
