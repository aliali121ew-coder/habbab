import type { FamilyPriority } from '../../types/family';

interface Props {
  initials: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'square' | 'circle';
  tone?: 'neutral' | 'primary' | 'rose' | 'emerald' | 'amber';
  priorityDot?: FamilyPriority;
  pulseDot?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<Props['size']>, string> = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-24 w-24 text-2xl',
};

const TONE_STYLES: Record<NonNullable<Props['tone']>, { bg: string; color: string; border: string }> = {
  neutral: { bg: 'var(--fp-muted-2)', color: 'var(--fp-ink)', border: 'var(--fp-border)' },
  primary: { bg: 'var(--fp-primary-soft)', color: 'var(--fp-primary)', border: 'transparent' },
  rose: { bg: 'var(--fp-rose-soft)', color: 'var(--fp-rose)', border: 'transparent' },
  emerald: { bg: 'var(--fp-emerald-soft)', color: 'var(--fp-emerald)', border: 'transparent' },
  amber: { bg: 'var(--fp-amber-soft)', color: 'var(--fp-amber)', border: 'transparent' },
};

const DOT_COLORS: Record<FamilyPriority, string> = {
  critical: 'var(--fp-rose)',
  intensive: 'var(--fp-amber)',
  stable: 'var(--fp-emerald)',
};

export function InitialsAvatar({
  initials,
  size = 'md',
  shape = 'square',
  tone = 'neutral',
  priorityDot,
  pulseDot = false,
}: Props) {
  const style = TONE_STYLES[tone];
  const radiusClass = shape === 'circle' ? 'rounded-full' : size === 'xl' ? 'rounded-3xl' : 'rounded-xl';

  return (
    <span className="relative inline-flex shrink-0">
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center border font-bold select-none ${SIZE_CLASSES[size]} ${radiusClass}`}
        style={{
          backgroundColor: style.bg,
          color: style.color,
          borderColor: style.border,
        }}
      >
        {initials}
      </span>

      {priorityDot && (
        <span
          aria-hidden="true"
          className={`absolute bottom-0.5 end-0.5 h-3.5 w-3.5 rounded-full ring-2 ${pulseDot ? 'animate-pulse' : ''}`}
          style={{
            backgroundColor: DOT_COLORS[priorityDot],
            boxShadow: '0 0 0 2px var(--fp-card)',
          }}
        />
      )}
    </span>
  );
}
