// Small helpers shared by all screens.

export async function api(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body && JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: r.status });
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
const AVATAR_COLORS = ['#0EA5C9,#0369A1', '#8B5CF6,#6D28D9', '#10B981,#059669', '#F59E0B,#D97706', '#F43F5E,#BE123C'];
export const avatarStyle = id => ({ background: `linear-gradient(135deg,${AVATAR_COLORS[id % AVATAR_COLORS.length]})` });

const waNumber = p => { const d = String(p).replace(/\D/g, ''); return d.length === 10 ? '91' + d : d; };
export const waLink = (phone, text) => `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;
export const mailLink = (email, subject, body) =>
  `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

export const outstandingDocs = (S, clientId) => S.documents.filter(d => d.client_id === clientId && d.status !== 'received');
export const unpaid = S => S.invoices.filter(i => !i.paid_at);
export const unfiled = S => S.filings.filter(f => !f.filed_at);
export const overdue = S => unpaid(S).filter(i => i.days_overdue > 0 && i.approval !== 'pending');

// One row per return type + period + due date.
export function groupFilings(list) {
  const groups = {};
  for (const f of list) (groups[`${f.return_type}|${f.period}|${f.due_date}`] ||= []).push(f);
  return Object.values(groups);
}

// Matches the n8n recovery stages: 1-7 gentle, 8-15 firm, 16-30 final, 30+ partner.
export function invoiceStage(i) {
  if (i.paid_at) return ['✓ Paid', 'emerald'];
  if (i.approval === 'pending') return ['⏳ Awaiting Partner Approval', 'violet'];
  const d = i.days_overdue;
  if (d <= 0) return d >= -7 ? ['⚠️ Due Soon', 'amber'] : ['Not Due', 'teal'];
  if (d <= 7) return ['Gentle Reminder', 'amber'];
  if (d <= 15) return ['Firm Reminder', 'rose'];
  if (d <= 30) return ['🚨 Final Notice', 'rose'];
  return ['🚨 Escalated to Partner', 'rose'];
}

export const urgency = daysLeft => (daysLeft < 7 ? 'urgent' : daysLeft <= 30 ? 'warning' : 'ok');
export const urgencyColor = { urgent: 'var(--rose)', warning: 'var(--amber)', ok: 'var(--emerald)' };
