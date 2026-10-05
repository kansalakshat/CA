import { useState } from 'react';
import { useApp } from '../App.jsx';
import { avatarStyle, initials, mailLink, signature, waLink } from '../lib.js';

const FILTERS = [['all', 'All Clients'], ['missing', 'Missing Docs'], ['pending', 'Pending Verify'], ['complete', 'Complete']];
const NEXT_STATUS = { missing: 'pending', pending: 'received', received: 'missing' };
const STATUS_ICON = { received: '✅', missing: '❌', pending: '⏳' };

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
      <div className="section-title">📄 Document Collection Hub</div>
      <div className="section-desc">Client se required documents track karein. Document par click karke status badlein (Missing, Pending Verify, Received).</div>

      <div className="row-between" style={{ marginBottom: 16 }}>
        <div className="doc-filters">
          {FILTERS.map(([key, label]) => (
            <div key={key} className={'filter-tab' + (filter === key ? ' active' : '')} onClick={() => setFilter(key)}>{label}</div>
          ))}
        </div>
        <span className="tooltip-tag">🤖 Auto-reminders every Monday via n8n</span>
      </div>

      {cards.map(x => <ClientDocs key={x.c.id} {...x} />)}
      {!cards.length && <div className="card empty">No clients match this filter.</div>}
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
    <div className="client-doc-card">
      <div className="client-doc-header">
        <div className="client-avatar" style={avatarStyle(c.id)}>{initials(c.name)}</div>
        <div className="client-info">
          <div className="name">{c.name}</div>
          <div className="meta">
            {c.services.replace(/,/g, ', ') || 'No services'} •{' '}
            {!docs.length ? 'No documents requested yet' : outstanding.length ? `${missing + pending} outstanding • reminded ${reminders}×` : 'All docs received ✓'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {complete && <span className="badge badge-emerald">✓ Complete</span>}
          {outstanding.length > 0 && (
            <>
              <a className="reminder-btn wa" href={waLink(c.phone, msg)} target="_blank" rel="noopener noreferrer" onClick={remind}>📱 WhatsApp Remind</a>
              {c.email && <a className="reminder-btn email" href={mailLink(c.email, 'Documents needed', msg)} onClick={remind}>📧 Email</a>}
            </>
          )}
        </div>
      </div>
      <div className="client-doc-body">
        <div className="doc-grid">
          {docs.map(d => (
            <div key={d.id} className={`doc-item ${d.status}`} title="Click to change status" role="button"
              onClick={() => act('PATCH', `/api/documents/${d.id}`, { status: NEXT_STATUS[d.status] })}>
              <div className="doc-icon">📄</div>
              <div className="doc-name">{d.name}</div>
              <div className="doc-status-icon">{STATUS_ICON[d.status]}</div>
            </div>
          ))}
        </div>
        {docs.length > 0 && (
          <>
            <div className="progress-bar"><div className="progress-fill" style={{ width: pct + '%' }}></div></div>
            <div style={{ fontSize: 11, color: complete ? 'var(--emerald)' : 'var(--text-muted)', marginTop: 4 }}>
              {received}/{docs.length} documents received ({pct}%)
            </div>
          </>
        )}
        <form className="doc-add" onSubmit={addDoc}>
          <input className="form-input" placeholder="Document name, e.g. Form 16" required maxLength={80} value={newDoc} onChange={e => setNewDoc(e.target.value)} aria-label="New document name" />
          <button className="btn btn-outline btn-sm">+ Request</button>
        </form>
      </div>
    </div>
  );
}
