import { useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  Users,
  Percent,
  Clock,
  Activity,
  AlertTriangle,
} from 'lucide-react';
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
} from 'recharts';
import { formatCurrency } from '../utils/salesFilters';
import type { MarginSummary, AppointmentRow, SaleRow } from '../hooks/useSalesMarginData';

interface SalesOverviewTabProps {
  loading: boolean;
  summary: MarginSummary;
  appointments: AppointmentRow[];
  sales: SaleRow[];
}

const CHART_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#06B6D4',
  '#EC4899', '#84CC16', '#F97316', '#14B8A6', '#0EA5E9',
];

export function SalesOverviewTab({ loading, summary, appointments, sales }: SalesOverviewTabProps) {
  const cards = [
    {
      label: 'Cash In',
      value: formatCurrency(summary.cashIn),
      subtitle: `${sales.length} sales`,
      icon: DollarSign,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
    },
    {
      label: 'Revenue Earned',
      value: formatCurrency(summary.revenueEarned),
      subtitle: `${summary.appointmentsWithData} visits with data`,
      icon: TrendingUp,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
    },
    {
      label: 'Staff Cost',
      value: formatCurrency(summary.staffCost),
      subtitle: `${summary.totalAppointments} visits`,
      icon: Users,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
    },
    {
      label: 'Gross Margin',
      value: formatCurrency(summary.grossMargin),
      subtitle: `${summary.marginPercent.toFixed(1)}% margin`,
      icon: Percent,
      color: summary.grossMargin >= 0 ? 'text-teal-600' : 'text-red-600',
      bg: summary.grossMargin >= 0 ? 'bg-teal-50' : 'bg-red-50',
      border: summary.grossMargin >= 0 ? 'border-teal-200' : 'border-red-200',
    },
    {
      label: 'Deferred Revenue',
      value: formatCurrency(summary.deferredRevenue),
      subtitle: 'cash in - revenue earned',
      icon: Clock,
      color: 'text-slate-600',
      bg: 'bg-slate-50',
      border: 'border-slate-200',
    },
    {
      label: 'Avg Margin / Visit',
      value: formatCurrency(summary.avgMarginPerVisit),
      subtitle: `of ${summary.appointmentsWithData} visits`,
      icon: Activity,
      color: 'text-cyan-600',
      bg: 'bg-cyan-50',
      border: 'border-cyan-200',
    },
  ];

  const revenueByCategory = useMemo(() => {
    const map: Record<string, { name: string; revenue: number; cost: number }> = {};
    appointments.forEach(a => {
      if (!a.hasRevenueData) return;
      const cat = a.sessionTypeName || 'Unknown';
      if (!map[cat]) map[cat] = { name: cat, revenue: 0, cost: 0 };
      map[cat].revenue += a.revenue || 0;
      map[cat].cost += a.staffCost;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 12);
  }, [appointments]);

  const marginByStaff = useMemo(() => {
    const map: Record<string, { name: string; revenue: number; cost: number; margin: number }> = {};
    appointments.forEach(a => {
      const key = a.staff_id || 'unknown';
      if (!map[key]) map[key] = { name: a.staffName, revenue: 0, cost: 0, margin: 0 };
      map[key].cost += a.staffCost;
      if (a.hasRevenueData) {
        map[key].revenue += a.revenue || 0;
        map[key].margin += a.margin || 0;
      }
    });
    return Object.values(map)
      .filter(s => s.revenue > 0 || s.cost > 0)
      .sort((a, b) => b.margin - a.margin);
  }, [appointments]);

  const revenueVsCostPie = useMemo(() => {
    if (summary.revenueEarned === 0 && summary.staffCost === 0) return [];
    return [
      { name: 'Margin', value: Math.max(0, summary.grossMargin) },
      { name: 'Staff Cost', value: summary.staffCost },
    ];
  }, [summary]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-500">Loading data...</div>;
  }

  return (
    <div className="space-y-6">
      {summary.appointmentsNoData > 0 && (
        <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 space-y-1">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            No data: {summary.appointmentsNoData} of {summary.totalAppointments} completed visits have no revenue data
          </div>
          <ul className="ml-6 text-xs space-y-0.5 text-amber-600">
            {summary.noDataCsNotSynced > 0 && (
              <li>{summary.noDataCsNotSynced} -- client service not synced (missing from client_services table)</li>
            )}
            {summary.noDataNoPricingOption > 0 && (
              <li>{summary.noDataNoPricingOption} -- client service has no pricing option linked</li>
            )}
            {summary.noDataNoClientService > 0 && (
              <li>{summary.noDataNoClientService} -- appointment has no client_service_id</li>
            )}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(card => (
          <div
            key={card.label}
            className={`${card.bg} rounded-xl border ${card.border} p-5 transition-all hover:shadow-md`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-500">{card.label}</div>
                <div className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</div>
                <div className="text-xs text-slate-400 mt-1">{card.subtitle}</div>
              </div>
              <div className={`p-3 rounded-xl ${card.bg}`}>
                <card.icon className={`w-6 h-6 ${card.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Revenue & Staff Cost by Staff</h3>
          {marginByStaff.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-500">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(250, marginByStaff.length * 40)}>
              <BarChart data={marginByStaff} layout="vertical" margin={{ top: 5, right: 100, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tickFormatter={(v) => `${(v / 1).toFixed(0)}`} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number, name: string) => [formatCurrency(value), name === 'revenue' ? 'Revenue' : name === 'cost' ? 'Staff Cost' : 'Margin']}
                />
                <Bar dataKey="revenue" fill="#3B82F6" radius={[0, 2, 2, 0]} name="Revenue" stackId="a" />
                <Bar dataKey="cost" fill="#F59E0B" radius={[0, 2, 2, 0]} name="Staff Cost" stackId="b" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Revenue Split</h3>
          {revenueVsCostPie.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-500">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={revenueVsCostPie}
                  cx="50%"
                  cy="45%"
                  outerRadius={90}
                  innerRadius={50}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  <Cell fill="#10B981" />
                  <Cell fill="#F59E0B" />
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Revenue by Service</h3>
        {revenueByCategory.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-500">No data</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(300, revenueByCategory.length * 40)}>
            <BarChart data={revenueByCategory} layout="vertical" margin={{ top: 5, right: 100, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
              <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Bar dataKey="revenue" fill="#3B82F6" radius={[0, 4, 4, 0]} name="Revenue" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
