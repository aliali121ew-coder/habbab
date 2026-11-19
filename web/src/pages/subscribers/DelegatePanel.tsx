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
  key: string;
  label: string;
  value: number;
}

const DURATION = 1100;

// 0 → 1 over DURATION with an ease-out, restarted whenever `key` changes; jumps straight to 1
// for readers who asked the system for less motion.
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
      setProgress(1 - (1 - t) ** 3);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    setProgress(0);
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [key]);
  return progress;
}

// Subscribers split by state for the chosen month, drawn as raised, rounded segments that
// sweep in from zero. The gaps and the legend's labels keep the slices apart for readers who
// can't tell the colours apart.
function Breakdown({ slices, title, tag }: { slices: Slice[]; title: string; tag: string }) {
  const uid = useId().replace(/:/g, '');
  const caption = `${title} · ${tag}`;
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const progress = useGrow(`${tag}:${slices.map((slice) => slice.value).join(',')}`);
  const radius = 46;
  const stroke = 14;
  const length = 2 * Math.PI * radius;
  const shown = slices.filter((slice) => slice.value > 0);
  const swept = length * progress;
  let offset = 0;
  const arcs = shown.map((slice) => {
    const share = (slice.value / total) * length;
    const start = offset;
    offset += share;
    // Round caps reach half a stroke past each end, so a rounded slice leaves room for both;
    // a slice too short for that gets flat ends and a plain 3px gap instead.
    const round = share > stroke + 8;
    const gap = shown.length > 1 ? (round ? stroke + 3 : 3) : 0;
    const visible = Math.max(Math.min(share, swept - start) - gap, 0);
    return { ...slice, dash: `${visible} ${length}`, offset: -(start + gap / 2), round, hidden: visible <= 0 };
  });
  const percent = (value: number) => (total ? formatPercent((value / total) * 100) : '0%');

  return (
    <figure className="panel-donut">
      <figcaption><span>{title}</span><em>{tag}</em></figcaption>
      <div className="panel-donut-body">
        <svg viewBox="0 0 120 120" role="img" aria-label={`${caption}: ${slices.map((s) => `${s.label} ${formatNumber(s.value)}`).join('، ')}`}>
          <defs>
            {shown.map((slice) => (
              <linearGradient key={slice.key} id={`${uid}-${slice.key}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" className={`slice-light ${slice.key}`} />
                <stop offset="1" className={`slice-deep ${slice.key}`} />
              </linearGradient>
            ))}
            <radialGradient id={`${uid}-face`} cx="50%" cy="38%" r="62%">
              <stop offset="0" className="face-light" />
              <stop offset="1" className="face-deep" />
            </radialGradient>
          </defs>
          <circle cx="60" cy="60" r={radius} className="donut-track" strokeWidth={stroke} />
          <g className="donut-ring" transform="rotate(-90 60 60)">
            {arcs.map((arc) => !arc.hidden && (
              <circle
                key={arc.key}
                cx="60"
                cy="60"
                r={radius}
                className={`donut-slice ${arc.key}`}
                stroke={`url(#${uid}-${arc.key})`}
                strokeWidth={stroke}
                strokeLinecap={arc.round ? 'round' : 'butt'}
                strokeDasharray={arc.dash}
                strokeDashoffset={arc.offset}
              >
                <title>{`${arc.label}: ${formatNumber(arc.value)} (${percent(arc.value)})`}</title>
              </circle>
            ))}
          </g>
          <circle cx="60" cy="60" r={radius - stroke / 2 - 4} className="donut-face" fill={`url(#${uid}-face)`} />
          <text x="60" y="60" textAnchor="middle" className="donut-total">{formatNumber(Math.round(total * progress))}</text>
          <text x="60" y="76" textAnchor="middle" className="donut-unit">مشترك</text>
        </svg>
        <ul>
          {slices.map((slice) => (
            <li key={slice.key}>
              <span className={`donut-key ${slice.key}`} aria-hidden />
              <span className="donut-label">{slice.label}</span>
              <b><bdi>{formatNumber(slice.value)}</bdi></b>
              <small><bdi>{percent(slice.value)}</bdi></small>
            </li>
          ))}
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
          {/* The way to the subscribers' own page, part of the card rather than a block under it. */}
          <a className="dpn-open-list" href={subscriberListHref(delegate.id)}>
            <span className="dpn-open-list-icon" aria-hidden><UsersRound size={18} /></span>
            <span>عرض المشتركين</span>
            <ArrowLeft size={18} aria-hidden />
          </a>
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
          { key: 'paid', label: 'أحياء مسددون', value: paid },
          { key: 'unpaid', label: 'أحياء لم يسددوا', value: overview.alive - paid },
          { key: 'deceased', label: 'أموات', value: overview.deceased },
        ]}
      />

      {/* 4 · The year's collection, as a line. */}
      <CollectionLine year={overview.year} months={overview.months} selected={selectedMonth} currency={me.currency} onSelect={onSelectMonth} />
      </section>

      {profile && delegate && <DelegateProfileDrawer delegateId={delegate.id} onClose={() => setProfile(false)} onChanged={onPhotoChanged} />}
    </aside>
  );
}
