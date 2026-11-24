import { useEffect, useState } from 'react';
import { HeartHandshake, UserCheck } from 'lucide-react';
import { patientLinks, type PatientLinks } from '../../data/patients';

/* Who follows a patient (the manager and health officer choose):
   - the family: a patient from a registered family follows that family's delegate;
   - a delegate given directly (wins over the family's);
   - neither: only the foundation's staff see the patient. */

let cached: Promise<PatientLinks> | null = null;
const loadLinks = () => (cached ??= patientLinks().catch((e) => { cached = null; throw e; }));

export function usePatientLinks() {
  const [links, setLinks] = useState<PatientLinks | null>(null);
  useEffect(() => { let live = true; loadLinks().then((l) => live && setLinks(l)).catch(() => live && setLinks({ families: [], delegates: [] })); return () => { live = false; }; }, []);
  return links;
}

export function FollowFields({ familyId, delegateId, onChange }: {
  familyId: number | null; delegateId: number | null;
  onChange: (next: { familyId: number | null; delegateId: number | null }) => void;
}) {
  const links = usePatientLinks();
  const family = links?.families.find((f) => f.id === familyId);
  const who = delegateId
    ? `يتابعه ${links?.delegates.find((d) => d.id === delegateId)?.name ?? 'المندوب المختار'} مباشرة.`
    : family?.delegate ? `يتابعه مندوب العائلة: ${family.delegate}.`
      : 'بلا مندوب: يراه موظفو المؤسسة فقط.';
  return (
    <div className="pfw">
      <label className="pfw-field">
        <span><HeartHandshake size={15} /> العائلة (اختياري)</span>
        <select value={familyId ?? ''} disabled={!links} onChange={(e) => onChange({ familyId: e.target.value ? Number(e.target.value) : null, delegateId })}>
          <option value="">— ليس من عائلة مسجلة —</option>
          {links?.families.map((f) => <option key={f.id} value={f.id}>{f.name}{f.delegate ? ` — ${f.delegate}` : ''}</option>)}
        </select>
      </label>
      <label className="pfw-field">
        <span><UserCheck size={15} /> مندوب مباشر (اختياري)</span>
        <select value={delegateId ?? ''} disabled={!links} onChange={(e) => onChange({ familyId, delegateId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">{family ? '— مندوب العائلة —' : '— بلا مندوب —'}</option>
          {links?.delegates.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      <p className="pfw-who">{who}</p>
    </div>
  );
}
