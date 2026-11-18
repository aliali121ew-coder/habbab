import { useState, type FormEvent } from 'react';
import { api } from '../api';

// Shown instead of the app when the account must set a new password (a new admin, or a
// password reset by an admin). The server refuses every other request until this is done.
export function ChangePassword({ name, onDone, onSignOut }: { name: string; onDone: () => void; onSignOut: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (next.length < 10) return setError('كلمة المرور الجديدة يجب ألا تقل عن 10 أحرف');
    if (next !== confirm) return setError('كلمتا المرور الجديدتان غير متطابقتين');
    setBusy(true);
    setError('');
    try {
      await api('/auth/change-password', { method: 'POST', body: { current, next } });
      onDone();
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit}>
        <h1>تغيير كلمة المرور</h1>
        <p className="login-sub">مرحباً {name}، اختر كلمة مرور جديدة قبل المتابعة</p>
        {/* Lets the browser's password manager tie the new password to the right account. */}
        <input type="text" name="username" autoComplete="username" value={name} readOnly hidden />
        <label className="field">
          <span>كلمة المرور الحالية</span>
          <input type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" dir="ltr" required />
        </label>
        <label className="field">
          <span>كلمة المرور الجديدة (10 أحرف على الأقل)</span>
          <input type="password" value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" minLength={10} dir="ltr" required />
        </label>
        <label className="field">
          <span>تأكيد كلمة المرور الجديدة</span>
          <input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" minLength={10} dir="ltr" required />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn primary block" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ والمتابعة'}</button>
        <button type="button" className="btn block" onClick={onSignOut} disabled={busy} style={{ marginTop: 8 }}>تسجيل الخروج</button>
      </form>
    </main>
  );
}
