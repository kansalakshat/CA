import { useApp } from '../App.jsx';
import { inr, outstandingDocs, unpaid } from '../lib.js';
import { ServiceBadges } from './Dashboard.jsx';

export default function Clients() {
  const { S, openModal } = useApp();

  return (
    <>
      <div className="row-between" style={{ marginBottom: 20 }}>
        <div>
          <div className="section-title">👥 Client Management</div>
          <div className="section-desc" style={{ marginBottom: 0 }}>Aapke sare clients, unki services, documents aur dues ek jagah.</div>
        </div>
        <button className="btn btn-primary" onClick={() => openModal('client')}>+ New Client</button>
      </div>
      <div className="card">
        <table>
          <thead><tr>{['Client', 'PAN / GSTIN', 'Contact', 'Services', 'Docs Pending', 'Outstanding'].map(h => <th key={h} style={{ paddingTop: 14 }}>{h}</th>)}</tr></thead>
          <tbody>
            {S.clients.map(c => {
              const due = unpaid(S).filter(i => i.client_id === c.id).reduce((s, i) => s + i.total, 0);
              const docs = outstandingDocs(S, c.id).length;
              return (
                <tr key={c.id}>
                  <td><div style={{ fontWeight: 600 }}>{c.name}</div><div className="text-xs text-muted">{c.type}</div></td>
                  <td className="text-sm">{c.pan || '-'}<div className="text-xs text-muted">{c.gstin}</div></td>
                  <td className="text-sm">📱 {c.phone}<div className="text-xs text-muted">{c.email}</div></td>
                  <td><ServiceBadges services={c.services} /></td>
                  <td>{docs ? <span className="badge badge-amber">{docs} pending</span> : '-'}</td>
                  <td style={{ fontWeight: 700, color: due ? 'var(--rose)' : 'var(--text-muted)' }}>{due ? inr(due) : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!S.clients.length && <div className="empty">No clients yet.</div>}
      </div>
    </>
  );
}
