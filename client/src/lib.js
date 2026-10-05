// Small helpers shared by all screens.

export async function api(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(40_000),   // longer than the server's slowest call (n8n, 25s), so only a stuck request trips it
  }).catch(e => {
    throw new Error(e.name === 'TimeoutError' ? 'The server took too long to answer. Check your connection and try again.' : 'Could not reach the server. Check your connection and try again.');
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: r.status, code: data.code });
  return data;
}

export const todayIso = () => new Date().toLocaleDateString('en-CA');
export const thisMonth = iso => !!iso && iso.slice(0, 7) === todayIso().slice(0, 7);
export const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
export const inrShort = n => (n >= 1e5 ? '₹' + (n / 1e5).toFixed(1).replace(/\.0$/, '') + 'L' : inr(n));
export const fmtDate = (iso, opts = { day: '2-digit', month: 'short', year: 'numeric' }) =>
  iso ? new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', opts) : '';
export const lastMonthLabel = () =>
  new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

export const initials = name => name.split(/\s+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join('');

const waNumber = p => { const d = String(p).replace(/\D/g, ''); return d.length === 10 ? '91' + d : d; };
export const waLink = (phone, text) => `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;
export const mailLink = (email, subject, body) =>
  `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

// How reminder messages to clients end: "Dhanyavaad, Kansal & Associates (+91 98765 43210, office@kansal.in)".
export const signature = S => {
  const contact = [S.settings.phone, S.settings.email].filter(Boolean).join(', ');
  return `Dhanyavaad, ${S.settings.firmName}${contact ? ` (${contact})` : ''}`;
};

export const outstandingDocs =(S, clientId) => S.documents.filter(d => d.client_id === clientId && d.status !== 'received');
export const unpaid = S => S.invoices.filter(i => !i.paid_at);
export const unfiled = S => S.filings.filter(f => !f.filed_at);
export const overdue = S => unpaid(S).filter(i => i.days_overdue > 0 && i.approval !== 'pending');

// One row per return type + period + due date.
export function groupFilings(list) {
  const groups = {};
  for (const f of list) (groups[`${f.return_type}|${f.period}|${f.due_date}`] ||= []).push(f);
  return Object.values(groups);
}

// Matches the n8n recovery stages: 1-7 gentle, 8-15 firm, 16-30 final, 30+ partner. Returns [label, tone].
export function invoiceStage(i) {
  if (i.paid_at) return ['Paid', 'ok'];
  if (i.approval === 'pending') return ['Awaiting partner approval', 'accent'];
  const d = i.days_overdue;
  if (d <= 0) return d >= -7 ? ['Due soon', 'warn'] : ['Not due', ''];
  if (d <= 7) return ['Gentle reminder', 'warn'];
  if (d <= 15) return ['Firm reminder', 'danger'];
  if (d <= 30) return ['Final notice', 'danger'];
  return ['Escalated to partner', 'danger'];
}

// Countdown chip for anything with a due date: [label, tone]. Under 7 days is urgent, up to 30 is coming up.
export const dueChip = daysLeft => [
  daysLeft < 0 ? `${-daysLeft}d late` : daysLeft === 0 ? 'today' : `${daysLeft}d left`,
  daysLeft < 7 ? 'danger' : daysLeft <= 30 ? 'warn' : '',
];
export const daysFromToday = iso => Math.round((new Date(iso.slice(0, 10)) - new Date(todayIso())) / 86400000);
