import { useState } from 'react';
import { type DatePreset, PRESET_GROUPS, getPresetDates, getMonthRange, getAvailableMonths } from '../utils/datePresets';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  activePreset: DatePreset;
  onStartChange: (date: string) => void;
  onEndChange: (date: string) => void;
  onPreset: (preset: DatePreset, range: { start: string; end: string }) => void;
  label?: string;
  compact?: boolean;
}

export function DateRangePicker({
  startDate, endDate, activePreset,
  onStartChange, onEndChange, onPreset,
  label = 'Period', compact = false,
}: DateRangePickerProps) {
  const now = new Date();
  const [monthYear, setMonthYear] = useState(now.getFullYear());
  const months = getAvailableMonths(monthYear);

  const apply = (p: DatePreset) => onPreset(p, getPresetDates(p));

  const applyMonth = (month: number) => {
    const range = getMonthRange(monthYear, month);
    onPreset('custom', range);
  };

  const isMonthActive = (month: number) => {
    if (activePreset !== 'custom') return false;
    const range = getMonthRange(monthYear, month);
    return startDate === range.start && endDate === range.end;
  };

  const btnBase = compact
    ? 'px-2.5 py-1 text-xs font-medium rounded-md transition-colors'
    : 'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors';
  const active = 'bg-blue-600 text-white';
  const inactive = 'bg-slate-100 text-slate-700 hover:bg-slate-200';

  const yearOptions: number[] = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) yearOptions.push(y);

  return (
    <div>
      {label && <label className="block text-sm font-semibold text-slate-700 mb-2">{label}</label>}

      <div className="space-y-2 mb-4">
        {PRESET_GROUPS.map(g => (
          <div key={g.label} className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider w-16 shrink-0">{g.label}</span>
            <div className="flex flex-wrap gap-1.5">
              {g.presets.map(p => (
                <button key={p.key} onClick={() => apply(p.key)}
                  className={`${btnBase} ${activePreset === p.key ? active : inactive}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider w-16 shrink-0">Month</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <select value={monthYear} onChange={e => setMonthYear(Number(e.target.value))}
              className="px-2 py-1 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 focus:ring-1 focus:ring-blue-500">
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {months.map(m => (
              <button key={m.month} onClick={() => applyMonth(m.month)}
                className={`${btnBase} ${isMonthActive(m.month) ? active : inactive}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">From</span>
          <input type="date" value={startDate}
            onChange={e => { onStartChange(e.target.value); onPreset('custom', { start: e.target.value, end: endDate }); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">To</span>
          <input type="date" value={endDate}
            onChange={e => { onEndChange(e.target.value); onPreset('custom', { start: startDate, end: e.target.value }); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>
      </div>
    </div>
  );
}
