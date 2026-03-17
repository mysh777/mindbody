import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw, Building2, TrendingUp, Users, ShoppingBag } from 'lucide-react';
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
  LineChart,
  Line,
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
}

interface Sale {
  id: string;
  client_id: string | null;
  sale_datetime: string | null;
  location_id: string | null;
  total: number | null;
}

interface CategoryStat {
  name: string;
  type: 'service' | 'product';
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
  const [clients, setClients] = useState<Record<string, string>>({});
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [filterPreset, setFilterPreset] = useState<FilterPreset>('this_month');
  const [dateRange, setDateRange] = useState(getFilterPresetDates('this_month'));
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthStat[]>([]);
  const [loadingMonthly, setLoadingMonthly] = useState(false);

  const months = getMonthsForTimeline();

  const loadLocations = useCallback(async () => {
    const { data } = await supabase.from('locations').select('id, name').order('name');
    setLocations(data || []);
  }, []);

  const loadClients = useCallback(async () => {
    const { data } = await supabase.from('clients').select('id, first_name, last_name');
    const clientMap: Record<string, string> = {};
    if (data) {
      data.forEach((c: { id: string; first_name: string | null; last_name: string | null }) => {
        clientMap[c.id] = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.id;
      });
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
            .select('id, sale_id, description, item_name, quantity, total_amount, is_service')
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
        let query = supabase
          .from('sales')
          .select('total')
          .gte('sale_datetime', m.start)
          .lte('sale_datetime', m.end + 'T23:59:59');

        if (selectedLocation !== 'all') {
          query = query.eq('location_id', selectedLocation);
        }

        const { data, error } = await query;
        if (error) throw error;

        const revenue = (data || []).reduce((sum, s) => sum + (s.total || 0), 0);
        monthlyStats.push({
          month: m.month,
          revenue,
          count: data?.length || 0,
        });
      }

      setMonthlyData(monthlyStats);
    } catch (error) {
      console.error('Error loading monthly data:', error);
    } finally {
      setLoadingMonthly(false);
    }
  }, [selectedLocation]);

  useEffect(() => {
    loadLocations();
    loadClients();
  }, [loadLocations, loadClients]);

  useEffect(() => {
    loadSalesData();
  }, [loadSalesData]);

  useEffect(() => {
    loadMonthlyData();
  }, [loadMonthlyData]);

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

  const categoryStats: CategoryStat[] = useMemo(() => {
    const statsMap: Record<string, { count: number; revenue: number; isService: boolean }> = {};

    saleItems.forEach(item => {
      const categoryName = item.description || item.item_name || 'Unknown';
      if (!statsMap[categoryName]) {
        statsMap[categoryName] = { count: 0, revenue: 0, isService: item.is_service };
      }
      statsMap[categoryName].count += item.quantity;
      statsMap[categoryName].revenue += item.total_amount;
    });

    return Object.entries(statsMap)
      .map(([name, data]) => ({
        name,
        type: data.isService ? 'service' as const : 'product' as const,
        count: data.count,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15);
  }, [saleItems]);

  const serviceCategories = useMemo(() => categoryStats.filter(c => c.type === 'service'), [categoryStats]);
  const productCategories = useMemo(() => categoryStats.filter(c => c.type === 'product'), [categoryStats]);

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
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Revenue by Category</h3>
          {loading ? (
            <div className="h-80 flex items-center justify-center text-slate-500">Loading...</div>
          ) : categoryStats.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-slate-500">No data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={categoryStats} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                  {categoryStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.type === 'service' ? '#3B82F6' : '#F59E0B'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="mt-4 flex gap-4 justify-center">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-blue-500"></div>
              <span className="text-sm text-slate-600">Services</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-amber-500"></div>
              <span className="text-sm text-slate-600">Products</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Revenue by Location</h3>
          {loading ? (
            <div className="h-80 flex items-center justify-center text-slate-500">Loading...</div>
          ) : locationStats.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-slate-500">No data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={locationStats} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="revenue" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Services Distribution</h3>
            {loading ? (
              <div className="h-80 flex items-center justify-center text-slate-500">Loading...</div>
            ) : serviceCategories.length === 0 ? (
              <div className="h-80 flex items-center justify-center text-slate-500">No services data</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={serviceCategories}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="revenue"
                    nameKey="name"
                    label={({ name, percent }) => `${name.substring(0, 15)}${name.length > 15 ? '...' : ''} ${(percent * 100).toFixed(0)}%`}
                  >
                    {serviceCategories.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Products Distribution</h3>
            {loading ? (
              <div className="h-80 flex items-center justify-center text-slate-500">Loading...</div>
            ) : productCategories.length === 0 ? (
              <div className="h-80 flex items-center justify-center text-slate-500">No products data</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={productCategories}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="revenue"
                    nameKey="name"
                    label={({ name, percent }) => `${name.substring(0, 15)}${name.length > 15 ? '...' : ''} ${(percent * 100).toFixed(0)}%`}
                  >
                    {productCategories.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[(index + 5) % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Monthly Revenue (Last 12 Months)</h3>
          {loadingMonthly ? (
            <div className="h-80 flex items-center justify-center text-slate-500">Loading...</div>
          ) : monthlyData.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-slate-500">No data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={{ fill: '#3B82F6', strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                  name="Revenue"
                />
              </LineChart>
            </ResponsiveContainer>
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
