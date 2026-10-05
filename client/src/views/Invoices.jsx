import { useApp } from '../App.jsx';
import { fmtDate, inr, invoiceStage, mailLink, thisMonth, unpaid, waLink } from '../lib.js';
import { N8N_TEXT } from '../components.jsx';

const SCHEDULE = [
  ['🙂', '1 to 7 Days Overdue', 'Gentle reminder: Email + WA + Call'],
  ['😐', '8 to 15 Days', 'Firm reminder: Email + WA + Call'],
  ['⚠️', '16 to 30 Days', 'Final notice: Email + WA + Call'],
  ['🚨', '30+ Days', 'Escalate to CA partner'],
];

export default function Invoices() {
  const { S, openModal } = useApp();
  const sum = list => list.reduce((s, i) => s + i.total, 0);

  return (
    <>
      <div className="section-title">🧾 Invoice & Fee Management</div>
      <div className="section-desc">Invoice banayein (GST apne aap judta hai), payment status track karein, WhatsApp/Email/Call se reminder bhejein.</div>

      <div className="invoice-summary">
        <div className="inv-stat"><div className="amount">{inr(sum(S.invoices.filter(i => thisMonth(i.issue_date))))}</div><div className="inv-label">Total Billed (this month)</div></div>
        <div className="inv-stat"><div className="amount" style={{ color: 'var(--emerald)' }}>{inr(sum(S.invoices.filter(i => thisMonth(i.paid_at))))}</div><div className="inv-label">✅ Collected (this month)</div></div>
        <div className="inv-stat"><div className="amount" style={{ color: 'var(--rose)' }}>{inr(sum(unpaid(S)))}</div><div className="inv-label">⏰ Outstanding (all)</div></div>
      </div>

      <div className="card">
        <div className="card-header">
          <span>💸</span>
          <span className="card-title">Invoices</span>
          <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => openModal('invoice')}>+ New Invoice</button>
        </div>
        <table>
          <thead><tr><th>Client</th><th>Invoice #</th><th>Service</th><th>Amount (incl. GST)</th><th>Due Date</th><th>Overdue</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{S.invoices.map(i => <InvoiceRow key={i.id} i={i} />)}</tbody>
        </table>
        {!S.invoices.length && <div className="empty">No invoices yet. Click “+ New Invoice”.</div>}
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-title">🤖 Auto-Recovery Schedule (n8n, daily 10:00)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {SCHEDULE.map(([icon, title, desc], idx) => (
            <div key={title} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, textAlign: 'center', background: idx === 3 ? 'var(--rose-light)' : undefined }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{title}</div>
              <div style={{ fontSize: 11.5, color: idx === 3 ? 'var(--rose)' : 'var(--text-muted)', marginTop: 3 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function InvoiceRow({ i }) {
  const { S, act, toast } = useApp();
  const [label, color] = invoiceStage(i);
  const late = !i.paid_at && i.days_overdue > 0;
  const waiting = i.approval === 'pending';
  const amountColor = i.paid_at ? 'var(--text-muted)' : late ? 'var(--rose)' : 'var(--amber)';
  const msg = `Namaste ${i.client_name}, invoice ${i.number} (${inr(i.total)}) ${late ? `${i.days_overdue} din se overdue hai` : `ki due date ${fmtDate(i.due_date)} hai`}. Kripya payment kar dein. Dhanyavaad, ${S.settings.firmName}`;

  async function approve() {
    const r = await act('POST', `/api/invoices/${i.id}/approve`);
    if (r) toast(`${r.number} approved. ${N8N_TEXT[r.n8n]}`);
  }

  return (
    <tr>
      <td><div style={{ fontWeight: 600 }}>{i.client_name}</div><div className="text-xs text-muted">📱 {i.client_phone}</div></td>
      <td className="text-sm text-muted">{i.number}</td>
      <td><span className="badge badge-teal">{i.service}</span></td>
      <td style={{ fontWeight: 700, color: amountColor }}>
        {inr(i.total)}
        <div className="text-xs text-muted" style={{ fontWeight: 400 }}>GST {i.gst_rate}%: {inr(i.gst_amount)}</div>
      </td>
      <td className="text-sm">{fmtDate(i.due_date)}</td>
      <td>{late ? <span style={{ fontWeight: 700, color: 'var(--rose)' }}>{i.days_overdue} days</span> : <span style={{ color: 'var(--text-muted)' }}>-</span>}</td>
      <td><span className={`badge badge-${color}`}>{label}</span></td>
      <td>
        <div className="action-row">
          {waiting && (S.me.role === 'partner'
            ? <button className="reminder-btn email" onClick={approve}>✓ Approve</button>
            : <span className="text-xs text-muted">Partner must approve</span>)}
          {!i.paid_at && !waiting && (
            <>
              <a className="reminder-btn wa" href={waLink(i.client_phone, msg)} target="_blank" rel="noopener noreferrer" title="WhatsApp reminder">📱 WA</a>
              {i.client_email && <a className="reminder-btn email" href={mailLink(i.client_email, 'Payment reminder: ' + i.number, msg)} title="Email reminder">📧</a>}
              <a className="reminder-btn call" href={`tel:${i.client_phone}`} title="Call">📞</a>
              <button className="reminder-btn email" onClick={() => act('POST', `/api/invoices/${i.id}/paid`, null, `${i.number} marked paid`)}>✓ Paid</button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
