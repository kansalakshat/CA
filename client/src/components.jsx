import { useEffect, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { useApp } from './App.jsx';
import { api, dueChip, lastMonthLabel } from './lib.js';

// Page title, one-line description and the page's main actions.
export const PageHead = ({ title, desc, children }) => (
  <div className="page-head">
    <div className="text">
      <h1>{title}</h1>
      {desc && <p>{desc}</p>}
    </div>
    {children && <div className="actions">{children}</div>}
  </div>
);

// Countdown chip: "6d left", "today", "5d late".
export function Due({ days }) {
  const [label, tone] = dueChip(days);
  return <span className={'due' + (tone ? ' tone-' + tone : '')}>{label}</span>;
}

// A delete button that asks first: one click swaps it for "<confirmLabel> / Cancel", the second click runs onConfirm.
export function ConfirmButton({ confirmLabel, onConfirm, className, children, ...rest }) {
  const [state, setState] = useState('idle');   // idle | asking | cancelled (cancelled = idle, but refocus the button)
  const cancel = () => setState('cancelled');
  if (state !== 'asking') return <button className={className} autoFocus={state === 'cancelled'} onClick={() => setState('asking')} {...rest}>{children}</button>;
  return (
    <span className="confirm" onKeyDown={e => e.key === 'Escape' && cancel()}>
      <button className="btn btn-danger-solid btn-sm" autoFocus onClick={() => { setState('idle'); onConfirm(); }}>{confirmLabel}</button>
      <button className="btn btn-ghost btn-sm" onClick={cancel}>Cancel</button>
    </span>
  );
}

// A modal with a form. Inputs are read by their `name` when submitted and POSTed to `url`.
export function FormModal({ title, url, submitLabel, okMsg, onClose, onSaved, children }) {
  const { reload, toast } = useApp();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);
    if (e.target.elements.services) data.services = fd.getAll('services');
    setError('');
    setBusy(true);
    try {
      const r = await api('POST', url, data);
      onClose();
      toast(onSaved ? onSaved(r) : okMsg);
      await reload();
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-head">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="icon-btn bare" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
        <div className="form-error" role="alert">{error}</div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        </div>
      </form>
    </div>
  );
}

export const Field = ({ label, hint, children }) => (
  <label className="field">
    <span className="field-label">{label}</span>
    {children}
    {hint && <span className="field-hint">{hint}</span>}
  </label>
);

export function ClientSelect({ name = 'clientId', required = true, blank }) {
  const { S } = useApp();
  return (
    <select className="input" name={name} required={required} defaultValue="">
      <option value="" disabled={required}>{blank || 'Select client…'}</option>
      {S.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

export const N8N_TEXT = { off: 'n8n not connected, so nothing was sent.', sent: 'Sent to n8n.', failed: 'n8n call failed, check the server log.' };

export function n8nMessage(r) {
  const n8n = N8N_TEXT[r.n8n];
  if (r.approval === 'pending') return `${r.number} saved. Over ₹50,000: needs partner approval before it goes to the client. ${n8n}`;
  return `${r.number} saved. ${n8n}`;
}

const SERVICES = [['GST', 'GST filing'], ['ITR', 'ITR'], ['TDS', 'TDS'], ['ROC', 'ROC / MCA'], ['Audit', 'Audit'], ['Bookkeeping', 'Bookkeeping']];

export const ClientModal = ({ onClose }) => (
  <FormModal title="Naya client add karein" url="/api/clients" submitLabel="Add client" okMsg="Client added" onClose={onClose}>
    <div className="form-row">
      <Field label="Client / firm name"><input className="input" name="name" placeholder="Mehta Textiles Pvt Ltd" required maxLength={200} autoFocus /></Field>
      <Field label="Client type">
        <select className="input" name="type">
          {['Individual', 'Proprietorship', 'Partnership', 'Private Limited', 'Public Limited', 'LLP'].map(t => <option key={t}>{t}</option>)}
        </select>
      </Field>
    </div>
    <div className="form-row">
      <Field label="PAN (optional)"><input className="input mono" name="pan" placeholder="AABCM1234F" maxLength={10} pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]" title="10 characters, e.g. AABCM1234F" autoCapitalize="characters" spellCheck={false} /></Field>
      <Field label="GSTIN (optional)"><input className="input mono" name="gstin" placeholder="23AABCM1234F1Z5" maxLength={15} pattern="[0-9A-Za-z]{15}" title="15 characters" autoCapitalize="characters" spellCheck={false} /></Field>
    </div>
    <div className="form-row">
      <Field label="WhatsApp number"><input className="input" name="phone" type="tel" placeholder="+91 98765 43210" required maxLength={20} autoComplete="off" /></Field>
      <Field label="Email (optional)"><input className="input" name="email" type="email" placeholder="client@example.com" autoComplete="off" spellCheck={false} /></Field>
    </div>
    <fieldset className="field" style={{ border: 0 }}>
      <legend className="field-label">Services</legend>
      <div className="checks">
        {SERVICES.map(([value, label]) => (
          <label key={value} className="check-chip">
            <input type="checkbox" name="services" value={value} defaultChecked={value === 'GST'} /><span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  </FormModal>
);

export const InvoiceModal = ({ onClose }) => (
  <FormModal title="New invoice" url="/api/invoices" submitLabel="Create invoice" onClose={onClose} onSaved={n8nMessage}>
    <Field label="Client"><ClientSelect /></Field>
    <Field label="Service"><input className="input" name="service" placeholder="Monthly bookkeeping and GST filing" required maxLength={200} /></Field>
    <div className="form-row">
      <Field label="Amount before GST (₹)"><input className="input num" name="amount" type="number" inputMode="decimal" min="1" step="0.01" required /></Field>
      <Field label="GST rate">
        <select className="input" name="gstRate" defaultValue="18">
          {[18, 12, 5, 0].map(r => <option key={r} value={r}>{r}%</option>)}
        </select>
      </Field>
    </div>
    <Field label="Payment due in (days)" hint="Invoices above ₹50,000 (incl. GST) need partner approval before they are sent.">
      <input className="input num" name="dueDays" type="number" inputMode="numeric" min="0" max="365" defaultValue="15" />
    </Field>
  </FormModal>
);

export const FilingModal = ({ onClose }) => (
  <FormModal title="Add filing" url="/api/filings" submitLabel="Add filing" okMsg="Filing added" onClose={onClose}>
    <Field label="Client"><ClientSelect /></Field>
    <div className="form-row">
      <Field label="Return type">
        <input className="input" name="returnType" list="return-types" required maxLength={60} placeholder="GSTR-3B" />
        <datalist id="return-types">
          {['GSTR-1', 'GSTR-3B', 'TDS Return', 'ITR', 'ROC Annual Return (MGT-7)'].map(t => <option key={t} value={t} />)}
        </datalist>
      </Field>
      <Field label="Period"><input className="input" name="period" required maxLength={30} defaultValue={lastMonthLabel()} /></Field>
    </div>
    <Field label="Due date"><input className="input" name="dueDate" type="date" required /></Field>
  </FormModal>
);

export const LeadModal = ({ onClose }) => (
  <FormModal title="Add lead" url="/api/leads" submitLabel="Add lead" okMsg="Lead added" onClose={onClose}>
    <Field label="Name"><input className="input" name="name" required maxLength={200} placeholder="Sunita Agarwal" autoFocus /></Field>
    <Field label="Service needed (optional)"><input className="input" name="service" maxLength={200} placeholder="GST registration + ITR" /></Field>
    <div className="form-row">
      <Field label="Source">
        <select className="input" name="source">
          {['WhatsApp', 'Website', 'Referral', 'Other'].map(s => <option key={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Expected value (₹)"><input className="input num" name="value" type="number" inputMode="numeric" min="0" defaultValue="0" /></Field>
    </div>
    <Field label="Lead score" hint="0 to 100: how likely this lead is to convert.">
      <input className="input num" name="score" type="number" inputMode="numeric" min="0" max="100" defaultValue="30" />
    </Field>
  </FormModal>
);
