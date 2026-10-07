import { formatCurrency } from '../utils/salesFilters';
import { formatApptDate, formatApptTime } from '../utils/formatDateTime';
import type { AppointmentRow } from '../hooks/useSalesMarginData';

export interface TariffSale {
  saleId: string;
  saleDate: string;
  clientName: string;
  amount: number;
  rule: 'cash' | 'fifo';
}

const VISIT_LIMIT = 100;

export function TariffSalesList({ sales, total, print }: { sales: TariffSale[]; total: number; print?: boolean }) {
  const listed = sales.reduce((s, x) => s + x.amount, 0);
  const withoutClient = total - listed;
  return (
    <table className={print ? 'pr-visit-table' : 'w-full text-xs'}>
      <thead>
        <tr className="text-slate-400 uppercase tracking-wider text-[10px]">
          <th className="py-1.5 text-left">Sale date</th>
          <th className="py-1.5 text-left">Client</th>
          <th className="py-1.5 text-left">Basis</th>
          <th className="py-1.5 text-right">Sales by service</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {sales.map((s, i) => (
          <tr key={`${s.saleId}-${i}`} className="text-slate-600">
            <td className="py-1 whitespace-nowrap">{formatApptDate(s.saleDate)}</td>
            <td className="py-1 text-slate-800">{s.clientName}</td>
            <td className="py-1 text-slate-500">{s.rule === 'cash' ? 'Paid at sale' : 'Paid from account balance'}</td>
            <td className="py-1 text-right font-mono text-blue-600">{formatCurrency(s.amount)}</td>
          </tr>
        ))}
        {Math.abs(withoutClient) >= 0.01 && (
          <tr className="text-slate-500 italic">
            <td className="py-1" colSpan={3}>Sales not linked to a client</td>
            <td className="py-1 text-right font-mono">{formatCurrency(withoutClient)}</td>
          </tr>
        )}
        {sales.length === 0 && Math.abs(withoutClient) < 0.01 && (
          <tr><td colSpan={4} className="py-2 text-slate-400">No sales of this pricing option in the period.</td></tr>
        )}
      </tbody>
    </table>
  );
}

export function TariffVisitsList({ visits, print }: { visits: AppointmentRow[]; print?: boolean }) {
  if (visits.length === 0) {
    return <p className="py-2 text-xs text-slate-400">No completed visits in the period.</p>;
  }
  const shown = print ? visits : visits.slice(0, VISIT_LIMIT);
  return (
    <table className={print ? 'pr-visit-table' : 'w-full text-xs'}>
      <thead>
        <tr className="text-slate-400 uppercase tracking-wider text-[10px]">
          <th className="py-1.5 text-left">Date</th>
          <th className="py-1.5 text-left">Time</th>
          <th className="py-1.5 text-left">Client</th>
          <th className="py-1.5 text-left">Staff</th>
          <th className="py-1.5 text-left">Location</th>
          <th className="py-1.5 text-right">Revenue earned</th>
          <th className="py-1.5 text-right">Staff cost</th>
          <th className="py-1.5 text-right">Gross margin</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {shown.map(a => (
          <tr key={a.id} className="text-slate-600">
            <td className="py-1 whitespace-nowrap">{formatApptDate(a.start_datetime)}</td>
            <td className="py-1">{formatApptTime(a.start_datetime)}</td>
            <td className="py-1 text-slate-800">{a.clientName}</td>
            <td className="py-1">{a.staffName}</td>
            <td className="py-1 text-slate-500">{a.locationName}</td>
            <td className="py-1 text-right font-mono text-blue-600">
              {a.revenue != null ? formatCurrency(a.revenue) : <span className="text-amber-500">no price</span>}
              {a.isEstimated && <span className="ml-1 text-[10px] text-slate-400" title="Estimated price">est.</span>}
            </td>
            <td className="py-1 text-right font-mono text-amber-600">{formatCurrency(a.staffCost)}</td>
            <td className="py-1 text-right font-mono text-slate-700">{a.margin != null ? formatCurrency(a.margin) : '-'}</td>
          </tr>
        ))}
        {shown.length < visits.length && (
          <tr><td colSpan={8} className="py-2 text-center text-slate-500 italic">
            Showing {VISIT_LIMIT} of {visits.length} visits. Print / PDF and Visits Excel include all of them.
          </td></tr>
        )}
      </tbody>
    </table>
  );
}
