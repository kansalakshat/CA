import { useApp } from '../App.jsx';
import { fmtDate, inr } from '../lib.js';

const STAGES = [
  ['new', '🆕 New Enquiry', { background: '#E2E8F0', color: 'var(--slate)' }],
  ['qualifying', '🤖 Qualifying', { background: 'var(--teal-light)', color: '#0C4A6E' }],
  ['proposal', '📤 Proposal Sent', { background: 'var(--violet-light)', color: '#4C1D95' }],
  ['won', '🎉 Won: Onboarding', { background: 'var(--emerald-light)', color: '#065F46' }],
];

export default function Leads() {
  const { S, act, openModal } = useApp();
  const move = (lead, stage) => act('PATCH', `/api/leads/${lead.id}`, { stage });

  return (
    <>
      <div className="row-between" style={{ marginBottom: 20 }}>
        <div>
          <div className="section-title">📊 Lead Qualification Pipeline</div>
          <div className="section-desc" style={{ marginBottom: 0 }}>Website/WhatsApp enquiries: qualify, proposal, won. Arrows se stage badlein.</div>
        </div>
        <button className="btn btn-primary" onClick={() => openModal('lead')}>+ Add Lead</button>
      </div>

      <div className="kanban">
        {STAGES.map(([key, title, countStyle], idx) => {
          const leads = S.leads.filter(l => l.stage === key);
          return (
            <div className="kanban-col" key={key}>
              <div className="kanban-col-header">
                <div className="kanban-count" style={countStyle}>{leads.length}</div>
                <span className="kanban-col-title">{title}</span>
              </div>
              {leads.map(l => {
                const scoreColor = l.score >= 75 ? 'var(--emerald)' : l.score >= 40 ? 'var(--amber)' : 'var(--rose)';
                return (
                  <div className="lead-card" key={l.id} style={key === 'won' ? { borderColor: 'var(--emerald)' } : undefined}>
                    <div className="lead-name">{l.name}</div>
                    <div className="lead-service">{l.service}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Added {fmtDate(l.created_at)} • score {l.score}</div>
                    {key !== 'won' && <div className="score-bar"><div className="score-fill" style={{ width: l.score + '%', background: scoreColor }}></div></div>}
                    <div className="lead-footer">
                      <span className="lead-source">{l.source}</span>
                      {idx > 0 && <button className="lead-move" title="Move back" onClick={() => move(l, STAGES[idx - 1][0])}>←</button>}
                      {idx < 3 && <button className="lead-move" title="Move forward" onClick={() => move(l, STAGES[idx + 1][0])}>→</button>}
                      <span className="lead-value">{inr(l.value)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}
