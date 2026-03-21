import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, ArrowUpDown } from 'lucide-react';
import { formatCurrency } from '../utils/salesFilters';
import type { ByStaffRow, AppointmentRow } from '../hooks/useSalesMarginData';

interface ByStaffTabProps {
  loading: boolean;
  byStaff: ByStaffRow[];
  appointments: AppointmentRow[];
  onNavigate?: (tableName: string, id: string) => void;
}

type SortField = 'visits' | 'revenue' | 'staffCost' | 'margin' | 'marginPercent';

export function ByStaffTab({ loading, byStaff, appointments, onNavigate }: ByStaffTabProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortField>('margin');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    return [...byStaff].sort((a, b) => {
      const mul = sortDir === 'desc' ? -1 : 1;
      return mul * (a[sortBy] - b[sortBy]);
    });
  }, [byStaff, sortBy, sortDir]);

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

  const getAppointmentsForStaff = (staffId: string) =>
    appointments.filter(a => (a.staff_id || 'unknown') === staffId);

  const totals = useMemo(() => {
    return byStaff.reduce(
      (acc, r) => ({
        visits: acc.visits + r.visits,
        revenue: acc.revenue + r.revenue,
        staffCost: acc.staffCost + r.staffCost,
        margin: acc.margin + r.margin,
        visitsNoData: acc.visitsNoData + r.visitsNoData,
      }),
      { visits: 0, revenue: 0, staffCost: 0, margin: 0, visitsNoData: 0 }
    );
  }, [byStaff]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-500">Loading data...</div>;
  }

  if (byStaff.length === 0) {
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
          <h3 className="font-semibold text-slate-800">Profitability by Staff Member</h3>
          <span className="text-xs text-slate-500">{byStaff.length} staff members</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="w-8"></th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Staff Member</th>
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
                const isOpen = expanded.has(row.staffId);
                const appts = isOpen ? getAppointmentsForStaff(row.staffId) : [];
                const marginColor = row.margin > 0 ? 'text-emerald-600' : row.margin < 0 ? 'text-red-600' : 'text-slate-500';

                return (
                  <StaffRow
                    key={row.staffId}
                    row={row}
                    isOpen={isOpen}
                    appts={appts}
                    marginColor={marginColor}
                    onToggle={() => toggleExpand(row.staffId)}
                    onNavigate={onNavigate}
                  />
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-300">
              <tr className="font-bold">
                <td></td>
                <td className="px-4 py-3 text-slate-900">Total</td>
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

function StaffRow({
  row,
  isOpen,
  appts,
  marginColor,
  onToggle,
  onNavigate,
}: {
  row: ByStaffRow;
  isOpen: boolean;
  appts: AppointmentRow[];
  marginColor: string;
  onToggle: () => void;
  onNavigate?: (tableName: string, id: string) => void;
}) {
  const serviceBreakdown = useMemo(() => {
    const map: Record<string, { name: string; visits: number; revenue: number; cost: number; margin: number; noData: number }> = {};
    appts.forEach(a => {
      const key = a.session_type_id || 'unknown';
      if (!map[key]) map[key] = { name: a.sessionTypeName, visits: 0, revenue: 0, cost: 0, margin: 0, noData: 0 };
      map[key].visits++;
      map[key].cost += a.staffCost;
      if (a.hasRevenueData) {
        map[key].revenue += a.revenue!;
        map[key].margin += a.margin!;
      } else {
        map[key].noData++;
      }
    });
    return Object.values(map).sort((a, b) => b.margin - a.margin);
  }, [appts]);

  return (
    <>
      <tr
        className="hover:bg-slate-50 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="pl-3 text-slate-400">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </td>
        <td className="px-4 py-3 font-medium text-slate-900">{row.staffName}</td>
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

      {isOpen && serviceBreakdown.length > 0 && (
        <tr>
          <td colSpan={8} className="p-0">
            <div className="bg-slate-50 border-y border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-2 text-left">Service</th>
                    <th className="px-4 py-2 text-right">Visits</th>
                    <th className="px-4 py-2 text-right">Revenue</th>
                    <th className="px-4 py-2 text-right">Staff Cost</th>
                    <th className="px-4 py-2 text-right">Margin</th>
                    <th className="px-4 py-2 text-right">No Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {serviceBreakdown.map((svc, idx) => (
                    <tr key={idx} className="hover:bg-slate-100">
                      <td className="px-6 py-1.5 text-slate-700 font-medium">{svc.name}</td>
                      <td className="px-4 py-1.5 text-right text-slate-600">{svc.visits}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-blue-600">{formatCurrency(svc.revenue)}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-amber-600">{formatCurrency(svc.cost)}</td>
                      <td className={`px-4 py-1.5 text-right font-mono ${svc.margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatCurrency(svc.margin)}
                      </td>
                      <td className="px-4 py-1.5 text-right">
                        {svc.noData > 0 && <span className="text-amber-500">{svc.noData}</span>}
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
