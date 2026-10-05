import { useState } from 'react';
import { api } from '../lib.js';

// First run: create the partner account. After that: normal login.
export default function Login({ needsSetup, onDone }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('POST', needsSetup ? '/api/auth/setup' : '/api/auth/login', Object.fromEntries(new FormData(e.target)));
      onDone();
    } catch (x) {
      setError(x.message);
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-logo" style={{ marginBottom: 20 }}>
          <div className="brand-icon">CA</div>
          <div>
            <div className="modal-title" style={{ margin: 0 }}>{needsSetup ? 'Create partner account' : 'Log in'}</div>
            <div className="text-xs text-muted">CA Firm CRM</div>
          </div>
        </div>
        {needsSetup && (
          <>
            <p className="text-sm text-muted" style={{ marginBottom: 14 }}>First time here. This account will be the admin (partner). You can add staff later in Settings.</p>
            <label className="form-group" style={{ display: 'block' }}>
              <span className="form-label">Your name</span>
              <input className="form-input" name="name" required maxLength={200} placeholder="CA Rajesh Sharma" autoFocus />
            </label>
          </>
        )}
        <label className="form-group" style={{ display: 'block' }}>
          <span className="form-label">Email</span>
          <input className="form-input" name="email" type="email" required autoComplete="username" autoFocus={!needsSetup} />
        </label>
        <label className="form-group" style={{ display: 'block' }}>
          <span className="form-label">Password{needsSetup && ' (at least 8 characters)'}</span>
          <input className="form-input" name="password" type="password" required minLength={needsSetup ? 8 : undefined}
            autoComplete={needsSetup ? 'new-password' : 'current-password'} />
        </label>
        <div className="form-error" role="alert">{error}</div>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={busy}>
          {busy ? 'Please wait…' : needsSetup ? 'Create account' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
