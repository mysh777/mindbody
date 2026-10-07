import type { StaffLoadRow } from '../utils/ownerMonthDetail';
import { formatEur, formatNumber, formatPct, monthShort, percentChange } from '../utils/ownerFormat';

interface StaffLoadProps {
  rows: StaffLoadRow[];
  lastYearMonth: string;
  monthVisits: number;
  hasSchedule: boolean;
}

function UtilBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-400">—</span>;
  const tone = value >= 70 ? 'bg-emerald-500' : value >= 40 ? 'bg-sky-500' : 'bg-amber-400';
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="hidden sm:block w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden print:hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="tabular-nums w-14 text-right">{formatPct(value, 0)}</span>
    </div>
  );
}

function YearChange({ current, previous }: { current: number; previous: number }) {
  const pct = percentChange(current, previous);
  if (pct === null) return <span className="text-slate-400">{current > 0 ? 'new' : '—'}</span>;
  return (
    <span className={`tabular-nums font-medium ${pct > 0.05 ? 'text-emerald-600' : pct < -0.05 ? 'text-red-600' : 'text-slate-500'}`}>
      {pct > 0 ? '+' : ''}{formatPct(pct, 0)}
    </span>
  );
}

function sum(rows: StaffLoadRow[]) {
  const t = rows.reduce((a, r) => ({
    workHours: a.workHours + r.workHours,
    visitHours: a.visitHours + r.visitHours,
    visits: a.visits + r.visits,
    revenueEarned: a.revenueEarned + r.revenueEarned,
    staffCost: a.staffCost + r.staffCost,
    revenueLastYear: a.revenueLastYear + r.revenueLastYear,
  }), { workHours: 0, visitHours: 0, visits: 0, revenueEarned: 0, staffCost: 0, revenueLastYear: 0 });
  return {
    ...t,
    utilisation: t.workHours > 0 ? (t.visitHours / t.workHours) * 100 : null,
    revenuePerHour: t.workHours > 0 ? t.revenueEarned / t.workHours : null,
  };
}

const PRINT_TOP = 10;

const th = 'px-3 py-2.5 print:py-1 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap';
const td = 'px-3 py-2.5 print:py-0.5 text-right tabular-nums whitespace-nowrap';

function Row({ name, r, strong }: { name: string; r: ReturnType<typeof sum> | StaffLoadRow; strong?: boolean }) {
  return (
    <tr className={strong ? 'bg-slate-50 font-semibold text-slate-900' : 'hover:bg-sky-50/50 transition-colors text-slate-700'}>
      <td className="px-3 py-2.5 print:py-0.5 text-left whitespace-nowrap">{name}</td>
      <td className={td}>{formatNumber(r.workHours, 1)}</td>
      <td className={td}>{formatNumber(r.visitHours, 1)}</td>
      <td className={td}>{formatNumber(r.visits)}</td>
      <td className={td}><UtilBar value={r.utilisation} /></td>
      <td className={td}>{formatEur(r.revenueEarned)}</td>
      <td className={td}>{r.revenuePerHour === null ? '—' : formatEur(r.revenuePerHour)}</td>
      <td className={td}>{formatEur(r.staffCost)}</td>
      <td className={td}><YearChange current={r.revenueEarned} previous={r.revenueLastYear} /></td>
    </tr>
  );
}

export function OwnerStaffLoad({ rows, lastYearMonth, monthVisits, hasSchedule }: StaffLoadProps) {
  const people = rows.filter(r => !r.isEquipment);
  const equipment = rows.filter(r => r.isEquipment);
  const total = sum(rows);
  const busiest = [...people].sort((a, b) => b.visitHours - a.visitHours).slice(0, PRINT_TOP);

  return (
    <section className="owner-breakable bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="p-5 pb-3 print:p-2">
        <h3 className="text-base font-semibold text-slate-900">Staff load</h3>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed summary-hide">
          Utilisation = visit hours / working hours from the Mindbody schedule (minus time off). Overlapping bookings of one staff member count once.
          Per hour — Revenue earned per working hour. Change — Revenue earned vs {monthShort(lastYearMonth)}.
        </p>
        {people.length > PRINT_TOP && (
          <p className="hidden print:block summary-only text-xs text-slate-500 mt-0.5">
            Top {PRINT_TOP} of {people.length} staff by visit hours. Total row covers everyone. Full table — Margin by Staff.
          </p>
        )}
        {!hasSchedule && <p className="mt-2 text-xs text-amber-700">No schedule loaded for this month — utilisation not calculated.</p>}
        {total.visits !== monthVisits && (
          <p className="mt-2 text-xs text-red-700">Visits by staff ({total.visits}) do not match visits for the month ({monthVisits}).</p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-y border-slate-200 bg-slate-50/60">
            <tr>
              <th className={`${th} text-left`}>Staff</th>
              <th className={th}>Working h</th>
              <th className={th}>Visit hours</th>
              <th className={th}>Visits</th>
              <th className={th}>Utilisation</th>
              <th className={th}>Revenue earned</th>
              <th className={th}>Per hour</th>
              <th className={th}>Staff cost</th>
              <th className={th}>vs last year</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 summary-hide">
            {people.map(r => <Row key={r.staffId} name={r.name} r={r} />)}
            {people.length > 0 && <Row name="Staff total" r={sum(people)} strong />}
            {equipment.length > 0 && (
              <tr><td colSpan={9} className="px-3 pt-5 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Equipment</td></tr>
            )}
            {equipment.map(r => <Row key={r.staffId} name={r.name} r={r} />)}
            {equipment.length > 0 && <Row name="Equipment total" r={sum(equipment)} strong />}
            <Row name="Total" r={total} strong />
          </tbody>
          <tbody className="hidden print:table-row-group summary-only">
            {busiest.map(r => <Row key={r.staffId} name={r.name} r={r} />)}
            <Row name="Total, all staff and equipment" r={total} strong />
          </tbody>
        </table>
      </div>
    </section>
  );
}
