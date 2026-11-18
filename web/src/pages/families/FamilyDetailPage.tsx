import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, ArrowRight, Building2, CalendarDays, Camera, CheckCircle2, ClipboardCheck,
  FileText, HandCoins, HeartHandshake, HeartPulse, Home, MapPin, Phone, Pill, Plus,
  Printer, Search, ShieldCheck, Stethoscope, UserCheck, Users, Wallet,
} from 'lucide-react';
import { api, type Me, type Overview } from '../../api';
import { formatNumber, initialOf } from '../../format';
import { compressAvatar } from '../../image';
import { familyIdFromHash } from '../../route';
import { printWhenReady } from '../../components/printWhenReady';
import { AddFamilyAidDialog } from './FamilyDialogs';
import { FamilyDossierPrint } from './FamilyPrintSheets';
import {
  CATEGORY_LABELS,
  HOUSING_LABELS,
  PRIORITY_LABELS,
  getUnifiedDisbursements,
  loadFamilies,
  loadFamilyPhotos,
  mergeDelegates,
  saveFamilies,
  saveFamilyPhotos,
  type Family,
  type FamilyAid,
  type FamilyAidKind,
  type FamilyDelegate,
} from './sample';
import { clearPendingFamilyHeroId, getPendingFamilyHeroId, navigateWithTransition, runViewTransition } from './viewTransition';

type DetailTab = 'all' | 'salaries' | 'assistance' | 'patients' | 'members';

const TABS: { id: DetailTab; label: string }[] = [
  { id: 'all', label: 'السجل الموحد' },
  { id: 'salaries', label: 'الرواتب الشهرية' },
  { id: 'assistance', label: 'المساعدات والغذاء والإيجار' },
  { id: 'patients', label: 'مساعدات المرضى والكشفيات' },
  { id: 'members', label: 'أفراد العائلة والتقييم الميداني' },
];

export function FamilyDetailPage({ me }: { me: Me }) {
  const familyId = familyIdFromHash();
  const [families, setFamilies] = useState<Family[]>(() => loadFamilies());
  const [photos, setPhotos] = useState<Record<number, string>>(() => loadFamilyPhotos());
  const [liveDelegates, setLiveDelegates] = useState<FamilyDelegate[]>(() => mergeDelegates());

  const [activeTab, setActiveTab] = useState<DetailTab>('all');
  const [ledgerQuery, setLedgerQuery] = useState('');
  const [aidKindModal, setAidKindModal] = useState<FamilyAidKind | null>(null);
  const [printing, setPrinting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const tabRefs = useRef<Record<DetailTab, HTMLButtonElement | null>>({
    all: null, salaries: null, assistance: null, patients: null, members: null,
  });
  const panelRefs = useRef<Record<DetailTab, HTMLDivElement | null>>({
    all: null, salaries: null, assistance: null, patients: null, members: null,
  });
  const heroAvatarRef = useRef<HTMLDivElement>(null);

  const tablistLabelId = useId();
  const delegateSelectId = useId();

  useEffect(() => {
    let active = true;
    api<Overview>('/overview')
      .then((overview) => {
        if (!active) return;
        setLiveDelegates(mergeDelegates(overview.delegates));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Clean up any view-transition-name applied for incoming morphing.
  useEffect(() => {
    const pendingId = getPendingFamilyHeroId();
    if (pendingId === familyId && heroAvatarRef.current) {
      heroAvatarRef.current.style.viewTransitionName = `family-hero-${familyId}`;
      const timer = window.setTimeout(() => {
        if (heroAvatarRef.current) heroAvatarRef.current.style.viewTransitionName = '';
        clearPendingFamilyHeroId();
      }, 650);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [familyId]);

  // Listen for Chrome Find-in-Page `beforematch` so hidden="until-found" switches tabs smoothly.
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    for (const tab of TABS) {
      const panel = panelRefs.current[tab.id];
      if (!panel) continue;
      const onMatch = () => {
        setActiveTab(tab.id);
      };
      panel.addEventListener('beforematch', onMatch);
      cleanups.push(() => panel.removeEventListener('beforematch', onMatch));
    }
    return () => cleanups.forEach((fn) => fn());
  }, []);

  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    const cancel = printWhenReady('.fam-print-sheet');
    return () => {
      cancel();
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  const family = families.find((f) => f.id === familyId);

  const delegates = useMemo(() => {
    const map = new Map<string, FamilyDelegate>();
    for (const d of liveDelegates) map.set(d.name, d);
    for (const f of families) {
      if (!map.has(f.delegateName)) {
        map.set(f.delegateName, {
          id: f.delegateId,
          name: f.delegateName,
          phone: f.delegatePhone,
          zone: f.district,
        });
      }
    }
    return [...map.values()];
  }, [liveDelegates, families]);

  const data = useMemo(() => (family ? getUnifiedDisbursements(family) : null), [family]);

  const filteredLedger = useMemo(() => {
    if (!data) return [];
    const needle = ledgerQuery.trim();
    return data.items.filter((item) => {
      if (!needle) return true;
      return [
        item.title,
        item.label,
        item.delegateName,
        item.foundation,
        item.note,
        item.doctor ?? '',
        item.patientName ?? '',
        item.receiptNo,
      ].some((txt) => txt.includes(needle));
    });
  }, [data, ledgerQuery]);

  if (!family || !data) {
    return (
      <div className="fam-page" dir="rtl">
        <section className="fam-empty">
          <HeartHandshake size={42} aria-hidden />
          <h1 id="family-detail-heading" tabIndex={-1}>ملف العائلة غير موجود</h1>
          <p>تعذّر العثور على سجل بهذا الرقم، قد يكون أُزيل أو تغير رابطه.</p>
          <a
            className="btn primary"
            href="#/families"
            onClick={(e) => {
              e.preventDefault();
              navigateWithTransition('#/families', { focusTargetId: 'families-heading' });
            }}
          >
            <ArrowRight size={17} aria-hidden /> العودة إلى العوائل المتعففة
          </a>
        </section>
      </div>
    );
  }

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const blob = await compressAvatar(file);
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') return;
        const next = { ...photos, [family.id]: reader.result };
        setPhotos(next);
        saveFamilyPhotos(next);
        setStatusMessage('تم تحديث صورة ملف العائلة بنجاح');
      };
      reader.readAsDataURL(blob);
    } catch {
      setStatusMessage('تعذّر قراءة الصورة، جرّب صورة أخرى');
    }
  };

  const handleDelegateChange = (delegateName: string) => {
    const found = delegates.find((d) => d.name === delegateName);
    if (!found) return;
    const updated = families.map((f) => (f.id === family.id
      ? { ...f, delegateId: found.id, delegateName: found.name, delegatePhone: found.phone }
      : f));
    setFamilies(updated);
    saveFamilies(updated);
    setStatusMessage(`تم إسناد العائلة إلى المندوب ${found.name}`);
  };

  const handleCreateAid = (aid: FamilyAid) => {
    const updated = families.map((f) => (f.id === family.id
      ? { ...f, lastVisit: aid.date, aids: [aid, ...f.aids] }
      : f));
    runViewTransition(() => {
      setFamilies(updated);
    });
    saveFamilies(updated);
    setStatusMessage(`تم تسجيل ${aid.title} بنجاح`);
  };

  const selectTab = (tabId: DetailTab) => {
    setActiveTab(tabId);
    const btn = tabRefs.current[tabId];
    btn?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((t) => t.id === activeTab);
    if (index < 0) return;
    const isRtl = true;
    let nextIndex = -1;
    if (event.key === 'ArrowLeft') nextIndex = isRtl ? (index + 1) % TABS.length : (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'ArrowRight') nextIndex = isRtl ? (index - 1 + TABS.length) % TABS.length : (index + 1) % TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = TABS.length - 1;

    if (nextIndex >= 0) {
      event.preventDefault();
      const targetTab = TABS[nextIndex].id;
      selectTab(targetTab);
      tabRefs.current[targetTab]?.focus();
    }
  };

  const salaryItems = data.items.filter((i) => i.group === 'salary');
  const assistanceItems = data.items.filter((i) => i.group === 'assistance');
  const patientItems = data.items.filter((i) => i.source === 'patient');
  const photo = photos[family.id];
  const pct = (value: number) => (data.grandTotal > 0 ? Math.round((value / data.grandTotal) * 100) : 0);

  return (
    <div className="fam-page fam-detail" dir="rtl">
      <p role="status" className="visually-hidden">{statusMessage}</p>

      {/* Top Navigation & Quick Actions */}
      <nav className="fam-detail-nav" aria-label="مسار الملف">
        <a
          className="fam-back-link"
          href="#/families"
          onClick={(e) => {
            e.preventDefault();
            navigateWithTransition('#/families', {
              familyId: family.id,
              focusTargetId: 'families-heading',
              sourceEl: heroAvatarRef.current,
            });
          }}
        >
          <ArrowRight size={17} aria-hidden /> العودة إلى سجل العوائل
        </a>

        <div className="fam-detail-actions">
          <button type="button" className="btn" onClick={() => setPrinting(true)}>
            <Printer size={17} aria-hidden /> طباعة الملف الكامل
          </button>
          <button type="button" className="btn" onClick={() => setAidKindModal('food')}>
            <HandCoins size={17} aria-hidden /> صرف مساعدة
          </button>
          <button type="button" className="btn primary" onClick={() => setAidKindModal('salary')}>
            <Plus size={17} aria-hidden /> صرف الراتب الشهري
          </button>
        </div>
      </nav>

      {/* Dossier Hero Header */}
      <header className="fam-dossier-hero">
        <div className="fam-dossier-main">
          <div className="fam-dossier-photo-box" ref={heroAvatarRef}>
            <label className={`fam-dossier-photo tone-${family.tone}`} title="تغيير صورة الملف العائلي">
              {photo
                ? <img src={photo} alt={family.headName} />
                : <span>{initialOf(family.guardianName)}</span>}
              <span className="fam-photo-badge" aria-hidden><Camera size={15} /></span>
              <input
                type="file"
                accept="image/*"
                aria-label={`رفع صورة ${family.headName}`}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  void pickPhoto(file);
                }}
                hidden
              />
            </label>
          </div>

          <div className="fam-dossier-info">
            <div className="fam-card-meta">
              <span className="fam-file-chip"><bdi dir="ltr">{family.fileNo}</bdi></span>
              <span className={`fam-prio-pill priority-${family.priority}`}>{PRIORITY_LABELS[family.priority]}</span>
              <span className="fam-cat-pill">{CATEGORY_LABELS[family.category]}</span>
              <span className="fam-cat-pill">{HOUSING_LABELS[family.housing]}</span>
            </div>

            <h1 id="family-detail-heading" tabIndex={-1}>{family.headName}</h1>
            <p className="fam-dossier-guardian">
              المعيل المسؤول: <b>{family.guardianName}</b> • الهوية/البطاقة: <bdi dir="ltr">{family.nationalId}</bdi>
            </p>

            <dl className="fam-dossier-facts">
              <div>
                <dt><Phone size={14} aria-hidden /> رقم الهاتف</dt>
                <dd><bdi dir="ltr">{family.phone}</bdi></dd>
              </div>
              <div>
                <dt><MapPin size={14} aria-hidden /> العنوان الكامل</dt>
                <dd>{family.address}</dd>
              </div>
              <div>
                <dt><Users size={14} aria-hidden /> عدد الأفراد</dt>
                <dd><bdi>{family.members.length}</bdi> أفراد</dd>
              </div>
              <div>
                <dt><CalendarDays size={14} aria-hidden /> تاريخ التسجيل وآخر زيارة</dt>
                <dd><bdi dir="ltr">{family.registeredAt}</bdi> • زيارة <bdi dir="ltr">{family.lastVisit}</bdi></dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Dedicated Delegate Profile Box */}
        <aside className="fam-delegate-card" aria-label="المندوب الخاص بالعائلة">
          <div className="fam-del-card-top">
            <span className="fam-del-card-icon" aria-hidden><UserCheck size={20} /></span>
            <div>
              <small>المندوب الخاص المتابع للعائلة</small>
              <h2>{family.delegateName}</h2>
            </div>
          </div>
          <div className="fam-del-card-meta">
            <span><Phone size={14} aria-hidden /> <bdi dir="ltr">{family.delegatePhone}</bdi></span>
            <span><ShieldCheck size={14} aria-hidden /> {family.verifiedBy}</span>
          </div>
          <div className="fam-del-reassign">
            <label htmlFor={delegateSelectId}>تغيير أو إعادة إسناد المندوب</label>
            <select
              id={delegateSelectId}
              className="fam-select"
              value={family.delegateName}
              onChange={(e) => handleDelegateChange(e.target.value)}
            >
              {delegates.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name} ({d.zone})
                </option>
              ))}
            </select>
          </div>
        </aside>
      </header>

      {/* 5-Metric Comprehensive Support Strip */}
      <section className="fam-detail-kpis" aria-label="ملخص جميع أشكال الدعم">
        <article className="fam-dkpi">
          <span className="fam-dkpi-icon tone-emerald" aria-hidden><Wallet size={19} /></span>
          <div>
            <small>الرواتب الشهرية</small>
            <strong><bdi>{formatNumber(data.salariesTotal)}</bdi> <em>{me.currency}</em></strong>
            <span className="fam-dkpi-foot">المقرر شهرياً: <bdi>{formatNumber(family.monthlySalary)}</bdi></span>
          </div>
        </article>

        <article className="fam-dkpi">
          <span className="fam-dkpi-icon tone-amber" aria-hidden><HandCoins size={19} /></span>
          <div>
            <small>المساعدات والغذاء والإيجار</small>
            <strong><bdi>{formatNumber(data.assistanceTotal)}</bdi> <em>{me.currency}</em></strong>
            <span className="fam-dkpi-foot"><bdi>{assistanceItems.length}</bdi> دفعات مسجلة</span>
          </div>
        </article>

        <article className="fam-dkpi">
          <span className="fam-dkpi-icon tone-teal" aria-hidden><Pill size={19} /></span>
          <div>
            <small>مساعدات المرضى والدواء</small>
            <strong><bdi>{formatNumber(data.patientCashTotal + data.patientMedicineTotal)}</bdi> <em>{me.currency}</em></strong>
            <span className="fam-dkpi-foot">من سجل المرضى ({data.linkedPatients.length} مريض)</span>
          </div>
        </article>

        <article className="fam-dkpi">
          <span className="fam-dkpi-icon tone-rose" aria-hidden><Stethoscope size={19} /></span>
          <div>
            <small>الكشفيات الطبية</small>
            <strong><bdi>{formatNumber(data.patientExamsTotal)}</bdi> <em>{me.currency}</em></strong>
            <span className="fam-dkpi-foot"><bdi>{data.patientExamsCount}</bdi> كشفية طبية موثقة</span>
          </div>
        </article>

        <article className="fam-dkpi is-grand">
          <span className="fam-dkpi-icon tone-brand" aria-hidden><Building2 size={19} /></span>
          <div>
            <small>إجمالي الدعم التراكمي</small>
            <strong><bdi>{formatNumber(data.grandTotal)}</bdi> <em>{me.currency}</em></strong>
            <span className="fam-dkpi-foot"><bdi>{data.items.length}</bdi> حركة مالية وطبية</span>
          </div>
        </article>
      </section>

      {/* Aid Composition Bar */}
      <section className="fam-mix-banner" aria-label="نسب توزيع الدعم">
        <div className="fam-mix-banner-head">
          <h2>هيكل الرعاية التراكمي للعائلة</h2>
          <ul>
            <li><i className="seg-salary" /> الرواتب <bdi>{pct(data.salariesTotal)}%</bdi></li>
            <li><i className="seg-assist" /> المساعدات <bdi>{pct(data.assistanceTotal)}%</bdi></li>
            <li><i className="seg-patient" /> المرضى والدواء <bdi>{pct(data.patientCashTotal + data.patientMedicineTotal)}%</bdi></li>
            <li><i className="seg-exam" /> الكشفيات الطبية <bdi>{pct(data.patientExamsTotal)}%</bdi></li>
          </ul>
        </div>
        <div className="fam-mix-bar is-lg" aria-hidden>
          {data.salariesTotal > 0 && <span className="seg-salary" style={{ width: `${Math.max(4, pct(data.salariesTotal))}%` }} />}
          {data.assistanceTotal > 0 && <span className="seg-assist" style={{ width: `${Math.max(4, pct(data.assistanceTotal))}%` }} />}
          {(data.patientCashTotal + data.patientMedicineTotal) > 0 && (
            <span className="seg-patient" style={{ width: `${Math.max(4, pct(data.patientCashTotal + data.patientMedicineTotal))}%` }} />
          )}
          {data.patientExamsTotal > 0 && <span className="seg-exam" style={{ width: `${Math.max(4, pct(data.patientExamsTotal))}%` }} />}
        </div>
      </section>

      {/* Accessible Modern Tabs Workspace */}
      <section className="fam-tabs-card" aria-labelledby={tablistLabelId}>
        <span id={tablistLabelId} className="visually-hidden">أقسام ملف العائلة الكامل</span>

        <div
          className="fam-tablist scroller"
          aria-labelledby={tablistLabelId}
          onKeyDown={onTabKeyDown}
          {...({ focusgroup: 'tablist nomemory' } as Record<string, string>)}
        >
          {TABS.map((tab) => {
            const selected = activeTab === tab.id;
            const badgeCount = tab.id === 'all'
              ? data.items.length
              : tab.id === 'salaries'
                ? salaryItems.length
                : tab.id === 'assistance'
                  ? assistanceItems.length
                  : tab.id === 'patients'
                    ? patientItems.length
                    : family.members.length;

            return (
              <button
                key={tab.id}
                ref={(el) => { tabRefs.current[tab.id] = el; }}
                id={`fam-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => selectTab(tab.id)}
                {...(selected ? ({ focusgroupstart: '' } as Record<string, string>) : {})}
              >
                <span>{tab.label}</span>
                <small><bdi>{badgeCount}</bdi></small>
              </button>
            );
          })}
        </div>

        {/* Panels use stacked same-cell placement + hidden="until-found" per Modern Web Guidance Tabs pattern */}
        <div className="fam-panels">
          {/* TAB 1: Unified Ledger */}
          <div
            ref={(el) => { panelRefs.current.all = el; }}
            role="tabpanel"
            aria-labelledby="fam-tab-all"
            tabIndex={activeTab === 'all' ? 0 : undefined}
            {...(activeTab === 'all' ? {} : ({ hidden: 'until-found' } as unknown as { hidden?: boolean }))}
          >
            <div className="fam-panel-inner">
              <div className="fam-panel-tools">
                <label className="fam-search-mini">
                  <Search size={16} aria-hidden />
                  <input
                    type="search"
                    value={ledgerQuery}
                    onChange={(e) => setLedgerQuery(e.target.value)}
                    placeholder="ابحث في كل الرواتب والمساعدات والكشفيات..."
                    aria-label="بحث في السجل الموحد"
                  />
                </label>
                <span className="fam-count-note">يعرض <bdi>{filteredLedger.length}</bdi> حركة</span>
              </div>

              <div className="fam-table-wrap" tabIndex={0}>
                <table className="fam-table">
                  <thead>
                    <tr>
                      <th scope="col">التاريخ</th>
                      <th scope="col">الفئة</th>
                      <th scope="col">البيان والتفاصيل</th>
                      <th scope="col">المصدر / المؤسسة</th>
                      <th scope="col">المندوب / الطبيب</th>
                      <th scope="col" className="num">المبلغ ({me.currency})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLedger.map((item) => (
                      <tr key={item.id}>
                        <td><bdi dir="ltr">{item.date}</bdi></td>
                        <td><span className={`fam-kind-pill group-${item.group}`}>{item.label}</span></td>
                        <td>
                          <div className="fam-t-name">
                            <b>{item.title}</b>
                            <small>{item.note} • وصل <bdi dir="ltr">{item.receiptNo}</bdi></small>
                          </div>
                        </td>
                        <td>
                          {item.source === 'patient' && item.patientId ? (
                            <a href={`#/patients/${item.patientId}`} className="fam-pt-chip">
                              <HeartPulse size={13} aria-hidden /> سجل المرضى ({item.foundation})
                            </a>
                          ) : (
                            <span>{item.foundation}</span>
                          )}
                        </td>
                        <td>
                          <span>{item.delegateName}</span>
                          {item.doctor && <small className="fam-t-sub">{item.doctor}</small>}
                        </td>
                        <td className="num"><b><bdi>{formatNumber(item.amount)}</bdi></b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* TAB 2: Salaries */}
          <div
            ref={(el) => { panelRefs.current.salaries = el; }}
            role="tabpanel"
            aria-labelledby="fam-tab-salaries"
            tabIndex={activeTab === 'salaries' ? 0 : undefined}
            {...(activeTab === 'salaries' ? {} : ({ hidden: 'until-found' } as unknown as { hidden?: boolean }))}
          >
            <div className="fam-panel-inner">
              <div className="fam-panel-banner">
                <div>
                  <h3>الراتب الشهري المقرر: <bdi>{formatNumber(family.monthlySalary)}</bdi> {me.currency}</h3>
                  <p>مجموع الرواتب المصروفة حتى الآن: <b><bdi>{formatNumber(data.salariesTotal)}</bdi> {me.currency}</b></p>
                </div>
                <button type="button" className="btn primary" onClick={() => setAidKindModal('salary')}>
                  <Plus size={16} aria-hidden /> صرف راتب جديد
                </button>
              </div>

              <div className="fam-table-wrap" tabIndex={0}>
                <table className="fam-table">
                  <thead>
                    <tr>
                      <th scope="col">التاريخ</th>
                      <th scope="col">بيان الراتب</th>
                      <th scope="col">المندوب المسلّم</th>
                      <th scope="col">رقم الوصل</th>
                      <th scope="col">الملاحظات</th>
                      <th scope="col" className="num">المبلغ ({me.currency})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salaryItems.map((item) => (
                      <tr key={item.id}>
                        <td><bdi dir="ltr">{item.date}</bdi></td>
                        <td><b>{item.title}</b></td>
                        <td>{item.delegateName}</td>
                        <td><bdi dir="ltr">{item.receiptNo}</bdi></td>
                        <td>{item.note}</td>
                        <td className="num"><b><bdi>{formatNumber(item.amount)}</bdi></b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* TAB 3: General Assistance */}
          <div
            ref={(el) => { panelRefs.current.assistance = el; }}
            role="tabpanel"
            aria-labelledby="fam-tab-assistance"
            tabIndex={activeTab === 'assistance' ? 0 : undefined}
            {...(activeTab === 'assistance' ? {} : ({ hidden: 'until-found' } as unknown as { hidden?: boolean }))}
          >
            <div className="fam-panel-inner">
              <div className="fam-panel-banner">
                <div>
                  <h3>المساعدات الغذائية والإيجار والطارئة</h3>
                  <p>إجمالي المصروف في هذا القسم: <b><bdi>{formatNumber(data.assistanceTotal)}</bdi> {me.currency}</b></p>
                </div>
                <button type="button" className="btn primary" onClick={() => setAidKindModal('food')}>
                  <Plus size={16} aria-hidden /> إضافة مساعدة أو إيجار
                </button>
              </div>

              <div className="fam-table-wrap" tabIndex={0}>
                <table className="fam-table">
                  <thead>
                    <tr>
                      <th scope="col">التاريخ</th>
                      <th scope="col">النوع</th>
                      <th scope="col">البيان</th>
                      <th scope="col">المندوب</th>
                      <th scope="col">رقم الوصل</th>
                      <th scope="col" className="num">المبلغ ({me.currency})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assistanceItems.map((item) => (
                      <tr key={item.id}>
                        <td><bdi dir="ltr">{item.date}</bdi></td>
                        <td><span className="fam-kind-pill group-assistance">{item.label}</span></td>
                        <td>
                          <div className="fam-t-name">
                            <b>{item.title}</b>
                            <small>{item.note}</small>
                          </div>
                        </td>
                        <td>{item.delegateName}</td>
                        <td><bdi dir="ltr">{item.receiptNo}</bdi></td>
                        <td className="num"><b><bdi>{formatNumber(item.amount)}</bdi></b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* TAB 4: Live Patient Aid & Medical Exams from Patients Page */}
          <div
            ref={(el) => { panelRefs.current.patients = el; }}
            role="tabpanel"
            aria-labelledby="fam-tab-patients"
            tabIndex={activeTab === 'patients' ? 0 : undefined}
            {...(activeTab === 'patients' ? {} : ({ hidden: 'until-found' } as unknown as { hidden?: boolean }))}
          >
            <div className="fam-panel-inner">
              {data.linkedPatients.length === 0 ? (
                <div className="fam-empty is-compact">
                  <Stethoscope size={32} aria-hidden />
                  <h3>لا توجد حالات مرضية مسجلة لهذه العائلة</h3>
                  <p>عند ربط مريض من صفحة المرضى بهذه العائلة، ستظهر كشفياته وأدويته ومساعداته هنا تلقائياً.</p>
                </div>
              ) : (
                <>
                  <div className="fam-patients-cards">
                    {data.linkedPatients.map((patient) => {
                      const ptCash = patient.records.reduce((s, r) => s + r.cash, 0);
                      const ptMed = patient.records.reduce((s, r) => s + r.medicine, 0);
                      const ptExams = patient.records.reduce((s, r) => s + r.exams, 0);
                      return (
                        <article key={patient.id} className="fam-pt-linked-card">
                          <div className="fam-ptl-head">
                            <div>
                              <span className="fam-file-chip"><bdi dir="ltr">{patient.file}</bdi></span>
                              <h3>{patient.name}</h3>
                              <p>{patient.condition} • <bdi>{patient.age}</bdi> سنة</p>
                            </div>
                            <a href={`#/patients/${patient.id}`} className="btn">
                              ملف المريض <ArrowLeft size={15} aria-hidden />
                            </a>
                          </div>
                          <dl className="fam-ptl-nums">
                            <div><dt>مبالغ نقدية</dt><dd><bdi>{formatNumber(ptCash)}</bdi></dd></div>
                            <div><dt>شراء دواء</dt><dd><bdi>{formatNumber(ptMed)}</bdi></dd></div>
                            <div><dt>كشفيات طبية</dt><dd><bdi>{formatNumber(ptExams)}</bdi></dd></div>
                          </dl>
                        </article>
                      );
                    })}
                  </div>

                  <div className="fam-table-wrap" tabIndex={0}>
                    <table className="fam-table">
                      <thead>
                        <tr>
                          <th scope="col">التاريخ</th>
                          <th scope="col">المريض</th>
                          <th scope="col">نوع الرعاية</th>
                          <th scope="col">الطبيب</th>
                          <th scope="col">المؤسسة الداعمة</th>
                          <th scope="col">المندوب</th>
                          <th scope="col" className="num">المبلغ ({me.currency})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {patientItems.map((item) => (
                          <tr key={item.id}>
                            <td><bdi dir="ltr">{item.date}</bdi></td>
                            <td>
                              {item.patientId ? (
                                <a href={`#/patients/${item.patientId}`} className="fam-pt-chip">
                                  {item.patientName}
                                </a>
                              ) : item.patientName}
                            </td>
                            <td><span className={`fam-kind-pill group-${item.group}`}>{item.label}</span></td>
                            <td>{item.doctor}</td>
                            <td>{item.foundation}</td>
                            <td>{item.delegateName}</td>
                            <td className="num"><b><bdi>{formatNumber(item.amount)}</bdi></b></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* TAB 5: Members & Modern Accordions Field Report */}
          <div
            ref={(el) => { panelRefs.current.members = el; }}
            role="tabpanel"
            aria-labelledby="fam-tab-members"
            tabIndex={activeTab === 'members' ? 0 : undefined}
            {...(activeTab === 'members' ? {} : ({ hidden: 'until-found' } as unknown as { hidden?: boolean }))}
          >
            <div className="fam-panel-inner">
              <div className="fam-members-grid">
                {family.members.map((member) => (
                  <article key={member.id} className="fam-member-card">
                    <div className="fam-mc-head">
                      <span className={`fam-mc-badge ${member.gender === 'female' ? 'is-female' : 'is-male'}`}>
                        {member.name.charAt(0)}
                      </span>
                      <div>
                        <h3>{member.name}</h3>
                        <p>{member.relation} • <bdi>{member.age}</bdi> سنة</p>
                      </div>
                      {member.isOrphan && <span className="fam-orphan-tag">يتيم مكفول</span>}
                    </div>
                    <dl className="fam-mc-body">
                      <div><dt>الوضع</dt><dd>{member.roleNote}</dd></div>
                      <div>
                        <dt>الحالة الصحية</dt>
                        <dd>
                          {member.patientId ? (
                            <a href={`#/patients/${member.patientId}`} className="fam-pt-chip">
                              <HeartPulse size={13} aria-hidden /> {member.healthNote}
                            </a>
                          ) : member.healthNote}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>

              {/* Native Animated <details> Field Assessment Accordion (no headings inside summary!) */}
              <section className="fam-accordions" aria-label="التقييم الميداني والمستندات">
                <details className="fam-acc" open>
                  <summary>التقرير الميداني والتقييم الاجتماعي ({family.verifiedBy})</summary>
                  <div className="fam-acc-body">
                    <p>{family.caseSummary}</p>
                    <div className="fam-needs-list">
                      <strong>الاحتياجات المعتمدة للعائلة:</strong>
                      <ul>
                        {family.needs.map((need) => (
                          <li key={need}><CheckCircle2 size={14} aria-hidden /> {need}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </details>

                <details className="fam-acc">
                  <summary>تفاصيل السكن والإيجار والعنوان الجغرافي</summary>
                  <div className="fam-acc-body">
                    <dl className="fam-acc-dl">
                      <div><dt>نوع السكن</dt><dd>{HOUSING_LABELS[family.housing]}</dd></div>
                      <div><dt>قيمة الإيجار الشهري</dt><dd><bdi>{formatNumber(family.rentAmount)}</bdi> {me.currency}</dd></div>
                      <div><dt>العنوان المفصل</dt><dd>{family.address}</dd></div>
                      <div><dt>القاطع / المنطقة</dt><dd>{family.district}</dd></div>
                    </dl>
                  </div>
                </details>

                <details className="fam-acc">
                  <summary>المستمسكات والأرشفة الإدارية لرقم الملف {family.fileNo}</summary>
                  <div className="fam-acc-body">
                    <ul className="fam-docs-list">
                      <li><FileText size={15} aria-hidden /> البطاقة الوطنية الموحدة: <bdi dir="ltr">{family.nationalId}</bdi></li>
                      <li><ClipboardCheck size={15} aria-hidden /> محضر الكشف الميداني موقّع بتاريخ <bdi dir="ltr">{family.lastVisit}</bdi></li>
                      <li><Home size={15} aria-hidden /> تأييد السكن والمختار (محفوظ بالأرشيف)</li>
                      <li><UserCheck size={15} aria-hidden /> تعهد متابعة المندوب: {family.delegateName}</li>
                    </ul>
                  </div>
                </details>
              </section>
            </div>
          </div>
        </div>
      </section>

      {aidKindModal && (
        <AddFamilyAidDialog
          open={Boolean(aidKindModal)}
          family={family}
          delegates={delegates}
          currency={me.currency}
          initialKind={aidKindModal}
          onClose={() => setAidKindModal(null)}
          onCreate={handleCreateAid}
        />
      )}

      {printing && createPortal(
        <FamilyDossierPrint family={family} currency={me.currency} />,
        document.body,
      )}
    </div>
  );
}
