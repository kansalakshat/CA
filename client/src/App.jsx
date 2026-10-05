import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Bell, CalendarCheck, ChartBar, ChatsCircle, CheckSquare, FileText, Funnel, GearSix, Hourglass, List,
  MagnifyingGlass, Plus, Receipt, SignOut, SquaresFour, UsersThree, Warning,
} from '@phosphor-icons/react';
import { api, overdue, outstandingDocs, unfiled, groupFilings, fmtDate, inr, initials, todayIso } from './lib.js';
import { ClientModal, InvoiceModal, FilingModal, LeadModal } from './components.jsx';
import Login from './views/Login.jsx';
import FirmSetup from './views/FirmSetup.jsx';
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
  dashboard: { component: Dashboard, icon: SquaresFour, label: 'Dashboard' },
  agent: { component: Agent, icon: ChatsCircle, label: 'AI support agent' },
  documents: { component: Documents, icon: FileText, label: 'Document hub' },
  compliance: { component: Compliance, icon: CalendarCheck, label: 'Compliance' },
  leads: { component: Leads, icon: Funnel, label: 'Lead pipeline' },
  invoices: { component: Invoices, icon: Receipt, label: 'Invoices & fees' },
  clients: { component: Clients, icon: UsersThree, label: 'Clients' },
  tasks: { component: Tasks, icon: CheckSquare, label: 'Tasks' },
  reports: { component: Reports, icon: ChartBar, label: 'Reports' },
  settings: { component: Settings, icon: GearSix, label: 'Settings' },
};

const NAV = [
  ['', ['dashboard']],
  ['Daily work', ['agent', 'documents', 'compliance', 'leads', 'invoices']],
  ['Practice', ['clients', 'tasks', 'reports']],
  ['Firm', ['settings']],
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
  const [auth, setAuth] = useState(null);      // { user, googleEnabled, pendingSignup }
  const [S, setS] = useState(null);            // everything from /api/state
  const [view, setView] = useState('dashboard');
  const [modal, setModal] = useState(null);
  const [navOpen, setNavOpen] = useState(false);   // sidebar drawer on small screens
  // The server redirects back with ?verified=1, ?verify_error=1 or ?google_error=1. Read once, then clean the address bar.
  const [toastMsg, setToastMsg] = useState(() => (new URLSearchParams(window.location.search).has('verified') ? 'Email confirmed. Welcome.' : ''));
  const [loginNotice] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
    if (p.has('verify_error')) return 'That confirmation link is invalid or has expired. Log in to get a new one.';
    if (p.has('google_error')) return 'Google sign-in did not work. Please try again.';
    return '';
  });

  const checkAuth = useCallback(() => api('GET', '/api/auth/status').then(setAuth).catch(() => setAuth({ user: null })), []);
  useEffect(() => { checkAuth(); }, [checkAuth]);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(''), 3500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const handleError = useCallback(e => {
    if (e.status === 401) { setS(null); checkAuth(); }
    else setToastMsg(e.message);
  }, [checkAuth]);

  // Returns false if loading failed (the error is already shown or handled).
  const reload = useCallback(async () => {
    try { setS(await api('GET', '/api/state')); return true; } catch (e) { handleError(e); return false; }
  }, [handleError]);

  useEffect(() => { if (auth?.user) reload(); }, [auth?.user?.id, reload]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = e => e.key === 'Escape' && setNavOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  const firmName = S?.settings.firmName;
  useEffect(() => { if (firmName) document.title = `${VIEWS[view].label} · ${firmName}`; }, [view, firmName]);

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
  if (!auth.user) return <Login googleEnabled={auth.googleEnabled} pendingSignup={auth.pendingSignup} notice={loginNotice} onDone={checkAuth} />;
  if (!S) return <ShellSkeleton />;
  // A new firm's partner fills in contact details once (or skips).
  if (S.me.role === 'partner' && !S.settings.setupDone) return <FirmSetup S={S} onDone={reload} />;

  const go = id => { setView(id); setNavOpen(false); window.scrollTo(0, 0); };
  const ctx = { S, reload, act, toast: setToastMsg, openModal: setModal, go, logout: () => api('POST', '/api/auth/logout').then(checkAuth) };
  const View = VIEWS[view].component;
  const Modal = modal && MODALS[modal];

  const badges = {
    agent: S.messageCount,
    documents: S.clients.filter(c => outstandingDocs(S, c.id).length).length,
    compliance: unfiled(S).filter(f => f.days_left < 7).length,
    leads: S.leads.filter(l => l.stage !== 'won').length,
    invoices: overdue(S).length,
  };
  const alertBadge = { compliance: true, invoices: true };   // counts of things already late or due this week

  return (
    <AppCtx.Provider value={ctx}>
      <a href="#main" className="skip-link">Skip to content</a>
      <div className="app">
        <nav className={'sidebar' + (navOpen ? ' open' : '')} aria-label="Main">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">CA</div>
            <div>
              <div className="brand-name">{S.settings.firmName}</div>
              <div className="brand-sub">Chartered Accountants</div>
            </div>
          </div>

          {NAV.map(([section, ids]) => (
            <div className="nav-group" key={section || 'top'}>
              {section && <div className="nav-label">{section}</div>}
              {ids.map(id => {
                const Icon = VIEWS[id].icon;
                return (
                  <button key={id} className="nav-item" aria-current={view === id ? 'page' : undefined} onClick={() => go(id)}>
                    <Icon size={18} weight={view === id ? 'fill' : 'regular'} aria-hidden="true" />
                    {VIEWS[id].label}
                    {badges[id] > 0 && <span className={'nav-count' + (alertBadge[id] ? ' alert' : '')}>{badges[id]}</span>}
                  </button>
                );
              })}
            </div>
          ))}

          <div className="sidebar-foot">
            <div className="avatar" aria-hidden="true">{initials(S.me.name)}</div>
            <div className="who">
              <div className="who-name">{S.me.name}</div>
              <div className="who-role">{S.me.role === 'partner' ? 'Partner, admin' : 'Staff'}</div>
            </div>
            <button className="icon-btn bare" title="Log out" aria-label="Log out" onClick={ctx.logout}><SignOut size={18} /></button>
          </div>
        </nav>
        {navOpen && <div className="sidebar-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}

        <div className="main">
          <header className="topbar">
            <button className="icon-btn menu-btn" aria-label="Open menu" aria-expanded={navOpen} onClick={() => setNavOpen(true)}><List size={20} /></button>
            <Search />
            <div className="topbar-actions">
              <button className="btn btn-primary" onClick={() => setModal('client')} aria-label="New client">
                <Plus size={16} weight="bold" aria-hidden="true" /><span className="new-label">New client</span>
              </button>
              <Notifications />
            </div>
          </header>

          <main className="content" id="main" tabIndex={-1}>
            <View />
          </main>
        </div>
      </div>

      {Modal && <Modal onClose={() => setModal(null)} />}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </AppCtx.Provider>
  );
}

// Placeholder shaped like the app while /api/state loads.
function ShellSkeleton() {
  return (
    <div className="app" aria-busy="true" aria-label="Loading">
      <div className="sidebar">{[150, 110, 120, 100, 130, 90, 120].map((w, i) => <div key={i} className="skel" style={{ height: 14, width: w, margin: '12px 10px' }} />)}</div>
      <div className="main">
        <div className="topbar"><div className="skel" style={{ height: 36, width: 300, maxWidth: '100%' }} /></div>
        <div className="content">
          <div className="skel" style={{ height: 28, width: 220, marginBottom: 24 }} />
          <div className="skel" style={{ height: 104, marginBottom: 20 }} />
          <div className="skel" style={{ height: 300 }} />
        </div>
      </div>
    </div>
  );
}

function PopItem({ item, onPick }) {
  const Icon = item.icon;
  return (
    <button className="pop-item" onClick={onPick}>
      <Icon size={16} aria-hidden="true" style={item.tone ? { color: `var(--${item.tone})` } : undefined} />
      <span><span className="t">{item.title}</span><span className="s" style={{ display: 'block' }}>{item.sub}</span></span>
    </button>
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
    ...S.clients.filter(c => has(c.name, c.pan, c.gstin, c.phone, c.email)).map(c => ({ key: 'c' + c.id, view: 'clients', icon: UsersThree, title: c.name, sub: c.gstin || c.pan || c.phone })),
    ...S.invoices.filter(i => has(i.number, i.client_name)).map(i => ({ key: 'i' + i.id, view: 'invoices', icon: Receipt, title: i.number, sub: `${i.client_name} · ${inr(i.total)}` })),
    ...S.tasks.filter(t => has(t.title)).map(t => ({ key: 't' + t.id, view: 'tasks', icon: CheckSquare, title: t.title, sub: t.done_at ? 'Done' : 'Open' })),
    ...S.leads.filter(l => has(l.name, l.service)).map(l => ({ key: 'l' + l.id, view: 'leads', icon: Funnel, title: l.name, sub: l.service })),
  ].slice(0, 12);

  return (
    <div ref={ref} className="search">
      <label className="search-field">
        <MagnifyingGlass size={16} aria-hidden="true" />
        <input type="search" placeholder="Client, invoice, task search karein…" autoComplete="off" value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && setQ('')} aria-label="Search clients, invoices, tasks and leads" />
      </label>
      {needle.length >= 2 && (
        <div className="popover">
          {results.length ? results.map(r => <PopItem key={r.key} item={r} onPick={() => { go(r.view); setQ(''); }} />)
            : <div className="empty">No matches for "{q.trim()}"</div>}
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
    ...(S.me.role === 'partner' ? S.invoices.filter(i => i.approval === 'pending').map(i => ({ key: 'a' + i.id, view: 'invoices', icon: Hourglass, tone: 'accent', title: `Approve ${i.number}`, sub: `${i.client_name} · ${inr(i.total)}` })) : []),
    ...overdue(S).filter(i => i.days_overdue > 30).map(i => ({ key: 'o' + i.id, view: 'invoices', icon: Warning, tone: 'danger', title: `${i.client_name}: ${i.days_overdue} days overdue`, sub: `${i.number} · ${inr(i.total)}` })),
    ...groupFilings(unfiled(S).filter(f => f.days_left < 7)).map(g => ({ key: 'f' + g[0].id, view: 'compliance', icon: CalendarCheck, tone: 'warn', title: `${g[0].return_type} due ${fmtDate(g[0].due_date)}`, sub: `${g.length} client(s) pending` })),
    ...S.tasks.filter(t => !t.done_at && (t.assignee_id === S.me.id || !t.assignee_id) && t.due_date && t.due_date <= todayIso())
      .map(t => ({ key: 't' + t.id, view: 'tasks', icon: CheckSquare, title: t.title, sub: `Due ${fmtDate(t.due_date)}${t.assignee_name ? '' : ' · unassigned'}` })),
  ];

  return (
    <div ref={ref} className="bell">
      <button className="icon-btn" onClick={() => setOpen(o => !o)} aria-expanded={open}
        aria-label={items.length ? `Notifications, ${items.length} need attention` : 'Notifications'}>
        <Bell size={18} />
      </button>
      {items.length > 0 && <span className="bell-count" aria-hidden="true">{items.length}</span>}
      {open && (
        <div className="popover">
          {items.length ? items.map(n => <PopItem key={n.key} item={n} onPick={() => { go(n.view); setOpen(false); }} />)
            : <div className="empty">Nothing needs attention right now.</div>}
        </div>
      )}
    </div>
  );
}
