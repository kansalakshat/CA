import { useState } from 'react';
import { api } from '../lib.js';

// Log in, or sign up a new CA firm (you become its partner / admin).
export default function Login({ onDone }) {
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const signup = mode === 'signup';

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('POST', signup ? '/api/auth/signup' : '/api/auth/login', Object.fromEntries(new FormData(e.target)));
      onDone();
    } catch (x) {
      setError(x.message);
      setBusy(false);
    }
  }

  function switchMode() {
    setMode(signup ? 'login' : 'signup');
    setError('');
  }

  return (
    <div className="login-wrap">
      {/* key resets the form fields when switching between log in and sign up */}
      <form className="login-card" onSubmit={submit} key={mode}>
        <div className="brand-logo" style={{ marginBottom: 20 }}>
          <div className="brand-icon">CA</div>
          <div>
            <div className="modal-title" style={{ margin: 0 }}>{signup ? 'Sign up your firm' : 'Log in'}</div>
            <div className="text-xs text-muted">CA Firm CRM</div>
          </div>
        </div>
        {signup && (
          <>
            <p className="text-sm text-muted" style={{ marginBottom: 14 }}>
              Creates a private workspace for your firm. You become its partner (admin) and can add your team later in Settings.
            </p>
            <label className="form-group" style={{ display: 'block' }}>
              <span className="form-label">Firm name</span>
              <input className="form-input" name="firmName" required maxLength={100} placeholder="Kansal & Associates" autoFocus />
            </label>
            <label className="form-group" style={{ display: 'block' }}>
              <span className="form-label">Your name</span>
              <input className="form-input" name="name" required maxLength={200} placeholder="CA Akshat Kansal" />
            </label>
          </>
        )}
        <label className="form-group" style={{ display: 'block' }}>
          <span className="form-label">Email</span>
          <input className="form-input" name="email" type="email" required autoComplete="username" autoFocus={!signup} />
        </label>
        <label className="form-group" style={{ display: 'block' }}>
          <span className="form-label">Password{signup && ' (at least 8 characters)'}</span>
          <input className="form-input" name="password" type="password" required minLength={signup ? 8 : undefined}
            autoComplete={signup ? 'new-password' : 'current-password'} />
        </label>
        <div className="form-error" role="alert">{error}</div>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={busy}>
          {busy ? 'Please wait…' : signup ? 'Create firm account' : 'Log in'}
        </button>
        <div className="text-sm text-muted" style={{ textAlign: 'center', marginTop: 16 }}>
          {signup ? 'Already have an account?' : 'New CA firm?'}{' '}
          <button type="button" onClick={switchMode}
            style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 600, cursor: 'pointer', fontSize: 'inherit', padding: 0 }}>
            {signup ? 'Log in' : 'Sign up your firm'}
          </button>
        </div>
        {!signup && <div className="text-xs text-muted" style={{ textAlign: 'center', marginTop: 8 }}>Joining an existing firm? Ask your partner to add you in Settings.</div>}
      </form>
    </div>
  );
}
