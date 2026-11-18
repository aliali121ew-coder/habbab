import { HeartPulse, User } from 'lucide-react';

export function MembersList({ members = [] }) {
  if (members.length === 0) {
    return <p className="py-6 text-center text-xs text-slate-500">لا يوجد أفراد مسجلون لهذا الملف.</p>;
  }

  return (
    <ul className="space-y-2.5">
      {members.map((member, index) => (
        <li
          key={`${member.name}-${index}`}
          className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-slate-50/60 px-3.5 py-2.5 transition hover:bg-slate-50"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200/80">
              <User className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-slate-900">{member.name}</p>
              <p className="text-[11px] text-slate-500">
                {member.relation} · <span className="tabular-nums">{member.age}</span> سنة · {member.status}
              </p>
            </div>
          </div>

          {member.chronic && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700">
              <HeartPulse className="h-3 w-3" aria-hidden />
              {member.chronic}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
