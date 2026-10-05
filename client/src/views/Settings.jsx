import { useState } from 'react';
import { useApp } from '../App.jsx';
import { api } from '../lib.js';

export default function Settings() {
  const { S } = useApp();
  const isPartner = S.me.role === 'partner';

  return (
    <>
      <div className="section-title">⚙️ Settings</div>
      <div className="section-desc">
        Firm details, n8n connection aur team users. WhatsApp API, email (Gmail) aur AI prompts n8n ke andar set hote hain.
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isPartner ? <FirmSettings /> : <div className="panel text-sm text-muted">Only partners can change firm and n8n settings.</div>}
          <ChangePassword />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Users />
        </div>
      </div>
    </>
  );
}

function FirmSettings() {
  const { S, act } = useApp();
  const [firmName, setFirmName] = useState(S.settings.firmName);
  const [phone, setPhone] = useState(S.settings.phone);
  const [email, setEmail] = useState(S.settings.email);
  const [n8nBaseUrl, setN8nBaseUrl] = useState(S.settings.n8nBaseUrl);

  return (
    <form className="panel" onSubmit={e => { e.preventDefault(); act('PATCH', '/api/settings', { firmName, phone, email, n8nBaseUrl }, 'Settings saved'); }}>
      <div className="panel-title">🏢 Firm & n8n</div>
      <label className="form-group" style={{ display: 'block' }}>
        <span className="form-label">Firm name</span>
        <input className="form-input" required maxLength={100} value={firmName} onChange={e => setFirmName(e.target.value)} />
      </label>
      <div className="form-row">
        <label className="form-group" style={{ display: 'block' }}>
          <span className="form-label">Firm phone / WhatsApp</span>
          <input className="form-input" type="tel" maxLength={20} placeholder="+91 98765 43210" value={phone} onChange={e => setPhone(e.target.value)} />
        </label>
        <label className="form-group" style={{ display: 'block' }}>
          <span className="form-label">Firm email</span>
          <input className="form-input" type="email" maxLength={200} placeholder="office@yourfirm.in" value={email} onChange={e => setEmail(e.target.value)} />
        </label>
      </div>
      <div className="text-xs text-muted" style={{ marginTop: -6, marginBottom: 12 }}>Shown at the end of WhatsApp and email reminders to clients.</div>
      <label className="form-group" style={{ display: 'block' }}>
        <span className="form-label">n8n webhook base URL (leave empty if n8n is not set up)</span>
        <input className="form-input" placeholder="http://localhost:5678/webhook" value={n8nBaseUrl} onChange={e => setN8nBaseUrl(e.target.value)} />
      </label>
      <div className="text-xs text-muted" style={{ marginBottom: 12 }}>
        When set, new invoices go to n8n (email + WhatsApp, partner approval above ₹50,000) and the chat uses n8n's AI agent.
      </div>
      <button className="btn btn-primary">Save</button>
    </form>
  );
}

function Users() {
  const { S, act } = useApp();
  const isPartner = S.me.role === 'partner';
  const empty = { name: '', email: '', password: '', role: 'staff' };
  const [form, setForm] = useState(empty);
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  async function add(e) {
    e.preventDefault();
    if (await act('POST', '/api/users', form, `User ${form.name} added. Share the password with them.`)) setForm(empty);
  }

  return (
    <div className="panel">
      <div className="panel-title">👥 Team Users</div>
      <table>
        <tbody>
          {S.users.map(u => (
            <tr key={u.id}>
              <td><div style={{ fontWeight: 600 }}>{u.name}{u.id === S.me.id && ' (you)'}</div><div className="text-xs text-muted">{u.email}</div></td>
              <td><span className={`badge badge-${u.role === 'partner' ? 'violet' : 'slate'}`}>{u.role === 'partner' ? 'Partner' : 'Staff'}</span></td>
              <td>{isPartner && u.id !== S.me.id && (
                <button className="btn btn-outline btn-sm" onClick={() => act('DELETE', `/api/users/${u.id}`, null, `${u.name} removed`)}>Remove</button>
              )}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {isPartner && (
        <form onSubmit={add} style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <div className="form-row">
            <input className="form-input" placeholder="Name" required maxLength={200} value={form.name} onChange={set('name')} aria-label="Name" />
            <input className="form-input" type="email" placeholder="Email" required value={form.email} onChange={set('email')} aria-label="Email" />
          </div>
          <div className="form-row" style={{ marginTop: 8 }}>
            <input className="form-input" type="password" placeholder="Password (8+ characters)" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')} aria-label="Password" />
            <select className="form-input" value={form.role} onChange={set('role')} aria-label="Role">
              <option value="staff">Staff</option><option value="partner">Partner (can approve invoices, manage users)</option>
            </select>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 10 }}>+ Add User</button>
        </form>
      )}
    </div>
  );
}

function ChangePassword() {
  const { S, toast } = useApp();
  const [error, setError] = useState('');
  const hasPassword = S.me.has_password;   // false for people who only sign in with Google

  async function submit(e) {
    e.preventDefault();
    const { current, next } = Object.fromEntries(new FormData(e.target));
    setError('');
    try {
      await api('POST', '/api/auth/password', { current, next });
      toast(hasPassword ? 'Password changed. Please log in again.' : 'Password set. Please log in again.');
      setTimeout(() => window.location.reload(), 1200);
    } catch (x) { setError(x.message); }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="panel-title">🔒 {hasPassword ? 'Change Your Password' : 'Set a Password'}</div>
      {!hasPassword && <div className="text-xs text-muted" style={{ marginBottom: 10 }}>You sign in with Google. A password lets you log in with your email too.</div>}
      <div className="form-row">
        {hasPassword && <input className="form-input" name="current" type="password" placeholder="Current password" required autoComplete="current-password" aria-label="Current password" />}
        <input className="form-input" name="next" type="password" placeholder="New password (8+)" required minLength={8} autoComplete="new-password" aria-label="New password" />
      </div>
      <div className="form-error">{error}</div>
      <button className="btn btn-outline">{hasPassword ? 'Change password' : 'Set password'}</button>
    </form>
  );
}
