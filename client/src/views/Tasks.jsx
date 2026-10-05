import { useState } from 'react';
import { CheckSquare, Plus, Trash } from '@phosphor-icons/react';
import { useApp } from '../App.jsx';
import { ConfirmButton, Due, PageHead } from '../components.jsx';
import { daysFromToday, fmtDate } from '../lib.js';

const PRIORITY = { high: ['danger', 'High'], normal: ['', 'Normal'], low: ['accent', 'Low'] };
const SOURCE = { chat: 'From client chat', documents: 'From document reminders', manual: '' };
const FILTERS = [['open', 'Open'], ['mine', 'Assigned to me'], ['done', 'Done'], ['all', 'All']];

export default function Tasks() {
  const { S, act } = useApp();
  const [filter, setFilter] = useState('open');
  const [form, setForm] = useState({ title: '', clientId: '', assigneeId: '', dueDate: '', priority: 'normal' });
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  const tasks = S.tasks.filter(t =>
    filter === 'all' || (filter === 'open' && !t.done_at) || (filter === 'mine' && !t.done_at && t.assignee_id === S.me.id) || (filter === 'done' && t.done_at));

  async function add(e) {
    e.preventDefault();
    if (await act('POST', '/api/tasks', form, 'Task added')) setForm({ title: '', clientId: '', assigneeId: '', dueDate: '', priority: 'normal' });
  }

  return (
    <>
      <PageHead title="Tasks" desc="Team ke sare tasks. Chat mein CA ko escalate hue sawaal aur 3 baar remind karne ke baad bhi pending documents yahan apne aap aa jaate hain." />

      <form className="card" onSubmit={add} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: 12, marginBottom: 20 }}>
        <input className="input" style={{ flex: '2 1 240px' }} placeholder="New task, e.g. File GSTR-3B for Mehta…" autoComplete="off" required maxLength={300} value={form.title} onChange={set('title')} aria-label="Task title" />
        <select className="input" style={{ flex: '1 1 150px' }} value={form.clientId} onChange={set('clientId')} aria-label="Client">
          <option value="">No client</option>
          {S.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input" style={{ flex: '1 1 140px' }} value={form.assigneeId} onChange={set('assigneeId')} aria-label="Assign to">
          <option value="">Unassigned</option>
          {S.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input className="input" style={{ flex: '0 1 160px' }} type="date" value={form.dueDate} onChange={set('dueDate')} aria-label="Due date" />
        <select className="input" style={{ flex: '0 1 110px' }} value={form.priority} onChange={set('priority')} aria-label="Priority">
          <option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
        </select>
        <button className="btn btn-primary"><Plus size={16} weight="bold" aria-hidden="true" />Add task</button>
      </form>

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Filter tasks">
          {FILTERS.map(([key, label]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}
        </div>
      </div>

      <section className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th style={{ width: 36 }}><span className="sr-only">Done</span></th><th>Task</th><th>Client</th><th>Assigned to</th><th>Due</th><th>Priority</th><th className="r"><span className="sr-only">Delete</span></th></tr></thead>
            <tbody>
              {tasks.map(t => (
                <tr key={t.id} className={t.done_at ? 'done-row' : undefined}>
                  <td><input type="checkbox" checked={!!t.done_at} aria-label={`Mark "${t.title}" done`} onChange={e => act('PATCH', `/api/tasks/${t.id}`, { done: e.target.checked })} /></td>
                  <td>
                    <div className="cell-main">{t.title}</div>
                    {SOURCE[t.source] && <div className="cell-sub">{SOURCE[t.source]}</div>}
                  </td>
                  <td className="small">{t.client_name || <span className="muted">-</span>}</td>
                  <td>
                    <select className="input sm" style={{ width: 'auto', maxWidth: 170 }} value={t.assignee_id || ''} aria-label={`Assign "${t.title}" to`}
                      onChange={e => act('PATCH', `/api/tasks/${t.id}`, { assigneeId: e.target.value })}>
                      <option value="">Unassigned</option>
                      {S.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {t.done_at ? <span className="small">Done {fmtDate(t.done_at)}</span>
                      : t.due_date ? <><div className="small num">{fmtDate(t.due_date)}</div><Due days={daysFromToday(t.due_date)} /></>
                        : <span className="muted">-</span>}
                  </td>
                  <td><span className={'badge' + (PRIORITY[t.priority][0] ? ' tone-' + PRIORITY[t.priority][0] : '')}>{PRIORITY[t.priority][1]}</span></td>
                  <td className="r">
                    <ConfirmButton className="icon-btn sm bare" title="Delete task" aria-label={`Delete "${t.title}"`} confirmLabel="Delete"
                      onConfirm={() => act('DELETE', `/api/tasks/${t.id}`, null, 'Task deleted')}><Trash size={16} /></ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!tasks.length && <div className="empty"><CheckSquare size={28} />No tasks here.</div>}
      </section>
    </>
  );
}
