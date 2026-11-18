import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatIQD, totalEntitlement } from '../../utils/format';

const SLICES = [
  { key: 'salary', label: 'الراتب الشهري', color: '#2563EB', dot: 'bg-blue-600' },
  { key: 'aid', label: 'المساعدات', color: '#10B981', dot: 'bg-emerald-500' },
  { key: 'medicine', label: 'الأدوية', color: '#F59E0B', dot: 'bg-amber-500' },
  { key: 'checkups', label: 'الكشفيات', color: '#F43F5E', dot: 'bg-rose-500' },
];

export function EntitlementDonut({ family }) {
  const total = totalEntitlement(family);
  const raw = SLICES.map((s) => ({
    ...s,
    value: family?.entitlements?.[s.key] ?? 0,
  }));
  const chartData = raw.filter((item) => item.value > 0);
  const displayData = chartData.length > 0 ? chartData : [{ key: 'empty', label: 'لا يوجد', value: 1, color: '#E2E8F0' }];

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500">إجمالي المستحقات الشهرية</span>
        <span className="text-base font-bold text-slate-900 tabular-nums">{formatIQD(total)}</span>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <div className="relative h-28 w-28 shrink-0" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={displayData}
                dataKey="value"
                nameKey="label"
                innerRadius={33}
                outerRadius={48}
                paddingAngle={chartData.length > 1 ? 3 : 0}
                strokeWidth={0}
              >
                {displayData.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(val) => formatIQD(val)}
                contentStyle={{
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  fontSize: '11px',
                  direction: 'rtl',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] text-slate-400">شهرياً</span>
            <span className="text-xs font-bold text-slate-800 tabular-nums">
              {total >= 1_000_000 ? `${(total / 1_000_000).toFixed(1)}M` : `${Math.round(total / 1000)}K`}
            </span>
          </div>
        </div>

        <ul className="grid flex-1 grid-cols-2 gap-x-3 gap-y-2.5">
          {raw.map((item) => (
            <li key={item.key} className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className={`h-2 w-2 shrink-0 rounded-full ${item.dot}`} aria-hidden />
                <span className="truncate">{item.label}</span>
              </div>
              <p className="mt-0.5 text-xs font-bold text-slate-900 tabular-nums">
                {formatIQD(item.value)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
