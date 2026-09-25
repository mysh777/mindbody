import { useState, useMemo, useEffect, useRef } from 'react';
import { Users, ArrowUpDown, AlertTriangle, Sparkles, Loader2, ChevronDown, ChevronRight, Search, X, Download, Printer } from 'lucide-react';
import { CopyLinkButton } from './CopyLinkButton';
import { useSalesMarginData } from '../hooks/useSalesMarginData';
import { formatCurrency } from '../utils/salesFilters';
import { exportToExcel } from '../utils/exportExcel';

import type { ByStaffRow, AppointmentRow } from '../hooks/useSalesMarginData';

import { type DatePreset, getPresetDates } from '../utils/datePresets';
import { DateRangePicker } from './DateRangePicker';
import { LocationFilter } from './LocationFilter';

type SortField = 'staffName' | 'visitsLinked' | 'visitsNoData' | 'revenue' | 'staffCost' | 'margin' | 'marginPercent';

interface Row extends ByStaffRow {
  visitsLinked: number;
  hasRate: boolean;
}

interface ServiceBreakdown {
  name: string;
  visitsLinked: number;
  visitsNoData: number;
  revenue: number;
  staffCost: number;
  margin: number;
}

interface MarginByStaffProps {
  urlParams?: Record<string, string>;
  onParamsChange?: (params: Record<string, string>) => void;
}

export function MarginByStaff({ urlParams, onParamsChange }: MarginByStaffProps) {
  const hasUrlDates = !!(urlParams?.from && urlParams?.to);
  const [datePreset, setDatePreset] = useState<DatePreset>(hasUrlDates ? 'custom' : 'ytd');
  const [generated, setGenerated] = useState(false);
  const [dateRange, setDateRange] = useState(() =>
    hasUrlDates ? { start: urlParams!.from, end: urlParams!.to } : getPresetDates('ytd')
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [locationId, setLocationId] = useState(urlParams?.location || 'all');
  const [locationName, setLocationName] = useState('All locations');
  const autoGenRef = useRef(hasUrlDates);

  const dummyRange = { start: '1900-01-01', end: '1900-01-02' };
  const [committedRange, setCommittedRange] = useState(
    hasUrlDates ? { start: urlParams!.from, end: urlParams!.to } : dummyRange
  );
  const [committedLoc, setCommittedLoc] = useState(urlParams?.location || 'all');

  const { loading, byStaff, appointments } = useSalesMarginData({
    dateRange: committedRange,
    selectedLocation: committedLoc,
    statusFilter: 'Completed',
  });

  const [sortBy, setSortBy] = useState<SortField>('margin');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');

  const applyPreset = (p: DatePreset, range: { start: string; end: string }) => {
    setDatePreset(p);
    setDateRange(range);
  };

  const handleGenerate = () => {
    setGenerated(true);
    setCommittedRange({ ...dateRange });
    setCommittedLoc(locationId);
    onParamsChange?.({ from: dateRange.start, to: dateRange.end, location: locationId });
  };

  useEffect(() => {
    if (autoGenRef.current) {
      autoGenRef.current = false;
      setGenerated(true);
    }
  }, []);

  const rows: Row[] = useMemo(() => {
    if (!generated) return [];
    return byStaff.map(r => ({
      ...r,
      visitsLinked: r.visits - r.visitsNoData,
      hasRate: r.staffCost > 0 || r.visits === 0,
    }));
  }, [byStaff, generated]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const terms = search.toLowerCase().split(/\s+/).filter(t => t.length >= 1);
    return rows.filter(r => {
      const name = r.staffName.toLowerCase();
      return terms.every(t => name.includes(t));
    });
  }, [rows, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const mul = sortDir === 'desc' ? -1 : 1;
      if (sortBy === 'staffName') return mul * a.staffName.localeCompare(b.staffName);
      return mul * ((a[sortBy] as number) - (b[sortBy] as number));
    });
  }, [filtered, sortBy, sortDir]);

  const totals = useMemo(() => {
    const t = filtered.reduce((acc, r) => ({
      visitsLinked: acc.visitsLinked + r.visitsLinked,
      visitsNoData: acc.visitsNoData + r.visitsNoData,
      revenue: acc.revenue + r.revenue,
      staffCost: acc.staffCost + r.staffCost,
      margin: acc.margin + r.margin,
    }), { visitsLinked: 0, visitsNoData: 0, revenue: 0, staffCost: 0, margin: 0 });
    return { ...t, marginPercent: t.revenue > 0 ? (t.margin / t.revenue) * 100 : 0 };
  }, [filtered]);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(field); setSortDir('desc'); }
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const getServiceBreakdown = (staffId: string, appts: AppointmentRow[]): ServiceBreakdown[] => {
    const map: Record<string, ServiceBreakdown> = {};
    appts.filter(a => (a.staff_id || 'unknown') === staffId).forEach(a => {
      const key = a.session_type_id || 'unknown';
      if (!map[key]) map[key] = { name: a.sessionTypeName, visitsLinked: 0, visitsNoData: 0, revenue: 0, staffCost: 0, margin: 0 };
      map[key].staffCost += a.staffCost;
      if (a.hasRevenueData) {
        map[key].visitsLinked++;
        map[key].revenue += a.revenue!;
        map[key].margin += a.margin!;
      } else {
        map[key].visitsNoData++;
      }
    });
    return Object.values(map).sort((a, b) => b.margin - a.margin);
  };

  const handleExportXlsx = () => {
    if (sorted.length === 0) return;
    const data = sorted.map(r => ({
      'Staff': r.staffName,
      'Visits (linked)': r.visitsLinked,
      'Visits (unlinked)': r.visitsNoData,
      'Revenue (EUR)': Number(r.revenue.toFixed(2)),
      'Staff Cost (EUR)': Number(r.staffCost.toFixed(2)),
      'Margin (EUR)': Number(r.margin.toFixed(2)),
      'Margin (%)': r.revenue > 0 ? Number(r.marginPercent.toFixed(1)) : 0,
    }));
    data.push({
      'Staff': 'TOTAL',
      'Visits (linked)': totals.visitsLinked,
      'Visits (unlinked)': totals.visitsNoData,
      'Revenue (EUR)': Number(totals.revenue.toFixed(2)),
      'Staff Cost (EUR)': Number(totals.staffCost.toFixed(2)),
      'Margin (EUR)': Number(totals.margin.toFixed(2)),
      'Margin (%)': Number(totals.marginPercent.toFixed(1)),
    });
    exportToExcel(data, 'margin_by_staff');
  };

  const handlePrint = () => window.print();

  const SH = ({ field, label }: { field: SortField; label: string }) => (
    <th className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:text-slate-900 select-none" onClick={() => toggleSort(field)}>
      <div className="flex items-center gap-1 justify-end">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${sortBy === field ? 'text-blue-600' : 'text-slate-400'}`} />
      </div>
    </th>
  );

  const mc = (v: number) => v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-600' : 'text-slate-500';

  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-blue-600" />
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Margin by Staff</h2>
            <p className="text-slate-500 text-sm mt-0.5">Staff cost = per-appointment pay rates from Mindbody</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-0">
              <DateRangePicker
                startDate={dateRange.start} endDate={dateRange.end}
                activePreset={datePreset}
                onStartChange={v => setDateRange(d => ({ ...d, start: v }))}
                onEndChange={v => setDateRange(d => ({ ...d, end: v }))}
                onPreset={applyPreset}
              />
            </div>
            <LocationFilter value={locationId} onChange={(id, name) => { setLocationId(id); setLocationName(name); }} />
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={handleGenerate}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Generate
            </button>
            {generated && sorted.length > 0 && (<>
              <button onClick={handleExportXlsx}
                className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2">
                <Download className="w-4 h-4" /> Excel
              </button>
              <button onClick={handlePrint}
                className="px-4 py-2.5 bg-slate-600 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors flex items-center gap-2">
                <Printer className="w-4 h-4" /> Print / PDF
              </button>
              <CopyLinkButton section="margin-by-staff" params={{ from: dateRange.start, to: dateRange.end, location: locationId }} />
            </>)}
          </div>
        </div>

        {generated && loading && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
            <p className="text-slate-500">Loading data...</p>
          </div>
        )}

        {generated && !loading && rows.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
            No completed appointments in selected period
          </div>
        )}

        {generated && !loading && rows.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-slate-800 shrink-0">Profitability by Staff Member</h3>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search staff..."
                    className="pl-9 pr-8 py-1.5 border border-slate-300 rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <span className="text-xs text-slate-500 shrink-0">{sorted.length}{search ? ` / ${rows.length}` : ''} staff members</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="w-8"></th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 cursor-pointer hover:text-slate-900 select-none" onClick={() => toggleSort('staffName')}>
                      <div className="flex items-center gap-1">Staff <ArrowUpDown className={`w-3 h-3 ${sortBy === 'staffName' ? 'text-blue-600' : 'text-slate-400'}`} /></div>
                    </th>
                    <SH field="visitsLinked" label="Visits (linked)" />
                    <SH field="visitsNoData" label="Visits (unlinked)" />
                    <SH field="revenue" label="Revenue" />
                    <SH field="staffCost" label="Staff Cost" />
                    <SH field="margin" label="Margin" />
                    <SH field="marginPercent" label="Margin %" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sorted.map(r => {
                    const isOpen = expanded.has(r.staffId);
                    const breakdown = isOpen ? getServiceBreakdown(r.staffId, appointments) : [];
                    return (
                      <StaffRowBlock key={r.staffId} row={r} isOpen={isOpen} breakdown={breakdown}
                        onToggle={() => toggleExpand(r.staffId)} mc={mc} />
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                  <tr className="font-bold">
                    <td></td>
                    <td className="px-4 py-3 text-slate-900">Total</td>
                    <td className="px-4 py-3 text-right text-slate-900">{totals.visitsLinked}</td>
                    <td className="px-4 py-3 text-right text-amber-600">{totals.visitsNoData > 0 ? totals.visitsNoData : '0'}</td>
                    <td className="px-4 py-3 text-right text-blue-600">{formatCurrency(totals.revenue)}</td>
                    <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(totals.staffCost)}</td>
                    <td className={`px-4 py-3 text-right ${mc(totals.margin)}`}>{formatCurrency(totals.margin)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{totals.revenue > 0 ? `${totals.marginPercent.toFixed(1)}%` : '-'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Print-only structured report — detailed per-staff breakdown */}
      {generated && sorted.length > 0 && (
        <div className="print-report hidden print:block">
          <h1>Margin by Staff — Detailed Report</h1>
          <div className="pr-sub">
            Location: {locationName}
            {' | '}Period: {dateRange.start} {'\u2014'} {dateRange.end}
            {' | '}Generated: {new Date().toLocaleDateString('en-GB')}
          </div>

          {/* Summary table */}
          <h2>Summary</h2>
          <table>
            <thead>
              <tr>
                <th>Staff</th>
                <th className="text-right">Visits (linked)</th>
                <th className="text-right">Visits (unlinked)</th>
                <th className="text-right">Revenue</th>
                <th className="text-right">Staff Cost</th>
                <th className="text-right">Margin</th>
                <th className="text-right">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.staffId}>
                  <td>{r.staffName}</td>
                  <td className="text-right">{r.visitsLinked}</td>
                  <td className="text-right">{r.visitsNoData}</td>
                  <td className="text-right">{formatCurrency(r.revenue)}</td>
                  <td className="text-right">{formatCurrency(r.staffCost)}</td>
                  <td className="text-right">{formatCurrency(r.margin)}</td>
                  <td className="text-right">{r.revenue > 0 ? `${r.marginPercent.toFixed(1)}%` : '-'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>TOTAL</td>
                <td className="text-right">{totals.visitsLinked}</td>
                <td className="text-right">{totals.visitsNoData}</td>
                <td className="text-right">{formatCurrency(totals.revenue)}</td>
                <td className="text-right">{formatCurrency(totals.staffCost)}</td>
                <td className="text-right">{formatCurrency(totals.margin)}</td>
                <td className="text-right">{totals.revenue > 0 ? `${totals.marginPercent.toFixed(1)}%` : '-'}</td>
              </tr>
            </tfoot>
          </table>

          {/* Per-staff detail sections */}
          {sorted.map(r => {
            const breakdown = getServiceBreakdown(r.staffId, appointments);
            if (breakdown.length === 0) return null;
            return (
              <div key={r.staffId} className="pr-staff-section">
                <h2>{r.staffName}</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th className="text-right">Linked</th>
                      <th className="text-right">Unlinked</th>
                      <th className="text-right">Revenue</th>
                      <th className="text-right">Staff Cost</th>
                      <th className="text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.map((svc, idx) => (
                      <tr key={idx}>
                        <td>{svc.name}</td>
                        <td className="text-right">{svc.visitsLinked}</td>
                        <td className="text-right">{svc.visitsNoData}</td>
                        <td className="text-right">{formatCurrency(svc.revenue)}</td>
                        <td className="text-right">{formatCurrency(svc.staffCost)}</td>
                        <td className="text-right">{formatCurrency(svc.margin)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total — {r.staffName}</td>
                      <td className="text-right">{r.visitsLinked}</td>
                      <td className="text-right">{r.visitsNoData}</td>
                      <td className="text-right">{formatCurrency(r.revenue)}</td>
                      <td className="text-right">{formatCurrency(r.staffCost)}</td>
                      <td className="text-right">{formatCurrency(r.margin)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })}

          {/* Grand total */}
          <div className="pr-grand-total">
            <h2>Grand Total</h2>
            <dl className="pr-grid">
              <dt>Visits (linked)</dt><dd>{totals.visitsLinked}</dd>
              <dt>Visits (unlinked)</dt><dd>{totals.visitsNoData}</dd>
              <dt>Revenue</dt><dd>{formatCurrency(totals.revenue)}</dd>
              <dt>Staff Cost</dt><dd>{formatCurrency(totals.staffCost)}</dd>
              <dt>Margin</dt><dd>{formatCurrency(totals.margin)}</dd>
              <dt>Margin %</dt><dd>{totals.revenue > 0 ? `${totals.marginPercent.toFixed(1)}%` : '-'}</dd>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

function StaffRowBlock({ row, isOpen, breakdown, onToggle, mc }: {
  row: Row; isOpen: boolean; breakdown: ServiceBreakdown[];
  onToggle: () => void; mc: (v: number) => string;
}) {
  return (
    <>
      <tr className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={onToggle}>
        <td className="pl-3 text-slate-400">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </td>
        <td className="px-4 py-3 font-medium text-slate-900">
          {row.staffName}
          {!row.hasRate && <span className="ml-2 text-[10px] text-orange-500 font-normal" title="No pay rate configured">No rate set</span>}
        </td>
        <td className="px-4 py-3 text-right text-slate-700">{row.visitsLinked}</td>
        <td className="px-4 py-3 text-right">
          {row.visitsNoData > 0 ? (
            <span className="inline-flex items-center gap-1 text-amber-600" title="Visits without pricing data">
              <AlertTriangle className="w-3 h-3" /> {row.visitsNoData}
            </span>
          ) : <span className="text-slate-400">0</span>}
        </td>
        <td className="px-4 py-3 text-right font-medium text-blue-600">{formatCurrency(row.revenue)}</td>
        <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(row.staffCost)}</td>
        <td className={`px-4 py-3 text-right font-semibold ${mc(row.margin)}`}>{formatCurrency(row.margin)}</td>
        <td className={`px-4 py-3 text-right ${mc(row.margin)}`}>
          {row.revenue > 0 ? `${row.marginPercent.toFixed(1)}%` : '-'}
          {row.visitsEstimated > 0 && <Sparkles className="w-3 h-3 inline ml-1 text-violet-500" title={`${row.visitsEstimated} estimated`} />}
        </td>
      </tr>

      {isOpen && breakdown.length > 0 && (
        <tr>
          <td colSpan={8} className="p-0">
            <div className="bg-slate-50 border-y border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-2 text-left">Service</th>
                    <th className="px-4 py-2 text-right">Linked</th>
                    <th className="px-4 py-2 text-right">Unlinked</th>
                    <th className="px-4 py-2 text-right">Revenue</th>
                    <th className="px-4 py-2 text-right">Staff Cost</th>
                    <th className="px-4 py-2 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {breakdown.map((svc, idx) => (
                    <tr key={idx} className="hover:bg-slate-100">
                      <td className="px-6 py-1.5 text-slate-700 font-medium">{svc.name}</td>
                      <td className="px-4 py-1.5 text-right text-slate-600">{svc.visitsLinked}</td>
                      <td className="px-4 py-1.5 text-right">{svc.visitsNoData > 0 ? <span className="text-amber-500">{svc.visitsNoData}</span> : '0'}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-blue-600">{formatCurrency(svc.revenue)}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-amber-600">{formatCurrency(svc.staffCost)}</td>
                      <td className={`px-4 py-1.5 text-right font-mono ${svc.margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatCurrency(svc.margin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
