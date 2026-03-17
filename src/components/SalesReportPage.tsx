import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw, Building2, TrendingUp, Users, ShoppingBag, Download } from 'lucide-react';
import { exportToExcel } from '../utils/exportExcel';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LabelList,
} from 'recharts';

interface SalesReportPageProps {
  onNavigate?: (tableName: string, id: string) => void;
}

interface SaleItem {
  id: string;
  sale_id: string;
  description: string | null;
  item_name: string | null;
  quantity: number;
  total_amount: number;
  is_service: boolean;
  category_id: number | null;
}

interface Sale {
  id: string;
  client_id: string | null;
  sale_datetime: string | null;
  location_id: string | null;
  total: number | null;
}

interface ServiceCategory {
  id: string;
  mindbody_id: string;
  name: string;
}

interface ServiceCategoryStat {
  id: string;
  name: string;
  count: number;
  revenue: number;
}

interface PricingOptionStat {
  name: string;
  count: number;
  revenue: number;
}

interface LocationStat {
  id: string;
  name: string;
  revenue: number;
  count: number;
}

interface MonthStat {
  month: string;
  revenue: number;
  count: number;
  [key: string]: string | number;
}

interface ClientStat {
  id: string;
  name: string;
  totalSpent: number;
  purchases: { name: string; amount: number }[];
}

type FilterPreset = 'today' | 'this_week' | 'this_month' | 'last_month' | 'this_year' | 'custom';

const CHART_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
  '#14B8A6', '#A855F7', '#22C55E', '#0EA5E9', '#FB923C',
];

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

function getLast12Months(): { month: string; start: string; end: string }[] {
  const months: { month: string; start: string; end: string }[] = [];
  const today = new Date();

  for (let i = 11; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    months.push({
      month: date.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
      start: date.toISOString().split('T')[0],
      end: lastDay.toISOString().split('T')[0],
    });
  }

  return months;
}

export function SalesReportPage({ onNavigate }: SalesReportPageProps) {
  const [loading, setLoading] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [pricingOptions, setPricingOptions] = useState<{ name: string; program_name: string | null }[]>([]);
  const [clients, setClients] = useState<Record<string, string>>({});
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [filterPreset, setFilterPreset] = useState<FilterPreset>('this_month');
  const [dateRange, setDateRange] = useState(getFilterPresetDates('this_month'));
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthStat[]>([]);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [exportingSales, setExportingSales] = useState(false);
  const [exportingStaff, setExportingStaff] = useState(false);

  const months = getMonthsForTimeline();

  const PAYMENT_METHODS: Record<number, string> = {
    1: 'Cash',
    2: 'Credit Card',
    3: 'Check',
    4: 'Gift Card',
    7: 'Account',
    9: 'Comp',
    16: 'Bank Transfer',
    98: 'Other',
  };

  const loadLocations = useCallback(async () => {
    const { data } = await supabase.from('locations').select('id, name').order('name');
    setLocations(data || []);
  }, []);

  const loadServiceCategories = useCallback(async () => {
    const { data } = await supabase.from('service_categories').select('id, mindbody_id, name').order('name');
    setServiceCategories(data || []);
  }, []);

  const loadPricingOptions = useCallback(async () => {
    const { data } = await supabase.from('pricing_options').select('name, program_name');
    setPricingOptions(data || []);
  }, []);

  const loadClients = useCallback(async () => {
    const clientMap: Record<string, string> = {};
    let offset = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data } = await supabase
        .from('clients')
        .select('id, first_name, last_name')
        .range(offset, offset + batchSize - 1);

      if (data && data.length > 0) {
        data.forEach((c: { id: string; first_name: string | null; last_name: string | null }) => {
          clientMap[c.id] = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.id;
        });
        offset += batchSize;
        hasMore = data.length === batchSize;
      } else {
        hasMore = false;
      }
    }

    setClients(clientMap);
  }, []);

  const loadSalesData = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('sales')
        .select('id, client_id, sale_datetime, location_id, total')
        .gte('sale_datetime', dateRange.start)
        .lte('sale_datetime', dateRange.end + 'T23:59:59');

      if (selectedLocation !== 'all') {
        query = query.eq('location_id', selectedLocation);
      }

      const { data: salesData, error: salesError } = await query;
      if (salesError) throw salesError;

      setSales(salesData || []);

      if (salesData && salesData.length > 0) {
        const saleIds = salesData.map(s => s.id);
        const batchSize = 500;
        const allItems: SaleItem[] = [];

        for (let i = 0; i < saleIds.length; i += batchSize) {
          const batch = saleIds.slice(i, i + batchSize);
          const { data: itemsData, error: itemsError } = await supabase
            .from('sale_items')
            .select('id, sale_id, description, item_name, quantity, total_amount, is_service, category_id')
            .in('sale_id', batch);

          if (itemsError) throw itemsError;
          if (itemsData) allItems.push(...itemsData);
        }

        setSaleItems(allItems);
      } else {
        setSaleItems([]);
      }
    } catch (error) {
      console.error('Error loading sales data:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedLocation]);

  const loadMonthlyData = useCallback(async () => {
    setLoadingMonthly(true);
    try {
      const last12 = getLast12Months();
      const monthlyStats: MonthStat[] = [];

      for (const m of last12) {
        const { data, error } = await supabase
          .from('sales')
          .select('total, location_id')
          .gte('sale_datetime', m.start)
          .lte('sale_datetime', m.end + 'T23:59:59');

        if (error) throw error;

        const statEntry: MonthStat = {
          month: m.month,
          revenue: 0,
          count: data?.length || 0,
        };

        const locationRevenues: Record<string, number> = {};
        (data || []).forEach(s => {
          const locId = s.location_id || 'unknown';
          locationRevenues[locId] = (locationRevenues[locId] || 0) + (s.total || 0);
          statEntry.revenue += s.total || 0;
        });

        locations.forEach(loc => {
          statEntry[`loc_${loc.id}`] = locationRevenues[loc.id] || 0;
        });

        monthlyStats.push(statEntry);
      }

      setMonthlyData(monthlyStats);
    } catch (error) {
      console.error('Error loading monthly data:', error);
    } finally {
      setLoadingMonthly(false);
    }
  }, [locations]);

  useEffect(() => {
    loadLocations();
    loadClients();
    loadServiceCategories();
    loadPricingOptions();
  }, [loadLocations, loadClients, loadServiceCategories, loadPricingOptions]);

  useEffect(() => {
    loadSalesData();
  }, [loadSalesData]);

  useEffect(() => {
    if (locations.length > 0) {
      loadMonthlyData();
    }
  }, [loadMonthlyData, locations.length]);

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

  const serviceCategoryStats: ServiceCategoryStat[] = useMemo(() => {
    const statsMap: Record<string, { count: number; revenue: number }> = {};
    const itemToCategoryLookup: Record<string, string> = {};

    pricingOptions.forEach(po => {
      if (po.program_name) {
        itemToCategoryLookup[po.name] = po.program_name;
      }
    });

    saleItems.forEach(item => {
      if (!item.is_service) return;

      const itemName = item.item_name || item.description || '';
      const categoryName = itemToCategoryLookup[itemName] || 'Other Services';

      if (!statsMap[categoryName]) {
        statsMap[categoryName] = { count: 0, revenue: 0 };
      }
      statsMap[categoryName].count += item.quantity;
      statsMap[categoryName].revenue += item.total_amount;
    });

    return Object.entries(statsMap)
      .map(([name, data]) => ({
        id: name,
        name,
        count: data.count,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15);
  }, [saleItems, pricingOptions]);

  const pricingOptionStats: PricingOptionStat[] = useMemo(() => {
    const statsMap: Record<string, { count: number; revenue: number }> = {};

    saleItems.forEach(item => {
      const itemName = item.item_name || item.description || 'Unknown';
      if (!statsMap[itemName]) {
        statsMap[itemName] = { count: 0, revenue: 0 };
      }
      statsMap[itemName].count += item.quantity;
      statsMap[itemName].revenue += item.total_amount;
    });

    return Object.entries(statsMap)
      .map(([name, data]) => ({
        name,
        count: data.count,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [saleItems]);

  const locationStats: LocationStat[] = useMemo(() => {
    const statsMap: Record<string, { revenue: number; count: number }> = {};

    sales.forEach(sale => {
      const locId = sale.location_id || 'unknown';
      if (!statsMap[locId]) {
        statsMap[locId] = { revenue: 0, count: 0 };
      }
      statsMap[locId].revenue += sale.total || 0;
      statsMap[locId].count += 1;
    });

    return Object.entries(statsMap)
      .map(([id, data]) => ({
        id,
        name: locations.find(l => l.id === id)?.name || id,
        revenue: data.revenue,
        count: data.count,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [sales, locations]);

  const topClients: ClientStat[] = useMemo(() => {
    const clientMap: Record<string, { totalSpent: number; items: Record<string, number> }> = {};

    const saleLookup: Record<string, Sale> = {};
    sales.forEach(s => { saleLookup[s.id] = s; });

    saleItems.forEach(item => {
      const sale = saleLookup[item.sale_id];
      if (!sale || !sale.client_id) return;

      if (!clientMap[sale.client_id]) {
        clientMap[sale.client_id] = { totalSpent: 0, items: {} };
      }

      clientMap[sale.client_id].totalSpent += item.total_amount;
      const itemName = item.description || item.item_name || 'Unknown';
      clientMap[sale.client_id].items[itemName] = (clientMap[sale.client_id].items[itemName] || 0) + item.total_amount;
    });

    return Object.entries(clientMap)
      .map(([id, data]) => ({
        id,
        name: clients[id] || id,
        totalSpent: data.totalSpent,
        purchases: Object.entries(data.items)
          .map(([name, amount]) => ({ name, amount }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5),
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10);
  }, [sales, saleItems, clients]);

  const totals = useMemo(() => ({
    revenue: sales.reduce((sum, s) => sum + (s.total || 0), 0),
    count: sales.length,
    items: saleItems.length,
  }), [sales, saleItems]);

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg">
          <p className="font-medium text-slate-900">{label}</p>
          <p className="text-sm text-slate-600">{formatCurrency(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };

  const exportSalesData = async () => {
    setExportingSales(true);
    try {
      let salesQuery = supabase
        .from('sales')
        .select('id, client_id, sale_datetime, location_id, total, mindbody_client_id')
        .gte('sale_datetime', dateRange.start)
        .lte('sale_datetime', dateRange.end + 'T23:59:59');

      if (selectedLocation !== 'all') {
        salesQuery = salesQuery.eq('location_id', selectedLocation);
      }

      const { data: salesData, error: salesError } = await salesQuery;
      if (salesError) throw salesError;
      if (!salesData || salesData.length === 0) {
        alert('No sales data to export');
        return;
      }

      const saleIds = salesData.map(s => s.id);
      const allItems: { sale_id: string; item_name: string | null; description: string | null; total_amount: number; is_service: boolean }[] = [];
      for (let i = 0; i < saleIds.length; i += 500) {
        const batch = saleIds.slice(i, i + 500);
        const { data: itemsData } = await supabase
          .from('sale_items')
          .select('sale_id, item_name, description, total_amount, is_service')
          .in('sale_id', batch);
        if (itemsData) allItems.push(...itemsData);
      }

      const { data: paymentsData } = await supabase
        .from('payments')
        .select('sale_id, method, amount')
        .in('sale_id', saleIds);

      const paymentsBySale: Record<string, string[]> = {};
      (paymentsData || []).forEach(p => {
        if (!paymentsBySale[p.sale_id]) paymentsBySale[p.sale_id] = [];
        const methodName = PAYMENT_METHODS[p.method] || `Method ${p.method}`;
        if (!paymentsBySale[p.sale_id].includes(methodName)) {
          paymentsBySale[p.sale_id].push(methodName);
        }
      });

      const itemToCategoryLookup: Record<string, string> = {};
      pricingOptions.forEach(po => {
        if (po.program_name) itemToCategoryLookup[po.name] = po.program_name;
      });

      const exportData: Record<string, string | number>[] = [];

      salesData.forEach(sale => {
        const saleItemsList = allItems.filter(i => i.sale_id === sale.id);
        const clientName = sale.client_id ? clients[sale.client_id] || sale.client_id : 'Unknown';
        const locationName = locations.find(l => l.id === sale.location_id)?.name || sale.location_id || 'Unknown';
        const paymentMethod = paymentsBySale[sale.id]?.join(', ') || 'Unknown';

        if (saleItemsList.length === 0) {
          exportData.push({
            'Date': sale.sale_datetime ? new Date(sale.sale_datetime).toLocaleDateString('en-GB') : '',
            'Client': clientName,
            'Location': locationName,
            'Amount': sale.total || 0,
            'Category': '',
            'Service': '',
            'Pricing Option': '',
            'Payment Method': paymentMethod,
          });
        } else {
          saleItemsList.forEach(item => {
            const itemName = item.item_name || item.description || 'Unknown';
            const categoryName = itemToCategoryLookup[itemName] || (item.is_service ? 'Other Services' : 'Product');
            exportData.push({
              'Date': sale.sale_datetime ? new Date(sale.sale_datetime).toLocaleDateString('en-GB') : '',
              'Client': clientName,
              'Location': locationName,
              'Amount': item.total_amount,
              'Category': categoryName,
              'Service': item.is_service ? itemName : '',
              'Pricing Option': itemName,
              'Payment Method': paymentMethod,
            });
          });
        }
      });

      exportToExcel(exportData, `sales_${dateRange.start}_to_${dateRange.end}`);
    } catch (error) {
      console.error('Error exporting sales:', error);
      alert('Error exporting sales data');
    } finally {
      setExportingSales(false);
    }
  };

  const exportStaffData = async () => {
    setExportingStaff(true);
    try {
      let query = supabase
        .from('appointments')
        .select('id, client_id, staff_id, session_type_id, start_datetime, status')
        .gte('start_datetime', dateRange.start)
        .lte('start_datetime', dateRange.end + 'T23:59:59')
        .neq('status', 'Cancelled');

      if (selectedLocation !== 'all') {
        query = query.eq('location_id', selectedLocation);
      }

      const { data: apptData, error: apptError } = await query;
      if (apptError) throw apptError;
      if (!apptData || apptData.length === 0) {
        alert('No appointment data to export');
        return;
      }

      const { data: staffData } = await supabase.from('staff').select('id, first_name, last_name');
      const staffMap: Record<string, string> = {};
      (staffData || []).forEach(s => {
        staffMap[s.id] = `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.id;
      });

      const { data: sessionTypesData } = await supabase.from('session_types').select('id, name, service_category_id, default_price');
      const sessionTypeMap: Record<string, { name: string; category_id: string | null; price: number }> = {};
      (sessionTypesData || []).forEach(st => {
        sessionTypeMap[st.id] = { name: st.name, category_id: st.service_category_id, price: st.default_price || 0 };
      });

      const categoryMap: Record<string, string> = {};
      serviceCategories.forEach(c => {
        categoryMap[c.id] = c.name;
      });

      const exportData: Record<string, string | number>[] = [];

      apptData.forEach(appt => {
        const clientName = appt.client_id ? clients[appt.client_id] || appt.client_id : 'Unknown';
        const staffName = appt.staff_id ? staffMap[appt.staff_id] || appt.staff_id : 'Unknown';
        const sessionType = appt.session_type_id ? sessionTypeMap[appt.session_type_id] : null;
        const categoryName = sessionType?.category_id ? categoryMap[sessionType.category_id] || '' : '';

        exportData.push({
          'Date': appt.start_datetime ? new Date(appt.start_datetime).toLocaleDateString('en-GB') : '',
          'Category': categoryName,
          'Service': sessionType?.name || 'Unknown',
          'Pricing Option': sessionType?.name || '',
          'Staff': staffName,
          'Client': clientName,
          'Price': sessionType?.price || 0,
        });
      });

      exportToExcel(exportData, `staff_report_${dateRange.start}_to_${dateRange.end}`);
    } catch (error) {
      console.error('Error exporting staff data:', error);
      alert('Error exporting staff data');
    } finally {
      setExportingStaff(false);
    }
  };

  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Sales Report</h2>
            <p className="text-slate-600 mt-1">
              {loading ? 'Loading...' : `${totals.count} sales, ${formatCurrency(totals.revenue)} total`}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportSalesData}
              disabled={exportingSales || loading}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Download className={`w-4 h-4 ${exportingSales ? 'animate-pulse' : ''}`} />
              {exportingSales ? 'Exporting...' : 'Export Sales'}
            </button>
            <button
              onClick={exportStaffData}
              disabled={exportingStaff || loading}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              <Download className={`w-4 h-4 ${exportingStaff ? 'animate-pulse' : ''}`} />
              {exportingStaff ? 'Exporting...' : 'Export Staff'}
            </button>
            <button
              onClick={() => { loadSalesData(); loadMonthlyData(); }}
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-slate-600">
              <TrendingUp className="w-5 h-5" />
              <span className="text-sm">Total Revenue</span>
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2">{formatCurrency(totals.revenue)}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-slate-600">
              <ShoppingBag className="w-5 h-5" />
              <span className="text-sm">Total Sales</span>
            </div>
            <div className="text-2xl font-bold text-blue-600 mt-2">{totals.count}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-slate-600">
              <Users className="w-5 h-5" />
              <span className="text-sm">Items Sold</span>
            </div>
            <div className="text-2xl font-bold text-green-600 mt-2">{totals.items}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Revenue by Service Category</h3>
          {loading ? (
            <div className="h-80 flex items-center justify-center text-slate-500">Loading...</div>
          ) : serviceCategoryStats.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-slate-500">No data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(300, serviceCategoryStats.length * 40)}>
              <BarChart data={serviceCategoryStats} layout="vertical" margin={{ top: 5, right: 80, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="revenue" fill="#3B82F6" radius={[0, 4, 4, 0]} label={{ position: 'right', formatter: (v: number) => formatCurrency(v), fontSize: 11, fill: '#64748b' }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Top 10 Pricing Options</h3>
          {loading ? (
            <div className="h-80 flex items-center justify-center text-slate-500">Loading...</div>
          ) : pricingOptionStats.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-slate-500">No data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(300, pricingOptionStats.length * 45)}>
              <BarChart data={pricingOptionStats} layout="vertical" margin={{ top: 5, right: 80, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                <YAxis type="category" dataKey="name" width={220} tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="revenue" fill="#10B981" radius={[0, 4, 4, 0]} label={{ position: 'right', formatter: (v: number) => formatCurrency(v), fontSize: 11, fill: '#64748b' }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Revenue by Location</h3>
          {loading ? (
            <div className="h-80 flex items-center justify-center text-slate-500">Loading...</div>
          ) : locationStats.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-slate-500">No data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={locationStats} margin={{ top: 30, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="revenue" fill="#F59E0B" radius={[4, 4, 0, 0]} label={{ position: 'top', formatter: (v: number) => formatCurrency(v), fontSize: 11, fill: '#64748b' }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Service Categories Distribution</h3>
            {loading ? (
              <div className="h-80 flex items-center justify-center text-slate-500">Loading...</div>
            ) : serviceCategoryStats.length === 0 ? (
              <div className="h-80 flex items-center justify-center text-slate-500">No services data</div>
            ) : (
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie
                    data={serviceCategoryStats}
                    cx="50%"
                    cy="45%"
                    labelLine={true}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="revenue"
                    nameKey="name"
                    label={({ name, percent }) => `${name.substring(0, 12)}${name.length > 12 ? '...' : ''} ${(percent * 100).toFixed(0)}%`}
                  >
                    {serviceCategoryStats.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Top Pricing Options Distribution</h3>
            {loading ? (
              <div className="h-80 flex items-center justify-center text-slate-500">Loading...</div>
            ) : pricingOptionStats.length === 0 ? (
              <div className="h-80 flex items-center justify-center text-slate-500">No pricing data</div>
            ) : (
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie
                    data={pricingOptionStats.slice(0, 8)}
                    cx="50%"
                    cy="45%"
                    labelLine={true}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="revenue"
                    nameKey="name"
                    label={({ name, percent }) => `${name.substring(0, 12)}${name.length > 12 ? '...' : ''} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pricingOptionStats.slice(0, 8).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[(index + 5) % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Monthly Revenue by Location (Last 12 Months)</h3>
          {loadingMonthly ? (
            <div className="h-80 flex items-center justify-center text-slate-500">Loading...</div>
          ) : monthlyData.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-slate-500">No data available</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={monthlyData} margin={{ top: 30, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatCurrency(value), name === 'revenue' ? 'Total' : locations.find(l => `loc_${l.id}` === name)?.name || name]}
                    labelFormatter={(label) => `Month: ${label}`}
                  />
                  <Legend formatter={(value) => value === 'revenue' ? 'Total' : locations.find(l => `loc_${l.id}` === value)?.name || value} />
                  {locations.map((loc, index) => (
                    <Bar
                      key={loc.id}
                      dataKey={`loc_${loc.id}`}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                      radius={[2, 2, 0, 0]}
                      name={`loc_${loc.id}`}
                    >
                      <LabelList
                        dataKey={`loc_${loc.id}`}
                        position="top"
                        formatter={(v: number) => v > 0 ? `${(v / 1000).toFixed(1)}k` : ''}
                        fontSize={9}
                        fill="#64748b"
                      />
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 pt-4 border-t border-slate-200">
                <div className="flex flex-wrap gap-4 justify-center">
                  {monthlyData.length > 0 && locations.map((loc, index) => {
                    const total = monthlyData.reduce((sum, m) => sum + (Number(m[`loc_${loc.id}`]) || 0), 0);
                    return (
                      <div key={loc.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}></div>
                        <span className="text-sm text-slate-600">{loc.name}:</span>
                        <span className="text-sm font-semibold text-slate-900">{formatCurrency(total)}</span>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
                    <span className="text-sm font-medium text-blue-700">Total:</span>
                    <span className="text-sm font-bold text-blue-900">{formatCurrency(monthlyData.reduce((sum, m) => sum + m.revenue, 0))}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Top 10 Clients</h3>
          {loading ? (
            <div className="text-center text-slate-500 py-8">Loading...</div>
          ) : topClients.length === 0 ? (
            <div className="text-center text-slate-500 py-8">No client data available</div>
          ) : (
            <div className="space-y-4">
              {topClients.map((client, index) => (
                <div key={client.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-semibold text-slate-600">
                        {index + 1}
                      </div>
                      <button
                        onClick={() => onNavigate?.('clients', client.id)}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {client.name}
                      </button>
                    </div>
                    <div className="font-semibold text-slate-900">{formatCurrency(client.totalSpent)}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 ml-11">
                    {client.purchases.map((p, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-slate-100 rounded text-xs text-slate-600"
                      >
                        {p.name}: {formatCurrency(p.amount)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
