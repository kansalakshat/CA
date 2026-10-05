import { useState } from 'react';
import { CheckCircle, Clock, EnvelopeSimple, FileText, WhatsappLogo, XCircle } from '@phosphor-icons/react';
import { useApp } from '../App.jsx';
import { PageHead } from '../components.jsx';
import { initials, mailLink, signature, waLink } from '../lib.js';

const FILTERS = [['all', 'All clients'], ['missing', 'Missing docs'], ['pending', 'Pending verify'], ['complete', 'Complete']];
const NEXT_STATUS = { missing: 'pending', pending: 'received', received: 'missing' };
const STATUS = {
  received: [CheckCircle, 'Received'],
  pending: [Clock, 'Pending verify'],
  missing: [XCircle, 'Missing'],
};

export default function Documents() {
  const { S } = useApp();
  const [filter, setFilter] = useState('all');

  const cards = S.clients.map(c => {
    const docs = S.documents.filter(d => d.client_id === c.id);
    const missing = docs.filter(d => d.status === 'missing').length;
    const pending = docs.filter(d => d.status === 'pending').length;
    return { c, docs, missing, pending, received: docs.length - missing - pending };
  }).filter(x =>
    filter === 'all' ||
    (filter === 'missing' && x.missing) ||
    (filter === 'pending' && x.pending) ||
    (filter === 'complete' && x.docs.length && x.received === x.docs.length));

  return (
    <>
      <PageHead title="Document hub" desc="Client se required documents track karein. Document par click karke status badlein: missing, pending verify, received." />

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Filter clients">
          {FILTERS.map(([key, label]) => (
            <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>
        <span className="note-line end"><Clock size={15} aria-hidden="true" />Auto-reminders every Monday via n8n</span>
      </div>

      {cards.map(x => <ClientDocs key={x.c.id} {...x} />)}
      {!cards.length && <div className="card empty"><FileText size={28} />No clients match this filter.</div>}
    </>
  );
}

function ClientDocs({ c, docs, missing, pending, received }) {
  const { act, S } = useApp();
  const [newDoc, setNewDoc] = useState('');
  const outstanding = docs.filter(d => d.status !== 'received');
  const complete = docs.length > 0 && !outstanding.length;
  const pct = docs.length ? Math.round(received / docs.length * 100) : 0;
  const reminders = Math.max(0, ...outstanding.map(d => d.reminder_count));
  const msg = `Namaste ${c.name}, kripya ye documents bhej dein: ${outstanding.map(d => d.name).join(', ')}. ${signature(S)}`;
  const remind = () => act('POST', '/api/documents/remind', { clientId: c.id });

  async function addDoc(e) {
    e.preventDefault();
    if (await act('POST', '/api/documents', { clientId: c.id, name: newDoc })) setNewDoc('');
  }

  return (
    <section className="card doc-card" aria-label={c.name}>
      <div className="doc-card-head">
        <div className="avatar lg" aria-hidden="true">{initials(c.name)}</div>
        <div className="info">
          <h2 style={{ fontSize: 15 }}>{c.name}</h2>
          <div className="cell-sub">
            {c.services.replace(/,/g, ', ') || 'No services'} ·{' '}
            {!docs.length ? 'No documents requested yet' : outstanding.length ? `${missing + pending} outstanding, reminded ${reminders}×` : 'All documents received'}
          </div>
        </div>
        <div className="end">
          {complete && <span className="badge tone-ok"><CheckCircle size={14} weight="fill" aria-hidden="true" />Complete</span>}
          {outstanding.length > 0 && (
            <>
              <a className="btn btn-sm wa" href={waLink(c.phone, msg)} target="_blank" rel="noopener noreferrer" onClick={remind}>
                <WhatsappLogo size={15} weight="fill" aria-hidden="true" />WhatsApp remind
              </a>
              {c.email && <a className="btn btn-secondary btn-sm" href={mailLink(c.email, 'Documents needed', msg)} onClick={remind}><EnvelopeSimple size={15} aria-hidden="true" />Email</a>}
            </>
          )}
        </div>
      </div>
      <div className="doc-card-body">
        {docs.length > 0 && (
          <div className="doc-grid">
            {docs.map(d => {
              const [Icon, label] = STATUS[d.status];
              return (
                <button key={d.id} className={`doc ${d.status}`} title="Click to change status"
                  aria-label={`${d.name}: ${label}. Click to change status.`}
                  onClick={() => act('PATCH', `/api/documents/${d.id}`, { status: NEXT_STATUS[d.status] })}>
                  <Icon size={18} weight={d.status === 'missing' ? 'regular' : 'fill'} aria-hidden="true" />
                  <span>{d.name}</span>
                </button>
              );
            })}
          </div>
        )}
        {docs.length > 0 && (
          <div className="progress">
            <div className="track" aria-hidden="true"><div className="fill" style={{ width: pct + '%' }} /></div>
            <span className="num" style={complete ? { color: 'var(--ok)' } : undefined}>{received} of {docs.length} received</span>
          </div>
        )}
        <form className="inline-add" onSubmit={addDoc}>
          <input className="input sm" placeholder="Document name, e.g. Form 16…" autoComplete="off" required maxLength={80} value={newDoc} onChange={e => setNewDoc(e.target.value)} aria-label={`Request a document from ${c.name}`} />
          <button className="btn btn-secondary btn-sm">Request</button>
        </form>
      </div>
    </section>
  );
}
