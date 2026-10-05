import { useApp } from '../App.jsx';
import { inr, inrShort } from '../lib.js';

const pct = (a, b) => (b ? Math.round(a / b * 100) : null);
const days = (from, to) => (new Date(to.slice(0, 10)) - new Date(from.slice(0, 10))) / 86400000;

export default function Reports() {
  const { S } = useApp();

  // Last 6 months: billed (by issue date) vs collected (by paid date).
  const months = Array.from({ length: 6 }, (_, k) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - 5 + k, 1);
    const key = d.toLocaleDateString('en-CA').slice(0, 7);
    return {
      label: d.toLocaleDateString('en-GB', { month: 'short' }),
      billed: S.invoices.filter(i => i.issue_date.startsWith(key)).reduce((s, i) => s + i.total, 0),
      collected: S.invoices.filter(i => i.paid_at?.startsWith(key)).reduce((s, i) => s + i.total, 0),
    };
  });
  const maxBar = Math.max(1, ...months.flatMap(m => [m.billed, m.collected]));

  const paid = S.invoices.filter(i => i.paid_at);
  const avgDaysToPay = paid.length ? Math.round(paid.reduce((s, i) => s + days(i.issue_date, i.paid_at), 0) / paid.length) : null;
  const filed = S.filings.filter(f => f.filed_at);
  const onTime = filed.filter(f => f.filed_at <= f.due_date).length;
  const docsReceived = S.documents.filter(d => d.status === 'received').length;
  const won = S.leads.filter(l => l.stage === 'won');

  const kpis = [
    ['Compliance filed on time', pct(onTime, filed.length), `${onTime} of ${filed.length} returns`, 'var(--emerald)'],
    ['Documents received', pct(docsReceived, S.documents.length), `${docsReceived} of ${S.documents.length} documents`, 'var(--teal)'],
    ['Lead conversion', pct(won.length, S.leads.length), `${won.length} of ${S.leads.length} leads won (${inrShort(won.reduce((s, l) => s + l.value, 0))})`, 'var(--violet)'],
    ['Fees collected', pct(paid.reduce((s, i) => s + i.total, 0), S.invoices.reduce((s, i) => s + i.total, 0)), avgDaysToPay == null ? 'No payments yet' : `Clients pay in ${avgDaysToPay} days on average`, 'var(--amber)'],
  ];

  const serviceCounts = {};
  S.clients.forEach(c => c.services.split(',').filter(Boolean).forEach(s => { serviceCounts[s] = (serviceCounts[s] || 0) + 1; }));
  const services = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <div className="section-title">📈 Reports & Analytics</div>
      <div className="section-desc">Practice performance, revenue trends, and compliance rates. Sab numbers aapke live data se.</div>

      <div className="stats-grid">
        {kpis.map(([label, value, sub, color]) => (
          <div className="stat-card" key={label}>
            <div className="stat-label">{label}</div>
            <div className="stat-value" style={{ color }}>{value == null ? '-' : value + '%'}</div>
            <div className="meter"><div style={{ width: (value || 0) + '%', background: color }}></div></div>
            <div className="stat-change" style={{ color: 'var(--text-muted)' }}>{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-title">💰 Billed vs Collected (last 6 months)</div>
          <div className="bar-chart" role="img" aria-label="Monthly billed and collected amounts">
            {months.map(m => (
              <div className="bar-group" key={m.label}>
                <div className="bars">
                  <div className="bar" title={`Billed ${m.label}: ${inr(m.billed)}`} style={{ height: (m.billed / maxBar * 100) + '%', background: 'var(--teal)' }}></div>
                  <div className="bar" title={`Collected ${m.label}: ${inr(m.collected)}`} style={{ height: (m.collected / maxBar * 100) + '%', background: 'var(--emerald)' }}></div>
                </div>
                <div className="bar-label">{m.label}</div>
              </div>
            ))}
          </div>
          <div className="legend"><span><i style={{ background: 'var(--teal)' }}></i>Billed</span><span><i style={{ background: 'var(--emerald)' }}></i>Collected</span></div>
          <table style={{ marginTop: 12 }}>
            <tbody>
              {months.map(m => (
                <tr key={m.label}><td className="text-sm">{m.label}</td><td className="text-sm">{inr(m.billed)}</td><td className="text-sm" style={{ color: 'var(--emerald)' }}>{inr(m.collected)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="panel">
            <div className="panel-title">🧩 Clients by Service</div>
            {services.map(([s, n]) => (
              <div key={s} style={{ marginBottom: 10 }}>
                <div className="row-between text-sm"><span>{s}</span><span className="font-semibold">{n}</span></div>
                <div className="meter"><div style={{ width: pct(n, S.clients.length) + '%', background: 'var(--teal)' }}></div></div>
              </div>
            ))}
            {!services.length && <div className="empty">No clients yet.</div>}
          </div>

          <div className="panel">
            <div className="panel-title">📊 Pipeline by Stage</div>
            {[['new', 'New'], ['qualifying', 'Qualifying'], ['proposal', 'Proposal'], ['won', 'Won']].map(([key, label]) => {
              const list = S.leads.filter(l => l.stage === key);
              return (
                <div className="row-between text-sm" key={key} style={{ padding: '6px 0', borderBottom: '1px solid var(--slate-light)' }}>
                  <span>{label} ({list.length})</span>
                  <span className="font-semibold">{inr(list.reduce((s, l) => s + l.value, 0))}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
