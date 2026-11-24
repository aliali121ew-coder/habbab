import { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, HandHeart, Lock } from 'lucide-react';
import { api } from '../../api';
import { NewRequest, type Request } from './RequestsPage';

/* The public page a foundation shares with families: #/apply/<code>. No account. While the
   foundation's window is open, a family sends a request in the same three steps (type, place on
   the map, details); outside it the page says when it opens or that it is closed. */

interface Info { foundation: string; state: 'open' | 'scheduled' | 'closed'; from: string | null; until: string | null; mapToken: string | null }

const fmt = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('ar-IQ-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })
  : '');

export function ApplyPage({ code }: { code: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [draft, setDraft] = useState<Partial<Request>>({ members: 1, urgent: false });
  const [website, setWebsite] = useState(''); // left empty by people; filled by bots
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    api<Info>(`/apply/${encodeURIComponent(code)}`).then(setInfo).catch((e: Error) => setLoadError(e.message));
  }, [code]);

  async function submit() {
    setBusy(true); setError('');
    try {
      await api(`/apply/${encodeURIComponent(code)}`, {
        method: 'POST',
        body: {
          kind: draft.kind, title: draft.title?.trim(), details: draft.details?.trim() || undefined,
          name: draft.name?.trim(), phone: draft.phone?.trim(), province: draft.province, area: draft.area?.trim() || undefined,
          landmark: draft.landmark?.trim() || undefined, members: draft.members ?? 1, urgent: !!draft.urgent,
          lat: draft.lat ?? null, lng: draft.lng ?? null, website,
        },
      });
      setSent(true);
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  const shell = (body: React.ReactNode) => (
    <div dir="rtl" className="rq-apply">
      <header className="rq-apply-head">
        <span className="rq-ic kind-general"><HandHeart size={24} /></span>
        <div>
          <small>طلب مساعدة</small>
          <strong>{info?.foundation ?? '…'}</strong>
        </div>
      </header>
      <main className="rq-apply-main">{body}</main>
    </div>
  );

  if (loadError) return shell(<Notice icon={<Lock size={26} />} title="الرابط غير صحيح" text="تأكد من الرابط الذي وصلك من المؤسسة." />);
  if (!info) return shell(<div className="page-loading" aria-busy="true"><span className="boot-star" /></div>);
  if (sent) {
    return shell(<Notice ok icon={<CheckCircle2 size={30} />} title="وصل طلبك" text="شكراً لك. ستراجع المؤسسة طلبك وتتواصل معك على رقم الهاتف الذي أدخلته." />);
  }
  if (info.state !== 'open') {
    return shell(
      <Notice
        icon={<CalendarClock size={28} />}
        title={info.state === 'scheduled' ? 'التسجيل لم يبدأ بعد' : 'التسجيل مغلق حالياً'}
        text={info.state === 'scheduled' ? `يُفتح التسجيل ${fmt(info.from)}` : 'تفتح المؤسسة التسجيل في أوقات محددة. تابع إعلاناتها.'}
      />,
    );
  }

  if (step === 0) {
    return shell(
      <div className="rq-apply-intro">
        <h1>قدّم طلب مساعدة</h1>
        <p>ثلاث خطوات: نوع المساعدة، ثم موقعك على الخريطة، ثم بياناتك.</p>
        <p className="rq-apply-until"><CalendarClock size={16} /> التسجيل مفتوح حتى {fmt(info.until)}</p>
        <button type="button" className="rq-primary rq-wide" onClick={() => setStep(1)}>ابدأ الطلب</button>
      </div>,
    );
  }

  return (
    <div dir="rtl" className="rq-apply rq-apply-form">
      <input className="rq-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(e) => setWebsite(e.target.value)} />
      <NewRequest
        step={step}
        draft={draft}
        setDraft={setDraft}
        go={(s) => { setError(''); setStep(s); }}
        onSubmit={submit}
        busy={busy}
        error={error}
        editing={false}
        mapToken={info.mapToken}
        submitLabel="إرسال الطلب"
      />
    </div>
  );
}

function Notice({ icon, title, text, ok }: { icon: React.ReactNode; title: string; text: string; ok?: boolean }) {
  return (
    <div className={`rq-apply-notice${ok ? ' ok' : ''}`}>
      <span className="rq-apply-notice-ic">{icon}</span>
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}
