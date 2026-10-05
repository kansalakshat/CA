import { useState } from 'react';
import { useApp } from '../App.jsx';
import { api } from '../lib.js';
import { ConfirmButton, Field, PageHead } from '../components.jsx';

export default function Settings() {
  const { S } = useApp();
  const isPartner = S.me.role === 'partner';

  return (
    <>
      <PageHead title="Settings" desc="Firm details, n8n connection aur team users. WhatsApp API, email (Gmail) aur AI prompts n8n ke andar set hote hain." />

      <div className="grid-2">
        <div className="stack">
          {isPartner ? <FirmSettings /> : <div className="card card-body muted" style={{ paddingTop: 18 }}>Only partners can change firm and n8n settings.</div>}
          <ChangePassword />
        </div>
        <div className="stack">
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
    <form className="card" onSubmit={e => { e.preventDefault(); act('PATCH', '/api/settings', { firmName, phone, email, n8nBaseUrl }, 'Settings saved'); }}>
      <div className="card-head"><h2>Firm and n8n</h2></div>
      <div className="card-body">
        <Field label="Firm name"><input className="input" required maxLength={100} value={firmName} onChange={e => setFirmName(e.target.value)} /></Field>
        <div className="form-row">
          <Field label="Firm phone / WhatsApp"><input className="input" type="tel" maxLength={20} placeholder="+91 98765 43210" value={phone} onChange={e => setPhone(e.target.value)} /></Field>
          <Field label="Firm email"><input className="input" type="email" maxLength={200} placeholder="office@yourfirm.in" value={email} onChange={e => setEmail(e.target.value)} spellCheck={false} /></Field>
        </div>
        <p className="field-hint" style={{ marginTop: -8, marginBottom: 14 }}>Shown at the end of WhatsApp and email reminders to clients.</p>
        <Field label="n8n webhook base URL (optional)" hint="When set, new invoices go to n8n (email + WhatsApp, partner approval above ₹50,000) and the chat uses n8n's AI agent.">
          <input className="input mono" placeholder="http://localhost:5678/webhook" value={n8nBaseUrl} onChange={e => setN8nBaseUrl(e.target.value)} spellCheck={false} />
        </Field>
        <button className="btn btn-primary">Save changes</button>
      </div>
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
    <section className="card">
      <div className="card-head"><h2>Team users</h2></div>
      <div className="table-wrap">
        <table>
          <tbody>
            {S.users.map(u => (
              <tr key={u.id}>
                <td><div className="cell-main">{u.name}{u.id === S.me.id && <span className="muted"> (you)</span>}</div><div className="cell-sub">{u.email}</div></td>
                <td><span className={'badge' + (u.role === 'partner' ? ' tone-accent' : '')}>{u.role === 'partner' ? 'Partner' : 'Staff'}</span></td>
                <td className="r">{isPartner && u.id !== S.me.id && (
                  <ConfirmButton className="btn btn-danger btn-sm" confirmLabel={`Remove ${u.name.split(' ')[0]}`}
                    onConfirm={() => act('DELETE', `/api/users/${u.id}`, null, `${u.name} removed`)}>Remove</ConfirmButton>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isPartner && (
        <form onSubmit={add} className="card-body" style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 12 }}>Add a team member</h3>
          <div className="form-row">
            <Field label="Name"><input className="input" required maxLength={200} value={form.name} onChange={set('name')} autoComplete="off" /></Field>
            <Field label="Email"><input className="input" type="email" required value={form.email} onChange={set('email')} autoComplete="off" spellCheck={false} /></Field>
          </div>
          <div className="form-row">
            <Field label="Starting password" hint="8+ characters. Share it with them."><input className="input" type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')} /></Field>
            <Field label="Role">
              <select className="input" value={form.role} onChange={set('role')}>
                <option value="staff">Staff</option><option value="partner">Partner (approves invoices, manages users)</option>
              </select>
            </Field>
          </div>
          <button className="btn btn-primary">Add user</button>
        </form>
      )}
    </section>
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
    <form className="card" onSubmit={submit}>
      <div className="card-head"><h2>{hasPassword ? 'Change your password' : 'Set a password'}</h2></div>
      <div className="card-body">
        {!hasPassword && <p className="field-hint" style={{ marginTop: 0, marginBottom: 12 }}>You sign in with Google. A password lets you log in with your email too.</p>}
        <div className="form-row">
          {hasPassword && <Field label="Current password"><input className="input" name="current" type="password" required autoComplete="current-password" /></Field>}
          <Field label="New password" hint="At least 8 characters."><input className="input" name="next" type="password" required minLength={8} autoComplete="new-password" /></Field>
        </div>
        <div className="form-error" role="alert">{error}</div>
        <button className="btn btn-secondary">{hasPassword ? 'Change password' : 'Set password'}</button>
      </div>
    </form>
  );
}
