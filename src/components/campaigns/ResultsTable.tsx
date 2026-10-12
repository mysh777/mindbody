import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import { formatEur, formatNumber } from '../../utils/ownerFormat';
import { normalizeText } from '../../utils/campaignMatch';
import { STATUS_LABELS, type ClientResult } from '../../utils/campaignResults';
import { formatLead } from './MatchReview';

type SortKey = 'name' | 'leadDate' | 'firstVisitEver' | 'visits' | 'procedures' | 'moneyPaid' | 'salesByService' | 'revenueEarned' | 'lastVisit' | 'packageVisitsLeft' | 'obligations';

interface Column {
  key: SortKey;
  label: string;
  numeric?: boolean;
}

interface ResultsTableProps {
  clients: ClientResult[];
  showLead: boolean;
  onViewClient?: (clientId: string) => void;
}

export function ResultsTable({ clients, showLead, onViewClient }: ResultsTableProps) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'moneyPaid', desc: true });

  const columns: Column[] = [
    { key: 'name', label: 'Client' },
    ...(showLead ? [{ key: 'leadDate' as const, label: 'Lead date' }] : []),
    { key: 'firstVisitEver', label: 'First visit' },
    { key: 'visits', label: 'Visits', numeric: true },
    { key: 'procedures', label: 'Procedures', numeric: true },
    { key: 'moneyPaid', label: 'Money paid', numeric: true },
    { key: 'salesByService', label: 'Sales by service', numeric: true },
    { key: 'revenueEarned', label: 'Revenue earned', numeric: true },
    { key: 'lastVisit', label: 'Last visit' },
    { key: 'packageVisitsLeft', label: 'Active package', numeric: true },
    { key: 'obligations', label: 'Obligations now', numeric: true },
  ];

  const visible = useMemo(() => {
    const q = normalizeText(query);
    const digits = query.replace(/\D/g, '');
    const filtered = q ? clients.filter(c => normalizeText(c.name).includes(q) || (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits))) : clients;
    const dir = sort.desc ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const x = a[sort.key] ?? '';
      const y = b[sort.key] ?? '';
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [clients, query, sort]);

  const sum = (f: (c: ClientResult) => number) => visible.reduce((s, c) => s + f(c), 0);
  const fmtDate = (d: string | null) => (d ? formatLead(d.slice(0, 10)) : '-');

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">Clients <span className="text-slate-400 font-normal">({visible.length})</span></h3>
        <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-1.5 w-full sm:w-72 focus-within:ring-2 focus-within:ring-teal-500 print:hidden">
          <Search className="w-4 h-4 text-slate-400" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or phone" className="flex-1 text-sm outline-none bg-transparent" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {columns.map(col => (
                <th key={col.key} onClick={() => setSort(s => ({ key: col.key, desc: s.key === col.key ? !s.desc : !!col.numeric }))}
                  className={`px-3 py-2.5 font-medium whitespace-nowrap cursor-pointer select-none hover:text-slate-900 ${col.numeric ? 'text-right' : 'text-left'}`}>
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sort.key === col.key && (sort.desc ? <ArrowDown className="w-3.5 h-3.5" /> : <ArrowUp className="w-3.5 h-3.5" />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map(c => (
              <tr key={c.clientId} className="hover:bg-slate-50 transition-colors">
                <td className="px-3 py-2">
                  <button onClick={() => onViewClient?.(c.clientId)} className="text-left font-medium text-slate-800 hover:text-teal-700">{c.name}</button>
                  <div className="text-xs text-slate-500 flex flex-wrap gap-x-2">
                    {c.phone && <span>{c.phone}</span>}
                    {c.status && <StatusTag status={c.status} />}
                    {c.status === 'booked' && c.nextBooking && <span className="text-cyan-700">on {fmtDate(c.nextBooking)}</span>}
                    {c.newInPeriod && <span className="text-teal-700 font-medium">New in period</span>}
                  </div>
                </td>
                {showLead && <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fmtDate(c.leadDate)}</td>}
                <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fmtDate(c.firstVisitEver)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.visits || '-'}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">{c.procedures || '-'}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900">{c.moneyPaid ? formatEur(c.moneyPaid) : '-'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.salesByService ? formatEur(c.salesByService) : '-'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.revenueEarned ? formatEur(c.revenueEarned) : '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fmtDate(c.lastVisit)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{c.activePackages ? `${c.packageVisitsLeft} visits left` : '-'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.obligations ? formatEur(c.obligations) : '-'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 font-semibold text-slate-900 border-t-2 border-slate-200">
            <tr>
              <td className="px-3 py-2.5">Total</td>
              {showLead && <td />}
              <td />
              <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(sum(c => c.visits))}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(sum(c => c.procedures))}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatEur(sum(c => c.moneyPaid))}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatEur(sum(c => c.salesByService))}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatEur(sum(c => c.revenueEarned))}</td>
              <td />
              <td className="px-3 py-2.5 text-right">{visible.filter(c => c.activePackages > 0).length} clients</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatEur(sum(c => c.obligations))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

const STATUS_TONES = { new: 'text-emerald-700', existing: 'text-sky-700', booked: 'text-cyan-700', noVisits: 'text-amber-700', notFound: 'text-rose-700' };

function StatusTag({ status }: { status: keyof typeof STATUS_TONES }) {
  return <span className={STATUS_TONES[status]}>{STATUS_LABELS[status]}</span>;
}
