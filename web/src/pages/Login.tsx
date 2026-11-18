import { useState, type FormEvent } from 'react';
import { api } from '../api';

const REMEMBER_KEY = 'remember-me';

function rememberedChoice() {
  try {
    return localStorage.getItem(REMEMBER_KEY) === '1';
  } catch {
    return false;
  }
}

// Chromium browsers can be asked outright to offer saving the password; elsewhere the
// browser notices the sign-in form succeeding and offers it by itself.
async function offerToSavePassword(form: HTMLFormElement) {
  const Credential = (window as { PasswordCredential?: new (form: HTMLFormElement) => Credential }).PasswordCredential;
  if (!Credential || !navigator.credentials?.store) return;
  try {
    await navigator.credentials.store(new Credential(form));
  } catch {
    // The user declined, or the browser refused: signing in is unaffected.
  }
}

export function Login({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(rememberedChoice);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    setBusy(true);
    setError('');
    try {
      await api('/auth/login', { method: 'POST', body: { username, password, remember } });
      try { localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0'); } catch { /* storage blocked */ }
      // Not awaited: the browser's save prompt must not hold up signing in.
      void offerToSavePassword(form);
      onDone();
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form className="login-card" method="post" action="/api/auth/login" onSubmit={submit}>
        <p className="login-basmala">بسم الله الرحمن الرحيم</p>
        <h1>سجلات الخير</h1>
        <p className="login-sub">نظام إدارة المشتركين والمساعدات</p>
        <label className="field">
          <span>اسم المستخدم</span>
          <input id="username" name="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} dir="ltr" required />
        </label>
        <label className="field">
          <span>كلمة المرور</span>
          <input id="password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" dir="ltr" required />
        </label>
        <label className="login-remember">
          <input type="checkbox" name="remember" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          <span>تذكرني على هذا الجهاز</span>
          <small>يبقى الدخول 30 يوماً، فلا تفعّله على جهاز مشترك</small>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn primary block" disabled={busy}>{busy ? 'جارٍ الدخول…' : 'دخول'}</button>
      </form>
    </main>
  );
}
