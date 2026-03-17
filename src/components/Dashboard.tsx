import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Sidebar, MenuSection } from './Sidebar';
import { ApiIntegration } from './ApiIntegration';
import { PivotTable } from './PivotTable';
import { TableView } from './TableView';
import { ServicesGroupedView } from './ServicesGroupedView';
import { SalesExpandableView } from './SalesExpandableView';

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
  'services': { tableName: 'session_types', displayName: 'Session Types' },
  'staff-services': { tableName: 'staff_session_types', displayName: 'Staff - Session Types' },
  'pricing-options': { tableName: 'pricing_options', displayName: 'Pricing Options' },
  'clients': { tableName: 'clients', displayName: 'Clients' },
  'appointments': { tableName: 'appointments', displayName: 'Appointments' },
  'sales': { tableName: 'sales', displayName: 'Sales' },
  'transactions': { tableName: 'transactions', displayName: 'Transactions' },
  'sale-items': { tableName: 'sale_items', displayName: 'Sale Items' },
  'client-services': { tableName: 'client_services', displayName: 'Client Services' },
  'retail-products': { tableName: 'retail_products', displayName: 'Retail Products' },
};

const tableSectionMap: Record<string, MenuSection> = {
  'clients': 'clients',
  'staff': 'staff',
  'locations': 'locations',
  'sales': 'sales',
  'appointments': 'appointments',
  'session_types': 'services',
  'service_categories': 'service-categories',
  'service_subcategories': 'service-categories',
  'pricing_options': 'pricing-options',
  'products': 'retail-products',
  'sites': 'sites',
  'sale_items': 'sale-items',
  'transactions': 'transactions',
  'client_services': 'client-services',
  'retail_products': 'retail-products',
  'staff_session_types': 'staff-services',
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const loadStats = useCallback(async () => {
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
  }, []);

  const handleSyncComplete = useCallback(() => {
    loadStats();
    setRefreshTrigger(prev => prev + 1);
  }, [loadStats]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    setSelectedId(null);
  }, [activeSection]);

  const handleNavigate = (tableName: string, id: string) => {
    const section = tableSectionMap[tableName];
    if (section) {
      setActiveSection(section);
      setTimeout(() => setSelectedId(id), 100);
    }
  };

  const renderContent = () => {
    if (activeSection === 'api-integration') {
      return <ApiIntegration onSyncComplete={handleSyncComplete} />;
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

    if (activeSection === 'services') {
      return <ServicesGroupedView />;
    }

    if (activeSection === 'sales') {
      return <SalesExpandableView onNavigate={handleNavigate} />;
    }

    const tableConfig = tableNameMap[activeSection];
    if (tableConfig) {
      return (
        <TableView
          tableName={tableConfig.tableName}
          displayName={tableConfig.displayName}
          onNavigate={handleNavigate}
          selectedId={selectedId}
        />
      );
    }

    return null;
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        refreshTrigger={refreshTrigger}
      />
      <div className="flex-1 overflow-auto">
        {renderContent()}
      </div>
    </div>
  );
}
