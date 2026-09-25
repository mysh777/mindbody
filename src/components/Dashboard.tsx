import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Sidebar, MenuSection } from './Sidebar';
import { ApiIntegration } from './ApiIntegration';
import { PivotTable } from './PivotTable';
import { TableView } from './TableView';
import { ReferenceTables } from './ReferenceTables';
import { SalesExpandableView } from './SalesExpandableView';
import { SalesReportPage } from './SalesReportPage';
import { SalesByPricingOption } from './SalesByPricingOption';
import { ClientBalance } from './ClientBalance';
import { StaffExpandableView } from './StaffExpandableView';
import { AppointmentsView } from './AppointmentsView';
import { ClientServicesView } from './ClientServicesView';
import { StaffPricelist } from './StaffPricelist';
import { ClientActivityReport } from './ClientActivityReport';
import { DataLinkageHealthTab } from './DataLinkageHealthTab';
import { ClientCard } from './ClientCard';
import { ExpiringPackages } from './ExpiringPackages';
import { MarginByService } from './MarginByService';
import { MarginByStaff } from './MarginByStaff';
import { SleepingClients } from './SleepingClients';
import { useHashRouter } from '../hooks/useHashRouter';

interface Stats {
  clients: number;
  appointments: number;
  sales: number;
  revenue: number;
  lastSync: string | null;
}

const tableNameMap: Record<MenuSection, { tableName: string; displayName: string } | null> = {
  'api-integration': null,
  'references': null,
  'pivot-reports': null,
  'clients-report': null,
  'staff-report': null,
  'staff-pricelist': null,
  'appointments': { tableName: 'appointments', displayName: 'Appointments' },
  'sales': { tableName: 'sales', displayName: 'Sales' },
  'sales-report': null,
  'sales-by-pricing': null,
  'client-services': { tableName: 'client_services', displayName: 'Client Services' },
  'transactions': { tableName: 'transactions', displayName: 'Transactions' },
  'sale-items': { tableName: 'sale_items', displayName: 'Sale Items' },
  'client-activity': null,
  'client-card': null,
  'expiring-packages': null,
  'linkage-health': null,
  'margin-by-service': null,
  'margin-by-staff': null,
  'sleeping-clients': null,
};

const tableSectionMap: Record<string, MenuSection> = {
  'clients': 'clients-report',
  'staff': 'references',
  'locations': 'references',
  'sales': 'sales',
  'appointments': 'appointments',
  'session_types': 'references',
  'service_categories': 'references',
  'pricing_options': 'references',
  'products': 'references',
  'sites': 'references',
  'sale_items': 'sale-items',
  'transactions': 'transactions',
  'client_services': 'client-services',
  'retail_products': 'references',
};

export function Dashboard() {
  const { section: activeSection, params: urlParams, navigate, setParams } = useHashRouter();
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

  const handleViewClient = useCallback((clientId: string) => {
    navigate('client-card', { client: clientId });
  }, [navigate]);

  const handleNavigate = (tableName: string, id: string) => {
    const section = tableSectionMap[tableName];
    if (section) {
      navigate(section);
      setTimeout(() => setSelectedId(id), 100);
    }
  };

  const handleSectionChange = useCallback((section: MenuSection) => {
    navigate(section);
  }, [navigate]);

  const renderContent = () => {
    if (activeSection === 'api-integration') {
      return <ApiIntegration onSyncComplete={handleSyncComplete} />;
    }

    if (activeSection === 'references') {
      return <ReferenceTables onNavigate={handleNavigate} />;
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

    if (activeSection === 'clients-report') {
      return <ClientBalance />;
    }

    if (activeSection === 'staff-report') {
      return <StaffExpandableView />;
    }

    if (activeSection === 'staff-pricelist') {
      return <StaffPricelist />;
    }

    if (activeSection === 'sales') {
      return <SalesExpandableView onNavigate={handleNavigate} />;
    }

    if (activeSection === 'sales-report') {
      return <SalesReportPage onNavigate={handleNavigate} />;
    }

    if (activeSection === 'sales-by-pricing') {
      return <SalesByPricingOption onNavigate={handleNavigate} />;
    }

    if (activeSection === 'appointments') {
      return <AppointmentsView />;
    }

    if (activeSection === 'client-services') {
      return <ClientServicesView />;
    }

    if (activeSection === 'client-activity') {
      return <ClientActivityReport />;
    }

    if (activeSection === 'expiring-packages') {
      return <ExpiringPackages onViewClient={handleViewClient} urlParams={urlParams} onParamsChange={setParams} />;
    }

    if (activeSection === 'client-card') {
      return <ClientCard urlParams={urlParams} onParamsChange={setParams} />;
    }

    if (activeSection === 'linkage-health') {
      return <DataLinkageHealthTab />;
    }

    if (activeSection === 'margin-by-service') {
      return <MarginByService urlParams={urlParams} onParamsChange={setParams} />;
    }

    if (activeSection === 'margin-by-staff') {
      return <MarginByStaff urlParams={urlParams} onParamsChange={setParams} />;
    }

    if (activeSection === 'sleeping-clients') {
      return <SleepingClients onViewClient={handleViewClient} urlParams={urlParams} onParamsChange={setParams} />;
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
        onSectionChange={handleSectionChange}
        refreshTrigger={refreshTrigger}
      />
      <div className="flex-1 overflow-auto">
        {renderContent()}
      </div>
    </div>
  );
}
