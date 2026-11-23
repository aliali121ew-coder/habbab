import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Building2, Check, LogIn, PauseCircle, PlayCircle, Plus, SlidersHorizontal, Users } from 'lucide-react';
import { api, type Feature, type Me } from '../../api';
import { Modal } from '../../components/Modal';
import { StateMessage } from '../../components/StateMessage';
import { enterFoundation } from '../../components/Shell';
import { FEATURE_LIST } from '../../features';
import { formatNumber } from '../../format';

interface Foundation {
  id: number;
  name: string;
  status: 'active' | 'suspended';
  features: Feature[];
  created_at: string;
  users: number;
  subscribers: number;
}

const ALL: Feature[] = FEATURE_LIST.map((item) => item.id);

// The features as a list of ticks; used when creating a foundation and when editing one.
function FeaturePicker({ value, onChange }: { value: Feature[]; onChange: (next: Feature[]) => void }) {
  const toggle = (id: Feature) => onChange(value.includes(id) ? value.filter((key) => key !== id) : [...value, id]);
  return (
    <fieldset className="sys-features">
      <legend>الصفحات المفعّلة</legend>
      {FEATURE_LIST.map((item) => (
        <label key={item.id} className={value.includes(item.id) ? 'on' : undefined}>
          <input type="checkbox" checked={value.includes(item.id)} onChange={() => toggle(item.id)} />
          <span className="sys-tick" aria-hidden><Check size={14} /></span>
          <span className="sys-feature-text">
            <b>{item.label}</b>
            <small>{item.hint}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function NewFoundation({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [features, setFeatures] = useState<Feature[]>(ALL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/system/foundations', {
        method: 'POST',
        body: { name, features, admin_full_name: adminName, admin_username: username, admin_password: password },
      });
      onSaved();
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title="مؤسسة جديدة" onClose={onClose}>
      <form className="sys-form" onSubmit={submit}>
        <label className="field">
          <span>اسم المؤسسة</span>
          <input value={name} onChange={(event) => setName(event.target.value)} required minLength={3} maxLength={120} autoFocus />
        </label>
        <p className="sys-form-note">مدير المؤسسة: يغيّر كلمة المرور عند أول دخول، ثم يضيف موظفيه ومندوبيه.</p>
        <label className="field">
          <span>اسم المدير</span>
          <input value={adminName} onChange={(event) => setAdminName(event.target.value)} required minLength={3} maxLength={120} />
        </label>
        <div className="sys-form-row">
          <label className="field">
            <span>اسم المستخدم</span>
            <input dir="ltr" value={username} onChange={(event) => setUsername(event.target.value)} required pattern="[a-zA-Z0-9._\-]{3,32}" autoComplete="off" />
          </label>
          <label className="field">
            <span>كلمة مرور مؤقتة</span>
            <input dir="ltr" type="text" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} autoComplete="off" />
          </label>
        </div>
        <FeaturePicker value={features} onChange={setFeatures} />
        {error && <p className="sys-error" role="alert">{error}</p>}
        <div className="sys-form-actions">
          <button type="button" className="btn" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'إنشاء المؤسسة'}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditFeatures({ foundation, onClose, onSaved }: { foundation: Foundation; onClose: () => void; onSaved: () => void }) {
  const [features, setFeatures] = useState<Feature[]>(foundation.features);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/system/foundations/${foundation.id}`, { method: 'PATCH', body: { features } });
      onSaved();
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal title={`صفحات ${foundation.name}`} onClose={onClose}>
      <form className="sys-form" onSubmit={submit}>
        <FeaturePicker value={features} onChange={setFeatures} />
        <p className="sys-form-note">يظهر التغيير في قائمة المؤسسة فوراً، ويرفض الخادم الصفحات المطفأة خلال 15 دقيقة.</p>
        {error && <p className="sys-error" role="alert">{error}</p>}
        <div className="sys-form-actions">
          <button type="button" className="btn" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
        </div>
      </form>
    </Modal>
  );
}

// مدير النظام: every foundation, its size and its pages; create, switch pages, suspend, enter.
export function SystemPage({ me }: { me: Me }) {
  const [items, setItems] = useState<Foundation[] | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Foundation | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await api<{ items: Foundation[] }>('/system/foundations');
      setItems(data.items);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const setStatus = async (foundation: Foundation) => {
    const next = foundation.status === 'active' ? 'suspended' : 'active';
    if (next === 'suspended' && !window.confirm(`إيقاف «${foundation.name}»؟\nلن يستطيع موظفوها الدخول حتى تعيد تفعيلها. لا تُحذف أي بيانات.`)) return;
    setBusyId(foundation.id);
    try {
      await api(`/system/foundations/${foundation.id}`, { method: 'PATCH', body: { status: next } });
      await load();
    } catch (failure) {
      window.alert((failure as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const enter = async (foundation: Foundation) => {
    setBusyId(foundation.id);
    try {
      await enterFoundation(foundation.id);
    } catch (failure) {
      window.alert((failure as Error).message);
      setBusyId(null);
    }
  };

  if (error) return <StateMessage kind="error" title="تعذّر تحميل المؤسسات" hint={error} onRetry={load} />;

  return (
    <div className="sys">
      <header className="sys-head">
        <span className="sys-head-icon" aria-hidden><Building2 size={22} /></span>
        <div>
          <h1>المؤسسات</h1>
          <p>{items ? `${formatNumber(items.length)} مؤسسة` : 'جارٍ التحميل…'}</p>
        </div>
        <button type="button" className="btn primary sys-add" onClick={() => setAdding(true)}>
          <Plus size={16} aria-hidden /> مؤسسة جديدة
        </button>
      </header>

      {!items ? (
        <div className="sys-list" aria-busy="true">
          {[0, 1, 2].map((key) => <div key={key} className="sys-card sys-skeleton" />)}
        </div>
      ) : (
        <ul className="sys-list">
          {items.map((foundation) => {
            const here = foundation.id === me.foundation_id;
            const home = foundation.id === me.home_foundation_id;
            return (
              <li key={foundation.id} className={`sys-card${foundation.status === 'suspended' ? ' is-off' : ''}`}>
                <div className="sys-card-top">
                  <span className="sys-card-mark" aria-hidden>{foundation.name.replace(/^(مؤسسة|جمعية)\s+/, '').charAt(0)}</span>
                  <div className="sys-card-name">
                    <strong>{foundation.name}</strong>
                    <small>
                      {foundation.status === 'active' ? <span className="sys-chip ok">فعّالة</span> : <span className="sys-chip off">موقوفة</span>}
                      {here && <span className="sys-chip here">أنت هنا</span>}
                    </small>
                  </div>
                </div>
                <div className="sys-card-stats">
                  <span><Users size={13} aria-hidden /> <bdi>{formatNumber(foundation.users)}</bdi> مستخدم</span>
                  <span><bdi>{formatNumber(foundation.subscribers)}</bdi> مشترك</span>
                  <span><bdi>{foundation.features.length}</bdi> من <bdi>{ALL.length}</bdi> صفحات</span>
                </div>
                <div className="sys-card-actions">
                  <button type="button" className="btn" onClick={() => setEditing(foundation)}>
                    <SlidersHorizontal size={15} aria-hidden /> الصفحات
                  </button>
                  {!home && (
                    <button type="button" className="btn" disabled={busyId === foundation.id} onClick={() => void setStatus(foundation)}>
                      {foundation.status === 'active'
                        ? <><PauseCircle size={15} aria-hidden /> إيقاف</>
                        : <><PlayCircle size={15} aria-hidden /> تفعيل</>}
                    </button>
                  )}
                  {!here && (
                    <button type="button" className="btn primary" disabled={busyId === foundation.id} onClick={() => void enter(foundation)}>
                      <LogIn size={15} aria-hidden /> دخول
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {adding && <NewFoundation onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void load(); }} />}
      {editing && (
        <EditFeatures
          foundation={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            const wasHere = editing.id === me.foundation_id;
            setEditing(null);
            // The menu of the foundation being worked in follows at once.
            if (wasHere) location.reload(); else void load();
          }}
        />
      )}
    </div>
  );
}
