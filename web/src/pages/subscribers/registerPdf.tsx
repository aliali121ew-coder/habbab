import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { api, type PrintRow } from '../../api';
import { RegisterSheets, buildRegisterGroups } from './RegisterPrintModal';

interface Options {
  year: number;
  cutoff: number;
  status: 'alive' | 'deceased';
  delegateId: number;
  delegateName: string;
  currency: string;
}

// The delegate's register as an A4 landscape PDF, one page per printed sheet: the same pages
// the print dialog shows, drawn off screen and captured by the browser itself.
export async function buildRegisterPdf({ year, cutoff, status, delegateId, delegateName, currency }: Options): Promise<File> {
  const query = new URLSearchParams({ year: String(year), until: String(cutoff), status, delegate: String(delegateId) });
  const [{ items }, { toCanvas, getFontEmbedCSS }, { jsPDF }] = await Promise.all([
    api<{ items: PrintRow[] }>(`/collections/print?${query}`),
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
      root.render(<>{buildRegisterGroups(items, cutoff, currency, delegateName).map((group) => (
        <RegisterSheets key={group.key} report={group.report} year={year} cutoff={cutoff} status={status} delegateName={group.name} />
      ))}</>);
    });
    await document.fonts.ready;
    await Promise.all([...host.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined)));

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });
    const sheets = [...host.querySelectorAll<HTMLElement>('.reg-sheet')];
    // Every page uses the same fonts: embed them once rather than once per page.
    const fontEmbedCSS = await getFontEmbedCSS(host);
    for (const [index, sheet] of sheets.entries()) {
      const canvas = await toCanvas(sheet, { pixelRatio: 2, backgroundColor: '#ffffff', fontEmbedCSS });
      if (index > 0) pdf.addPage('a4', 'landscape');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 297, 210);
    }
    return new File([pdf.output('blob')], `سجل${status === 'deceased' ? '-المتوفين' : ''}-${delegateName}-${year}.pdf`, { type: 'application/pdf' });
  } finally {
    root.unmount();
    host.remove();
  }
}
