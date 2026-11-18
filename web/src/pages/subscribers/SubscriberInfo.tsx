import { useState, type FormEvent } from 'react';
import { Check, FileText, MapPin, Minus, Pencil, Phone, Plus, UserCheck, Users, X } from 'lucide-react';
import { api, type DelegateSummary, type GridRow, type Me, type SubscriberDetail } from '../../api';
import { formatNumber } from '../../format';

interface Props {
  me: Me;
  row: GridRow;
  detail: SubscriberDetail | null;
  loading: boolean;
  delegateName: string;
  delegates: DelegateSummary[];
  onSaved: (patch: Partial<SubscriberDetail>) => void;
}

interface Draft {
  delegate_id: string;
  family_size: number;
  phone: string;
  address: string;
}

// The four detail cards of a subscriber. The administration, and a delegate for their own
// subscribers, edit them in place; only the administration can move a subscriber to another delegate.
export function SubscriberInfo({ me, row, detail, loading, delegateName, delegates, onSaved }: Props) {
  const canEdit = me.role === 'admin' || me.role === 'delegate';
  const canMove = me.role === 'admin';
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const family = detail?.family_size ?? row.family_size ?? 1;
  const phone = detail ? detail.phone : row.phone;

  const start = () => {
    setError('');
    setDraft({
      delegate_id: String(detail?.delegate_id ?? row.delegate_id ?? ''),
      family_size: family,
      phone: phone ?? '',
      address: detail?.address ?? '',
    });
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || busy) return;
    const next = {
      delegate_id: draft.delegate_id ? Number(draft.delegate_id) : null,
      family_size: draft.family_size,
      phone: draft.phone.replace(/\s+/g, '') || null,
      address: draft.address.trim() || null,
    };
    // Only what changed is sent, so a delegate never sends the delegate field.
    const body: Record<string, unknown> = {};
    if (canMove && next.delegate_id !== (detail?.delegate_id ?? row.delegate_id)) body.delegate_id = next.delegate_id;
    if (next.family_size !== family) body.family_size = next.family_size;
    if (next.phone !== (phone ?? null)) body.phone = next.phone;
    if (next.address !== (detail?.address ?? null)) body.address = next.address;
    if (!Object.keys(body).length) { setDraft(null); return; }

    setBusy(true);
    setError('');
    try {
      await api(`/subscribers/${row.id}`, { method: 'PATCH', body });
      const patch: Partial<SubscriberDetail> = { ...body } as Partial<SubscriberDetail>;
      if ('delegate_id' in body) {
        patch.delegate_name = delegates.find((person) => person.id === next.delegate_id)?.full_name ?? null;
      }
      onSaved(patch);
      setDraft(null);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => current && { ...current, [key]: value });

  if (!draft) {
    return (
      <section className="sub-info-wrap">
        <header className="sub-info-head">
          <h3>بيانات المشترك</h3>
          {canEdit && (
            <button type="button" className="info-edit-btn" onClick={start} disabled={loading}>
              <Pencil size={13} aria-hidden /> تعديل التفاصيل
            </button>
          )}
        </header>
        <dl className="sub-info">
          <div>
            <dt><UserCheck size={15} aria-hidden /> المندوب المسؤول</dt>
            <dd>{delegateName}</dd>
          </div>
          <div>
            <dt><Users size={15} aria-hidden /> أفراد الأسرة</dt>
            <dd><bdi>{formatNumber(family)}</bdi></dd>
          </div>
          <div>
            <dt><Phone size={15} aria-hidden /> رقم الهاتف</dt>
            <dd><bdi dir="ltr">{phone || 'غير مسجل'}</bdi></dd>
          </div>
          <div>
            <dt><MapPin size={15} aria-hidden /> العنوان</dt>
            <dd>{loading ? 'جارٍ التحميل…' : (detail?.address || 'غير محدد')}</dd>
          </div>
          {detail?.notes && (
            <div className="wide">
              <dt><FileText size={15} aria-hidden /> ملاحظات</dt>
              <dd>{detail.notes}</dd>
            </div>
          )}
        </dl>
      </section>
    );
  }

  return (
    <form className="sub-info-wrap editing" onSubmit={save}>
      <header className="sub-info-head">
        <h3>تعديل بيانات المشترك</h3>
      </header>
      <dl className="sub-info">
        <div>
          <dt><UserCheck size={15} aria-hidden /> المندوب المسؤول</dt>
          <dd>
            {canMove ? (
              <select value={draft.delegate_id} onChange={(event) => set('delegate_id', event.target.value)} aria-label="المندوب المسؤول">
                <option value="">بدون مندوب</option>
                {delegates.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
              </select>
            ) : delegateName}
          </dd>
        </div>
        <div>
          <dt><Users size={15} aria-hidden /> أفراد الأسرة</dt>
          <dd>
            <div className="add-stepper">
              <button type="button" aria-label="إنقاص" disabled={draft.family_size <= 1} onClick={() => set('family_size', Math.max(1, draft.family_size - 1))}><Minus size={15} aria-hidden /></button>
              <input
                type="number"
                inputMode="numeric"
                dir="ltr"
                min={1}
                max={50}
                value={draft.family_size}
                onChange={(event) => set('family_size', Math.min(50, Math.max(1, Number(event.target.value) || 1)))}
                aria-label="عدد أفراد الأسرة"
              />
              <button type="button" aria-label="زيادة" disabled={draft.family_size >= 50} onClick={() => set('family_size', Math.min(50, draft.family_size + 1))}><Plus size={15} aria-hidden /></button>
            </div>
          </dd>
        </div>
        <div>
          <dt><Phone size={15} aria-hidden /> رقم الهاتف</dt>
          <dd>
            <input type="tel" inputMode="tel" dir="ltr" value={draft.phone} onChange={(event) => set('phone', event.target.value)} placeholder="07XXXXXXXXX" maxLength={20} aria-label="رقم الهاتف" />
          </dd>
        </div>
        <div>
          <dt><MapPin size={15} aria-hidden /> العنوان</dt>
          <dd>
            <input value={draft.address} onChange={(event) => set('address', event.target.value)} placeholder="المحافظة - القضاء - الحي" maxLength={200} aria-label="العنوان" />
          </dd>
        </div>
      </dl>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="info-actions">
        <button type="submit" className="btn primary" disabled={busy}><Check size={16} aria-hidden /> {busy ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}</button>
        <button type="button" className="btn" disabled={busy} onClick={() => { setDraft(null); setError(''); }}><X size={16} aria-hidden /> إلغاء</button>
      </footer>
    </form>
  );
}
