import { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowUpDown, RefreshCw, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../utils/salesFilters';

interface PricelistRow {
  sessionTypeId: string;
  sessionTypeName: string;
  categoryName: string;
  pricingOptionId: string | null;
  pricingOptionName: string;
  packagePrice: number;
  sessionCount: number;
  revenuePerVisit: number;
  staffEntries: StaffEntry[];
}

interface StaffEntry {
  staffId: string;
  staffName: string;
  staffCost: number;
  margin: number;
  marginPercent: number;
}

interface ServicePricelistTabProps {
  onNavigate?: (tableName: string, id: string) => void;
}

type SortField = 'sessionTypeName' | 'pricingOptionName' | 'revenuePerVisit';

export function ServicePricelistTab({ onNavigate }: ServicePricelistTabProps) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PricelistRow[]>([]);
  const [sortBy, setSortBy] = useState<SortField>('sessionTypeName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [stRes, poRes, sstRes, staffRes] = await Promise.all([
        supabase.from('session_types').select('id, name, category_name'),
        supabase.from('pricing_options').select('id, name, price, session_count, program_name'),
        supabase.from('staff_session_types').select('staff_id, session_type_id, pay_rate'),
        supabase.from('staff').select('id, first_name, last_name'),
      ]);

      const sessionTypes = stRes.data || [];
      const pricingOptions = poRes.data || [];
      const staffSessionTypes = sstRes.data || [];
      const staffList = staffRes.data || [];

      const staffMap: Record<string, string> = {};
      staffList.forEach(s => {
        staffMap[s.id] = `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.id;
      });

      const stMap: Record<string, { name: string; category: string }> = {};
      sessionTypes.forEach(st => {
        stMap[st.id] = { name: st.name, category: st.category_name || '' };
      });

      const staffRatesBySessionType: Record<string, StaffEntry[]> = {};
      staffSessionTypes.forEach(sst => {
        if (!sst.session_type_id || !sst.staff_id) return;
        const key = sst.session_type_id;
        if (!staffRatesBySessionType[key]) staffRatesBySessionType[key] = [];
        staffRatesBySessionType[key].push({
          staffId: sst.staff_id,
          staffName: staffMap[sst.staff_id] || sst.staff_id,
          staffCost: Number(sst.pay_rate) || 0,
          margin: 0,
          marginPercent: 0,
        });
      });

      const poByProgram: Record<string, typeof pricingOptions> = {};
      pricingOptions.forEach(po => {
        const progName = po.program_name || 'Unknown';
        if (!poByProgram[progName]) poByProgram[progName] = [];
        poByProgram[progName].push(po);
      });

      const result: PricelistRow[] = [];

      sessionTypes.forEach(st => {
        const staffEntries = staffRatesBySessionType[st.id] || [];

        const matchingPOs = pricingOptions.filter(po => {
          const sc = po.session_count || 0;
          return sc > 0;
        });

        if (matchingPOs.length === 0) {
          const entries = staffEntries.map(se => ({
            ...se,
            margin: 0 - se.staffCost,
            marginPercent: 0,
          }));

          result.push({
            sessionTypeId: st.id,
            sessionTypeName: st.name,
            categoryName: st.category_name || '',
            pricingOptionId: null,
            pricingOptionName: 'No pricing option',
            packagePrice: 0,
            sessionCount: 0,
            revenuePerVisit: 0,
            staffEntries: entries,
          });
        }

        matchingPOs.forEach(po => {
          const price = Number(po.price) || 0;
          const sc = po.session_count || 1;
          const rev = price / sc;

          const entries = staffEntries.map(se => ({
            ...se,
            margin: rev - se.staffCost,
            marginPercent: rev > 0 ? ((rev - se.staffCost) / rev) * 100 : 0,
          }));

          result.push({
            sessionTypeId: st.id,
            sessionTypeName: st.name,
            categoryName: st.category_name || '',
            pricingOptionId: po.id,
            pricingOptionName: po.name || 'Unnamed',
            packagePrice: price,
            sessionCount: sc,
            revenuePerVisit: rev,
            staffEntries: entries,
          });
        });
      });

      setRows(result);
    } catch (error) {
      console.error('Error loading pricelist data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const categories = useMemo(() => {
    const set = new Set(rows.map(r => r.categoryName).filter(Boolean));
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (filterCategory !== 'all') {
      result = result.filter(r => r.categoryName === filterCategory);
    }
    return result;
  }, [rows, filterCategory]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const mul = sortDir === 'desc' ? -1 : 1;
      if (sortBy === 'revenuePerVisit') {
        return mul * (a.revenuePerVisit - b.revenuePerVisit);
      }
      return mul * (a[sortBy] || '').localeCompare(b[sortBy] || '');
    });
  }, [filtered, sortBy, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortDir(field === 'revenuePerVisit' ? 'desc' : 'asc');
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
    return <div className="flex items-center justify-center h-64 text-slate-500">Loading pricelist data...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm"
        >
          <option value="all">All Categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <span className="text-sm text-slate-500">{sorted.length} combinations</span>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50 ml-auto"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <SortHeader field="sessionTypeName" label="Service" />
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Category</th>
                <SortHeader field="pricingOptionName" label="Pricing Option" />
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Package</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Sessions</th>
                <SortHeader field="revenuePerVisit" label="Revenue / Visit" align="right" />
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Staff</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Staff Cost</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Margin</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((row, idx) => {
                if (row.staffEntries.length === 0) {
                  return (
                    <tr key={`${row.sessionTypeId}-${row.pricingOptionId || 'none'}-${idx}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{row.sessionTypeName}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{row.categoryName}</td>
                      <td className="px-4 py-3 text-slate-700">{row.pricingOptionName}</td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {row.packagePrice > 0 ? formatCurrency(row.packagePrice) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500">{row.sessionCount || '-'}</td>
                      <td className="px-4 py-3 text-right font-medium text-blue-600">
                        {row.revenuePerVisit > 0 ? formatCurrency(row.revenuePerVisit) : '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-400 italic text-xs">no staff assigned</td>
                      <td className="px-4 py-3 text-right text-slate-400">-</td>
                      <td className="px-4 py-3 text-right text-slate-400">-</td>
                      <td className="px-4 py-3 text-right text-slate-400">-</td>
                    </tr>
                  );
                }

                return row.staffEntries.map((se, seIdx) => (
                  <tr
                    key={`${row.sessionTypeId}-${row.pricingOptionId || 'none'}-${se.staffId}-${idx}`}
                    className="hover:bg-slate-50"
                  >
                    {seIdx === 0 ? (
                      <>
                        <td className="px-4 py-2 font-medium text-slate-900" rowSpan={row.staffEntries.length}>
                          {row.sessionTypeName}
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-500" rowSpan={row.staffEntries.length}>
                          {row.categoryName}
                        </td>
                        <td className="px-4 py-2 text-slate-700" rowSpan={row.staffEntries.length}>
                          {row.pricingOptionName}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-600" rowSpan={row.staffEntries.length}>
                          {row.packagePrice > 0 ? formatCurrency(row.packagePrice) : '-'}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-500" rowSpan={row.staffEntries.length}>
                          {row.sessionCount || '-'}
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-blue-600" rowSpan={row.staffEntries.length}>
                          {row.revenuePerVisit > 0 ? formatCurrency(row.revenuePerVisit) : '-'}
                        </td>
                      </>
                    ) : null}
                    <td className="px-4 py-2 text-slate-700">{se.staffName}</td>
                    <td className="px-4 py-2 text-right text-amber-600">{formatCurrency(se.staffCost)}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${se.margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {row.revenuePerVisit > 0 ? formatCurrency(se.margin) : '-'}
                    </td>
                    <td className={`px-4 py-2 text-right ${se.margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {row.revenuePerVisit > 0 ? `${se.marginPercent.toFixed(1)}%` : '-'}
                    </td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
