import { useApp } from '../App.jsx';
import { PageHead } from '../components.jsx';
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
    ['Compliance filed on time', pct(onTime, filed.length), `${onTime} of ${filed.length} returns`],
    ['Documents received', pct(docsReceived, S.documents.length), `${docsReceived} of ${S.documents.length} documents`],
    ['Lead conversion', pct(won.length, S.leads.length), `${won.length} of ${S.leads.length} leads won (${inrShort(won.reduce((s, l) => s + l.value, 0))})`],
    ['Fees collected', pct(paid.reduce((s, i) => s + i.total, 0), S.invoices.reduce((s, i) => s + i.total, 0)), avgDaysToPay == null ? 'No payments yet' : `Clients pay in ${avgDaysToPay} days on average`],
  ];

  const serviceCounts = {};
  S.clients.forEach(c => c.services.split(',').filter(Boolean).forEach(s => { serviceCounts[s] = (serviceCounts[s] || 0) + 1; }));
  const services = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1]);
  const maxService = Math.max(1, ...services.map(([, n]) => n));

  return (
    <>
      <PageHead title="Reports" desc="Practice performance, revenue trends aur compliance rates. Sab numbers aapke live data se." />

      <section className="card ledger" aria-label="Key rates">
        {kpis.map(([label, value, sub]) => (
          <div key={label}>
            <div className="label">{label}</div>
            <div className="value">{value == null ? '-' : value + '%'}</div>
            <div className="note">{sub}</div>
          </div>
        ))}
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>Billed vs collected, last 6 months</h2></div>
          <div className="card-body">
            <div className="bars" role="img" aria-label="Monthly billed and collected amounts. Exact figures are in the table below.">
              {months.map(m => (
                <div className="bar-group" key={m.label} tabIndex={0} aria-label={`${m.label}: billed ${inr(m.billed)}, collected ${inr(m.collected)}`}>
                  <div className="bar" style={{ height: (m.billed / maxBar * 100) + '%', background: 'var(--series-1)' }} />
                  <div className="bar" style={{ height: (m.collected / maxBar * 100) + '%', background: 'var(--series-2)' }} />
                  <div className="bar-tip">
                    <div className="strong" style={{ marginBottom: 4 }}>{m.label}</div>
                    <div className="num"><i style={{ background: 'var(--series-1)' }} />Billed {inr(m.billed)}</div>
                    <div className="num"><i style={{ background: 'var(--series-2)' }} />Collected {inr(m.collected)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="bar-labels" aria-hidden="true">{months.map(m => <span key={m.label}>{m.label}</span>)}</div>
            <div className="legend"><span><i style={{ background: 'var(--series-1)' }} />Billed</span><span><i style={{ background: 'var(--series-2)' }} />Collected</span></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Month</th><th className="r">Billed</th><th className="r">Collected</th></tr></thead>
              <tbody>
                {months.map(m => (
                  <tr key={m.label}><td>{m.label}</td><td className="r num">{inr(m.billed)}</td><td className="r num">{inr(m.collected)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>Clients by service</h2></div>
            <div className="card-body">
              {services.map(([s, n]) => (
                <div className="hbar" key={s}>
                  <span>{s}</span>
                  <div className="b" style={{ width: (n / maxService * 100) + '%' }} aria-hidden="true" />
                  <b>{n}</b>
                </div>
              ))}
              {!services.length && <div className="empty">No clients yet.</div>}
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Pipeline by stage</h2></div>
            <div className="card-body">
              {[['new', 'New'], ['qualifying', 'Qualifying'], ['proposal', 'Proposal'], ['won', 'Won']].map(([key, label]) => {
                const list = S.leads.filter(l => l.stage === key);
                return (
                  <div className="kv" key={key}>
                    <span>{label} <span className="muted num">({list.length})</span></span>
                    <b>{inr(list.reduce((s, l) => s + l.value, 0))}</b>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
