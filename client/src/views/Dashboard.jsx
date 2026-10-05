import { ArrowRight, CalendarCheck, UsersThree } from '@phosphor-icons/react';
import { useApp } from '../App.jsx';
import { Due, PageHead } from '../components.jsx';
import { fmtDate, groupFilings, inrShort, outstandingDocs, overdue, thisMonth, unfiled, unpaid } from '../lib.js';

export default function Dashboard() {
  const { S, go, openModal } = useApp();
  const late = overdue(S);
  const pending = unfiled(S);
  const urgent = pending.filter(f => f.days_left < 7).length;
  const lateClients = new Set(late.map(i => i.client_id)).size;
  const activeLeads = S.leads.filter(l => l.stage !== 'won');
  const openTasks = S.tasks.filter(t => !t.done_at);
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  const stats = [
    ['Total clients', S.clients.length, `+${S.clients.filter(c => thisMonth(c.created_at)).length} this month`, ''],
    ['Pending deadlines', pending.length, `${urgent} due within 7 days`, urgent ? 'danger' : ''],
    ['Fees collected', inrShort(S.invoices.filter(i => thisMonth(i.paid_at)).reduce((s, i) => s + i.total, 0)), 'This month', ''],
    ['Pending fees', inrShort(unpaid(S).reduce((s, i) => s + i.total, 0)), `${lateClients} client${lateClients === 1 ? '' : 's'} overdue`, lateClients ? 'danger' : ''],
  ];

  const activity = [
    ['Chat queries today', S.messageCount],
    ['Document reminders sent', S.clients.reduce((s, c) => s + Math.max(0, ...outstandingDocs(S, c.id).map(d => d.reminder_count)), 0)],
    ['Returns ready (data received)', pending.filter(f => f.data_received).length],
    ['Overdue invoices in recovery', late.length],
    ['Open tasks', openTasks.length],
  ];

  return (
    <>
      <PageHead title="Aaj ka overview" desc={today} />

      <section className="card ledger" aria-label="Key numbers">
        {stats.map(([label, value, note, tone]) => (
          <div key={label}>
            <div className="label">{label}</div>
            <div className="value">{value}</div>
            <div className={'note ' + tone}>{note}</div>
          </div>
        ))}
      </section>

      <div className="dash-grid">
        <section className="card">
          <div className="card-head">
            <h2>Upcoming compliance deadlines</h2>
            <div className="end"><button className="btn btn-ghost btn-sm" onClick={() => go('compliance')}>View all <ArrowRight size={14} aria-hidden="true" /></button></div>
          </div>
          <div className="card-body">
            {groupFilings(pending).slice(0, 6).map(g => {
              const f = g[0];
              return (
                <div className="deadline" key={f.id}>
                  <div className="info">
                    <div className="cell-main">{f.return_type} · {f.period}</div>
                    <div className="cell-sub">{g.length} client{g.length > 1 ? 's' : ''} pending</div>
                  </div>
                  <div className="date num">{fmtDate(f.due_date, { day: '2-digit', month: 'short' })}</div>
                  <Due days={f.days_left} />
                </div>
              );
            })}
            {!pending.length && <div className="empty"><CalendarCheck size={28} />No pending deadlines.</div>}
          </div>
        </section>

        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2>Automation activity</h2>
              <div className="end"><span className={'badge ' + (S.settings.n8nBaseUrl ? 'tone-ok' : '')}>{S.settings.n8nBaseUrl ? 'n8n connected' : 'n8n off'}</span></div>
            </div>
            <div className="card-body">
              {activity.map(([label, value]) => <div className="kv" key={label}><span>{label}</span><b>{value}</b></div>)}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Lead pipeline</h2>
              <div className="end"><button className="btn btn-ghost btn-sm" onClick={() => go('leads')}>Open <ArrowRight size={14} aria-hidden="true" /></button></div>
            </div>
            <div className="card-body pipeline-sum">
              <div><div className="v">{activeLeads.length}</div><div className="cell-sub">Active leads</div></div>
              <div><div className="v">{inrShort(activeLeads.reduce((s, l) => s + l.value, 0))}</div><div className="cell-sub">Pipeline value</div></div>
            </div>
          </section>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Recent clients</h2>
          <div className="end"><button className="btn btn-ghost btn-sm" onClick={() => go('clients')}>All clients <ArrowRight size={14} aria-hidden="true" /></button></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Client</th><th>Services</th><th>Added</th><th>Pending documents</th><th>Status</th></tr></thead>
            <tbody>
              {S.clients.slice(0, 5).map(c => {
                const docs = outstandingDocs(S, c.id);
                const status = late.some(i => i.client_id === c.id) ? ['danger', 'Fees overdue'] : docs.length ? ['warn', 'Docs pending'] : ['ok', 'Active'];
                return (
                  <tr key={c.id}>
                    <td><div className="cell-main">{c.name}</div><div className="cell-sub mono">{c.gstin || c.pan || ''}</div></td>
                    <td><ServiceBadges services={c.services} /></td>
                    <td className="muted num" style={{ whiteSpace: 'nowrap' }}>{fmtDate(c.created_at)}</td>
                    <td>{docs.length ? <span className="small">{docs.slice(0, 2).map(d => d.name).join(', ')}{docs.length > 2 ? ` +${docs.length - 2}` : ''}</span> : <span className="muted">None</span>}</td>
                    <td><span className={`badge tone-${status[0]}`}>{status[1]}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!S.clients.length && (
          <div className="empty"><UsersThree size={28} />No clients yet.<br /><button className="btn btn-primary" onClick={() => openModal('client')}>Add your first client</button></div>
        )}
      </section>
    </>
  );
}

export const ServiceBadges = ({ services }) =>
  services ? <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>{services.split(',').map(s => <span key={s} className="badge">{s}</span>)}</span> : <span className="muted">None</span>;
