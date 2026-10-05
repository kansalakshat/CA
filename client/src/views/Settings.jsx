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
          {isPartner && <N8nKey />}
          <Users />
        </div>
      </div>
    </>
  );
}

function FirmSettings() {
  const { S, act } = useApp();
  const [firmName, setFirmName] = useState(S.settings.firmName);
  const [n8nBaseUrl, setN8nBaseUrl] = useState(S.settings.n8nBaseUrl);

  return (
    <form className="panel" onSubmit={e => { e.preventDefault(); act('PATCH', '/api/settings', { firmName, n8nBaseUrl }, 'Settings saved'); }}>
      <div className="panel-title">🏢 Firm & n8n</div>
      <label className="form-group" style={{ display: 'block' }}>
        <span className="form-label">Firm name</span>
        <input className="form-input" required maxLength={100} value={firmName} onChange={e => setFirmName(e.target.value)} />
      </label>
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

function N8nKey() {
  const { S, act, toast } = useApp();
  const copy = text => navigator.clipboard.writeText(text).then(() => toast('Copied'), () => toast('Copy failed, select and copy manually'));

  return (
    <div className="panel">
      <div className="panel-title">🔑 Connecting n8n to this CRM</div>
      <div className="text-sm" style={{ marginBottom: 6 }}>CRM address for n8n:</div>
      <div className="code" style={{ marginBottom: 10 }}>{window.location.origin}</div>
      <div className="text-sm" style={{ marginBottom: 6 }}>API key (n8n sends it as header <b>x-api-key</b>):</div>
      <div className="code" style={{ marginBottom: 10 }}>{S.settings.apiKey}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-outline btn-sm" onClick={() => copy(S.settings.apiKey)}>Copy key</button>
        <button className="btn btn-outline btn-sm" onClick={() => act('POST', '/api/settings/api-key', null, 'New key created. Update it in n8n too.')}>Create new key</button>
      </div>
      <div className="text-xs text-muted" style={{ marginTop: 10 }}>Import <b>n8n-workflow.json</b> into n8n and paste the key where it says YOUR_CRM_API_KEY. See README.</div>
    </div>
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
  const { toast } = useApp();
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    const { current, next } = Object.fromEntries(new FormData(e.target));
    setError('');
    try {
      await api('POST', '/api/auth/password', { current, next });
      toast('Password changed. Please log in again.');
      setTimeout(() => window.location.reload(), 1200);
    } catch (x) { setError(x.message); }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="panel-title">🔒 Change Your Password</div>
      <div className="form-row">
        <input className="form-input" name="current" type="password" placeholder="Current password" required autoComplete="current-password" aria-label="Current password" />
        <input className="form-input" name="next" type="password" placeholder="New password (8+)" required minLength={8} autoComplete="new-password" aria-label="New password" />
      </div>
      <div className="form-error">{error}</div>
      <button className="btn btn-outline">Change password</button>
    </form>
  );
}
