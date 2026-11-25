import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Me } from '../../api';
import { StateMessage } from '../../components/StateMessage';
import { DonationDialog, type Donation } from '../aid/DonationDialog';
import { DonationsDesktop } from './DonationsDesktop';

interface Sheet { year: number; items: Donation[]; previous_december_cash: number }

const THIS_YEAR = new Date().getUTCFullYear();

// التبرعات: one overview for every screen (pages/donations/DonationsDesktop.tsx) — on a computer the
// approved finance-dashboard layout, on a phone the same page stacked: the summary cards, a ring of the
// period's donations by kind, and the donations as cards. This file loads the year and opens the form.
export function DonationsPage({ me }: { me: Me }) {
  const [year, setYear] = useState(THIS_YEAR);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<{ donation: Donation | null } | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setSheet(await api<Sheet>(`/donations?year=${year}`));
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, [year]);
  useEffect(() => { setSheet(null); void load(); }, [load]);

  const donorNames = useMemo(() => [...new Set(sheet?.items.map((item) => item.donor_name) ?? [])], [sheet]);

  return (
    <>
      {error && !sheet && <StateMessage kind="error" title="تعذّر تحميل التبرعات" hint={error} onRetry={load} />}
      {!sheet && !error && <div className="dd" aria-busy="true"><div className="dd-card skeleton dd-skel" /></div>}
      {sheet && (
        <DonationsDesktop
          items={sheet.items}
          previousDecemberCash={sheet.previous_december_cash}
          year={year}
          onYear={setYear}
          currency={me.currency}
          onAdd={() => setDialog({ donation: null })}
          onOpen={(donation) => setDialog({ donation })}
        />
      )}
      {dialog && (
        <DonationDialog
          donation={dialog.donation}
          donors={donorNames}
          currency={me.currency}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); void load(); }}
        />
      )}
    </>
  );
}
