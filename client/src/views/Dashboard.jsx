import { useApp } from '../App.jsx';
import { fmtDate, groupFilings, inrShort, outstandingDocs, overdue, thisMonth, unfiled, unpaid, urgency, urgencyColor } from '../lib.js';

export default function Dashboard() {
  const { S, go } = useApp();
  const late = overdue(S);
  const pending = unfiled(S);
  const activeLeads = S.leads.filter(l => l.stage !== 'won');
  const openTasks = S.tasks.filter(t => !t.done_at);

  const stats = [
    ['teal', '👥', 'Total Clients', S.clients.length, `↑ ${S.clients.filter(c => thisMonth(c.created_at)).length} this month`, 'up'],
    ['amber', '⏰', 'Pending Deadlines', pending.length, `${pending.filter(f => f.days_left < 7).length} urgent (7 days)`, 'down'],
    ['emerald', '💰', 'Fees Collected', inrShort(S.invoices.filter(i => thisMonth(i.paid_at)).reduce((s, i) => s + i.total, 0)), 'This month', 'up'],
    ['rose', '📬', 'Pending Fees', inrShort(unpaid(S).reduce((s, i) => s + i.total, 0)), `${new Set(late.map(i => i.client_id)).size} clients overdue`, 'down'],
  ];

  const activity = [
    ['Chat Queries Today', S.messageCount, 'var(--teal)'],
    ['Document Reminders Sent', S.clients.reduce((s, c) => s + Math.max(0, ...outstandingDocs(S, c.id).map(d => d.reminder_count)), 0), 'var(--amber)'],
    ['Returns Ready (data received)', pending.filter(f => f.data_received).length, 'var(--emerald)'],
    ['Overdue Invoices in Recovery', late.length, 'var(--rose)'],
    ['Open Tasks', openTasks.length, 'var(--violet)'],
  ];

  return (
    <>
      <div className="stats-grid">
        {stats.map(([color, icon, label, value, sub, dir]) => (
          <div className={`stat-card ${color}`} key={label}>
            <div className="stat-icon">{icon}</div>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
            <div className={`stat-change ${dir}`}>{sub}</div>
          </div>
        ))}
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-header">
            <span>🔥</span>
            <span className="card-title">Upcoming Compliance Deadlines</span>
            <span className="card-action" onClick={() => go('compliance')}>View All →</span>
          </div>
          <div className="card-body">
            {groupFilings(pending).slice(0, 5).map(g => {
              const f = g[0];
              const u = urgency(f.days_left);
              return (
                <div className="deadline-item" key={f.id}>
                  <div className="deadline-dot" style={{ background: urgencyColor[u] }}></div>
                  <div className="deadline-info">
                    <div className="deadline-name">{f.return_type}: {f.period}</div>
                    <div className="deadline-client">{g.length} client{g.length > 1 ? 's' : ''} pending</div>
                  </div>
                  <div className={`deadline-date ${{ urgent: 'urgent', warning: 'soon', ok: 'ok' }[u]}`}>{fmtDate(f.due_date, { day: '2-digit', month: 'short' })}</div>
                </div>
              );
            })}
            {!pending.length && <div className="empty">No pending deadlines 🎉</div>}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header">
              <span>🤖</span>
              <span className="card-title">Automation Activity</span>
              <span className="ai-badge" style={S.settings.n8nBaseUrl ? {} : { background: 'var(--slate)' }}>{S.settings.n8nBaseUrl ? 'n8n Live' : 'n8n off'}</span>
            </div>
            <div className="card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activity.map(([label, value, color]) => (
                  <div className="row-between" key={label}>
                    <span className="text-sm">{label}</span>
                    <span className="font-semibold" style={{ color }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span>📊</span>
              <span className="card-title">Lead Pipeline</span>
              <span className="card-action" onClick={() => go('leads')}>View →</span>
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="tile"><div className="big-num" style={{ color: 'var(--teal)' }}>{activeLeads.length}</div><div className="text-xs text-muted">Active Leads</div></div>
                <div className="tile"><div className="big-num" style={{ color: 'var(--emerald)' }}>{inrShort(activeLeads.reduce((s, l) => s + l.value, 0))}</div><div className="text-xs text-muted">Pipeline Value</div></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <span>👥</span>
          <span className="card-title">Recent Clients</span>
          <span className="card-action" onClick={() => go('clients')}>View All Clients →</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Client Name</th><th>Services</th><th>Added</th><th>Pending Doc</th><th>Status</th></tr></thead>
            <tbody>
              {S.clients.slice(0, 5).map(c => {
                const docs = outstandingDocs(S, c.id);
                const status = late.some(i => i.client_id === c.id) ? ['rose', '🚨 Fees Overdue'] : docs.length ? ['amber', '⚠ Doc Pending'] : ['emerald', '✓ Active'];
                return (
                  <tr key={c.id}>
                    <td><div style={{ fontWeight: 600 }}>{c.name}</div><div className="text-xs text-muted">{c.gstin ? `GST: ${c.gstin}` : c.pan ? `PAN: ${c.pan}` : ''}</div></td>
                    <td><ServiceBadges services={c.services} /></td>
                    <td className="text-sm text-muted">{fmtDate(c.created_at)}</td>
                    <td>{docs.length ? docs.slice(0, 2).map(d => <span key={d.id} className={`badge badge-${d.status === 'missing' ? 'rose' : 'amber'}`} style={{ marginRight: 4 }}>{d.name}</span>) : '-'}</td>
                    <td><span className={`badge badge-${status[0]}`}>{status[1]}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!S.clients.length && <div className="empty">No clients yet. Click “+ New Client”.</div>}
        </div>
      </div>
    </>
  );
}

export const ServiceBadges = ({ services }) =>
  services ? services.split(',').map(s => <span key={s} className="badge badge-teal" style={{ marginRight: 4 }}>{s}</span>) : '-';
