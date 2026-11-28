import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { motion } from 'framer-motion';

export function QButton({
  variant = 'default',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost' }) {
  const cls = `q-btn${variant !== 'default' ? ` ${variant}` : ''}${className ? ` ${className}` : ''}`;
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}

export function QIconButton({
  bordered,
  active,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { bordered?: boolean; active?: boolean }) {
  const cls = `q-icon-btn${bordered ? ' bordered' : ''}${active ? ' active' : ''}${className ? ` ${className}` : ''}`;
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}

export function QCard({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`q-card${className ? ` ${className}` : ''}`}>{children}</div>;
}

export function QChip({
  active,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button type="button" className={`q-chip${active ? ' on' : ''}${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </button>
  );
}

export interface SegOption<T extends string> {
  id: T;
  label: string;
}

export function QSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  layoutId = 'q-seg-pill',
  ariaLabel,
}: {
  options: readonly SegOption<T>[];
  value: T;
  onChange: (next: T) => void;
  layoutId?: string;
  ariaLabel: string;
}) {
  return (
    <div className="q-seg" role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`q-seg-item${active ? ' on' : ''}`}
            onClick={() => onChange(opt.id)}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="q-seg-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Ornamental 8-point Islamic star / rotated-diamond badge for Surah & Juz numbers. */
export function QStarBadge({ label }: { label: string }) {
  return (
    <span className="q-star-badge" aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none">
        <rect
          x="7"
          y="7"
          width="26"
          height="26"
          rx="6"
          transform="rotate(45 20 20)"
          fill="currentColor"
          fillOpacity="0.11"
          stroke="currentColor"
          strokeOpacity="0.34"
          strokeWidth="1.25"
        />
      </svg>
      <span>{label}</span>
    </span>
  );
}

export function QSkeleton({ height = 74 }: { height?: number }) {
  return <div className="q-skel" style={{ height }} aria-hidden="true" />;
}
