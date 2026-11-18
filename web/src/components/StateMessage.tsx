import { AlertTriangle, Inbox } from 'lucide-react';

interface Props {
  kind: 'empty' | 'error';
  title: string;
  hint?: string;
  onRetry?: () => void;
}

export function StateMessage({ kind, title, hint, onRetry }: Props) {
  const Icon = kind === 'error' ? AlertTriangle : Inbox;
  return (
    <div className={`state state-${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      <Icon size={26} aria-hidden />
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
      {onRetry && <button type="button" className="btn" onClick={onRetry}>إعادة المحاولة</button>}
    </div>
  );
}
