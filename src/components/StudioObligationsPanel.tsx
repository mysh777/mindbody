import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Download, Loader2, Printer, Search, Users, Wallet, Ticket } from 'lucide-react';
import { handlePrint } from '../utils/printReport';
import { fetchByIds } from '../lib/fetchByIds';
import { loadStudioObligations, type ClientObligation, type ObligationsSummary } from '../utils/obligations';
import { exportToExcel } from '../utils/exportExcel';

interface Row extends ClientObligation {
  name: string;
  email: string;
  phone: string;
}

type SortKey = 'name' | 'value' | 'visits' | 'nextExpiry';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

const formatDate = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC' }) : 'No expiry';

interface Props {
  onOpenClient: (clientId: string) => void;
}

export function StudioObligationsPanel({ onOpenClient }: Props) {
  const [summary, setSummary] = useState<ObligationsSummary | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortAsc, setSortAsc] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await loadStudioObligations();
      const clients = await fetchByIds<any>('clients', 'id', [...s.byClient.keys()], 'id, first_name, last_name, email, mobile_phone, home_phone');
      const byId = new Map(clients.map(c => [String(c.id), c]));
      const list: Row[] = [...s.byClient.values()].map(o => {
        const c = byId.get(o.clientId);
        return {
          ...o,
          name: c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() || `Client ${o.clientId}` : `Client ${o.clientId}`,
          email: c?.email || '',
          phone: c?.mobile_phone || c?.home_phone || '',
        };
      });
      if (cancelled) return;
      setSummary(s);
      setRows(list);
    })().catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter(r => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')))
      : rows;
    const dir = sortAsc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name) * dir;
      if (sortKey === 'nextExpiry') return (a.nextExpiry || '9999').localeCompare(b.nextExpiry || '9999') * dir;
      return (a[sortKey] - b[sortKey]) * dir;
    });
  }, [rows, query, sortKey, sortAsc]);

  const listTotal = useMemo(() => visible.reduce((s, r) => s + r.value, 0), [visible]);
  const listVisits = useMemo(() => visible.reduce((s, r) => s + r.visits, 0), [visible]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === 'name' || key === 'nextExpiry'); }
  };

  const handleExport = () => {
    exportToExcel(visible.map(r => ({
      'Client': r.name,
      'Client ID': r.clientId,
      'Email': r.email,
      'Phone': r.phone,
      'Active Packages': r.packages,
      'Remaining Visits': r.visits,
      'Obligations (EUR)': Number(r.value.toFixed(2)),
      'Paid-price Part (EUR)': Number(r.paidPart.toFixed(2)),
      'Next Expiry': r.nextExpiry || '',
    })), 'client_obligations');
  };

  const SortHead = ({ k, label, align = 'left' }: { k: SortKey; label: string; align?: 'left' | 'right' }) => (
    <th className={`px-4 py-2 font-medium text-slate-500 text-${align}`}>
      <button onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1 hover:text-slate-800 transition-colors ${sortKey === k ? 'text-slate-800' : ''}`}>
        {label}
        {sortKey === k && (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );

  return (
    <div ref={printRef} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 print:hidden">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Studio Overview</h3>
          <p className="text-xs text-slate-500">Clients with unused visits in active packages, as of today</p>
        </div>
        {summary && (
          <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 transition-colors">
            {open ? 'Hide list' : `Show list (${rows.length})`}
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">Could not load studio obligations. Try reloading the page.</p>}
      {!summary && !error && (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading obligations…</div>
      )}

      {summary && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs text-slate-500"><Users className="w-4 h-4" /> Active Clients</div>
              <div className="text-xl font-semibold text-slate-900 mt-1">{summary.clients}</div>
            </div>
            <div className="rounded-lg bg-blue-50 p-4">
              <div className="flex items-center gap-2 text-xs text-blue-700"><Wallet className="w-4 h-4" /> Total Obligations</div>
              <div className="text-xl font-semibold text-blue-900 mt-1">{formatCurrency(summary.total)}</div>
            </div>
            <div className="rounded-lg bg-emerald-50 p-4">
              <div className="flex items-center gap-2 text-xs text-emerald-700"><Ticket className="w-4 h-4" /> Remaining Visits</div>
              <div className="text-xl font-semibold text-emerald-900 mt-1">{summary.remainingVisits}</div>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {formatCurrency(summary.paidPart)} at the price actually paid, {formatCurrency(summary.catalogPart)} estimated from the catalogue price
            {summary.catalogPackages > 0 && ` (${summary.catalogPackages} packages)`}
            {summary.noDataPackages > 0 && `; ${summary.noDataPackages} packages have no price data`}.
          </p>

          {open && (
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search by name, email or phone"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button onClick={handleExport} className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors">
                  <Download className="w-4 h-4" /> Export Excel
                </button>
                <button onClick={() => handlePrint(printRef)} className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors">
                  <Printer className="w-4 h-4" /> Print / PDF
                </button>
              </div>

              <div className="max-h-96 overflow-auto border border-slate-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <SortHead k="name" label="Client" />
                      <th className="px-4 py-2 text-left font-medium text-slate-500 hidden md:table-cell">Contact</th>
                      <SortHead k="visits" label="Visits left" align="right" />
                      <SortHead k="value" label="Obligations" align="right" />
                      <SortHead k="nextExpiry" label="Next expiry" align="right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visible.map(r => (
                      <tr key={r.clientId} onClick={() => onOpenClient(r.clientId)} className="cursor-pointer hover:bg-blue-50 transition-colors">
                        <td className="px-4 py-2 text-slate-900 font-medium">{r.name}</td>
                        <td className="px-4 py-2 text-slate-500 hidden md:table-cell">{r.email || r.phone || '—'}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{r.visits}</td>
                        <td className="px-4 py-2 text-right text-slate-900">{formatCurrency(r.value)}</td>
                        <td className="px-4 py-2 text-right text-slate-500">{formatDate(r.nextExpiry)}</td>
                      </tr>
                    ))}
                    {visible.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No clients match your search.</td></tr>
                    )}
                  </tbody>
                  <tfoot className="bg-slate-50 sticky bottom-0 font-semibold">
                    <tr>
                      <td className="px-4 py-2 text-slate-700">Total ({visible.length} clients)</td>
                      <td className="hidden md:table-cell" />
                      <td className="px-4 py-2 text-right text-slate-700">{listVisits}</td>
                      <td className="px-4 py-2 text-right text-slate-900">{formatCurrency(listTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          <div className="print-report hidden">
            <h1>Studio Obligations</h1>
            <div className="pr-sub">
              Clients with unused visits in active packages, as of {new Date().toLocaleDateString('en-GB')}
              {query.trim() && ` | Search: "${query.trim()}"`}
            </div>
            <dl className="pr-grid">
              <dt>Active Clients</dt><dd>{summary.clients}</dd>
              <dt>Total Obligations</dt><dd>{formatCurrency(summary.total)}</dd>
              <dt>Remaining Visits</dt><dd>{summary.remainingVisits}</dd>
              <dt>At price paid</dt><dd>{formatCurrency(summary.paidPart)}</dd>
              <dt>From catalogue price</dt><dd>{formatCurrency(summary.catalogPart)}</dd>
            </dl>
            <table>
              <thead><tr><th>Client</th><th>Email</th><th>Phone</th><th>Packages</th><th>Visits left</th><th>Obligations</th><th>Paid-price part</th><th>Next expiry</th></tr></thead>
              <tbody>
                {visible.map(r => (
                  <tr key={r.clientId}>
                    <td>{r.name}</td>
                    <td>{r.email}</td>
                    <td>{r.phone}</td>
                    <td style={{ textAlign: 'center' }}>{r.packages}</td>
                    <td style={{ textAlign: 'center' }}>{r.visits}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(r.value)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(r.paidPart)}</td>
                    <td>{formatDate(r.nextExpiry)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Total ({visible.length} clients)</td>
                  <td style={{ textAlign: 'center' }}>{listVisits}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(listTotal)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
