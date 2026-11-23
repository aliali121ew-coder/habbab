import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Check } from 'lucide-react';
import { api, type GridRow } from '../../api';
import { useBranding } from '../../branding';
import { MONTH_NAMES, formatNumber } from '../../format';
import { formatUnpaidSummary } from './SubscriberModal';
import { buildStatementPdf } from './statementPdf';

// WhatsApp's own mark, drawn inline so it needs no image request.
export function WhatsAppMark() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.5 1.1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3Z"
      />
    </svg>
  );
}

// A receipt the user sends once a payment is recorded: the latest paid month, the amount,
// the date, and anything still outstanding.
function receipt(row: GridRow, year: number, currentMonth: number | null, currency: string, foundation: string) {
  let lastMonth = -1;
  for (let month = 11; month >= 0; month -= 1) {
    if (row.paid_mask & (1 << month)) { lastMonth = month; break; }
  }
  const unpaid = formatUnpaidSummary(row.paid_mask, currentMonth);
  const lines = [`السلام عليكم ${row.full_name}،`];
  if (lastMonth >= 0) {
    lines.push(
      `تم استلام اشتراككم الشهري لدى ${foundation}.`,
      `الشهر: ${MONTH_NAMES[lastMonth]} ${year}`,
      `المبلغ: ${formatNumber(row.monthly_fee)} ${currency}`,
    );
    if (row.last_paid_date) lines.push(`تاريخ التسديد: ${row.last_paid_date.slice(0, 10)}`);
  } else {
    lines.push(`نشكركم على اشتراككم لدى ${foundation}.`);
  }
  if (unpaid.count > 0) lines.push(`الأشهر غير المسددة حتى الآن: ${unpaid.text}`);
  lines.push('شكراً لكم، تقبّل الله أعمالكم.');
  return lines.join('\n');
}

// How long the button shows its result before returning to the WhatsApp mark.
const RESULT_MS = 5000;

// 'ready': the PDF is built but the browser no longer counts the original tap as fresh enough
// to open the share sheet, so one more tap shares it at once.
type State = 'idle' | 'busy' | 'ready' | 'shared' | 'saved';

const LABELS: Record<State, string> = {
  idle: 'واتساب',
  busy: 'جارٍ تجهيز الملف…',
  ready: 'اضغط للإرسال',
  shared: 'تمت المشاركة',
  saved: 'نُزّل الملف',
};

function download(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

interface SendProps {
  // Builds the PDF to send.
  build: () => Promise<File>;
  // The endpoint that reveals the recipient's WhatsApp number, asked for before anything is built
  // so a missing number is reported at once.
  phonePath: string;
  text: string;
  title: string;
  className?: string;
  // The resting label; the busy and result labels are shared.
  label?: string;
  // Names what the PDF holds; when it changes (another month, another list) a PDF prepared
  // earlier is dropped.
  cacheKey?: string;
}

// Sends a PDF with a message on WhatsApp. Where the device can share files (phones, and Chrome
// or Edge on Windows) its share sheet opens and WhatsApp is one tap away; elsewhere the PDF is
// saved and the recipient's chat opens for it to be attached.
export function SendPdfButton({ build, phonePath, text, title, className = 'whatsapp-row-btn', label = LABELS.idle, cacheKey = '' }: SendProps) {
  const [state, setState] = useState<State>('idle');
  const [file, setFile] = useState<File | null>(null);
  const prepared = useRef<{ key: string; pdf: Promise<File> } | null>(null);

  // The PDF takes a few seconds; begun as the pointer arrives, it is usually ready by the tap, so
  // the share sheet opens while the browser still counts the tap as fresh.
  const prepare = () => {
    if (prepared.current?.key !== cacheKey) {
      const pdf = build();
      prepared.current = { key: cacheKey, pdf };
      pdf.catch(() => { if (prepared.current?.pdf === pdf) prepared.current = null; });
    }
    return prepared.current.pdf;
  };

  useEffect(() => {
    if (state !== 'shared' && state !== 'saved') return undefined;
    const timer = window.setTimeout(() => { setState('idle'); setFile(null); }, RESULT_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const share = async (pdf: File) => {
    try {
      await navigator.share({ files: [pdf], text, title: pdf.name });
      setState('shared');
    } catch (failure) {
      const name = (failure as Error).name;
      if (name === 'AbortError') { setState('idle'); setFile(null); return; }
      if (name === 'NotAllowedError') { setFile(pdf); setState('ready'); return; }
      throw failure;
    }
  };

  const send = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (state === 'busy') return;
    try {
      if (state === 'ready' && file) { await share(file); return; }
      setState('busy');
      const [{ phone }, pdf] = await Promise.all([
        api<{ phone: string }>(phonePath, { method: 'POST' }),
        prepare(),
      ]);
      if (navigator.canShare?.({ files: [pdf] })) {
        await share(pdf);
      } else {
        download(pdf);
        window.location.href = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(`${text}\n\n(أرفقوا الملف المنزَّل: ${pdf.name})`)}`;
        setState('saved');
      }
    } catch (failure) {
      setState('idle');
      setFile(null);
      window.alert((failure as Error).message || 'تعذّر إرسال الملف');
    }
  };

  const done = state === 'shared' || state === 'saved';
  return (
    <button
      type="button"
      className={`${className}${done ? ' done' : ''}${state === 'ready' ? ' ready' : ''}`}
      title={title}
      aria-label={title}
      aria-live="polite"
      disabled={state === 'busy'}
      onClick={send}
      onPointerEnter={() => { void prepare(); }}
      onFocus={() => { void prepare(); }}
    >
      {done ? <Check size={16} strokeWidth={3} aria-hidden /> : <WhatsAppMark />}
      <span className="btn-label">{state === 'idle' ? label : LABELS[state]}</span>
    </button>
  );
}

interface Props {
  row: GridRow;
  year: number;
  currentMonth: number | null;
  currency: string;
  delegateName?: string | null;
}

// The subscriber's latest statement, with the receipt as its message.
export function WhatsAppButton({ row, year, currentMonth, currency, delegateName }: Props) {
  const brand = useBranding();
  if (!row.phone) {
    return <span className="no-phone-tag" title="أضف رقم هاتف للمشترك لإرسال رسالة واتساب">لا يوجد رقم هاتف</span>;
  }
  return (
    <SendPdfButton
      build={() => buildStatementPdf({ row, year, currentMonth, currency, delegateName })}
      phonePath={`/collections/subscriber/${row.id}/whatsapp`}
      cacheKey={`${row.id}-${year}-${row.paid_mask}-${row.last_paid_date ?? ''}`}
      text={receipt(row, year, currentMonth, currency, brand.name)}
      title={`إرسال كشف ${row.full_name} على واتساب`}
    />
  );
}
