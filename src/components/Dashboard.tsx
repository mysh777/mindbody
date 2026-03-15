import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Sidebar, MenuSection } from './Sidebar';
import { ApiIntegration } from './ApiIntegration';
import { PivotTable } from './PivotTable';
import { TableView } from './TableView';

interface Stats {
  clients: number;
  appointments: number;
  sales: number;
  revenue: number;
  lastSync: string | null;
}

const tableNameMap: Record<MenuSection, { tableName: string; displayName: string } | null> = {
  'api-integration': null,
  'pivot-reports': null,
  'sites': { tableName: 'sites', displayName: 'Sites' },
  'locations': { tableName: 'locations', displayName: 'Locations' },
  'staff': { tableName: 'staff', displayName: 'Staff' },
  'service-categories': { tableName: 'service_categories', displayName: 'Service Categories' },
  'session-types': { tableName: 'session_types', displayName: 'Session Types' },
  'staff-session-types': { tableName: 'staff_session_types', displayName: 'Staff ↔ Session Types' },
  'pricing-options': { tableName: 'pricing_options', displayName: 'Services' },
  'clients': { tableName: 'clients', displayName: 'Clients' },
  'appointments': { tableName: 'appointments', displayName: 'Appointments' },
  'sales': { tableName: 'sales', displayName: 'Sales' },
  'payments': { tableName: 'payments', displayName: 'Payments' },
  'sale-items': { tableName: 'sale_items', displayName: 'Sale Items' },
  'retail-products': { tableName: 'retail_products', displayName: 'Retail Products' },
};

export function Dashboard() {
  const [activeSection, setActiveSection] = useState<MenuSection>('api-integration');
  const [stats, setStats] = useState<Stats>({
    clients: 0,
    appointments: 0,
    sales: 0,
    revenue: 0,
    lastSync: null,
  });
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

  const renderContent = () => {
    if (activeSection === 'api-integration') {
      return <ApiIntegration onSyncComplete={loadStats} />;
    }

    if (activeSection === 'pivot-reports') {
      return (
        <div className="w-full bg-slate-50 min-h-full">
          <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
            <h2 className="text-2xl font-bold text-slate-900">Pivot Reports</h2>
            <p className="text-slate-600 mt-1">Create custom pivot tables and analyze your data</p>
          </div>
          <div className="p-6">
            <PivotTable />
          </div>
        </div>
      );
    }

    const tableConfig = tableNameMap[activeSection];
    if (tableConfig) {
      return <TableView tableName={tableConfig.tableName} displayName={tableConfig.displayName} />;
    }

    return null;
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />
      <div className="flex-1 overflow-auto">
        {renderContent()}
      </div>
    </div>
  );
}
