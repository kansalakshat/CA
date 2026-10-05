import { Plus, UsersThree } from '@phosphor-icons/react';
import { useApp } from '../App.jsx';
import { PageHead } from '../components.jsx';
import { inr, outstandingDocs, unpaid } from '../lib.js';
import { ServiceBadges } from './Dashboard.jsx';

export default function Clients() {
  const { S, openModal } = useApp();

  return (
    <>
      <PageHead title="Clients" desc="Aapke sare clients, unki services, documents aur dues ek jagah.">
        <button className="btn btn-primary" onClick={() => openModal('client')}><Plus size={16} weight="bold" aria-hidden="true" />New client</button>
      </PageHead>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Client</th><th>PAN / GSTIN</th><th>Contact</th><th>Services</th><th>Docs pending</th><th className="r">Outstanding</th></tr></thead>
            <tbody>
              {S.clients.map(c => {
                const due = unpaid(S).filter(i => i.client_id === c.id).reduce((s, i) => s + i.total, 0);
                const docs = outstandingDocs(S, c.id).length;
                return (
                  <tr key={c.id}>
                    <td><div className="cell-main">{c.name}</div><div className="cell-sub">{c.type}</div></td>
                    <td><div className="mono">{c.pan || '-'}</div><div className="cell-sub mono">{c.gstin}</div></td>
                    <td><a href={`tel:${c.phone}`} className="num" style={{ color: 'inherit', textDecoration: 'none', whiteSpace: 'nowrap' }}>{c.phone}</a><div className="cell-sub">{c.email}</div></td>
                    <td><ServiceBadges services={c.services} /></td>
                    <td>{docs ? <span className="badge tone-warn">{docs} pending</span> : <span className="muted">None</span>}</td>
                    <td className="r num strong" style={{ color: due ? 'var(--danger)' : 'var(--ink-3)', whiteSpace: 'nowrap' }}>{due ? inr(due) : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!S.clients.length && (
          <div className="empty"><UsersThree size={28} />No clients yet.<br /><button className="btn btn-primary" onClick={() => openModal('client')}>Add your first client</button></div>
        )}
      </div>
    </>
  );
}
