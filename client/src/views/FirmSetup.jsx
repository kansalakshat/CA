import { useState } from 'react';
import { api } from '../lib.js';

// Shown once to a partner right after their firm signs up. Saving or skipping both mark setup as done;
// everything stays editable in Settings.
export default function FirmSetup({ S, onDone }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(body) {
    setError('');
    setBusy(true);
    try {
      await api('PATCH', '/api/settings', { ...body, setupDone: true });
      await onDone();
    } catch (x) {
      setError(x.message);
      setBusy(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    save(Object.fromEntries(new FormData(e.target)));
  }

  const field = (label, input, hint) => (
    <label className="form-group" style={{ display: 'block' }}>
      <span className="form-label">{label}</span>
      {input}
      {hint && <span className="text-xs text-muted" style={{ display: 'block', marginTop: 4 }}>{hint}</span>}
    </label>
  );

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-logo" style={{ marginBottom: 20 }}>
          <div className="brand-icon">CA</div>
          <div>
            <div className="modal-title" style={{ margin: 0 }}>Set up your firm</div>
            <div className="text-xs text-muted">Welcome, {S.me.name.split(' ')[0]}! One quick step.</div>
          </div>
        </div>
        <p className="text-sm text-muted" style={{ marginBottom: 14 }}>
          These details appear in the WhatsApp and email reminders you send to clients. You can change them anytime in Settings.
        </p>
        {field('Firm name', <input className="form-input" name="firmName" required maxLength={100} defaultValue={S.settings.firmName} />)}
        {field('Firm phone / WhatsApp', <input className="form-input" name="phone" type="tel" maxLength={20} placeholder="+91 98765 43210" defaultValue={S.settings.phone} autoFocus />,
          'Clients can call or message this number.')}
        {field('Firm email', <input className="form-input" name="email" type="email" maxLength={200} placeholder="office@yourfirm.in" defaultValue={S.settings.email || S.me.email} />)}
        <div className="form-error" role="alert">{error}</div>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={busy}>
          {busy ? 'Saving…' : 'Save and continue'}
        </button>
        <div className="text-sm" style={{ textAlign: 'center', marginTop: 14 }}>
          <button type="button" disabled={busy} onClick={() => save({})}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 'inherit', padding: 0 }}>
            Skip for now
          </button>
        </div>
      </form>
    </div>
  );
}
