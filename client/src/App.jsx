import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, overdue, outstandingDocs, unfiled, groupFilings, fmtDate, inr, todayIso } from './lib.js';
import { ClientModal, InvoiceModal, FilingModal, LeadModal } from './components.jsx';
import Login from './views/Login.jsx';
import Dashboard from './views/Dashboard.jsx';
import Agent from './views/Agent.jsx';
import Documents from './views/Documents.jsx';
import Compliance from './views/Compliance.jsx';
import Leads from './views/Leads.jsx';
import Invoices from './views/Invoices.jsx';
import Clients from './views/Clients.jsx';
import Tasks from './views/Tasks.jsx';
import Reports from './views/Reports.jsx';
import Settings from './views/Settings.jsx';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const VIEWS = {
  dashboard: { component: Dashboard, icon: '📊', label: 'Dashboard', title: ['Dashboard', '· Aaj ka overview'] },
  agent: { component: Agent, icon: '🤖', label: 'AI Support Agent', title: ['🤖 AI Support Agent', '· WhatsApp & Email automation'] },
  documents: { component: Documents, icon: '📄', label: 'Document Hub', title: ['📄 Document Hub', '· Client documents track karein'] },
  compliance: { component: Compliance, icon: '🔔', label: 'Compliance', title: ['🔔 Compliance Tracker', '· GST, ITR, TDS, ROC deadlines'] },
  leads: { component: Leads, icon: '📊', label: 'Lead Pipeline', title: ['📊 Lead Pipeline', '· Lead qualification'] },
  invoices: { component: Invoices, icon: '🧾', label: 'Invoice & Fees', title: ['🧾 Invoice & Fees', '· Outstanding collections'] },
  clients: { component: Clients, icon: '👥', label: 'Clients', title: ['👥 Client Management', '· All clients'] },
  tasks: { component: Tasks, icon: '✅', label: 'Tasks', title: ['✅ Tasks', '· Team assignments'] },
  reports: { component: Reports, icon: '📈', label: 'Reports', title: ['📈 Reports', '· Analytics'] },
  settings: { component: Settings, icon: '⚙️', label: 'Settings', title: ['⚙️ Settings', '· Configuration'] },
};

const NAV = [
  ['Overview', ['dashboard']],
  ['AI Modules', ['agent', 'documents', 'compliance', 'leads', 'invoices']],
  ['Management', ['clients', 'tasks', 'reports']],
  ['Settings', ['settings']],
];

const MODALS = { client: ClientModal, invoice: InvoiceModal, filing: FilingModal, lead: LeadModal };

// Closes a dropdown when you click anywhere outside it.
function useClickOutside(ref, onOutside) {
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) onOutside(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onOutside]);
}

export default function App() {
  const [auth, setAuth] = useState(null);      // { user }
  const [S, setS] = useState(null);            // everything from /api/state
  const [view, setView] = useState('dashboard');
  const [modal, setModal] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  const checkAuth = useCallback(() => api('GET', '/api/auth/status').then(setAuth).catch(() => setAuth({ user: null })), []);
  useEffect(() => { checkAuth(); }, [checkAuth]);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(''), 3500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const handleError = useCallback(e => {
    if (e.status === 401) { setS(null); setAuth({ user: null }); }
    else setToastMsg('⚠️ ' + e.message);
  }, []);

  const reload = useCallback(async () => {
    try { setS(await api('GET', '/api/state')); } catch (e) { handleError(e); }
  }, [handleError]);

  useEffect(() => { if (auth?.user) reload(); }, [auth?.user?.id, reload]);

  // Run a change on the server, then reload everything. Returns the server reply, or null on error.
  const act = useCallback(async (method, url, body, okMsg) => {
    try {
      const r = await api(method, url, body);
      if (okMsg) setToastMsg(okMsg);
      await reload();
      return r;
    } catch (e) { handleError(e); return null; }
  }, [reload, handleError]);

  if (!auth) return null;
  if (!auth.user) return <Login onDone={checkAuth} />;
  if (!S) return <div className="login-wrap" style={{ color: 'white' }}>Loading…</div>;

  const ctx = { S, reload, act, toast: setToastMsg, openModal: setModal, go: setView, logout: () => api('POST', '/api/auth/logout').then(checkAuth) };
  const View = VIEWS[view].component;
  const Modal = modal && MODALS[modal];

  const badges = {
    agent: S.messageCount,
    documents: S.clients.filter(c => outstandingDocs(S, c.id).length).length,
    compliance: unfiled(S).filter(f => f.days_left < 7).length,
    leads: S.leads.filter(l => l.stage !== 'won').length,
    invoices: overdue(S).length,
  };
  const badgeClass = { documents: 'amber', leads: 'teal' };

  return (
    <AppCtx.Provider value={ctx}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo">
            <div className="brand-icon">CA</div>
            <div className="brand-text">
              <div className="brand-name">{S.settings.firmName}</div>
              <div className="brand-sub">CHARTERED ACCOUNTANTS</div>
            </div>
          </div>
        </div>

        {NAV.map(([section, ids]) => (
          <div className="sidebar-section" key={section}>
            <div className="sidebar-section-label">{section}</div>
            {ids.map(id => (
              <div key={id} className={'nav-item' + (view === id ? ' active' : '')} onClick={() => setView(id)}>
                <span className="nav-icon">{VIEWS[id].icon}</span> {VIEWS[id].label}
                {badges[id] > 0 && <span className={'nav-badge ' + (badgeClass[id] || '')}>{badges[id]}</span>}
              </div>
            ))}
          </div>
        ))}

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">{S.me.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()}</div>
            <div className="user-info">
              <div className="user-name">{S.me.name}</div>
              <div className="user-role">{S.me.role === 'partner' ? 'Partner, Admin' : 'Staff'}</div>
            </div>
            <button title="Log out" aria-label="Log out" onClick={ctx.logout}
              style={{ background: 'none', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 11, padding: '3px 7px' }}>Logout</button>
          </div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div>
            <span className="topbar-title">{VIEWS[view].title[0]}</span>
            <span className="topbar-subtitle">{VIEWS[view].title[1]}</span>
          </div>
          <div className="topbar-actions">
            <Search />
            <button className="btn btn-primary" onClick={() => setModal('client')}>+ New Client</button>
            <Notifications />
          </div>
        </div>

        <div className="content">
          <View />
        </div>
      </div>

      {Modal && <Modal onClose={() => setModal(null)} />}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </AppCtx.Provider>
  );
}

function Search() {
  const { S, go } = useApp();
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useClickOutside(ref, useCallback(() => setQ(''), []));

  const needle = q.trim().toLowerCase();
  const has = (...fields) => fields.some(f => f && String(f).toLowerCase().includes(needle));
  const results = needle.length < 2 ? [] : [
    ...S.clients.filter(c => has(c.name, c.pan, c.gstin, c.phone, c.email)).map(c => ({ key: 'c' + c.id, view: 'clients', title: `👥 ${c.name}`, sub: c.gstin || c.pan || c.phone })),
    ...S.invoices.filter(i => has(i.number, i.client_name)).map(i => ({ key: 'i' + i.id, view: 'invoices', title: `🧾 ${i.number}`, sub: `${i.client_name} • ${inr(i.total)}` })),
    ...S.tasks.filter(t => has(t.title)).map(t => ({ key: 't' + t.id, view: 'tasks', title: `✅ ${t.title}`, sub: t.done_at ? 'Done' : 'Open' })),
    ...S.leads.filter(l => has(l.name, l.service)).map(l => ({ key: 'l' + l.id, view: 'leads', title: `📊 ${l.name}`, sub: l.service })),
  ].slice(0, 12);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div className="search-box">
        <span>🔍</span>
        <input type="text" placeholder="Client, invoice, task search karein…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" />
      </div>
      {needle.length >= 2 && (
        <div className="dropdown" style={{ left: 0, right: 'auto' }}>
          {results.length ? results.map(r => (
            <div key={r.key} className="dropdown-item" onClick={() => { go(r.view); setQ(''); }}>
              {r.title}<div className="sub">{r.sub}</div>
            </div>
          )) : <div className="empty">No matches</div>}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const { S, go } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, useCallback(() => setOpen(false), []));

  const items = [
    ...(S.me.role === 'partner' ? S.invoices.filter(i => i.approval === 'pending').map(i => ({ key: 'a' + i.id, view: 'invoices', title: `⏳ Approve ${i.number}`, sub: `${i.client_name} • ${inr(i.total)}` })) : []),
    ...overdue(S).filter(i => i.days_overdue > 30).map(i => ({ key: 'o' + i.id, view: 'invoices', title: `🚨 ${i.client_name}: ${i.days_overdue} days overdue`, sub: `${i.number} • ${inr(i.total)}` })),
    ...groupFilings(unfiled(S).filter(f => f.days_left < 7)).map(g => ({ key: 'f' + g[0].id, view: 'compliance', title: `📋 ${g[0].return_type} due ${fmtDate(g[0].due_date)}`, sub: `${g.length} client(s) pending` })),
    ...S.tasks.filter(t => !t.done_at && (t.assignee_id === S.me.id || !t.assignee_id) && t.due_date && t.due_date <= todayIso())
      .map(t => ({ key: 't' + t.id, view: 'tasks', title: `✅ ${t.title}`, sub: `Due ${fmtDate(t.due_date)}${t.assignee_name ? '' : ' • unassigned'}` })),
  ];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div className="notif-btn" onClick={() => setOpen(o => !o)} role="button" aria-label="Notifications">
        🔔{items.length > 0 && <div className="notif-dot"></div>}
      </div>
      {open && (
        <div className="dropdown">
          {items.length ? items.map(n => (
            <div key={n.key} className="dropdown-item" onClick={() => { go(n.view); setOpen(false); }}>
              {n.title}<div className="sub">{n.sub}</div>
            </div>
          )) : <div className="empty">All clear 🎉</div>}
        </div>
      )}
    </div>
  );
}
