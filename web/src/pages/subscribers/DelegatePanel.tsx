import { useEffect, useId, useState, type ReactNode } from 'react';
import { ArrowLeft, HandHeart, MoonStar, Phone, Pill, UsersRound } from 'lucide-react';
import type { Me, Overview } from '../../api';
import { MONTH_NAMES, formatNumber, formatPercent, initialOf } from '../../format';
import { DelegateProfileDrawer } from '../delegates/DelegateProfileDrawer';
import { subscriberListHref } from '../../route';
import { useIsPhone } from '../../useIsPhone';
import { CollectionLine } from './CollectionLine';
import { Card, ListCards } from './ListCards';
import { WhatsAppMark } from './WhatsAppButton';

// One summary tile, drawn like the patient card's: icon, label, figure.
function Figure({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note?: string }) {
  return (
    <div className="dpn-fact">
      <dt>{label}</dt>
      <dd><bdi>{value}</bdi>{note && <small>{note}</small>}</dd>
    </div>
  );
}

interface Slice {
  key: 'paid' | 'unpaid' | 'deceased';
  label: string;
  shortLabel: string;
  value: number;
}

const SLICE_TONES: Record<Slice['key'], [string, string]> = {
  paid: ['#0f9f6e', '#22c58b'],
  unpaid: ['#d97706', '#f59e0b'],
  deceased: ['#2563eb', '#4f8df9'],
};

const DURATION = 1600;

// A filled ring segment between two angles (radians, clockwise from the top).
function sector(r0: number, r1: number, a0: number, a1: number) {
  const sweep = Math.min(a1 - a0, Math.PI * 2 - 0.0001);
  const end = a0 + sweep;
  const at = (r: number, a: number) => `${(80 + r * Math.sin(a)).toFixed(2)} ${(80 - r * Math.cos(a)).toFixed(2)}`;
  const large = sweep > Math.PI ? 1 : 0;
  return `M${at(r1, a0)}A${r1} ${r1} 0 ${large} 1 ${at(r1, end)}L${at(r0, end)}A${r0} ${r0} 0 ${large} 0 ${at(r0, a0)}Z`;
}

// 0 → 1 over DURATION with a smooth cubic ease-in-out, restarted whenever `key` changes;
// jumps straight to 1 for readers who asked the system for less motion.
function useGrow(key: string) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setProgress(1);
      return undefined;
    }
    let frame = 0;
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - started) / DURATION, 1);
      setProgress(t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    setProgress(0);
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [key]);
  return progress;
}

// Subscribers split by state for the chosen month, using the same interactive gradient ring,
// raised centre disc and 3-card legend as the donations chart.
function Breakdown({ slices, title, tag }: { slices: Slice[]; title: string; tag: string }) {
  const uid = useId().replace(/:/g, '');
  const [active, setActive] = useState<Slice['key'] | null>(null);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const grow = useGrow(`${tag}:${slices.map((slice) => slice.value).join(',')}`);
  const chosen = active ? slices.find((s) => s.key === active) ?? null : null;
  const toggle = (key: Slice['key']) => setActive((prev) => (prev === key ? null : key));
  const percent = (value: number) => (total ? formatPercent((value / total) * 100) : '0%');

  const full = Math.PI * 2 * grow;
  let start = 0;

  return (
    <figure className="panel-donut sub-ring-card">
      <figcaption className="sub-ring-head">
        <div>
          <span>{title}</span>
          <small>{tag} · حسب الحالة</small>
        </div>
        <em>{tag}</em>
      </figcaption>
      <div className="sub-ring-body">
        <div className="sub-ring">
          <svg viewBox="-10 -10 180 180" role="img" aria-label={`${title} · ${tag}: ${slices.map((s) => `${s.label} ${formatNumber(s.value)}`).join('، ')}`}>
            <defs>
              {slices.map((slice) => {
                const [deep, light] = SLICE_TONES[slice.key];
                return (
                  <linearGradient key={slice.key} id={`${uid}-${slice.key}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor={light} />
                    <stop offset="1" stopColor={deep} />
                  </linearGradient>
                );
              })}
            </defs>
            <circle cx="80" cy="80" r="66" className="sub-ring-track" />
            {total > 0 && slices.map((slice) => {
              const sweep = (slice.value / total) * full;
              const a0 = start;
              start += sweep;
              if (sweep <= 0.001) return null;
              const mid = a0 + sweep / 2;
              const pop = active === slice.key ? 7 : 0;
              return (
                <path
                  key={slice.key}
                  d={sector(52, 80, a0, a0 + sweep)}
                  fill={`url(#${uid}-${slice.key})`}
                  className={`sub-ring-arc${active === slice.key ? ' is-on' : ''}${active && active !== slice.key ? ' is-off' : ''}`}
                  transform={pop ? `translate(${(Math.sin(mid) * pop).toFixed(2)} ${(-Math.cos(mid) * pop).toFixed(2)})` : undefined}
                  onClick={() => toggle(slice.key)}
                >
                  <title>{`${slice.label}: ${formatNumber(slice.value)} (${percent(slice.value)})`}</title>
                </path>
              );
            })}
          </svg>
          <span className="sub-ring-disc" aria-live="polite">
            {chosen ? (
              <>
                <b style={{ color: SLICE_TONES[chosen.key][0] }}><bdi>{percent(chosen.value)}</bdi></b>
                <small>{chosen.shortLabel}</small>
              </>
            ) : (
              <>
                <b><bdi>{formatNumber(Math.round(total * grow))}</bdi></b>
                <small>مشترك</small>
              </>
            )}
          </span>
        </div>

        <ul className="sub-ring-keys" aria-label="حالات المشتركين ونسبها">
          {slices.map((slice) => {
            const [deep, light] = SLICE_TONES[slice.key];
            return (
              <li key={slice.key}>
                <button
                  type="button"
                  aria-pressed={active === slice.key}
                  onClick={() => toggle(slice.key)}
                  style={{ ['--tone' as string]: deep, ['--tone-2' as string]: light }}
                >
                  <span className="sub-key-name" title={slice.label}><i aria-hidden />{slice.shortLabel}</span>
                  <span className="sub-key-nums">
                    <bdi className="sub-key-share">{percent(slice.value)}</bdi>
                    <small><bdi>{formatNumber(slice.value)}</bdi></small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </figure>
  );
}

interface Props {
  me: Me;
  overview: Overview | null;
  selectedMonth: number;
  onSelectMonth: (month: number) => void;
  onPhotoChanged: () => void;
}

export function DelegatePanel({ me, overview, selectedMonth, onSelectMonth, onPhotoChanged }: Props) {
  const [profile, setProfile] = useState(false);
  const isPhone = useIsPhone();
  // A photo that fails to load falls back to the initial instead of its alt text.
  const [brokenPhoto, setBrokenPhoto] = useState(false);
  useEffect(() => setBrokenPhoto(false), [overview?.delegate?.avatar_url]);

  if (!overview) return <aside className="panel skeleton panel-skeleton" aria-busy="true" />;

  const delegate = overview.delegate;
  const paid = Math.min(overview.months[selectedMonth]?.paid_count ?? 0, overview.alive);

  return (
    <aside className="dpn-stack" aria-label={delegate ? `ملف ${delegate.full_name}` : 'ملخص المندوبين'}>
      {/* Two cards: the delegate (photo and figures), then the charts. */}
      <section className="panel dpn dpn-who">
      {/* 1 · The delegate as a photo card: a large rounded picture, then the name and count
             with the profile button beside them. The photo is changed from the profile only. */}
      <div className="dpn-card">
        <div className="dpn-card-photo">
          {delegate?.avatar_url && !brokenPhoto
            ? <img src={delegate.avatar_url} alt={`صورة ${delegate.full_name}`} onError={() => setBrokenPhoto(true)} />
            : delegate ? <span aria-hidden>{initialOf(delegate.full_name)}</span> : <UsersRound size={40} aria-hidden />}
        </div>
        <div className="dpn-card-row">
          {/* WhatsApp and call on the start side; profile button on the far side. Without a
              phone number the two icons stay visible but inactive. */}
          {delegate && (() => {
            // Opens the user's own WhatsApp / phone app; Iraqi numbers starting with 0 get 964.
            const digits = (delegate.phone ?? '').replace(/\D/g, '');
            const intl = digits.startsWith('0') ? `964${digits.slice(1)}` : digits;
            return (
              <span className="dpn-card-contact">
                {digits ? (
                  <>
                    <a className="dpn-card-icon wa" href={`https://wa.me/${intl}`} target="_blank" rel="noreferrer" aria-label={`واتساب ${delegate.full_name}`} title="واتساب"><WhatsAppMark /></a>
                    <a className="dpn-card-icon call" href={`tel:${digits}`} aria-label={`اتصال بـ ${delegate.full_name}`} title="اتصال"><Phone size={16} aria-hidden /></a>
                  </>
                ) : (
                  <>
                    <span className="dpn-card-icon wa off" title="لا يوجد رقم هاتف للمندوب" aria-label="واتساب غير متاح: لا يوجد رقم"><WhatsAppMark /></span>
                    <span className="dpn-card-icon call off" title="لا يوجد رقم هاتف للمندوب" aria-label="الاتصال غير متاح: لا يوجد رقم"><Phone size={16} aria-hidden /></span>
                  </>
                )}
              </span>
            );
          })()}
          {delegate && me.role === 'admin' && (
            <button type="button" className="dpn-card-btn" onClick={() => setProfile(true)}>
              <ArrowLeft size={15} aria-hidden /> الملف الشخصي
            </button>
          )}
        </div>
      </div>

      {/* 2 · Phone: the full list's coloured cards plus patients and families, two by two. A
             paid / unpaid / late card opens the full list already filtered to those subscribers.
             Desktop keeps the four plain figures below. */}
      {isPhone && delegate ? (
        <div className="dpn-cards">
          <ListCards
            overview={overview}
            delegateId={delegate.id}
            year={overview.year}
            month={(() => {
              const now = new Date();
              const thisYear = now.getUTCFullYear();
              return overview.year === thisYear ? now.getUTCMonth() : overview.year > thisYear ? -1 : selectedMonth;
            })()}
            filter={null}
            onPick={(picked) => { location.hash = subscriberListHref(delegate.id, picked); }}
          >
            <Card tone="patients" icon={<Pill size={18} />} label="المرضى" value={overview.patients} note="مسجّلون" />
            <Card tone="families" icon={<HandHeart size={18} />} label="العوائل المتعففة" value={null} note="تُضاف لاحقاً" />
          </ListCards>
        </div>
      ) : (
      <dl className="dpn-facts">
        <Figure icon={<UsersRound size={17} />} label="المشتركون الأحياء" value={formatNumber(overview.alive)} />
        <Figure icon={<MoonStar size={17} />} label="المشتركون الأموات" value={formatNumber(overview.deceased)} />
        <Figure icon={<Pill size={17} />} label="المرضى" value={formatNumber(overview.patients)} />
        <Figure icon={<HandHeart size={17} />} label="العوائل المتعففة" value="—" note="تُضاف لاحقاً" />
      </dl>
      )}
      </section>

      <section className="panel dpn dpn-charts" aria-label="الرسوم البيانية">
      {/* 3 · The month's split, as a ring. */}
      <Breakdown
        title="توزيع المشتركين"
        tag={MONTH_NAMES[selectedMonth]}
        slices={[
          { key: 'paid', label: 'أحياء مسددون', shortLabel: 'مسددون', value: paid },
          { key: 'unpaid', label: 'أحياء لم يسددوا', shortLabel: 'لم يسددوا', value: overview.alive - paid },
          { key: 'deceased', label: 'أموات', shortLabel: 'أموات', value: overview.deceased },
        ]}
      />

      {/* 4 · The year's collection, as a line. */}
      <CollectionLine year={overview.year} months={overview.months} selected={selectedMonth} currency={me.currency} onSelect={onSelectMonth} />
      </section>

      {profile && delegate && <DelegateProfileDrawer delegateId={delegate.id} onClose={() => setProfile(false)} onChanged={onPhotoChanged} />}
    </aside>
  );
}
