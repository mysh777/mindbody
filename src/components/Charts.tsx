import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { BarChart3, TrendingUp, Download } from 'lucide-react';
import { exportToExcel } from '../utils/exportExcel';

interface ChartData {
  label: string;
  value: number;
}

export function Charts() {
  const [salesByMonth, setSalesByMonth] = useState<ChartData[]>([]);
  const [appointmentsByStaff, setAppointmentsByStaff] = useState<ChartData[]>([]);
  const [clientsByState, setClientsByState] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(false);

  const loadChartData = async () => {
    setLoading(true);
    try {
      const { data: sales } = await supabase
        .from('sales')
        .select('sale_datetime, total')
        .not('sale_datetime', 'is', null);

      if (sales) {
        const monthlyData: Record<string, number> = {};
        sales.forEach((sale) => {
          const date = new Date(sale.sale_datetime);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          monthlyData[monthKey] = (monthlyData[monthKey] || 0) + (Number(sale.total) || 0);
        });

        const sortedMonths = Object.keys(monthlyData)
          .sort()
          .slice(-12)
          .map((month) => ({
            label: month,
            value: monthlyData[month],
          }));

        setSalesByMonth(sortedMonths);
      }

      const { data: appointments } = await supabase
        .from('appointments')
        .select(`
          staff_id,
          staff!appointments_staff_id_fkey(first_name, last_name)
        `);

      if (appointments) {
        const staffData: Record<string, number> = {};
        appointments.forEach((appt: any) => {
          if (appt.staff) {
            const staffName = `${appt.staff.first_name || ''} ${appt.staff.last_name || ''}`.trim() || 'Unknown';
            staffData[staffName] = (staffData[staffName] || 0) + 1;
          }
        });

        const topStaff = Object.entries(staffData)
          .map(([label, value]) => ({ label, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10);

        setAppointmentsByStaff(topStaff);
      }

      const { data: clients } = await supabase
        .from('clients')
        .select('state')
        .not('state', 'is', null);

      if (clients) {
        const stateData: Record<string, number> = {};
        clients.forEach((client) => {
          const state = client.state || 'Unknown';
          stateData[state] = (stateData[state] || 0) + 1;
        });

        const topStates = Object.entries(stateData)
          .map(([label, value]) => ({ label, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10);

        setClientsByState(topStates);
      }
    } catch (error) {
      console.error('Error loading chart data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChartData();
  }, []);

  const renderBarChart = (data: ChartData[], title: string, color: string) => {
    if (data.length === 0) return null;

    const maxValue = Math.max(...data.map((d) => d.value));

    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button
            onClick={() => exportToExcel(data, title.toLowerCase().replace(/\s+/g, '_'))}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>

        <div className="space-y-3">
          {data.map((item, idx) => (
            <div key={idx}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-slate-700 font-medium">{item.label}</span>
                <span className="text-slate-900 font-semibold">
                  {typeof item.value === 'number' && item.value > 100
                    ? item.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : item.value}
                </span>
              </div>
              <div className="h-8 bg-slate-100 rounded-lg overflow-hidden">
                <div
                  className={`h-full ${color} transition-all duration-500 rounded-lg flex items-center justify-end px-3`}
                  style={{ width: `${(item.value / maxValue) * 100}%` }}
                >
                  <span className="text-xs font-medium text-white">
                    {((item.value / maxValue) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-slate-600">
        Loading charts...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <TrendingUp className="w-6 h-6 text-blue-600 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900 mb-1">Data Visualizations</h3>
            <p className="text-sm text-blue-700">
              View key metrics and trends across your Mindbody data. Each chart can be exported to Excel for further analysis.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderBarChart(salesByMonth, 'Monthly Revenue', 'bg-emerald-500')}
        {renderBarChart(appointmentsByStaff, 'Appointments by Staff', 'bg-blue-500')}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderBarChart(clientsByState, 'Clients by State', 'bg-amber-500')}
      </div>
    </div>
  );
}
