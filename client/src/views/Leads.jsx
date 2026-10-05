import { ArrowLeft, ArrowRight, Plus } from '@phosphor-icons/react';
import { useApp } from '../App.jsx';
import { PageHead } from '../components.jsx';
import { fmtDate, inr, inrShort } from '../lib.js';

const STAGES = [['new', 'New enquiry'], ['qualifying', 'Qualifying'], ['proposal', 'Proposal sent'], ['won', 'Won, onboarding']];
const scoreTone = s => (s >= 75 ? 'ok' : s >= 40 ? 'warn' : 'danger');

export default function Leads() {
  const { S, act, openModal } = useApp();
  const move = (lead, stage) => act('PATCH', `/api/leads/${lead.id}`, { stage });

  return (
    <>
      <PageHead title="Lead pipeline" desc="Website aur WhatsApp enquiries: qualify, proposal, won. Arrows se stage badlein.">
        <button className="btn btn-primary" onClick={() => openModal('lead')}><Plus size={16} weight="bold" aria-hidden="true" />Add lead</button>
      </PageHead>

      <div className="kanban">
        {STAGES.map(([key, title], idx) => {
          const leads = S.leads.filter(l => l.stage === key);
          return (
            <section className="kanban-col" key={key} aria-label={title}>
              <div className="kanban-col-head">
                {title} <span className="count">{leads.length}</span>
                <span className="sum">{inrShort(leads.reduce((s, l) => s + l.value, 0))}</span>
              </div>
              {leads.map(l => (
                <article className="lead" key={l.id}>
                  <div className="lead-name">{l.name}</div>
                  {l.service && <div className="lead-service">{l.service}</div>}
                  <div className="lead-meta">
                    <span className="badge">{l.source}</span>
                    {key !== 'won' && <span className={'badge tone-' + scoreTone(l.score)}>Score {l.score}</span>}
                    <span>Added {fmtDate(l.created_at, { day: 'numeric', month: 'short' })}</span>
                  </div>
                  <div className="lead-foot">
                    {idx > 0 && <button className="icon-btn sm bare" aria-label={`Move ${l.name} back to ${STAGES[idx - 1][1]}`} title={`Back to ${STAGES[idx - 1][1]}`} onClick={() => move(l, STAGES[idx - 1][0])}><ArrowLeft size={15} /></button>}
                    {idx < 3 && <button className="icon-btn sm bare" aria-label={`Move ${l.name} to ${STAGES[idx + 1][1]}`} title={`Move to ${STAGES[idx + 1][1]}`} onClick={() => move(l, STAGES[idx + 1][0])}><ArrowRight size={15} /></button>}
                    <span className="value">{inr(l.value)}</span>
                  </div>
                </article>
              ))}
              {!leads.length && <div className="empty small" style={{ padding: '20px 8px' }}>No leads here.</div>}
            </section>
          );
        })}
      </div>
    </>
  );
}
