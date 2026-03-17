import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw, Building2, ChevronDown, ChevronRight, Download } from 'lucide-react';
import { exportToExcel } from '../utils/exportExcel';

interface SalesByPricingOptionProps {
  onNavigate?: (tableName: string, id: string) => void;
}

interface SaleItemDetail {
  sale_id: string;
  item_name: string;
  total_amount: number;
  client_id: string | null;
  client_name: string;
  sale_date: string;
  location_name: string;
}

type FilterPreset = 'today' | 'this_week' | 'this_month' | 'last_month' | 'this_year' | 'custom';

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
};

function getFilterPresetDates(preset: FilterPreset): { start: string; end: string } {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  switch (preset) {
    case 'today':
      return { start: todayStr, end: todayStr };
    case 'this_week': {
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      return { start: monday.toISOString().split('T')[0], end: todayStr };
    }
    case 'this_month': {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: firstDay.toISOString().split('T')[0], end: todayStr };
    }
    case 'last_month': {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: firstDay.toISOString().split('T')[0], end: lastDay.toISOString().split('T')[0] };
    }
    case 'this_year': {
      const firstDay = new Date(today.getFullYear(), 0, 1);
      return { start: firstDay.toISOString().split('T')[0], end: todayStr };
    }
    default:
      return { start: todayStr, end: todayStr };
  }
}

function getMonthsForTimeline(): { label: string; start: string; end: string }[] {
  const months: { label: string; start: string; end: string }[] = [];
  const today = new Date();

  for (let i = 11; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    months.push({
      label: date.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
      start: date.toISOString().split('T')[0],
      end: lastDay.toISOString().split('T')[0],
    });
  }

  return months;
}

export function SalesByPricingOption({ onNavigate }: SalesByPricingOptionProps) {
  const [loading, setLoading] = useState(false);
  const [saleItems, setSaleItems] = useState<SaleItemDetail[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [filterPreset, setFilterPreset] = useState<FilterPreset>('this_month');
  const [dateRange, setDateRange] = useState(getFilterPresetDates('this_month'));
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [expandedOptions, setExpandedOptions] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const months = getMonthsForTimeline();

  const loadLocations = useCallback(async () => {
    const { data } = await supabase.from('locations').select('id, name').order('name');
    setLocations(data || []);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let salesQuery = supabase
        .from('sales')
        .select('id, client_id, sale_datetime, location_id')
        .gte('sale_datetime', dateRange.start)
        .lte('sale_datetime', dateRange.end + 'T23:59:59');

      if (selectedLocation !== 'all') {
        salesQuery = salesQuery.eq('location_id', selectedLocation);
      }

      const { data: salesData, error: salesError } = await salesQuery;
      if (salesError) throw salesError;

      if (!salesData || salesData.length === 0) {
        setSaleItems([]);
        return;
      }

      const saleIds = salesData.map(s => s.id);
      const allItems: { sale_id: string; item_name: string | null; description: string | null; total_amount: number }[] = [];

      for (let i = 0; i < saleIds.length; i += 500) {
        const batch = saleIds.slice(i, i + 500);
        const { data: itemsData } = await supabase
          .from('sale_items')
          .select('sale_id, item_name, description, total_amount')
          .in('sale_id', batch)
          .gt('total_amount', 0);
        if (itemsData) allItems.push(...itemsData);
      }

      const clientIds = [...new Set(salesData.map(s => s.client_id).filter(Boolean))] as string[];
      const clientMap: Record<string, string> = {};

      for (let i = 0; i < clientIds.length; i += 500) {
        const batch = clientIds.slice(i, i + 500);
        const { data: clientsData } = await supabase
          .from('clients')
          .select('id, first_name, last_name')
          .in('id', batch);
        if (clientsData) {
          clientsData.forEach(c => {
            clientMap[c.id] = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.id;
          });
        }
      }

      const { data: locData } = await supabase.from('locations').select('id, name');
      const locationMap: Record<string, string> = {};
      (locData || []).forEach(l => { locationMap[l.id] = l.name; });

      const salesMap: Record<string, { client_id: string | null; sale_datetime: string | null; location_id: string | null }> = {};
      salesData.forEach(s => { salesMap[s.id] = s; });

      const detailed: SaleItemDetail[] = allItems.map(item => {
        const sale = salesMap[item.sale_id];
        return {
          sale_id: item.sale_id,
          item_name: item.item_name || item.description || 'Unknown',
          total_amount: item.total_amount,
          client_id: sale?.client_id || null,
          client_name: sale?.client_id ? clientMap[sale.client_id] || 'Unknown' : 'Unknown',
          sale_date: sale?.sale_datetime || '',
          location_name: sale?.location_id ? locationMap[sale.location_id] || 'Unknown' : 'Unknown',
        };
      });

      setSaleItems(detailed);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedLocation]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePresetChange = (preset: FilterPreset) => {
    setFilterPreset(preset);
    setSelectedMonth(null);
    if (preset !== 'custom') {
      setDateRange(getFilterPresetDates(preset));
    }
  };

  const handleMonthSelect = (month: { start: string; end: string; label: string }) => {
    setSelectedMonth(month.label);
    setFilterPreset('custom');
    setDateRange({ start: month.start, end: month.end });
  };

  const groupedData = useMemo(() => {
    const groups: Record<string, { items: SaleItemDetail[]; total: number; count: number }> = {};

    saleItems.forEach(item => {
      const key = item.item_name;
      if (!groups[key]) {
        groups[key] = { items: [], total: 0, count: 0 };
      }
      groups[key].items.push(item);
      groups[key].total += item.total_amount;
      groups[key].count += 1;
    });

    return Object.entries(groups)
      .map(([name, data]) => ({
        name,
        ...data,
        items: data.items.sort((a, b) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime()),
      }))
      .sort((a, b) => b.total - a.total);
  }, [saleItems]);

  const totals = useMemo(() => ({
    revenue: saleItems.reduce((sum, i) => sum + i.total_amount, 0),
    count: saleItems.length,
  }), [saleItems]);

  const toggleExpand = (name: string) => {
    setExpandedOptions(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedOptions(new Set(groupedData.map(g => g.name)));
  };

  const collapseAll = () => {
    setExpandedOptions(new Set());
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportData = saleItems.map(item => ({
        'Pricing Option': item.item_name,
        'Client': item.client_name,
        'Date': item.sale_date ? new Date(item.sale_date).toLocaleDateString('en-GB') : '',
        'Amount': item.total_amount,
        'Location': item.location_name,
      }));
      exportToExcel(exportData, `sales_by_pricing_option_${dateRange.start}_to_${dateRange.end}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Sales by Pricing Option</h2>
            <p className="text-slate-600 mt-1">
              {loading ? 'Loading...' : `${groupedData.length} pricing options, ${totals.count} sales, ${formatCurrency(totals.revenue)} total`}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              disabled={exporting || loading || saleItems.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Download className={`w-4 h-4 ${exporting ? 'animate-pulse' : ''}`} />
              {exporting ? 'Exporting...' : 'Export'}
            </button>
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
          <div className="flex gap-2 flex-wrap">
            {(['today', 'this_week', 'this_month', 'last_month', 'this_year'] as FilterPreset[]).map(preset => (
              <button
                key={preset}
                onClick={() => handlePresetChange(preset)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filterPreset === preset && !selectedMonth ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {preset.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </button>
            ))}
          </div>

          <div className="flex gap-1 overflow-x-auto pb-2">
            {months.map(month => (
              <button
                key={month.label}
                onClick={() => handleMonthSelect(month)}
                className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedMonth === month.label ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {month.label}
              </button>
            ))}
          </div>

          <div className="flex gap-4 items-center">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-500" />
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="all">All Locations</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-slate-900">Sales Details</h3>
            <div className="flex gap-2">
              <button
                onClick={expandAll}
                className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Expand All
              </button>
              <button
                onClick={collapseAll}
                className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Collapse All
              </button>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading...</div>
          ) : groupedData.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No sales data for selected period</div>
          ) : (
            <div className="divide-y divide-slate-200">
              {groupedData.map(group => (
                <div key={group.name}>
                  <button
                    onClick={() => toggleExpand(group.name)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {expandedOptions.has(group.name) ? (
                        <ChevronDown className="w-5 h-5 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-slate-400" />
                      )}
                      <span className="font-medium text-slate-900">{group.name}</span>
                      <span className="px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-600">
                        {group.count} sales
                      </span>
                    </div>
                    <span className="font-semibold text-slate-900">{formatCurrency(group.total)}</span>
                  </button>

                  {expandedOptions.has(group.name) && (
                    <div className="bg-slate-50 border-t border-slate-200">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left text-xs text-slate-500 uppercase tracking-wider">
                            <th className="px-4 py-2 pl-12">Client</th>
                            <th className="px-4 py-2">Date</th>
                            <th className="px-4 py-2">Location</th>
                            <th className="px-4 py-2 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {group.items.map((item, idx) => (
                            <tr key={`${item.sale_id}-${idx}`} className="hover:bg-slate-100">
                              <td className="px-4 py-2 pl-12">
                                {item.client_id ? (
                                  <button
                                    onClick={() => onNavigate?.('clients', item.client_id!)}
                                    className="text-blue-600 hover:underline"
                                  >
                                    {item.client_name}
                                  </button>
                                ) : (
                                  <span className="text-slate-600">{item.client_name}</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-slate-600">
                                {item.sale_date ? new Date(item.sale_date).toLocaleDateString('en-GB') : '-'}
                              </td>
                              <td className="px-4 py-2 text-slate-600">{item.location_name}</td>
                              <td className="px-4 py-2 text-right font-medium text-slate-900">
                                {formatCurrency(item.total_amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
