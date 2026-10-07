import { useState } from 'react';
import { HEAT_HOURS, WEEKDAYS, type HeatCell } from '../utils/ownerMonthDetail';
import { formatNumber, formatPct } from '../utils/ownerFormat';

type Mode = 'clients' | 'starts' | 'fill';
const MODES: { id: Mode; label: string }[] = [
  { id: 'clients', label: 'Clients at once' },
  { id: 'starts', label: 'Visits started' },
  { id: 'fill', label: 'Fill %' },
];

const valueOf = (c: HeatCell, mode: Mode) => (mode === 'clients' ? c.avgClients : mode === 'starts' ? c.avgStarts : c.fillPercent);
const show = (v: number | null, mode: Mode) => (v === null ? '' : mode === 'fill' ? formatPct(v, 0) : formatNumber(v, 1));
const slot = (c: HeatCell) => `${WEEKDAYS[c.weekday]} ${String(c.hour).padStart(2, '0')}:00`;

export function OwnerHeatmap({ cells, daysCounted }: { cells: HeatCell[]; daysCounted: number }) {
  const [mode, setMode] = useState<Mode>('clients');
  const max = Math.max(0.0001, ...cells.map(c => valueOf(c, mode) ?? 0));
  const byKey = new Map(cells.map(c => [`${c.weekday}|${c.hour}`, c]));

  // Busiest and quietest among hours when somebody works or someone visited.
  const open = cells.filter(c => c.fillPercent !== null || c.avgClients > 0);
  const ranked = [...open].sort((a, b) => b.avgClients - a.avgClients);
  const busiest = ranked.slice(0, 3);
  const quietest = ranked.slice(-3).reverse();

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 print:p-3 break-inside-avoid">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Busyness by day and hour</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Average per weekday this month ({daysCounted} days). Fill = staff visit time / their working time in that hour.
          </p>
        </div>
        <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1 print:hidden">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${mode === m.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="print:flex print:items-start print:gap-4">
      <div className="overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: 3 }}>
          <thead>
            <tr>
              <th />
              {HEAT_HOURS.map(h => <th key={h} className="text-[11px] font-medium text-slate-500 w-11 text-center">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((day, weekday) => (
              <tr key={day}>
                <th className="pr-2 text-xs font-medium text-slate-600 text-left">{day}</th>
                {HEAT_HOURS.map(hour => {
                  const cell = byKey.get(`${weekday}|${hour}`)!;
                  const v = valueOf(cell, mode);
                  const intensity = v === null ? 0 : v / max;
                  return (
                    <td
                      key={hour}
                      title={`${slot(cell)} — ${show(v, mode) || 'nobody working'}`}
                      className="heat-cell h-9 w-11 print:h-5 print:w-9 print:text-[9px] rounded-md text-center text-[11px] tabular-nums transition-transform hover:scale-110"
                      style={{
                        backgroundColor: v === null ? '#f8fafc' : `rgba(3, 105, 161, ${0.06 + intensity * 0.88})`,
                        color: intensity > 0.5 ? '#fff' : '#334155',
                        WebkitPrintColorAdjust: 'exact',
                        printColorAdjust: 'exact',
                      }}
                    >
                      {v !== null && v > 0 ? show(v, mode) : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 print:mt-0 print:flex-1 grid grid-cols-1 sm:grid-cols-2 print:grid-cols-1 gap-4 print:gap-2">
        {[{ title: 'Busiest hours', list: busiest, tone: 'text-sky-800 bg-sky-50' }, { title: 'Quietest hours', list: quietest, tone: 'text-slate-700 bg-slate-50' }].map(block => (
          <div key={block.title}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{block.title}</h4>
            <ul className="space-y-1.5 print:space-y-0.5">
              {block.list.map(c => (
                <li key={slot(c)} className={`flex items-center justify-between rounded-lg px-3 py-2 print:py-0.5 text-sm print:text-xs ${block.tone}`}>
                  <span className="font-medium">{slot(c)}</span>
                  <span className="tabular-nums text-xs">
                    {formatNumber(c.avgClients, 1)} clients{c.fillPercent !== null ? ` · ${formatPct(c.fillPercent, 0)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      </div>
    </section>
  );
}
