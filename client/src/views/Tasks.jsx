import { useState } from 'react';
import { useApp } from '../App.jsx';
import { fmtDate, todayIso } from '../lib.js';

const PRIORITY = { high: ['rose', 'High'], normal: ['slate', 'Normal'], low: ['teal', 'Low'] };
const SOURCE = { chat: '💬 From chat', documents: '📄 From doc reminders', manual: '' };

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
      <div className="section-title">✅ Task Management</div>
      <div className="section-desc">Team ke sare tasks. Chat mein CA ko escalate hue sawaal aur 3 baar remind karne ke baad bhi pending documents yahan apne aap aa jaate hain.</div>

      <form className="panel" onSubmit={add} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <input className="form-input" style={{ flex: '2 1 240px' }} placeholder="New task, e.g. File GSTR-3B for Mehta" required maxLength={300} value={form.title} onChange={set('title')} aria-label="Task title" />
        <select className="form-input" style={{ flex: '1 1 150px' }} value={form.clientId} onChange={set('clientId')} aria-label="Client">
          <option value="">No client</option>
          {S.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="form-input" style={{ flex: '1 1 130px' }} value={form.assigneeId} onChange={set('assigneeId')} aria-label="Assign to">
          <option value="">Unassigned</option>
          {S.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input className="form-input" style={{ flex: '0 1 150px' }} type="date" value={form.dueDate} onChange={set('dueDate')} aria-label="Due date" />
        <select className="form-input" style={{ flex: '0 1 110px' }} value={form.priority} onChange={set('priority')} aria-label="Priority">
          <option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
        </select>
        <button className="btn btn-primary">+ Add Task</button>
      </form>

      <div className="doc-filters" style={{ marginBottom: 12 }}>
        {[['open', 'Open'], ['mine', 'Assigned to me'], ['done', 'Done'], ['all', 'All']].map(([key, label]) => (
          <div key={key} className={'filter-tab' + (filter === key ? ' active' : '')} onClick={() => setFilter(key)}>{label}</div>
        ))}
      </div>

      <div className="card">
        <table>
          <thead><tr><th style={{ paddingTop: 14, width: 30 }}></th><th style={{ paddingTop: 14 }}>Task</th><th style={{ paddingTop: 14 }}>Client</th><th style={{ paddingTop: 14 }}>Assigned To</th><th style={{ paddingTop: 14 }}>Due</th><th style={{ paddingTop: 14 }}>Priority</th><th style={{ paddingTop: 14 }}></th></tr></thead>
          <tbody>
            {tasks.map(t => {
              const late = !t.done_at && t.due_date && t.due_date < todayIso();
              return (
                <tr key={t.id} className={'task-row' + (t.done_at ? ' done' : '')}>
                  <td><input type="checkbox" checked={!!t.done_at} aria-label="Done" onChange={e => act('PATCH', `/api/tasks/${t.id}`, { done: e.target.checked })} /></td>
                  <td>
                    <div className="task-title" style={{ fontWeight: 500 }}>{t.title}</div>
                    {SOURCE[t.source] && <div className="text-xs text-muted">{SOURCE[t.source]}</div>}
                  </td>
                  <td className="text-sm">{t.client_name || '-'}</td>
                  <td>
                    <select className="form-input" style={{ padding: '3px 6px', fontSize: 12 }} value={t.assignee_id || ''} aria-label="Assign to"
                      onChange={e => act('PATCH', `/api/tasks/${t.id}`, { assigneeId: e.target.value })}>
                      <option value="">Unassigned</option>
                      {S.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </td>
                  <td className="text-sm" style={{ color: late ? 'var(--rose)' : undefined, fontWeight: late ? 600 : undefined }}>
                    {t.done_at ? `Done ${fmtDate(t.done_at)}` : t.due_date ? fmtDate(t.due_date) : '-'}
                  </td>
                  <td><span className={`badge badge-${PRIORITY[t.priority][0]}`}>{PRIORITY[t.priority][1]}</span></td>
                  <td><div className="icon-btn" title="Delete task" role="button" onClick={() => act('DELETE', `/api/tasks/${t.id}`)}>🗑</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!tasks.length && <div className="empty">No tasks here.</div>}
      </div>
    </>
  );
}
