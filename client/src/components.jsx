import { useState } from 'react';
import { useApp } from './App.jsx';
import { api, lastMonthLabel } from './lib.js';

// A modal with a form. Inputs are read by their `name` when submitted and POSTed to `url`.
export function FormModal({ title, url, submitLabel, okMsg, onClose, onSaved, children }) {
  const { reload, toast } = useApp();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
    <div className="modal-overlay open" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit}>
        <div className="modal-title">{title}</div>
        {children}
        <div className="form-error">{error}</div>
        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        </div>
      </form>
    </div>
  );
}

export const Field = ({ label, children }) => (
  <label className="form-group" style={{ display: 'block' }}>
    <span className="form-label">{label}</span>
    {children}
  </label>
);

export function ClientSelect({ name = 'clientId', required = true, blank }) {
  const { S } = useApp();
  return (
    <select className="form-input" name={name} required={required} defaultValue="">
      <option value="" disabled={required}>{blank || 'Select client…'}</option>
      {S.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

export const N8N_TEXT = { off: 'n8n not connected, so nothing was sent.', sent: 'Sent to n8n.', failed: '⚠️ n8n call failed, check the server log.' };

export function n8nMessage(r) {
  const n8n = N8N_TEXT[r.n8n];
  if (r.approval === 'pending') return `${r.number} saved. Over ₹50,000: needs partner approval before it goes to the client. ${n8n}`;
  return `${r.number} saved. ${n8n}`;
}

const SERVICES = [['GST', 'GST Filing'], ['ITR', 'ITR'], ['TDS', 'TDS'], ['ROC', 'ROC / MCA'], ['Audit', 'Audit'], ['Bookkeeping', 'Bookkeeping']];

export const ClientModal = ({ onClose }) => (
  <FormModal title="+ Naya Client Add Karein" url="/api/clients" submitLabel="✓ Client Add Karein" okMsg="Client added" onClose={onClose}>
    <div className="form-row">
      <Field label="Client / Firm Name *"><input className="form-input" name="name" placeholder="Mehta Textiles Pvt Ltd" required maxLength={200} autoFocus /></Field>
      <Field label="Client Type *">
        <select className="form-input" name="type">
          {['Individual', 'Proprietorship', 'Partnership', 'Private Limited', 'Public Limited', 'LLP'].map(t => <option key={t}>{t}</option>)}
        </select>
      </Field>
    </div>
    <div className="form-row">
      <Field label="PAN Number"><input className="form-input" name="pan" placeholder="AABCM1234F" maxLength={10} pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]" title="10 characters, e.g. AABCM1234F" /></Field>
      <Field label="GSTIN"><input className="form-input" name="gstin" placeholder="23AABCM1234F1Z5" maxLength={15} pattern="[0-9A-Za-z]{15}" title="15 characters" /></Field>
    </div>
    <div className="form-row">
      <Field label="WhatsApp Number *"><input className="form-input" name="phone" type="tel" placeholder="+91 98765 43210" required maxLength={20} /></Field>
      <Field label="Email"><input className="form-input" name="email" type="email" placeholder="client@example.com" /></Field>
    </div>
    <div className="form-group">
      <span className="form-label">Services Required</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        {SERVICES.map(([value, label]) => (
          <label key={value} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" name="services" value={value} defaultChecked={value === 'GST'} /> {label}
          </label>
        ))}
      </div>
    </div>
  </FormModal>
);

export const InvoiceModal = ({ onClose }) => (
  <FormModal title="+ New Invoice" url="/api/invoices" submitLabel="✓ Create Invoice" onClose={onClose} onSaved={n8nMessage}>
    <Field label="Client *"><ClientSelect /></Field>
    <Field label="Service *"><input className="form-input" name="service" placeholder="Monthly bookkeeping and GST filing" required maxLength={200} /></Field>
    <div className="form-row">
      <Field label="Amount before GST (₹) *"><input className="form-input" name="amount" type="number" min="1" step="0.01" required /></Field>
      <Field label="GST Rate">
        <select className="form-input" name="gstRate" defaultValue="18">
          {[18, 12, 5, 0].map(r => <option key={r} value={r}>{r}%</option>)}
        </select>
      </Field>
    </div>
    <Field label="Payment due in (days)"><input className="form-input" name="dueDays" type="number" min="0" max="365" defaultValue="15" /></Field>
    <div className="text-xs text-muted">Invoices above ₹50,000 (incl. GST) need partner approval before they are sent.</div>
  </FormModal>
);

export const FilingModal = ({ onClose }) => (
  <FormModal title="+ Add Filing" url="/api/filings" submitLabel="✓ Add Filing" okMsg="Filing added" onClose={onClose}>
    <Field label="Client *"><ClientSelect /></Field>
    <div className="form-row">
      <Field label="Return Type *">
        <input className="form-input" name="returnType" list="return-types" required maxLength={60} placeholder="GSTR-3B" />
        <datalist id="return-types">
          {['GSTR-1', 'GSTR-3B', 'TDS Return', 'ITR', 'ROC Annual Return (MGT-7)'].map(t => <option key={t} value={t} />)}
        </datalist>
      </Field>
      <Field label="Period *"><input className="form-input" name="period" required maxLength={30} defaultValue={lastMonthLabel()} /></Field>
    </div>
    <Field label="Due Date *"><input className="form-input" name="dueDate" type="date" required /></Field>
  </FormModal>
);

export const LeadModal = ({ onClose }) => (
  <FormModal title="+ Add Lead" url="/api/leads" submitLabel="✓ Add Lead" okMsg="Lead added" onClose={onClose}>
    <Field label="Name *"><input className="form-input" name="name" required maxLength={200} placeholder="Sunita Agarwal" autoFocus /></Field>
    <Field label="Service Needed"><input className="form-input" name="service" maxLength={200} placeholder="GST Registration + ITR" /></Field>
    <div className="form-row">
      <Field label="Source">
        <select className="form-input" name="source">
          {['WhatsApp', 'Website', 'Referral', 'Other'].map(s => <option key={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Expected Value (₹)"><input className="form-input" name="value" type="number" min="0" defaultValue="0" /></Field>
    </div>
    <Field label="Lead Score (0 to 100, how likely to convert)"><input className="form-input" name="score" type="number" min="0" max="100" defaultValue="30" /></Field>
  </FormModal>
);
