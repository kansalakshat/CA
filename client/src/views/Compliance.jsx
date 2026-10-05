import { useApp } from '../App.jsx';
import { fmtDate, groupFilings, inr, thisMonth, unfiled, urgency, urgencyColor } from '../lib.js';

const typeIcon = t => (/GST/i.test(t) ? ['📋', 'teal'] : /TDS/i.test(t) ? ['💼', 'amber'] : /ITR/i.test(t) ? ['📊', 'violet'] : ['🏢', 'emerald']);

export default function Compliance() {
  const { S, openModal } = useApp();
  const pending = unfiled(S);
  const filed = S.filings.filter(f => f.filed_at).sort((a, b) => b.filed_at.localeCompare(a.filed_at));

  const summary = [
    ['var(--rose)', pending.filter(f => f.days_left < 7).length, '🚨 Urgent (<7 days)'],
    ['var(--amber)', pending.filter(f => f.days_left >= 7 && f.days_left <= 30).length, '⚠️ Upcoming (30 days)'],
    ['var(--emerald)', S.filings.filter(f => thisMonth(f.filed_at)).length, '✅ Filed This Month'],
    ['var(--teal)', pending.filter(f => !f.data_received).length, '📭 Client Data Missing'],
  ];

  return (
    <>
      <div className="section-title">🔔 Compliance Deadline Tracker</div>
      <div className="section-desc">GST, ITR, TDS, ROC returns per client. Data received tick karein aur tax figures bharein, net GST payable apne aap calculate hota hai.</div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {summary.map(([color, n, label]) => (
          <div className="summary-box" key={label}><div className="num" style={{ color }}>{n}</div><div className="lbl">{label}</div></div>
        ))}
        <button className="btn btn-primary" style={{ marginLeft: 'auto', alignSelf: 'center' }} onClick={() => openModal('filing')}>+ Add Filing</button>
      </div>

      <div className="month-header">Pending Returns</div>
      {groupFilings(pending).map(g => <PendingGroup key={g[0].id} g={g} />)}
      {!pending.length && <div className="card empty">Nothing pending 🎉</div>}

      {filed.length > 0 && <div className="month-header" style={{ marginTop: 24 }}>Recently Filed</div>}
      {groupFilings(filed).slice(0, 10).map(g => <FiledGroup key={g[0].id} g={g} />)}
    </>
  );
}

function PendingGroup({ g }) {
  const { act } = useApp();
  const f = g[0];
  const [icon, color] = typeIcon(f.return_type);
  const u = urgency(f.days_left);
  const left = f.days_left < 0 ? `${-f.days_left} days late!` : f.days_left === 0 ? 'Due today!' : `${f.days_left} days left`;
  const save = (x, field, value) => act('PATCH', `/api/filings/${x.id}`, { [field]: value });

  return (
    <div className={`compliance-item ${u}`} style={{ alignItems: 'flex-start' }}>
      <div className="comp-type-icon" style={{ background: `var(--${color}-light)` }}>{icon}</div>
      <div className="comp-info">
        <div className="comp-title">{f.return_type}: {f.period}</div>
        <div className="comp-meta">{g.length} client{g.length > 1 ? 's' : ''} pending • {g.filter(x => !x.data_received).length} waiting for client data</div>
        <table className="filing-table" style={{ marginTop: 8 }}>
          <thead><tr><th>Client</th><th>Data</th><th>Output Tax</th><th>Input Tax Credit</th><th>Net Payable</th><th></th></tr></thead>
          <tbody>
            {g.map(x => (
              <tr key={x.id}>
                <td style={{ fontWeight: 500 }}>{x.client_name}</td>
                <td>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!x.data_received} onChange={e => save(x, 'dataReceived', e.target.checked)} /> Data received
                  </label>
                </td>
                {/* Saves when you leave the box, not on every keystroke. `key` resets the box after a reload. */}
                <td><input key={'o' + x.output_tax} className="form-input" type="number" min="0" defaultValue={x.output_tax} aria-label="Output tax"
                  onBlur={e => Number(e.target.value) !== x.output_tax && save(x, 'outputTax', e.target.value)} /></td>
                <td><input key={'i' + x.input_tax_credit} className="form-input" type="number" min="0" defaultValue={x.input_tax_credit} aria-label="Input tax credit"
                  onBlur={e => Number(e.target.value) !== x.input_tax_credit && save(x, 'inputTaxCredit', e.target.value)} /></td>
                <td style={{ fontWeight: 600 }}>
                  {x.output_tax >= x.input_tax_credit
                    ? inr(x.output_tax - x.input_tax_credit)
                    : <span style={{ color: 'var(--emerald)' }}>{inr(x.input_tax_credit - x.output_tax)} ITC carry forward</span>}
                </td>
                <td><button className="btn btn-outline btn-sm" onClick={() => save(x, 'filed', true)}>✅ Filed</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="comp-due">
        <div className="comp-due-date" style={{ color: urgencyColor[u] }}>{fmtDate(f.due_date)}</div>
        <div className="comp-due-label" style={{ color: urgencyColor[u] }}>{left}</div>
      </div>
    </div>
  );
}

function FiledGroup({ g }) {
  const { act } = useApp();
  const f = g[0];
  return (
    <div className="compliance-item done">
      <div className="comp-type-icon" style={{ background: 'var(--slate-light)' }}>✅</div>
      <div className="comp-info">
        <div className="comp-title">{f.return_type}: {f.period}</div>
        <div className="comp-meta">{g.map(x => x.client_name).join(', ')} • Filed {fmtDate(f.filed_at)}</div>
      </div>
      <div className="comp-due">
        <div className="comp-due-date" style={{ color: 'var(--text-muted)' }}>{fmtDate(f.due_date)}</div>
        <div className="comp-due-label" style={{ color: 'var(--emerald)' }}>Completed ✓</div>
      </div>
      <div className="comp-actions">
        {g.map(x => (
          <div key={x.id} className="icon-btn" title={`Undo: mark ${x.client_name} as not filed`} role="button"
            onClick={() => act('PATCH', `/api/filings/${x.id}`, { filed: false })}>↩</div>
        ))}
      </div>
    </div>
  );
}
