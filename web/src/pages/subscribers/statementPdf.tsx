import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { api, type GridRow, type SubscriberDetail } from '../../api';
import { StatementSheet } from './PrintSheetModal';

interface Options {
  row: GridRow;
  year: number;
  currentMonth: number | null;
  currency: string;
  delegateName?: string | null;
}

// The latest statement as an A4 PDF file: the same sheet the print dialog shows, drawn off
// screen, captured by the browser itself (so Arabic letters stay joined), then placed on a page.
export async function buildStatementPdf({ row, year, currentMonth, currency, delegateName }: Options): Promise<File> {
  const [detail, { toCanvas }, { jsPDF }] = await Promise.all([
    api<SubscriberDetail>(`/collections/subscriber/${row.id}?year=${year}`),
    import('html-to-image'),
    import('jspdf'),
  ]);

  const host = document.createElement('div');
  host.className = 'pdf-host';
  host.setAttribute('aria-hidden', 'true');
  document.body.append(host);
  const root = createRoot(host);
  try {
    flushSync(() => {
      root.render(
        <StatementSheet row={row} year={year} currentMonth={currentMonth} currency={currency} delegateName={delegateName} detail={detail} />,
      );
    });
    await document.fonts.ready;
    await Promise.all([...host.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined)));

    const sheet = host.querySelector<HTMLElement>('.official-sheet');
    if (!sheet) throw new Error('تعذّر تجهيز الكشف');
    const canvas = await toCanvas(sheet, { pixelRatio: 2, backgroundColor: '#ffffff' });
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297);
    const blob = pdf.output('blob');
    return new File([blob], `كشف-${row.full_name}-${year}.pdf`, { type: 'application/pdf' });
  } finally {
    root.unmount();
    host.remove();
  }
}
