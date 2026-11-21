import { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, Building2, CalendarDays, HandCoins, HeartHandshake, HeartPulse, Home, LayoutGrid,
  MapPin, Phone, Plus, Printer, Search, Stethoscope, Table2, UserCheck, Users, Wallet,
} from 'lucide-react';
import { api, type Me, type Overview } from '../../api';
import { formatNumber, initialOf } from '../../format';
import { printWhenReady } from '../../components/printWhenReady';
import { SortTh, compare, nextSort, type SortState } from '../../components/SortTh';
import { AddFamilyAidDialog, AddFamilyDialog } from './FamilyDialogs';
import { FamiliesRegisterPrint } from './FamilyPrintSheets';
import {
  CATEGORY_LABELS,
  HOUSING_LABELS,
  PRIORITY_LABELS,
  getUnifiedDisbursements,
  loadFamilies,
  loadFamilyPhotos,
  mergeDelegates,
  saveFamilies,
  type Family,
  type FamilyAid,
  type FamilyAidKind,
  type FamilyCategory,
  type FamilyDelegate,
  type PriorityLevel,
} from './sample';
import { navigateWithTransition, runViewTransition } from './viewTransition';

type TableKey = 'headName' | 'district' | 'delegateName' | 'monthlySalary' | 'patientTotal' | 'grandTotal';

export function FamiliesPage({ me }: { me: Me }) {
  const [families, setFamilies] = useState<Family[]>(() => loadFamilies());
  const [photos] = useState<Record<number, string>>(() => loadFamilyPhotos());
  const [liveDelegates, setLiveDelegates] = useState<FamilyDelegate[]>(() => mergeDelegates());

  const [query, setQuery] = useState('');
  const [delegateFilter, setDelegateFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityLevel | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<FamilyCategory | 'all'>('all');
  const [viewMode, setViewMode] = useState<'bento' | 'table'>('bento');
  const [sort, setSort] = useState<SortState<TableKey>>({ key: 'grandTotal', dir: 'desc' });

  const [selectedId, setSelectedId] = useState<number>(() => loadFamilies()[0]?.id ?? 1);
  const [showAddFamily, setShowAddFamily] = useState(false);
  const [aidModal, setAidModal] = useState<{ family: Family; kind: FamilyAidKind } | null>(null);
  const [printing, setPrinting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const headingId = 'families-heading';
  const delegateSelectId = useId();
  const categorySelectId = useId();

  useEffect(() => {
    let active = true;
    api<Overview>('/overview')
      .then((overview) => {
        if (!active) return;
        setLiveDelegates(mergeDelegates(overview.delegates));
      })
      .catch(() => {
        // Offline / sample mode keeps SAMPLE_DELEGATES cleanly.
      });
    return () => { active = false; };
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

  // Enrich delegates list with any delegate names referenced in stored families.
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

  const enriched = useMemo(() => families.map((family) => ({
    family,
    totals: getUnifiedDisbursements(family),
  })), [families]);

  const visible = useMemo(() => {
    const needle = query.trim();
    // When a delegate signs in directly, scope or prioritize; allow filtering normally.
    const filtered = enriched.filter(({ family, totals }) => {
      if (delegateFilter !== 'all' && family.delegateName !== delegateFilter) return false;
      if (priorityFilter !== 'all' && family.priority !== priorityFilter) return false;
      if (categoryFilter !== 'all' && family.category !== categoryFilter) return false;
      if (!needle) return true;
      return [
        family.headName,
        family.guardianName,
        family.fileNo,
        family.phone,
        family.district,
        family.address,
        family.delegateName,
        ...totals.linkedPatients.map((p) => `${p.name} ${p.condition}`),
      ].some((text) => text.includes(needle));
    });

    return filtered.sort((a, b) => {
      switch (sort.key) {
        case 'headName': return compare(a.family.headName, b.family.headName, sort.dir);
        case 'district': return compare(a.family.district, b.family.district, sort.dir);
        case 'delegateName': return compare(a.family.delegateName, b.family.delegateName, sort.dir);
        case 'monthlySalary': return compare(a.family.monthlySalary, b.family.monthlySalary, sort.dir);
        case 'patientTotal': return compare(a.totals.patientAidTotal, b.totals.patientAidTotal, sort.dir);
        case 'grandTotal': return compare(a.totals.grandTotal, b.totals.grandTotal, sort.dir);
      }
    });
  }, [enriched, delegateFilter, priorityFilter, categoryFilter, query, sort]);

  const selectedEntry = visible.find((entry) => entry.family.id === selectedId)
    ?? visible[0]
    ?? enriched[0];

  const stats = useMemo(() => {
    let monthlyCommitment = 0;
    let totalSalaries = 0;
    let totalAssistance = 0;
    let totalPatientsAid = 0;
    let examsCount = 0;
    let membersCount = 0;

    for (const { family, totals } of visible) {
      monthlyCommitment += family.monthlySalary;
      totalSalaries += totals.salariesTotal;
      totalAssistance += totals.assistanceTotal;
      totalPatientsAid += totals.patientAidTotal;
      examsCount += totals.patientExamsCount;
      membersCount += family.members.length;
    }

    return {
      monthlyCommitment,
      totalSalaries,
      totalAssistance,
      totalPatientsAid,
      examsCount,
      membersCount,
    };
  }, [visible]);

  const updateFilterWithTransition = (fn: () => void, label: string) => {
    runViewTransition(() => {
      fn();
    });
    setStatusMessage(label);
  };

  const handleSort = (key: TableKey) => {
    const dirDefault = key === 'headName' || key === 'district' || key === 'delegateName' ? 'asc' : 'desc';
    runViewTransition(() => {
      setSort((current) => nextSort(current, key, dirDefault));
    });
    setStatusMessage('تم إعادة ترتيب قائمة العوائل');
  };

  const handleCreateFamily = (family: Family) => {
    const updated = [family, ...families];
    runViewTransition(() => {
      setFamilies(updated);
      setSelectedId(family.id);
    });
    saveFamilies(updated);
    setStatusMessage(`تم تسجيل ${family.headName} وربطها بالمندوب ${family.delegateName}`);
  };

  const handleCreateAid = (familyId: number, aid: FamilyAid) => {
    const updated = families.map((fam) => (fam.id === familyId
      ? { ...fam, lastVisit: aid.date, aids: [aid, ...fam.aids] }
      : fam));
    setFamilies(updated);
    saveFamilies(updated);
    setStatusMessage(`تم تسجيل ${aid.title} بمبلغ ${formatNumber(aid.amount)}`);
  };

  return (
    <div className="fam-page" dir="rtl">
      <p role="status" className="visually-hidden">{statusMessage}</p>

      {/* Modern Hero Banner */}
      <header className="fam-hero">
        <div className="fam-hero-main">
          <div className="fam-hero-badge" aria-hidden>
            <HeartHandshake size={28} />
          </div>
          <div className="fam-hero-copy">
            <div className="fam-eyebrow">
              <span>نظام الرعاية المتكاملة</span>
              <span>•</span>
              <span>مرتبط بسجل المندوبين والمرضى</span>
            </div>
            <h1 id={headingId} tabIndex={-1}>العوائل المتعففة</h1>
            <p>
              إدارة شاملة لكل عائلة مع مندوبها الخاص، ملف متكامل للرواتب الشهرية، المساعدات الغذائية والإيجارات،
              ومتابعة فورية لمساعدات المرضى والكشفيات الطبية.
            </p>
          </div>
        </div>

        <div className="fam-hero-actions">
          <button type="button" className="btn" onClick={() => setPrinting(true)}>
            <Printer size={17} aria-hidden /> طباعة الكشف العام
          </button>
          <button type="button" className="btn primary" onClick={() => setShowAddFamily(true)}>
            <Plus size={18} aria-hidden /> تسجيل عائلة جديدة
          </button>
        </div>

        {/* Modern 4-Tile Bento KPI Strip */}
        <section className="fam-bento-kpis" aria-label="ملخص دعم العوائل">
          <article className="fam-kpi-card tone-brand">
            <div className="fam-kpi-top">
              <span className="fam-kpi-label">العوائل المسجلة</span>
              <span className="fam-kpi-icon" aria-hidden><Home size={18} /></span>
            </div>
            <p className="fam-kpi-val">
              <bdi>{formatNumber(visible.length)}</bdi>
              <small>عائلة • <bdi>{formatNumber(stats.membersCount)}</bdi> فرد</small>
            </p>
          </article>

          <article className="fam-kpi-card tone-emerald">
            <div className="fam-kpi-top">
              <span className="fam-kpi-label">الرواتب الشهرية المصروفة</span>
              <span className="fam-kpi-icon" aria-hidden><Wallet size={18} /></span>
            </div>
            <p className="fam-kpi-val">
              <bdi>{formatNumber(stats.totalSalaries)}</bdi>
              <small>{me.currency} (التزام <bdi>{formatNumber(stats.monthlyCommitment)}</bdi>)</small>
            </p>
          </article>

          <article className="fam-kpi-card tone-amber">
            <div className="fam-kpi-top">
              <span className="fam-kpi-label">المساعدات والغذاء والإيجار</span>
              <span className="fam-kpi-icon" aria-hidden><HandCoins size={18} /></span>
            </div>
            <p className="fam-kpi-val">
              <bdi>{formatNumber(stats.totalAssistance)}</bdi>
              <small>{me.currency}</small>
            </p>
          </article>

          <article className="fam-kpi-card tone-rose">
            <div className="fam-kpi-top">
              <span className="fam-kpi-label">مساعدات المرضى والكشفيات</span>
              <span className="fam-kpi-icon" aria-hidden><HeartPulse size={18} /></span>
            </div>
            <p className="fam-kpi-val">
              <bdi>{formatNumber(stats.totalPatientsAid)}</bdi>
              <small>{me.currency} • <bdi>{formatNumber(stats.examsCount)}</bdi> كشفية</small>
            </p>
          </article>
        </section>
      </header>

      {/* Modern Floating Filter & View Switch Bar */}
      <section className="fam-toolbar" aria-label="أدوات البحث والفلترة">
        <div className="fam-search-box">
          <Search size={17} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث باسم العائلة، رقم الملف، المنطقة، المندوب، أو اسم المريض..."
            aria-label="بحث في العوائل المتعففة"
          />
        </div>

        <div className="fam-filters-row">
          <div className="fam-select-wrap">
            <label htmlFor={delegateSelectId} className="visually-hidden">تصفية حسب المندوب الخاص</label>
            <select
              id={delegateSelectId}
              className="fam-select fam-select-pill"
              value={delegateFilter}
              onChange={(e) => updateFilterWithTransition(
                () => setDelegateFilter(e.target.value),
                `تصفية حسب المندوب: ${e.target.value === 'all' ? 'الكل' : e.target.value}`,
              )}
            >
              <option value="all">كل المندوبين ({families.length})</option>
              {delegates.map((del) => {
                const count = families.filter((f) => f.delegateName === del.name).length;
                return (
                  <option key={del.name} value={del.name}>
                    المندوب: {del.name} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="fam-select-wrap">
            <label htmlFor={categorySelectId} className="visually-hidden">تصفية حسب تصنيف العائلة</label>
            <select
              id={categorySelectId}
              className="fam-select fam-select-pill"
              value={categoryFilter}
              onChange={(e) => updateFilterWithTransition(
                () => setCategoryFilter(e.target.value as FamilyCategory | 'all'),
                'تم تغيير تصنيف العوائل',
              )}
            >
              <option value="all">كل التصنيفات</option>
              {(Object.keys(CATEGORY_LABELS) as FamilyCategory[]).map((key) => (
                <option key={key} value={key}>{CATEGORY_LABELS[key]}</option>
              ))}
            </select>
          </div>

          <div className="fam-priority-pills" role="group" aria-label="تصفية حسب الأولوية">
            {([
              ['all', 'الكل'],
              ['urgent', 'حرجة'],
              ['high', 'متوسطة'],
              ['stable', 'جيدة'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={priorityFilter === key ? 'is-active' : undefined}
                aria-pressed={priorityFilter === key}
                onClick={() => updateFilterWithTransition(
                  () => setPriorityFilter(key),
                  `تصفية الأولوية: ${label}`,
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="fam-view-toggle" role="group" aria-label="طريقة العرض">
            <button
              type="button"
              className={viewMode === 'bento' ? 'is-active' : undefined}
              aria-pressed={viewMode === 'bento'}
              onClick={() => updateFilterWithTransition(() => setViewMode('bento'), 'عرض البطاقات')}
            >
              <LayoutGrid size={16} aria-hidden /> بطاقات
            </button>
            <button
              type="button"
              className={viewMode === 'table' ? 'is-active' : undefined}
              aria-pressed={viewMode === 'table'}
              onClick={() => updateFilterWithTransition(() => setViewMode('table'), 'عرض الجدول')}
            >
              <Table2 size={16} aria-hidden /> جدول
            </button>
          </div>
        </div>
      </section>

      {/* Main Split Workspace: Cards / Table + Live Inspector */}
      <div className="fam-workspace">
        <section className="fam-catalog" aria-label="قائمة العوائل المتعففة">
          {visible.length === 0 ? (
            <div className="fam-empty">
              <HeartHandshake size={40} aria-hidden />
              <h2>لا توجد عوائل تطابق معايير البحث</h2>
              <p>جرّب إزالة الفلاتر أو البحث بعبارة أخرى.</p>
              <button
                type="button"
                className="btn"
                onClick={() => updateFilterWithTransition(() => {
                  setQuery('');
                  setDelegateFilter('all');
                  setPriorityFilter('all');
                  setCategoryFilter('all');
                }, 'تم مسح الفلاتر')}
              >
                إظهار جميع العوائل
              </button>
            </div>
          ) : viewMode === 'bento' ? (
            <div className="fam-grid">
              {visible.map(({ family, totals }) => {
                const isSelected = selectedEntry?.family.id === family.id;
                const photo = photos[family.id];
                return (
                  <article
                    key={family.id}
                    className={`fam-card priority-${family.priority}${isSelected ? ' is-selected' : ''}`}
                    style={{ viewTransitionName: `fam-card-${family.id}` }}
                  >
                    {/* Card Header & Photo */}
                    <header className="fam-card-head">
                      <div className="fam-card-avatar-wrap">
                        <div className={`fam-card-avatar tone-${family.tone}`}>
                          {photo
                            ? <img src={photo} alt={family.headName} />
                            : <span>{initialOf(family.guardianName)}</span>}
                        </div>
                        <span className={`fam-prio-dot priority-${family.priority}`} title={PRIORITY_LABELS[family.priority]} />
                      </div>

                      <div className="fam-card-title">
                        <div className="fam-card-meta">
                          <span className="fam-file-chip"><bdi dir="ltr">{family.fileNo}</bdi></span>
                          <span className={`fam-prio-pill priority-${family.priority}`}>
                            {PRIORITY_LABELS[family.priority]}
                          </span>
                          <span className="fam-cat-pill">{CATEGORY_LABELS[family.category]}</span>
                        </div>
                        <h2>
                          <a
                            className="fam-card-link"
                            href={`#/families/${family.id}`}
                            onClick={(event) => {
                              event.preventDefault();
                              const avatarEl = event.currentTarget.closest('.fam-card')?.querySelector<HTMLElement>('.fam-card-avatar-wrap');
                              navigateWithTransition(`#/families/${family.id}`, {
                                familyId: family.id,
                                focusTargetId: 'family-detail-heading',
                                sourceEl: avatarEl,
                              });
                            }}
                          >
                            {family.headName}
                          </a>
                        </h2>
                        <p className="fam-card-loc">
                          <MapPin size={14} aria-hidden /> {family.district} • {HOUSING_LABELS[family.housing]}
                          {family.rentAmount > 0 && ` (${formatNumber(family.rentAmount)})`}
                        </p>
                      </div>
                    </header>

                    {/* Dedicated Delegate Strip + Quick Preview Select Button */}
                    <div className="fam-card-delegate">
                      <div className="fam-del-pill">
                        <UserCheck size={15} aria-hidden />
                        <span>المندوب الخاص: <b>{family.delegateName}</b></span>
                      </div>
                      <button
                        type="button"
                        className="fam-preview-btn"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedId(family.id)}
                        title="معاينة سريعة في اللوحة الجانبية"
                      >
                        معاينة
                      </button>
                    </div>

                    {/* 4-Part Financial + Medical Metrics */}
                    <dl className="fam-card-stats">
                      <div>
                        <dt>الراتب</dt>
                        <dd><bdi>{formatNumber(family.monthlySalary)}</bdi></dd>
                      </div>
                      <div>
                        <dt>المساعدات</dt>
                        <dd><bdi>{formatNumber(totals.assistanceTotal)}</bdi></dd>
                      </div>
                      <div>
                        <dt>مرضى وكشفيات</dt>
                        <dd className="is-medical"><bdi>{formatNumber(totals.patientAidTotal)}</bdi></dd>
                      </div>
                      <div>
                        <dt>الأفراد</dt>
                        <dd><bdi>{formatNumber(family.members.length)}</bdi></dd>
                      </div>
                    </dl>

                    {/* Linked Patients Strip */}
                    {totals.linkedPatients.length > 0 && (
                      <div className="fam-linked-patients">
                        <span className="fam-lp-title">
                          <Stethoscope size={14} aria-hidden /> مرضى مرتبطون:
                        </span>
                        <div className="fam-lp-chips">
                          {totals.linkedPatients.map((pt) => (
                            <a
                              key={pt.id}
                              className="fam-pt-chip"
                              href={`#/patients/${pt.id}`}
                              title={`فتح ملف المريض: ${pt.name} (${pt.condition})`}
                            >
                              {pt.name} <small>({pt.condition})</small>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Card Footer Actions */}
                    <footer className="fam-card-foot">
                      <button
                        type="button"
                        className="fam-quick-aid-btn"
                        onClick={() => setAidModal({ family, kind: 'salary' })}
                      >
                        <HandCoins size={15} aria-hidden /> صرف راتب / مساعدة
                      </button>
                      <span className="fam-open-cue" aria-hidden>
                        فتح الملف الكامل <ArrowLeft size={16} />
                      </span>
                    </footer>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="fam-table-wrap" tabIndex={0} role="region" aria-labelledby="fam-table-caption">
              <table className="fam-table">
                <caption id="fam-table-caption" className="visually-hidden">
                  جدول العوائل المتعففة ومندوبيها ومجموع الرواتب والمساعدات
                </caption>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <SortTh label="العائلة / رقم الملف" id="headName" sort={sort} onSort={handleSort} />
                    <SortTh label="المنطقة والسكن" id="district" sort={sort} onSort={handleSort} />
                    <SortTh label="المندوب الخاص" id="delegateName" sort={sort} onSort={handleSort} />
                    <SortTh label="الراتب الشهري" id="monthlySalary" sort={sort} onSort={handleSort} className="num" />
                    <SortTh label="مرضى وكشفيات" id="patientTotal" sort={sort} onSort={handleSort} className="num" />
                    <SortTh label="إجمالي الدعم" id="grandTotal" sort={sort} onSort={handleSort} className="num" />
                    <th scope="col">الملف</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ family, totals }, idx) => (
                    <tr
                      key={family.id}
                      className={selectedEntry?.family.id === family.id ? 'is-selected' : undefined}
                      onClick={() => setSelectedId(family.id)}
                    >
                      <td><bdi>{idx + 1}</bdi></td>
                      <td>
                        <div className="fam-t-name">
                          <b>{family.headName}</b>
                          <small><bdi dir="ltr">{family.fileNo}</bdi> • <bdi>{family.members.length}</bdi> أفراد</small>
                        </div>
                      </td>
                      <td>
                        <span>{family.district}</span>
                        <small className="fam-t-sub">{HOUSING_LABELS[family.housing]}</small>
                      </td>
                      <td>
                        <span className="fam-del-inline"><UserCheck size={14} aria-hidden /> {family.delegateName}</span>
                      </td>
                      <td className="num"><bdi>{formatNumber(family.monthlySalary)}</bdi></td>
                      <td className="num">
                        <span className="fam-t-med">
                          <bdi>{formatNumber(totals.patientAidTotal)}</bdi>
                          {totals.patientExamsCount > 0 && <small> ({totals.patientExamsCount} كشفية)</small>}
                        </span>
                      </td>
                      <td className="num"><b><bdi>{formatNumber(totals.grandTotal)}</bdi></b></td>
                      <td>
                        <a
                          className="fam-t-link"
                          href={`#/families/${family.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            navigateWithTransition(`#/families/${family.id}`, {
                              familyId: family.id,
                              focusTargetId: 'family-detail-heading',
                            });
                          }}
                        >
                          فتح الملف <ArrowLeft size={14} aria-hidden />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Live Modern Quick-Preview Inspector */}
        {selectedEntry && (
          <aside className="fam-inspector" aria-label={`معاينة ملف ${selectedEntry.family.headName}`}>
            <div className="fam-insp-head">
              <div className="fam-insp-id">
                <div className={`fam-insp-avatar tone-${selectedEntry.family.tone}`}>
                  {photos[selectedEntry.family.id]
                    ? <img src={photos[selectedEntry.family.id]} alt={selectedEntry.family.headName} />
                    : <span>{initialOf(selectedEntry.family.guardianName)}</span>}
                </div>
                <div>
                  <span className="fam-file-chip"><bdi dir="ltr">{selectedEntry.family.fileNo}</bdi></span>
                  <h2>{selectedEntry.family.headName}</h2>
                  <p>{selectedEntry.family.guardianName}</p>
                </div>
              </div>
              <a
                className="btn primary fam-insp-cta"
                href={`#/families/${selectedEntry.family.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  const av = e.currentTarget.closest('.fam-inspector')?.querySelector<HTMLElement>('.fam-insp-avatar');
                  navigateWithTransition(`#/families/${selectedEntry.family.id}`, {
                    familyId: selectedEntry.family.id,
                    focusTargetId: 'family-detail-heading',
                    sourceEl: av,
                  });
                }}
              >
                فتح الملف الخاص الكامل <ArrowLeft size={16} aria-hidden />
              </a>
            </div>

            <div className="fam-insp-delegate">
              <div className="fam-insp-del-badge">
                <UserCheck size={17} aria-hidden />
                <div>
                  <small>المندوب الخاص للعائلة</small>
                  <strong>{selectedEntry.family.delegateName}</strong>
                </div>
              </div>
              <span className="fam-insp-phone"><Phone size={13} aria-hidden /> <bdi dir="ltr">{selectedEntry.family.delegatePhone}</bdi></span>
            </div>

            <p className="fam-insp-summary">{selectedEntry.family.caseSummary}</p>

            {/* Stacked Support Breakdown Visual */}
            <div className="fam-insp-mix">
              <div className="fam-mix-head">
                <h3>توزيع إجمالي الدعم (<bdi>{formatNumber(selectedEntry.totals.grandTotal)}</bdi> {me.currency})</h3>
              </div>
              {(() => {
                const { salariesTotal, assistanceTotal, patientCashTotal, patientMedicineTotal, patientExamsTotal, grandTotal } = selectedEntry.totals;
                const pct = (v: number) => (grandTotal > 0 ? Math.max(4, Math.round((v / grandTotal) * 100)) : 25);
                return (
                  <>
                    <div className="fam-mix-bar" aria-hidden>
                      {salariesTotal > 0 && <span className="seg-salary" style={{ width: `${pct(salariesTotal)}%` }} />}
                      {assistanceTotal > 0 && <span className="seg-assist" style={{ width: `${pct(assistanceTotal)}%` }} />}
                      {(patientCashTotal + patientMedicineTotal) > 0 && (
                        <span className="seg-patient" style={{ width: `${pct(patientCashTotal + patientMedicineTotal)}%` }} />
                      )}
                      {patientExamsTotal > 0 && <span className="seg-exam" style={{ width: `${pct(patientExamsTotal)}%` }} />}
                    </div>
                    <ul className="fam-mix-legend">
                      <li><i className="seg-salary" /> رواتب <b><bdi>{formatNumber(salariesTotal)}</bdi></b></li>
                      <li><i className="seg-assist" /> مساعدات <b><bdi>{formatNumber(assistanceTotal)}</bdi></b></li>
                      <li><i className="seg-patient" /> مرضى ودواء <b><bdi>{formatNumber(patientCashTotal + patientMedicineTotal)}</bdi></b></li>
                      <li><i className="seg-exam" /> كشفيات ({selectedEntry.totals.patientExamsCount}) <b><bdi>{formatNumber(patientExamsTotal)}</bdi></b></li>
                    </ul>
                  </>
                );
              })()}
            </div>

            {/* Members Mini Roster */}
            <div className="fam-insp-members">
              <header>
                <h3><Users size={15} aria-hidden /> أفراد الأسرة ({selectedEntry.family.members.length})</h3>
                <span><CalendarDays size={13} aria-hidden /> آخر زيارة: <bdi dir="ltr">{selectedEntry.family.lastVisit}</bdi></span>
              </header>
              <ul>
                {selectedEntry.family.members.map((member) => (
                  <li key={member.id}>
                    <div>
                      <b>{member.name}</b>
                      <small>{member.relation} • <bdi>{member.age}</bdi> سنة</small>
                    </div>
                    {member.patientId ? (
                      <a href={`#/patients/${member.patientId}`} className="fam-member-pt-link">
                        <HeartPulse size={13} aria-hidden /> {member.healthNote}
                      </a>
                    ) : member.isOrphan ? (
                      <span className="fam-orphan-tag">يتيم</span>
                    ) : (
                      <span className="fam-role-tag">{member.roleNote}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        )}
      </div>

      {/* Modals */}
      <AddFamilyDialog
        open={showAddFamily}
        delegates={delegates}
        currency={me.currency}
        onClose={() => setShowAddFamily(false)}
        onCreate={handleCreateFamily}
      />

      {aidModal && (
        <AddFamilyAidDialog
          open={Boolean(aidModal)}
          family={aidModal.family}
          delegates={delegates}
          currency={me.currency}
          initialKind={aidModal.kind}
          onClose={() => setAidModal(null)}
          onCreate={(aid) => handleCreateAid(aidModal.family.id, aid)}
        />
      )}

      {printing && createPortal(
        <FamiliesRegisterPrint
          families={visible.map((v) => v.family)}
          currency={me.currency}
          delegateFilter={delegateFilter}
        />,
        document.body,
      )}
    </div>
  );
}
