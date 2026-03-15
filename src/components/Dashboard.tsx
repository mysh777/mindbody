import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { SyncButton } from './SyncButton';
import { DataTable } from './DataTable';
import { PivotTable } from './PivotTable';
import { Charts } from './Charts';
import { SyncHistory } from './SyncHistory';
import { ApiLogs } from './ApiLogs';
import { ActivationCode } from './ActivationCode';
import { RawApiData } from './RawApiData';
import { Users, Calendar, DollarSign, TrendingUp, Database, FileText, Key } from 'lucide-react';

interface Stats {
  clients: number;
  appointments: number;
  sales: number;
  revenue: number;
  lastSync: string | null;
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    clients: 0,
    appointments: 0,
    sales: 0,
    revenue: 0,
    lastSync: null,
  });
  const [activeTab, setActiveTab] = useState<'overview' | 'activation' | 'data' | 'pivot' | 'charts' | 'history' | 'logs' | 'raw'>('overview');
  const [loading, setLoading] = useState(true);

  const loadStats = async () => {
    setLoading(true);
    try {
      const [clientsRes, appointmentsRes, salesRes, syncRes] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact', head: true }),
        supabase.from('appointments').select('*', { count: 'exact', head: true }),
        supabase.from('sales').select('total'),
        supabase.from('sync_logs').select('*').order('started_at', { ascending: false }).limit(1).maybeSingle(),
      ]);

      const salesData = salesRes.data || [];
      const totalRevenue = salesData.reduce((sum, sale) => sum + (Number(sale.total) || 0), 0);

      setStats({
        clients: clientsRes.count || 0,
        appointments: appointmentsRes.count || 0,
        sales: salesData.length,
        revenue: totalRevenue,
        lastSync: syncRes.data?.completed_at || null,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: TrendingUp },
    { id: 'activation', label: 'Site Activation', icon: Key },
    { id: 'data', label: 'Data Tables', icon: Database },
    { id: 'pivot', label: 'Pivot Analysis', icon: TrendingUp },
    { id: 'charts', label: 'Charts', icon: TrendingUp },
    { id: 'history', label: 'Sync History', icon: Calendar },
    { id: 'logs', label: 'API Logs', icon: FileText },
    { id: 'raw', label: 'Raw API Data', icon: FileText },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Mindbody Analytics</h1>
              <p className="text-slate-600 mt-1">Comprehensive reporting and marketing dashboard</p>
            </div>
            <SyncButton onSyncComplete={loadStats} />
          </div>

          {stats.lastSync && (
            <p className="text-sm text-slate-500 mt-4">
              Last synced: {new Date(stats.lastSync).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      <div className="px-4 py-6">
        {activeTab === 'overview' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 p-2 rounded-lg">
                <Key className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-blue-900 mb-1">Authentication Status</h3>
                <p className="text-sm text-blue-800">
                  System configured with Source Credentials for Site ID: 197179. All read operations are working.
                </p>
                <p className="text-xs text-blue-700 mt-2">
                  Staff credentials are only needed for write operations (booking, payments, etc.)
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm mb-6">
          <div className="flex border-b border-slate-200">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'overview' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 font-medium">Total Clients</p>
                    <p className="text-3xl font-bold text-slate-900 mt-2">
                      {loading ? '...' : stats.clients.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-blue-100 p-3 rounded-lg">
                    <Users className="w-8 h-8 text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 font-medium">Appointments</p>
                    <p className="text-3xl font-bold text-slate-900 mt-2">
                      {loading ? '...' : stats.appointments.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-green-100 p-3 rounded-lg">
                    <Calendar className="w-8 h-8 text-green-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 font-medium">Total Sales</p>
                    <p className="text-3xl font-bold text-slate-900 mt-2">
                      {loading ? '...' : stats.sales.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-amber-100 p-3 rounded-lg">
                    <TrendingUp className="w-8 h-8 text-amber-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 font-medium">Total Revenue</p>
                    <p className="text-3xl font-bold text-slate-900 mt-2">
                      {loading ? '...' : `$${stats.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </p>
                  </div>
                  <div className="bg-emerald-100 p-3 rounded-lg">
                    <DollarSign className="w-8 h-8 text-emerald-600" />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-4">Quick Overview</h2>
              <div className="space-y-3 text-slate-700">
                <p>Welcome to your Mindbody Analytics Dashboard. This system syncs all your data from Mindbody and provides comprehensive reporting capabilities.</p>
                <p className="font-medium">Available features:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>View and filter all your data in structured tables</li>
                  <li>Create custom pivot tables for in-depth analysis</li>
                  <li>Visualize trends with interactive charts</li>
                  <li>Export any data to Excel for external reporting</li>
                  <li>Schedule automatic daily syncs or sync on-demand</li>
                </ul>
              </div>
            </div>
          </>
        )}

        {activeTab === 'activation' && <ActivationCode />}
        {activeTab === 'data' && <DataTable />}
        {activeTab === 'pivot' && <PivotTable />}
        {activeTab === 'charts' && <Charts />}
        {activeTab === 'history' && <SyncHistory />}
        {activeTab === 'logs' && <ApiLogs />}
        {activeTab === 'raw' && <RawApiData />}
      </div>
    </div>
  );
}
