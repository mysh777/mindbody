import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ChevronDown } from 'lucide-react';
import { loadUsage, cycleCost, formatUsd, FREE_CALLS_PER_CYCLE } from '../utils/mindbodyUsage';
import type { UsageSummary } from '../utils/mindbodyUsage';
import { friendlyType } from '../utils/syncRuns';
import { errorMessage } from '../utils/errorMessage';

const fmtDay = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function MindbodyUsagePanel() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    loadUsage().then(setUsage).catch(err => setError(errorMessage(err)));
  }, []);

  const { days, rows } = useMemo(() => {
    if (!usage) return { days: [] as string[], rows: [] as [string, number[]][] };
    const days = [...new Set(usage.stats.map(s => s.day))].sort().slice(-7);
    const map = new Map<string, number[]>();
    for (const s of usage.stats) {
      const i = days.indexOf(s.day);
      if (i < 0) continue;
      const row = map.get(s.step) ?? days.map(() => 0);
      row[i] += s.calls;
      map.set(s.step, row);
    }
    const rows = [...map.entries()].sort((a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0));
    return { days, rows };
  }, [usage]);

  if (error) {
    return <div className="bg-white rounded-lg border border-slate-200 px-4 py-3 text-sm text-red-700">Could not load Mindbody usage: {error}</div>;
  }
  if (!usage) {
    return <div className="bg-white rounded-lg border border-slate-200 px-4 py-3 h-[104px] animate-pulse" />;
  }

  const over = usage.projected > FREE_CALLS_PER_CYCLE;
  const pct = Math.min(100, (usage.cycleSoFar / FREE_CALLS_PER_CYCLE) * 100);

  return (
    <div className={`bg-white rounded-xl border ${over ? 'border-amber-300' : 'border-slate-200'} shadow-sm overflow-hidden`}>
      {over && (
        <div className="flex items-start gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
          <span>
            Needs attention: at the current pace this billing cycle will reach about {usage.projected.toLocaleString()} Mindbody requests,
            over the free {FREE_CALLS_PER_CYCLE.toLocaleString()}. Estimated bill {formatUsd(cycleCost(usage.projected))}. Avoid large reloads until {fmtDay(usage.cycleEnd)}.
          </span>
        </div>
      )}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-semibold text-slate-800">Mindbody API usage</span>
          <span className="text-xs text-slate-500">billing cycle {fmtDay(usage.cycleStart)} – {fmtDay(usage.cycleEnd)}, free up to {FREE_CALLS_PER_CYCLE.toLocaleString()} requests</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Today', value: usage.today.toLocaleString() },
            { label: 'This cycle so far', value: usage.cycleSoFar.toLocaleString() },
            { label: 'Projected for cycle', value: usage.projected.toLocaleString(), warn: over },
            { label: 'Projected cost', value: formatUsd(cycleCost(usage.projected)), warn: over },
          ].map(s => (
            <div key={s.label}>
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-0.5">{s.label}</div>
              <div className={`text-xl font-bold ${s.warn ? 'text-amber-700' : 'text-slate-900'}`}>{s.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${pct >= 100 ? 'bg-red-500' : over ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
        </div>
        <button onClick={() => setOpen(o => !o)} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800">
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          Requests per step, last 7 days
        </button>
        {open && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left font-medium py-1 pr-3">Step</th>
                  {days.map(d => <th key={d} className="text-right font-medium py-1 px-2">{fmtDay(new Date(`${d}T00:00:00Z`))}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(([step, counts]) => (
                  <tr key={step} className="border-t border-slate-100">
                    <td className="py-1 pr-3 text-slate-700">{friendlyType(step)}</td>
                    {counts.map((c, i) => <td key={i} className="text-right py-1 px-2 tabular-nums text-slate-900">{c || '–'}</td>)}
                  </tr>
                ))}
                <tr className="border-t border-slate-200 font-semibold">
                  <td className="py-1 pr-3 text-slate-800">Total</td>
                  {days.map((_, i) => <td key={i} className="text-right py-1 px-2 tabular-nums">{rows.reduce((s, [, c]) => s + c[i], 0)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
