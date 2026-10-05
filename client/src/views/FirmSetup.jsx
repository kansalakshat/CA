import { useState } from 'react';
import { api } from '../lib.js';
import { Field } from '../components.jsx';

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
      // On success this screen goes away. If loading the workspace fails, say so instead of spinning forever.
      if (!(await onDone())) setError('Saved, but your workspace did not load. Check your connection and click again.');
      setBusy(false);
    } catch (x) {
      setError(x.message);
      setBusy(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    save(Object.fromEntries(new FormData(e.target)));
  }

  return (
    <div className="auth">
      <form className="card auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <div className="brand-mark" aria-hidden="true">CA</div>
          <span className="strong">CA Firm CRM</span>
        </div>
        <h1>Set up your firm</h1>
        <p className="lead-text">
          Welcome, {S.me.name.split(' ')[0]}. These details appear in the WhatsApp and email reminders you send to clients. You can change them anytime in Settings.
        </p>
        <Field label="Firm name"><input className="input" name="firmName" required maxLength={100} defaultValue={S.settings.firmName} /></Field>
        <Field label="Firm phone / WhatsApp" hint="Clients can call or message this number.">
          <input className="input" name="phone" type="tel" maxLength={20} placeholder="+91 98765 43210" defaultValue={S.settings.phone} autoFocus />
        </Field>
        <Field label="Firm email"><input className="input" name="email" type="email" maxLength={200} placeholder="office@yourfirm.in" defaultValue={S.settings.email || S.me.email} spellCheck={false} /></Field>
        <div className="form-error" role="alert">{error}</div>
        <button className="btn btn-primary btn-block" style={{ marginTop: 6 }} disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}</button>
        <div className="auth-foot">
          <button type="button" className="link-btn" style={{ color: 'var(--ink-3)' }} disabled={busy} onClick={() => save({})}>Skip for now</button>
        </div>
      </form>
    </div>
  );
}
