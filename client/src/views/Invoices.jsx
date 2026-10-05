import { Check, EnvelopeSimple, Phone, Plus, Receipt, WhatsappLogo } from '@phosphor-icons/react';
import { useApp } from '../App.jsx';
import { Due, N8N_TEXT, PageHead } from '../components.jsx';
import { fmtDate, inr, invoiceStage, mailLink, signature, thisMonth, unpaid, waLink } from '../lib.js';

const SCHEDULE = [
  ['1 to 7 days overdue', 'Gentle reminder by email, WhatsApp and call'],
  ['8 to 15 days', 'Firm reminder by email, WhatsApp and call'],
  ['16 to 30 days', 'Final notice by email, WhatsApp and call'],
  ['30+ days', 'Escalated to the CA partner'],
];

export default function Invoices() {
  const { S, openModal } = useApp();
  const sum = list => list.reduce((s, i) => s + i.total, 0);
  const outstanding = sum(unpaid(S));

  return (
    <>
      <PageHead title="Invoices & fees" desc="Invoice banayein (GST apne aap judta hai), payment status track karein, WhatsApp, email ya call se reminder bhejein.">
        <button className="btn btn-primary" onClick={() => openModal('invoice')}><Plus size={16} weight="bold" aria-hidden="true" />New invoice</button>
      </PageHead>

      <section className="card ledger" aria-label="Fee summary">
        <div><div className="label">Billed this month</div><div className="value">{inr(sum(S.invoices.filter(i => thisMonth(i.issue_date))))}</div></div>
        <div><div className="label">Collected this month</div><div className="value ok">{inr(sum(S.invoices.filter(i => thisMonth(i.paid_at))))}</div></div>
        <div><div className="label">Outstanding, all time</div><div className={'value' + (outstanding ? ' danger' : '')}>{inr(outstanding)}</div></div>
      </section>

      <section className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Client</th><th>Invoice</th><th>Service</th><th className="r">Amount incl. GST</th><th>Due</th><th>Status</th><th className="r">Actions</th></tr></thead>
            <tbody>{S.invoices.map(i => <InvoiceRow key={i.id} i={i} />)}</tbody>
          </table>
        </div>
        {!S.invoices.length && (
          <div className="empty"><Receipt size={28} />No invoices yet.<br /><button className="btn btn-primary" onClick={() => openModal('invoice')}>Create an invoice</button></div>
        )}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h2>Auto-recovery schedule</h2><div className="end"><span className="muted small">n8n, daily at 10:00</span></div></div>
        <div className="card-body">
          {SCHEDULE.map(([when, what], idx) => (
            <div className="kv" key={when}>
              <span className="num strong" style={{ minWidth: 150 }}>{when}</span>
              <span style={{ flex: 1, color: idx === 3 ? 'var(--danger)' : 'var(--ink-2)' }}>{what}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function InvoiceRow({ i }) {
  const { S, act, toast } = useApp();
  const [label, tone] = invoiceStage(i);
  const late = !i.paid_at && i.days_overdue > 0;
  const waiting = i.approval === 'pending';
  const msg = `Namaste ${i.client_name}, invoice ${i.number} (${inr(i.total)}) ${late ? `${i.days_overdue} din se overdue hai` : `ki due date ${fmtDate(i.due_date)} hai`}. Kripya payment kar dein. ${signature(S)}`;

  async function approve() {
    const r = await act('POST', `/api/invoices/${i.id}/approve`);
    if (r) toast(`${r.number} approved. ${N8N_TEXT[r.n8n]}`);
  }

  return (
    <tr className={i.paid_at ? 'paid-row' : undefined}>
      <td className="cell-main">{i.client_name}</td>
      <td className="mono" style={{ whiteSpace: 'nowrap' }}>{i.number}</td>
      <td>{i.service}</td>
      <td className="r num" style={{ whiteSpace: 'nowrap' }}>
        <div className="strong" style={{ color: late ? 'var(--danger)' : undefined }}>{inr(i.total)}</div>
        <div className="cell-sub">GST {i.gst_rate}%: {inr(i.gst_amount)}</div>
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <div className="num small">{fmtDate(i.due_date)}</div>
        {!i.paid_at && !waiting && <Due days={-i.days_overdue} />}
      </td>
      <td><span className={'badge' + (tone ? ' tone-' + tone : '')}>{label}</span></td>
      <td>
        <div className="actions-cell">
          {waiting && (S.me.role === 'partner'
            ? <button className="btn btn-primary btn-sm" onClick={approve}><Check size={14} weight="bold" aria-hidden="true" />Approve</button>
            : <span className="cell-sub">Partner must approve</span>)}
          {!i.paid_at && !waiting && (
            <>
              <a className="icon-btn sm wa" href={waLink(i.client_phone, msg)} target="_blank" rel="noopener noreferrer" title="WhatsApp reminder" aria-label={`WhatsApp reminder to ${i.client_name}`}>
                <WhatsappLogo size={16} weight="fill" />
              </a>
              {i.client_email && <a className="icon-btn sm" href={mailLink(i.client_email, 'Payment reminder: ' + i.number, msg)} title="Email reminder" aria-label={`Email reminder to ${i.client_name}`}><EnvelopeSimple size={16} /></a>}
              <a className="icon-btn sm" href={`tel:${i.client_phone}`} title={`Call ${i.client_phone}`} aria-label={`Call ${i.client_name}, ${i.client_phone}`}><Phone size={16} /></a>
              <button className="btn btn-secondary btn-sm" title="Mark as paid" onClick={() => act('POST', `/api/invoices/${i.id}/paid`, null, `${i.number} marked paid`)}><Check size={14} weight="bold" aria-hidden="true" />Paid</button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
