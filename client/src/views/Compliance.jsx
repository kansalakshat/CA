import { ArrowCounterClockwise, CalendarCheck, Check, Plus } from '@phosphor-icons/react';
import { useApp } from '../App.jsx';
import { Due, PageHead } from '../components.jsx';
import { fmtDate, groupFilings, inr, thisMonth, unfiled } from '../lib.js';

export default function Compliance() {
  const { S, openModal } = useApp();
  const pending = unfiled(S);
  const filed = S.filings.filter(f => f.filed_at).sort((a, b) => b.filed_at.localeCompare(a.filed_at));
  const urgent = pending.filter(f => f.days_left < 7).length;
  const filedNow = S.filings.filter(f => thisMonth(f.filed_at)).length;

  const summary = [
    ['Urgent, under 7 days', urgent, urgent ? 'danger' : ''],
    ['Upcoming, 30 days', pending.filter(f => f.days_left >= 7 && f.days_left <= 30).length, ''],
    ['Filed this month', filedNow, filedNow ? 'ok' : ''],
    ['Client data missing', pending.filter(f => !f.data_received).length, ''],
  ];

  return (
    <>
      <PageHead title="Compliance tracker" desc="GST, ITR, TDS, ROC returns per client. Data received tick karein aur tax figures bharein, net GST payable apne aap calculate hota hai.">
        <button className="btn btn-primary" onClick={() => openModal('filing')}><Plus size={16} weight="bold" aria-hidden="true" />Add filing</button>
      </PageHead>

      <section className="card ledger" aria-label="Filing summary">
        {summary.map(([label, n, tone]) => (
          <div key={label}><div className="label">{label}</div><div className={'value ' + tone}>{n}</div></div>
        ))}
      </section>

      <h2 className="section-label">Pending returns</h2>
      {groupFilings(pending).map(g => <PendingGroup key={g[0].id} g={g} />)}
      {!pending.length && <div className="card empty"><CalendarCheck size={28} />Nothing pending.</div>}

      {filed.length > 0 && <h2 className="section-label">Recently filed</h2>}
      {groupFilings(filed).slice(0, 10).map(g => <FiledGroup key={g[0].id} g={g} />)}
    </>
  );
}

function PendingGroup({ g }) {
  const { act } = useApp();
  const f = g[0];
  const waiting = g.filter(x => !x.data_received).length;
  const save = (x, field, value) => act('PATCH', `/api/filings/${x.id}`, { [field]: value });

  return (
    <section className="card filing" aria-label={`${f.return_type} ${f.period}`}>
      <div className="filing-head">
        <div className="info">
          <h3>{f.return_type} · {f.period}</h3>
          <div className="cell-sub">{g.length} client{g.length > 1 ? 's' : ''} pending{waiting ? `, ${waiting} waiting for client data` : ''}</div>
        </div>
        <div className="row">
          <span className="num small muted">{fmtDate(f.due_date)}</span>
          <Due days={f.days_left} />
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Client</th><th>Data</th><th className="r">Output tax</th><th className="r">Input tax credit</th><th className="r">Net payable</th><th className="r"><span className="sr-only">Action</span></th></tr></thead>
          <tbody>
            {g.map(x => (
              <tr key={x.id}>
                <td className="cell-main">{x.client_name}</td>
                <td>
                  <label className="row small" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={!!x.data_received} onChange={e => save(x, 'dataReceived', e.target.checked)} /> Data received
                  </label>
                </td>
                {/* Saves when you leave the box, not on every keystroke. `key` resets the box after a reload. */}
                <td className="r"><input key={'o' + x.output_tax} className="input sm num" style={{ width: 120 }} type="number" inputMode="decimal" min="0" defaultValue={x.output_tax}
                  aria-label={`Output tax, ${x.client_name}`} onBlur={e => Number(e.target.value) !== x.output_tax && save(x, 'outputTax', e.target.value)} /></td>
                <td className="r"><input key={'i' + x.input_tax_credit} className="input sm num" style={{ width: 120 }} type="number" inputMode="decimal" min="0" defaultValue={x.input_tax_credit}
                  aria-label={`Input tax credit, ${x.client_name}`} onBlur={e => Number(e.target.value) !== x.input_tax_credit && save(x, 'inputTaxCredit', e.target.value)} /></td>
                <td className="r num strong" style={{ whiteSpace: 'nowrap' }}>
                  {x.output_tax >= x.input_tax_credit
                    ? inr(x.output_tax - x.input_tax_credit)
                    : <span style={{ color: 'var(--ok)' }}>{inr(x.input_tax_credit - x.output_tax)} ITC carried forward</span>}
                </td>
                <td className="r"><button className="btn btn-secondary btn-sm" onClick={() => save(x, 'filed', true)}><Check size={14} weight="bold" aria-hidden="true" />Filed</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FiledGroup({ g }) {
  const { act } = useApp();
  const f = g[0];
  return (
    <section className="card filing done" aria-label={`${f.return_type} ${f.period}, filed`}>
      <div className="filing-head">
        <div className="info">
          <h3>{f.return_type} · {f.period}</h3>
          <div className="cell-sub">{g.map(x => x.client_name).join(', ')} · filed {fmtDate(f.filed_at)}</div>
        </div>
        <span className="badge tone-ok"><Check size={13} weight="bold" aria-hidden="true" />Completed</span>
        <div className="row">
          {g.map(x => (
            <button key={x.id} className="icon-btn sm" title={`Undo: mark ${x.client_name} as not filed`} aria-label={`Undo: mark ${x.client_name} as not filed`}
              onClick={() => act('PATCH', `/api/filings/${x.id}`, { filed: false })}><ArrowCounterClockwise size={15} /></button>
          ))}
        </div>
      </div>
    </section>
  );
}
