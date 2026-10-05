import { useEffect, useState } from 'react';
import { api } from '../lib.js';
import { Field } from '../components.jsx';

// Log in, sign up a new CA firm (email + password, confirmed by email), or continue with Google.
export default function Login({ googleEnabled, pendingSignup, notice, onDone }) {
  const [mode, setMode] = useState(pendingSignup ? 'google' : 'login');   // login | signup | sent | google
  const [error, setError] = useState(notice || '');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');        // remembered for "resend"
  const [unverified, setUnverified] = useState(false);

  useEffect(() => { document.title = 'CA Firm CRM'; }, []);   // the app sets per-screen titles; reset after logout

  const go = next => { setMode(next); setError(''); setInfo(''); setUnverified(false); };

  async function submit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    setError(''); setInfo(''); setUnverified(false); setBusy(true);
    try {
      if (mode === 'signup') {
        const r = await api('POST', '/api/auth/signup', data);
        setEmail(r.email);
        setMode('sent');
      } else if (mode === 'google') {
        await api('POST', '/api/auth/google/complete', data);
        onDone();
      } else {
        setEmail(data.email);
        await api('POST', '/api/auth/login', data);
        onDone();
      }
    } catch (x) {
      setError(x.message);
      setUnverified(x.code === 'email_not_verified');
    }
    setBusy(false);
  }

  async function resend() {
    setBusy(true); setError('');
    try {
      await api('POST', '/api/auth/resend-verification', { email });
      setInfo(`If ${email} is waiting for confirmation, a new link is on its way.`);
    } catch (x) { setError(x.message); }
    setBusy(false);
  }

  async function cancelGoogle() {
    await api('POST', '/api/auth/google/cancel').catch(() => {});
    go('login');
  }

  const title = { login: 'Log in', signup: 'Sign up your firm', sent: 'Check your email', google: 'Name your firm' }[mode];
  const lead = {
    login: 'Clients, fees, filings and documents for your CA practice.',
    signup: 'Creates a private workspace for your firm. You become its partner (admin) and can add your team later in Settings.',
    sent: '',
    google: '',
  }[mode];

  return (
    <div className="auth">
      {/* key resets the form fields when switching screens */}
      <form className="card auth-card" onSubmit={submit} key={mode}>
        <div className="auth-brand">
          <div className="brand-mark" aria-hidden="true">CA</div>
          <span className="strong">CA Firm CRM</span>
        </div>
        <h1>{title}</h1>
        {lead && <p className="lead-text">{lead}</p>}

        {mode === 'sent' && (
          <>
            <p className="lead-text">We sent a confirmation link to <b>{email}</b>. Click it to open your firm's workspace.</p>
            <p className="field-hint" style={{ marginBottom: 16 }}>Can't find it? Check spam, or send it again. The link works for 24 hours.</p>
            <button type="button" className="btn btn-secondary btn-block" onClick={resend} disabled={busy}>Send the link again</button>
          </>
        )}

        {mode === 'google' && pendingSignup && (
          <>
            <p className="lead-text">Signed in with Google as <b>{pendingSignup.email}</b>. One last step: what is your firm called? You'll be its partner (admin).</p>
            <Field label="Firm name"><input className="input" name="firmName" required maxLength={100} placeholder="Kansal & Associates" autoFocus /></Field>
          </>
        )}

        {mode === 'signup' && (
          <>
            <Field label="Firm name"><input className="input" name="firmName" required maxLength={100} placeholder="Kansal & Associates" autoFocus /></Field>
            <Field label="Your name"><input className="input" name="name" required maxLength={200} placeholder="CA Akshat Kansal" autoComplete="name" /></Field>
          </>
        )}

        {(mode === 'login' || mode === 'signup') && (
          <>
            <Field label="Email"><input className="input" name="email" type="email" required autoComplete="username" spellCheck={false} autoFocus={mode === 'login'} /></Field>
            <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters.' : undefined}>
              <input className="input" name="password" type="password" required minLength={mode === 'signup' ? 8 : undefined}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            </Field>
          </>
        )}

        <div className="form-error" role="alert">{error}</div>
        {info && <div className="form-ok">{info}</div>}
        {unverified && <button type="button" className="btn btn-secondary btn-sm" onClick={resend} disabled={busy} style={{ marginBottom: 8 }}>Send the confirmation link again</button>}

        {mode !== 'sent' && (
          <button className="btn btn-primary btn-block" style={{ marginTop: 6 }} disabled={busy}>
            {busy ? 'Please wait…' : { login: 'Log in', signup: 'Create firm account', google: 'Create firm account' }[mode]}
          </button>
        )}

        {googleEnabled && (mode === 'login' || mode === 'signup') && (
          <>
            <div className="divider">or</div>
            <a href="/api/auth/google/start" className="btn btn-secondary btn-block">
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
                <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z" />
                <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.4-5.7c-2.1 1.4-4.7 2.2-7.8 2.2-6.3 0-11.6-4.2-13.5-9.9l-7.8 6C6.6 42.6 14.6 48 24 48z" />
              </svg>
              Continue with Google
            </a>
          </>
        )}

        <div className="auth-foot">
          {mode === 'login' && <>New CA firm? <button type="button" className="link-btn" onClick={() => go('signup')}>Sign up your firm</button></>}
          {(mode === 'signup' || mode === 'sent') && <>Already have an account? <button type="button" className="link-btn" onClick={() => go('login')}>Log in</button></>}
          {mode === 'google' && <button type="button" className="link-btn" onClick={cancelGoogle}>Use a different account</button>}
          {mode === 'login' && <p className="small" style={{ marginTop: 8 }}>Joining an existing firm? Ask your partner to add you in Settings.</p>}
        </div>
      </form>
    </div>
  );
}
