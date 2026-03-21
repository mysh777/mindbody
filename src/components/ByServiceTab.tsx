import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, ArrowUpDown } from 'lucide-react';
import { formatCurrency } from '../utils/salesFilters';
import type { ByServiceRow, AppointmentRow, NoDataReason } from '../hooks/useSalesMarginData';

const noDataLabel: Record<NoDataReason, string> = {
  ok: '',
  cs_not_synced: 'no data (service not synced)',
  no_pricing_option: 'no data (no pricing option)',
  no_client_service: 'no data (no service linked)',
};

interface ByServiceTabProps {
  loading: boolean;
  byService: ByServiceRow[];
  appointments: AppointmentRow[];
  onNavigate?: (tableName: string, id: string) => void;
}

type SortField = 'visits' | 'revenue' | 'staffCost' | 'margin' | 'marginPercent';

export function ByServiceTab({ loading, byService, appointments, onNavigate }: ByServiceTabProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortField>('margin');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    return [...byService].sort((a, b) => {
      const mul = sortDir === 'desc' ? -1 : 1;
      return mul * (a[sortBy] - b[sortBy]);
    });
  }, [byService, sortBy, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getAppointmentsForService = (sessionTypeId: string) =>
    appointments.filter(a => (a.session_type_id || 'unknown') === sessionTypeId);

  const totals = useMemo(() => {
    return byService.reduce(
      (acc, r) => ({
        visits: acc.visits + r.visits,
        revenue: acc.revenue + r.revenue,
        staffCost: acc.staffCost + r.staffCost,
        margin: acc.margin + r.margin,
        visitsNoData: acc.visitsNoData + r.visitsNoData,
      }),
      { visits: 0, revenue: 0, staffCost: 0, margin: 0, visitsNoData: 0 }
    );
  }, [byService]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-500">Loading data...</div>;
  }

  if (byService.length === 0) {
    return <div className="flex items-center justify-center h-64 text-slate-500">No appointment data for selected period</div>;
  }

  const SortHeader = ({ field, label, align = 'right' }: { field: SortField; label: string; align?: string }) => (
    <th
      className={`px-4 py-3 font-semibold text-slate-600 cursor-pointer hover:text-slate-900 transition-colors ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => toggleSort(field)}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}
        <ArrowUpDown className={`w-3 h-3 ${sortBy === field ? 'text-blue-600' : 'text-slate-400'}`} />
      </div>
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Profitability by Service Type</h3>
          <span className="text-xs text-slate-500">{byService.length} service types</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="w-8"></th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Service</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Category</th>
                <SortHeader field="visits" label="Visits" />
                <SortHeader field="revenue" label="Revenue" />
                <SortHeader field="staffCost" label="Staff Cost" />
                <SortHeader field="margin" label="Margin" />
                <SortHeader field="marginPercent" label="Margin %" />
                <th className="px-4 py-3 font-semibold text-slate-600 text-right">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map(row => {
                const isOpen = expanded.has(row.sessionTypeId);
                const appts = isOpen ? getAppointmentsForService(row.sessionTypeId) : [];
                const marginColor = row.margin > 0 ? 'text-emerald-600' : row.margin < 0 ? 'text-red-600' : 'text-slate-500';

                return (
                  <ServiceRow
                    key={row.sessionTypeId}
                    row={row}
                    isOpen={isOpen}
                    appts={appts}
                    marginColor={marginColor}
                    onToggle={() => toggleExpand(row.sessionTypeId)}
                    onNavigate={onNavigate}
                  />
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-300">
              <tr className="font-bold">
                <td></td>
                <td className="px-4 py-3 text-slate-900">Total</td>
                <td></td>
                <td className="px-4 py-3 text-right text-slate-900">{totals.visits}</td>
                <td className="px-4 py-3 text-right text-blue-600">{formatCurrency(totals.revenue)}</td>
                <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(totals.staffCost)}</td>
                <td className={`px-4 py-3 text-right ${totals.margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatCurrency(totals.margin)}
                </td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {totals.revenue > 0 ? `${((totals.margin / totals.revenue) * 100).toFixed(1)}%` : '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  {totals.visitsNoData > 0 && (
                    <span className="text-xs text-amber-600">{totals.visitsNoData} N/A</span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function ServiceRow({
  row,
  isOpen,
  appts,
  marginColor,
  onToggle,
  onNavigate,
}: {
  row: ByServiceRow;
  isOpen: boolean;
  appts: AppointmentRow[];
  marginColor: string;
  onToggle: () => void;
  onNavigate?: (tableName: string, id: string) => void;
}) {
  return (
    <>
      <tr
        className="hover:bg-slate-50 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="pl-3 text-slate-400">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </td>
        <td className="px-4 py-3 font-medium text-slate-900">{row.sessionTypeName}</td>
        <td className="px-4 py-3 text-slate-500 text-xs">{row.categoryName}</td>
        <td className="px-4 py-3 text-right text-slate-700">{row.visits}</td>
        <td className="px-4 py-3 text-right font-medium text-blue-600">{formatCurrency(row.revenue)}</td>
        <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(row.staffCost)}</td>
        <td className={`px-4 py-3 text-right font-semibold ${marginColor}`}>{formatCurrency(row.margin)}</td>
        <td className={`px-4 py-3 text-right ${marginColor}`}>
          {row.revenue > 0 ? `${row.marginPercent.toFixed(1)}%` : '-'}
        </td>
        <td className="px-4 py-3 text-right">
          {row.visitsNoData > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600" title={`${row.visitsNoData} visits without pricing data`}>
              <AlertTriangle className="w-3 h-3" />
              {row.visitsNoData}
            </span>
          )}
        </td>
      </tr>

      {isOpen && appts.length > 0 && (
        <tr>
          <td colSpan={9} className="p-0">
            <div className="bg-slate-50 border-y border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Client</th>
                    <th className="px-4 py-2 text-left">Staff</th>
                    <th className="px-4 py-2 text-left">Location</th>
                    <th className="px-4 py-2 text-right">Revenue</th>
                    <th className="px-4 py-2 text-right">Staff Cost</th>
                    <th className="px-4 py-2 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {appts.slice(0, 50).map(a => (
                    <tr key={a.id} className="hover:bg-slate-100">
                      <td className="px-6 py-1.5 text-slate-600">
                        {new Date(a.start_datetime).toLocaleDateString('de-DE')}
                      </td>
                      <td className="px-4 py-1.5">
                        {a.client_id ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); onNavigate?.('clients', a.client_id!); }}
                            className="text-blue-600 hover:underline"
                          >
                            {a.clientName}
                          </button>
                        ) : (
                          <span className="text-slate-500">{a.clientName}</span>
                        )}
                      </td>
                      <td className="px-4 py-1.5 text-slate-600">{a.staffName}</td>
                      <td className="px-4 py-1.5 text-slate-500">{a.locationName}</td>
                      <td className="px-4 py-1.5 text-right font-mono">
                        {a.hasRevenueData ? (
                          <span className="text-blue-600">{formatCurrency(a.revenue!)}</span>
                        ) : (
                          <span className="text-amber-500 italic text-[10px]">{noDataLabel[a.noDataReason]}</span>
                        )}
                      </td>
                      <td className="px-4 py-1.5 text-right font-mono text-amber-600">
                        {formatCurrency(a.staffCost)}
                      </td>
                      <td className="px-4 py-1.5 text-right font-mono">
                        {a.hasRevenueData ? (
                          <span className={a.margin! >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                            {formatCurrency(a.margin!)}
                          </span>
                        ) : (
                          <span className="text-amber-500 italic text-[10px]">{noDataLabel[a.noDataReason]}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {appts.length > 50 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-2 text-center text-slate-500 italic">
                        Showing 50 of {appts.length} appointments
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
