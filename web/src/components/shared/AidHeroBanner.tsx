import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, CalendarDays, ChevronLeft, ChevronRight,
  HeartPulse, ImagePlus, MapPin, MoreHorizontal, PackageCheck, Pencil,
  Plus, Sparkles, Trash2, X,
} from 'lucide-react';
import slideFood from '../../assets/hero/slide-food.jpg';
import slideMedical from '../../assets/hero/slide-medical.svg';
import slideFamily from '../../assets/hero/slide-family.svg';

type BadgeKind = 'emerald' | 'sky' | 'amber' | 'rose';

interface HeroSlide {
  id: string;
  badge: string;
  badgeKind: BadgeKind;
  title: string;
  subtitle: string;
  location: string;
  dateLabel: string;
  metric: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  image: string;
  imageAlt: string;
}

const BADGE_CLASSES: Record<BadgeKind, string> = {
  emerald: 'bg-emerald-500/90 text-white',
  sky: 'bg-sky-500/90 text-white',
  amber: 'bg-amber-400/95 text-slate-950',
  rose: 'bg-rose-500/90 text-white',
};

const PRESET_IMAGES = [
  { label: 'السلة الغذائية', src: slideFood },
  { label: 'المبادرة الطبية', src: slideMedical },
  { label: 'كسوة الأيتام', src: slideFamily },
];

const CTA_TARGETS = [
  { label: 'سجل العوائل المستفيدة', href: '#/families', secLabel: 'متابعة المندوبين', secHref: '#/delegates' },
  { label: 'ملفات المرضى', href: '#/patients', secLabel: 'سجل الصرفيات', secHref: '#/expenses' },
  { label: 'تفاصيل الصرف والتوزيع', href: '#/expenses', secLabel: 'قائمة العوائل', secHref: '#/families' },
  { label: 'سجل المندوبين', href: '#/delegates', secLabel: 'سجل العوائل', secHref: '#/families' },
];

const DEFAULT_SLIDES: HeroSlide[] = [
  {
    id: 'food-baskets',
    badge: 'قيد التوزيع الآن',
    badgeKind: 'emerald',
    title: 'توزيع السلات الغذائية للعوائل',
    subtitle: 'تجهيز وتسليم 120 سلة غذائية متكاملة عبر مندوبي المناطق مع توثيق فوري في سجل العائلة.',
    location: 'بغداد – الشعلة والكرخ',
    dateLabel: 'تشرين الثاني 2026',
    metric: '120 سلة غذائية',
    ctaLabel: 'سجل العوائل المستفيدة',
    ctaHref: '#/families',
    secondaryLabel: 'متابعة المندوبين',
    secondaryHref: '#/delegates',
    image: slideFood,
    imageAlt: 'متطوعون يجهزون السلات الغذائية للتوزيع على العوائل المتعففة',
  },
  {
    id: 'medical-aid',
    badge: 'مبادرة صحية مستمرة',
    badgeKind: 'sky',
    title: 'توفير الأدوية والكشفيات الطبية',
    subtitle: 'دعم مباشر لوصفات الأمراض المزمنة والفحوصات المختبرية بالتنسيق مع الأطباء المتعاونين.',
    location: 'جميع القواطع الصحية',
    dateLabel: 'تغطية 100% للمستحقين',
    metric: 'دعم علاجي عاجل',
    ctaLabel: 'ملفات المرضى',
    ctaHref: '#/patients',
    secondaryLabel: 'سجل الصرفيات',
    secondaryHref: '#/expenses',
    image: slideMedical,
    imageAlt: 'مبادرة توفير الأدوية والكشفيات الطبية للمرضى',
  },
  {
    id: 'winter-orphans',
    badge: 'حملة موسمية',
    badgeKind: 'amber',
    title: 'توزيع كسوة الأيتام والبطانيات',
    subtitle: 'توزيع الحصص الشتوية والقرطاسية على 85 عائلة أيتام بإشراف لجان التوزيع الميدانية.',
    location: 'الرصافة والمدينة والبلديات',
    dateLabel: 'الدفعة الأولى مكتملة',
    metric: '85 عائلة مشمولة',
    ctaLabel: 'تفاصيل الصرف والتوزيع',
    ctaHref: '#/expenses',
    secondaryLabel: 'قائمة العوائل',
    secondaryHref: '#/families',
    image: slideFamily,
    imageAlt: 'تجهيز كسوة الأيتام والمستلزمات المدرسية والبطانيات',
  },
  {
    id: 'urgent-surgeries',
    badge: 'حالات عاجلة',
    badgeKind: 'rose',
    title: 'دعم العمليات الجراحية العاجلة',
    subtitle: 'تغطية تكاليف العمليات الحرجة والمستلزمات الطبية الطارئة للمرضى المسجلين في المؤسسة.',
    location: 'بغداد والمحافظات',
    dateLabel: 'استجابة فورية',
    metric: '12 ملف مريض نشط',
    ctaLabel: 'ملفات المرضى',
    ctaHref: '#/patients',
    secondaryLabel: 'سجل الصرفيات',
    secondaryHref: '#/expenses',
    image: slideMedical,
    imageAlt: 'دعم العمليات الجراحية العاجلة',
  },
  {
    id: 'rent-support',
    badge: 'دعم السكن',
    badgeKind: 'emerald',
    title: 'سداد بدلات الإيجار للعوائل',
    subtitle: 'تسديد الإيجارات الشهرية المستحقة وتأهيل السكن لحماية عوائل الأرامل والأيتام.',
    location: 'الكاظمية والشعلة',
    dateLabel: 'يستحق في 1 من كل شهر',
    metric: 'تغطية إيجارات شهرية',
    ctaLabel: 'سجل العوائل المستفيدة',
    ctaHref: '#/families',
    secondaryLabel: 'تفاصيل الصرف',
    secondaryHref: '#/expenses',
    image: slideFamily,
    imageAlt: 'دعم إيجارات السكن وترميم المنازل',
  },
  {
    id: 'livelihood-projects',
    badge: 'مشاريع تمكين',
    badgeKind: 'amber',
    title: 'مشاريع التمكين ومصادر الرزق',
    subtitle: 'تمويل مشاريع مدرّة للدخل للعوائل الكريمة لتحقيق الاكتفاء الذاتي الكريم.',
    location: 'الزبير والموصل وسامراء',
    dateLabel: 'دفعة تشرين الثاني',
    metric: 'تمويل مشاريع أسرية',
    ctaLabel: 'تفاصيل الصرف والتوزيع',
    ctaHref: '#/expenses',
    secondaryLabel: 'متابعة المندوبين',
    secondaryHref: '#/delegates',
    image: slideFood,
    imageAlt: 'مبادرة المشاريع الصغيرة ومصادر الرزق',
  },
  {
    id: 'monthly-stipends',
    badge: 'كفالة شهرية',
    badgeKind: 'sky',
    title: 'صرف رواتب إلى الأيتام',
    subtitle: 'تسليم المخصصات النقدية الشهرية عبر المندوبين المعتمدين مع توثيق الوصولات في النظام.',
    location: 'كافة القواطع والمناطق',
    dateLabel: 'تحصيل وصرف شهري',
    metric: '49 مندوباً معتمداً',
    ctaLabel: 'سجل المندوبين',
    ctaHref: '#/delegates',
    secondaryLabel: 'سجل العوائل',
    secondaryHref: '#/families',
    image: slideFood,
    imageAlt: 'صرف الرواتب الشهرية وكفالات الأيتام',
  },
];

const MAX_SLIDES = 7;
const STORAGE_KEY = 'ahbab:hero-slides-v3';
const INTERVAL_MS = 5500;
const SCRIM = 'linear-gradient(270deg, rgba(15, 23, 42, 0.90) 0%, rgba(15, 23, 42, 0.72) 48%, rgba(15, 23, 42, 0.20) 100%)';

function loadSlides(): HeroSlide[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SLIDES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // fallback to defaults
  }
  return DEFAULT_SLIDES;
}

function saveSlides(slides: HeroSlide[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slides));
  } catch {
    // ignore storage quota errors
  }
}

async function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذّر قراءة الصورة'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('ملف غير صالح كصورة'));
      img.onload = () => {
        const maxW = 1600;
        const scale = img.width > maxW ? maxW / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.84));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function badgeIcon(kind: BadgeKind) {
  if (kind === 'sky') return HeartPulse;
  if (kind === 'amber' || kind === 'rose') return Sparkles;
  return PackageCheck;
}

const SLIDE_VARIANTS = {
  enter: (dir: number) => ({
    x: dir >= 0 ? '-18%' : '18%',
    opacity: 0,
  }),
  center: {
    x: '0%',
    opacity: 1,
  },
  exit: (dir: number) => ({
    x: dir >= 0 ? '18%' : '-18%',
    opacity: 0,
  }),
};

const TEXT_VARIANTS = {
  enter: (dir: number) => ({
    x: dir >= 0 ? -14 : 14,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (dir: number) => ({
    x: dir >= 0 ? 48 : -48,
    opacity: 0,
  }),
};

// Phone title: 3 words, then a smaller line of up to 6; anything past that shows on desktop only.
// "توزيع السلات الغذائية للعوائل" → head "توزيع السلات الغذائية", rest "للعوائل"
function splitTitle(text: string) {
  const words = text.trim().split(/\s+/);
  return {
    head: words.slice(0, 3).join(' '),
    rest: words.slice(3, 9).join(' '),
    overflow: words.slice(9).join(' '),
  };
}

export function AidHeroBanner({ isAdmin = false }: { isAdmin?: boolean }) {
  const [slides, setSlides] = useState<HeroSlide[]>(loadSlides);
  const [[index, direction], setSlideState] = useState<[number, number]>([0, 1]);
  const [paused, setPaused] = useState(false);
  const toggleMenu = () => {
    if (menuAt) { setMenuAt(null); return; }
    const r = menuBtn.current?.getBoundingClientRect();
    if (!r) return;
    const width = 192;
    setMenuAt({ top: r.bottom + 8, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
  };
  const touchX = useRef<number | null>(null);

  // Editor modal state
  const [editorMode, setEditorMode] = useState<'new' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [badge, setBadge] = useState('قيد التوزيع الآن');
  const [badgeKind, setBadgeKind] = useState<BadgeKind>('emerald');
  const [location, setLocation] = useState('');
  const [dateLabel, setDateLabel] = useState('');
  const [metric, setMetric] = useState('');
  const [ctaHref, setCtaHref] = useState('#/families');
  const [image, setImage] = useState(slideFood);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // The admin menu is portalled to <body> at the button's position: the slide clips its overflow.
  const [menuAt, setMenuAt] = useState<{ top: number; left: number } | null>(null);
  const menuOpen = menuAt !== null;
  const setMenuOpen = (open: boolean) => setMenuAt(open ? menuAt : null);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuAt) return undefined;
    const close = () => setMenuAt(null);
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !menuBtn.current?.contains(t)) close();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); menuBtn.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', close, { passive: true });
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', close);
      window.removeEventListener('resize', close);
    };
  }, [menuAt]);

  const safeIndex = index >= slides.length ? 0 : index;
  const slide = slides[safeIndex] ?? DEFAULT_SLIDES[0];

  // Restarts on every slide change, so a manual click always gets a full interval
  // before the next automatic step instead of being followed by a skip.
  useEffect(() => {
    if (paused || menuOpen || editorMode !== null || slides.length <= 1) return undefined;
    const id = window.setTimeout(() => {
      setSlideState(([prev]) => [(prev + 1) % slides.length, 1]);
    }, INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [paused, menuOpen, editorMode, slides.length, safeIndex]);

  const prevSlide = () => setSlideState(([i]) => [(i - 1 + slides.length) % slides.length, -1]);
  const nextSlide = () => setSlideState(([i]) => [(i + 1) % slides.length, 1]);
  const goToSlide = (targetIdx: number) => {
    setSlideState(([i]) => [targetIdx, targetIdx >= i ? 1 : -1]);
  };

  const openNew = () => {
    setEditorMode('new');
    setEditingId(null);
    setTitle('');
    setSubtitle('');
    setBadge('إعلان توزيع جديد');
    setBadgeKind('emerald');
    setLocation('بغداد – جميع القواطع');
    setDateLabel('تشرين الثاني 2026');
    setMetric('مساعدات مباشرة');
    setCtaHref('#/families');
    setImage(slideFood);
    setUploadError('');
  };

  const openEdit = () => {
    setEditorMode('edit');
    setEditingId(slide.id);
    setTitle(slide.title);
    setSubtitle(slide.subtitle);
    setBadge(slide.badge);
    setBadgeKind(slide.badgeKind);
    setLocation(slide.location);
    setDateLabel(slide.dateLabel);
    setMetric(slide.metric);
    setCtaHref(slide.ctaHref);
    setImage(slide.image);
    setUploadError('');
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    try {
      const dataUrl = await compressImageFile(file);
      setImage(dataUrl);
    } catch (err) {
      setUploadError((err as Error).message);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const target = CTA_TARGETS.find((t) => t.href === ctaHref) ?? CTA_TARGETS[0];

    const built: HeroSlide = {
      id: editorMode === 'edit' && editingId ? editingId : `slide-${Date.now()}`,
      badge: badge.trim() || 'إعلان توزيع',
      badgeKind,
      title: title.trim(),
      subtitle: subtitle.trim() || 'توزيع مساعدات إنسانية للعوائل المسجلة في المؤسسة.',
      location: location.trim() || 'بغداد',
      dateLabel: dateLabel.trim() || 'الشهر الحالي',
      metric: metric.trim() || 'مساعدة موثقة',
      ctaLabel: target.label,
      ctaHref: target.href,
      secondaryLabel: target.secLabel,
      secondaryHref: target.secHref,
      image,
      imageAlt: title.trim(),
    };

    if (editorMode === 'edit' && editingId) {
      const next = slides.map((s) => (s.id === editingId ? built : s));
      setSlides(next);
      saveSlides(next);
    } else {
      const next = [built, ...slides].slice(0, MAX_SLIDES);
      setSlides(next);
      saveSlides(next);
      setSlideState([0, -1]);
    }
    setEditorMode(null);
  };

  const handleDeleteCurrent = () => {
    if (!editingId || slides.length <= 1) return;
    const next = slides.filter((s) => s.id !== editingId);
    setSlides(next);
    saveSlides(next);
    setSlideState([0, -1]);
    setEditorMode(null);
  };

  const SlideIcon = badgeIcon(slide.badgeKind);

  return (
    <section
      aria-label="إعلانات توزيع المساعدات"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      // Swipe on touch screens. In RTL the next slide comes from the left, so a swipe to the right advances.
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) < 50) return;
        if (dx > 0) nextSlide(); else prevSlide();
      }}
      className="relative select-none overflow-hidden rounded-3xl border shadow-lg"
      style={{ borderColor: 'var(--fp-border)' }}
    >
      <div className="relative min-h-[264px] w-full sm:h-[290px] lg:h-[300px]">
        {/* Animated Background Image (Horizontal Slide) */}
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={slide.id}
            custom={direction}
            variants={SLIDE_VARIANTS}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            <img
              src={slide.image}
              alt={slide.imageAlt}
              className="h-full w-full object-cover object-center"
            />
            <div className="absolute inset-0" style={{ backgroundImage: SCRIM }} aria-hidden />
          </motion.div>
        </AnimatePresence>

        {/* Foreground RTL Hero Content */}
        <div className="relative z-10 flex min-h-[264px] flex-col justify-between gap-2.5 p-4 text-white sm:h-full sm:min-h-0 sm:gap-3 sm:p-7 lg:p-8">
          {/* Top Row: Slide Badges (right) + Admin Actions (left) */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold shadow-xs sm:px-3 ${BADGE_CLASSES[slide.badgeKind]}`}>
                <SlideIcon size={13} aria-hidden />
                {slide.badge}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white/95 backdrop-blur-xs">
                <MapPin size={12} className="shrink-0" aria-hidden />
                <span>{slide.location}</span>
              </span>
              <span className="hidden items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white/95 backdrop-blur-xs md:inline-flex">
                <CalendarDays size={12} aria-hidden />
                {slide.dateLabel}
              </span>
            </div>

            {isAdmin && (
              <div className="relative">
                <button
                  ref={menuBtn}
                  type="button"
                  onClick={toggleMenu}
                  aria-label="إدارة الإعلانات"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/30 text-white backdrop-blur-xs transition hover:bg-black/50"
                >
                  <MoreHorizontal size={20} aria-hidden />
                </button>
                {menuAt && createPortal(
                  <div
                    ref={menuRef}
                    role="menu"
                    dir="rtl"
                    className="fp-root fixed z-50 w-48 overflow-hidden rounded-2xl border p-1.5 shadow-xl"
                    style={{ top: menuAt.top, left: menuAt.left, backgroundColor: 'var(--fp-card)', borderColor: 'var(--fp-border)' }}
                  >
                    <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); openNew(); }} className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold transition hover:opacity-80" style={{ color: 'var(--fp-ink)' }}>
                      <Plus size={16} aria-hidden /> إعلان جديد
                    </button>
                    <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); openEdit(); }} className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold transition hover:opacity-80" style={{ color: 'var(--fp-ink)' }}>
                      <Pencil size={15} aria-hidden /> تعديل هذا الإعلان
                    </button>
                  </div>,
                  document.body,
                )}
              </div>
            )}
          </div>

          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={slide.id}
              custom={direction}
              variants={TEXT_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-2xl"
            >
              <h2 className="text-lg font-bold leading-snug tracking-tight text-white sm:text-2xl">
                {/* Phone: the first three words large, then up to six more on a smaller second
                    line. From sm up it is one free line at the full title size. */}
                {(() => {
                  const { head, rest, overflow } = splitTitle(slide.title);
                  return (
                    <>
                      {head}
                      {rest && (
                        <span className="mt-1 block text-sm font-semibold text-white/85 sm:mt-0 sm:inline sm:text-2xl sm:font-bold sm:text-white">
                          <span className="hidden sm:inline"> </span>{rest}
                        </span>
                      )}
                      {overflow && <span className="hidden sm:inline"> {overflow}</span>}
                    </>
                  );
                })()}
              </h2>

              <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-2.5">
                <a
                  href={slide.ctaHref}
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-white px-4 text-sm font-bold text-slate-900 no-underline shadow-sm transition hover:bg-white/90"
                >
                  <span>{slide.ctaLabel}</span>
                  <ArrowLeft size={14} aria-hidden />
                </a>
                <a
                  href={slide.secondaryHref}
                  className="hidden h-11 items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-4 text-sm font-semibold text-white no-underline backdrop-blur-xs transition hover:bg-white/20 sm:inline-flex"
                >
                  {slide.secondaryLabel}
                </a>
                <span className="hidden rounded-xl bg-black/25 px-3 py-1.5 text-[11px] font-bold text-emerald-300 backdrop-blur-xs md:inline-block">
                  {slide.metric}
                </span>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Bottom Controls: Slide Dots + Prev/Next */}
          <div className="flex items-center justify-between gap-4 pt-2">
            <div className="flex items-center" role="tablist" aria-label="اختيار إعلان التوزيع">
              {slides.map((item, idx) => {
                const active = idx === safeIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-label={item.title}
                    onClick={() => goToSlide(idx)}
                    className="group inline-flex h-11 min-w-[26px] items-center justify-center px-1.5"
                  >
                    <span className={`relative block h-2 overflow-hidden rounded-full transition-all ${
                      active ? 'w-9 bg-white/35' : 'w-2.5 bg-white/40 group-hover:bg-white/70'
                    }`}>
                    {active && (
                      <motion.span
                        key={`${item.id}-${paused ? 'paused' : 'run'}`}
                        initial={{ width: '0%' }}
                        animate={{ width: '100%' }}
                        transition={{ duration: paused ? 0 : INTERVAL_MS / 1000, ease: 'linear' }}
                        className="block h-full rounded-full bg-white"
                      />
                    )}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <span className="shrink-0 whitespace-nowrap rounded-full bg-black/30 px-2.5 py-0.5 text-xs font-bold tabular-nums text-white/90 backdrop-blur-xs" dir="ltr">
                {safeIndex + 1} / {slides.length}
              </span>
              <button
                type="button"
                onClick={prevSlide}
                aria-label="الإعلان السابق"
                className="hidden h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/25 sm:inline-flex text-white backdrop-blur-xs transition hover:bg-black/45"
              >
                <ChevronRight size={16} aria-hidden />
              </button>
              <button
                type="button"
                onClick={nextSlide}
                aria-label="الإعلان التالي"
                className="hidden h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/25 sm:inline-flex text-white backdrop-blur-xs transition hover:bg-black/45"
              >
                <ChevronLeft size={16} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* New / Edit Announcement Modal */}
      {editorMode &&
        createPortal(
          <div
            dir="rtl"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
            onClick={() => setEditorMode(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={editorMode === 'new' ? 'إضافة إعلان جديد' : 'تعديل الإعلان'}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-3xl border p-6 shadow-2xl"
              style={{
                backgroundColor: 'var(--fp-card)',
                borderColor: 'var(--fp-border)',
                color: 'var(--fp-ink)',
              }}
            >
              <div className="flex items-center justify-between gap-3 border-b pb-3.5" style={{ borderColor: 'var(--fp-border)' }}>
                <h3 className="text-base font-bold">
                  {editorMode === 'new' ? 'إضافة إعلان توزيع جديد' : 'تعديل الإعلان الحالي'}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditorMode(null)}
                  aria-label="إغلاق"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border transition hover:opacity-80"
                  style={{ borderColor: 'var(--fp-border)', color: 'var(--fp-ink-2)' }}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                {/* Image Upload + Preview */}
                <div>
                  <span className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--fp-ink-2)' }}>
                    صورة الإعلان (يفضّل 1600×700)
                  </span>
                  <div className="relative h-36 overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--fp-border)' }}>
                    <img src={image} alt="معاينة الإعلان" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 flex items-end justify-between bg-gradient-to-t from-black/70 via-transparent to-transparent p-3">
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-bold text-slate-900 shadow-sm transition hover:bg-blue-50"
                      >
                        <ImagePlus size={14} aria-hidden />
                        <span>رفع صورة من الجهاز</span>
                      </button>
                      <div className="flex items-center gap-1.5">
                        {PRESET_IMAGES.map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => setImage(p.src)}
                            className="rounded-lg bg-black/50 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-xs hover:bg-black/75"
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </div>
                  {uploadError && (
                    <p className="mt-1 text-xs font-semibold" style={{ color: 'var(--fp-rose)' }}>
                      {uploadError}
                    </p>
                  )}
                </div>

                {/* Title */}
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--fp-ink-2)' }}>
                    عنوان الإعلان *
                  </span>
                  <input
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="مثال: حملة توزيع السلات الغذائية لشهر كانون الأول"
                    className="h-10 w-full rounded-xl border px-3 text-xs outline-none focus:ring-2 focus:ring-blue-500/30"
                    style={{
                      backgroundColor: 'var(--fp-muted)',
                      borderColor: 'var(--fp-border)',
                      color: 'var(--fp-ink)',
                      margin: 0,
                    }}
                  />
                </label>

                {/* Subtitle */}
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--fp-ink-2)' }}>
                    التفاصيل المختصرة
                  </span>
                  <textarea
                    rows={2}
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder="وصف موجز للحملة أو المستفيدين..."
                    className="w-full rounded-xl border p-3 text-xs outline-none focus:ring-2 focus:ring-blue-500/30"
                    style={{
                      backgroundColor: 'var(--fp-muted)',
                      borderColor: 'var(--fp-border)',
                      color: 'var(--fp-ink)',
                      margin: 0,
                    }}
                  />
                </label>

                {/* Badge + Color + Metric */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--fp-ink-2)' }}>نص الشارة</span>
                    <input
                      value={badge}
                      onChange={(e) => setBadge(e.target.value)}
                      className="h-9 w-full rounded-xl border px-3 text-xs outline-none"
                      style={{ backgroundColor: 'var(--fp-muted)', borderColor: 'var(--fp-border)', color: 'var(--fp-ink)', margin: 0 }}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--fp-ink-2)' }}>لون الشارة</span>
                    <select
                      value={badgeKind}
                      onChange={(e) => setBadgeKind(e.target.value as BadgeKind)}
                      className="h-9 w-full rounded-xl border px-3 text-xs font-semibold outline-none"
                      style={{ backgroundColor: 'var(--fp-muted)', borderColor: 'var(--fp-border)', color: 'var(--fp-ink)', margin: 0 }}
                    >
                      <option value="emerald">أخضر (قيد التوزيع)</option>
                      <option value="sky">أزرق (صحي / مستمر)</option>
                      <option value="amber">كهرماني (موسمي)</option>
                      <option value="rose">وردي (عاجل)</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--fp-ink-2)' }}>العدد / الميزة</span>
                    <input
                      value={metric}
                      onChange={(e) => setMetric(e.target.value)}
                      placeholder="120 سلة غذائية"
                      className="h-9 w-full rounded-xl border px-3 text-xs outline-none"
                      style={{ backgroundColor: 'var(--fp-muted)', borderColor: 'var(--fp-border)', color: 'var(--fp-ink)', margin: 0 }}
                    />
                  </label>
                </div>

                {/* Location + Date + Target Link */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--fp-ink-2)' }}>المنطقة</span>
                    <input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="h-9 w-full rounded-xl border px-3 text-xs outline-none"
                      style={{ backgroundColor: 'var(--fp-muted)', borderColor: 'var(--fp-border)', color: 'var(--fp-ink)', margin: 0 }}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--fp-ink-2)' }}>التاريخ</span>
                    <input
                      value={dateLabel}
                      onChange={(e) => setDateLabel(e.target.value)}
                      className="h-9 w-full rounded-xl border px-3 text-xs outline-none"
                      style={{ backgroundColor: 'var(--fp-muted)', borderColor: 'var(--fp-border)', color: 'var(--fp-ink)', margin: 0 }}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--fp-ink-2)' }}>وجهة الزر</span>
                    <select
                      value={ctaHref}
                      onChange={(e) => setCtaHref(e.target.value)}
                      className="h-9 w-full rounded-xl border px-3 text-xs font-semibold outline-none"
                      style={{ backgroundColor: 'var(--fp-muted)', borderColor: 'var(--fp-border)', color: 'var(--fp-ink)', margin: 0 }}
                    >
                      {CTA_TARGETS.map((t) => (
                        <option key={t.href} value={t.href}>{t.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* Footer Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4" style={{ borderColor: 'var(--fp-border)' }}>
                  {editorMode === 'edit' && slides.length > 1 ? (
                    <button
                      type="button"
                      onClick={handleDeleteCurrent}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition hover:opacity-85"
                      style={{ backgroundColor: 'var(--fp-rose-soft)', color: 'var(--fp-rose)' }}
                    >
                      <Trash2 size={14} aria-hidden />
                      <span>حذف الإعلان</span>
                    </button>
                  ) : (
                    <span />
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditorMode(null)}
                      className="inline-flex h-9 items-center rounded-xl border px-4 text-xs font-semibold transition hover:opacity-80"
                      style={{ borderColor: 'var(--fp-border)', color: 'var(--fp-ink-2)' }}
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      className="inline-flex h-9 items-center rounded-xl px-5 text-xs font-bold text-white shadow-sm transition hover:brightness-105"
                      style={{ backgroundImage: 'linear-gradient(135deg, var(--fp-primary), var(--fp-primary-2))' }}
                    >
                      {editorMode === 'new' ? 'نشر الإعلان' : 'حفظ التعديلات'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
