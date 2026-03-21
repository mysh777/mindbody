import { useState, useMemo } from 'react';
import { ArrowUpDown, Download } from 'lucide-react';
import { formatCurrency } from '../utils/salesFilters';
import { exportToExcel } from '../utils/exportExcel';
import type { AppointmentRow } from '../hooks/useSalesMarginData';

interface PricelistRow {
  key: string;
  sessionTypeName: string;
  categoryName: string;
  pricingOptionName: string;
  staffName: string;
  revenuePerVisit: number;
  staffCost: number;
  margin: number;
  marginPercent: number;
  visits: number;
}

interface ServicePricelistTabProps {
  loading: boolean;
  appointments: AppointmentRow[];
  dateRange: { start: string; end: string };
}

type SortField = 'sessionTypeName' | 'pricingOptionName' | 'staffName' | 'revenuePerVisit' | 'staffCost' | 'margin' | 'visits';

export function ServicePricelistTab({ loading, appointments, dateRange }: ServicePricelistTabProps) {
  const [sortBy, setSortBy] = useState<SortField>('sessionTypeName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [exporting, setExporting] = useState(false);

  const { rows, categories } = useMemo(() => {
    const map: Record<string, PricelistRow & { totalRevenue: number; totalCost: number }> = {};
    const catSet = new Set<string>();

    const withData = appointments.filter(a => a.hasRevenueData);

    withData.forEach(a => {
      const key = `${a.sessionTypeName}||${a.pricingOptionName}||${a.staffName}`;
      catSet.add(a.sessionTypeName);

      if (!map[key]) {
        map[key] = {
          key,
          sessionTypeName: a.sessionTypeName,
          categoryName: '',
          pricingOptionName: a.pricingOptionName || '(unknown)',
          staffName: a.staffName,
          revenuePerVisit: 0,
          staffCost: 0,
          margin: 0,
          marginPercent: 0,
          visits: 0,
          totalRevenue: 0,
          totalCost: 0,
        };
      }
      map[key].visits++;
      map[key].totalRevenue += a.revenue || 0;
      map[key].totalCost += a.staffCost;
    });

    const result = Object.values(map).map(r => {
      const avgRev = r.visits > 0 ? r.totalRevenue / r.visits : 0;
      const avgCost = r.visits > 0 ? r.totalCost / r.visits : 0;
      const avgMargin = avgRev - avgCost;
      return {
        key: r.key,
        sessionTypeName: r.sessionTypeName,
        categoryName: r.categoryName,
        pricingOptionName: r.pricingOptionName,
        staffName: r.staffName,
        revenuePerVisit: avgRev,
        staffCost: avgCost,
        margin: avgMargin,
        marginPercent: avgRev > 0 ? (avgMargin / avgRev) * 100 : 0,
        visits: r.visits,
      };
    });

    return { rows: result, categories: [...catSet].sort() };
  }, [appointments]);

  const filtered = useMemo(() => {
    if (filterCategory === 'all') return rows;
    return rows.filter(r => r.sessionTypeName === filterCategory);
  }, [rows, filterCategory]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const mul = sortDir === 'desc' ? -1 : 1;
      const field = sortBy;
      if (field === 'revenuePerVisit' || field === 'staffCost' || field === 'margin' || field === 'visits') {
        return mul * (a[field] - b[field]);
      }
      return mul * (a[field] || '').localeCompare(b[field] || '');
    });
  }, [filtered, sortBy, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortDir(field === 'revenuePerVisit' || field === 'margin' || field === 'visits' || field === 'staffCost' ? 'desc' : 'asc');
    }
  };

  const handleExport = () => {
    setExporting(true);
    try {
      const exportData = sorted.map(r => ({
        'Service': r.sessionTypeName,
        'Pricing Option': r.pricingOptionName,
        'Staff': r.staffName,
        'Revenue / Visit': Number(r.revenuePerVisit.toFixed(2)),
        'Staff Cost': Number(r.staffCost.toFixed(2)),
        'Margin': Number(r.margin.toFixed(2)),
        'Margin %': `${r.marginPercent.toFixed(1)}%`,
        'Visits': r.visits,
      }));
      exportToExcel(exportData, `service_pricelist_${dateRange.start}_to_${dateRange.end}`);
    } finally {
      setExporting(false);
    }
  };

  const SortHeader = ({ field, label, align = 'left' }: { field: SortField; label: string; align?: string }) => (
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

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-500">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm"
        >
          <option value="all">All Services</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <span className="text-sm text-slate-500">{sorted.length} rows</span>
        <button
          onClick={handleExport}
          disabled={exporting || sorted.length === 0}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors ml-auto"
        >
          <Download className={`w-3.5 h-3.5 ${exporting ? 'animate-pulse' : ''}`} />
          Export Excel
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <SortHeader field="sessionTypeName" label="Service" />
                <SortHeader field="pricingOptionName" label="Pricing Option" />
                <SortHeader field="staffName" label="Staff" />
                <SortHeader field="revenuePerVisit" label="Revenue / Visit" align="right" />
                <SortHeader field="staffCost" label="Staff Cost" align="right" />
                <SortHeader field="margin" label="Margin" align="right" />
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Margin %</th>
                <SortHeader field="visits" label="Visits" align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map(row => (
                <tr key={row.key} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{row.sessionTypeName}</td>
                  <td className="px-4 py-2.5 text-slate-700">{row.pricingOptionName}</td>
                  <td className="px-4 py-2.5 text-slate-700">{row.staffName}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-blue-600">
                    {formatCurrency(row.revenuePerVisit)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-amber-600">
                    {formatCurrency(row.staffCost)}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${row.margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatCurrency(row.margin)}
                  </td>
                  <td className={`px-4 py-2.5 text-right ${row.margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {row.marginPercent.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{row.visits}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No appointment data with revenue info for this period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
