import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Sidebar } from './Sidebar';
import type { MenuSection } from '../lib/pages';
import { ApiIntegration, type AdminTab } from './ApiIntegration';
import { PivotTable } from './PivotTable';
import { TableView } from './TableView';
import { ReferenceTables } from './ReferenceTables';
import { SalesExpandableView } from './SalesExpandableView';
import { SalesReportPage } from './SalesReportPage';
import { ServiceDetailsPage } from './ServiceDetailsPage';
import { AppointmentsView } from './AppointmentsView';
import { ClientServicesView } from './ClientServicesView';
import { StaffPricelist } from './StaffPricelist';
import { DataLinkageHealthTab } from './DataLinkageHealthTab';
import { ClientCard } from './ClientCard';
import { ExpiringPackages } from './ExpiringPackages';
import { MarginByService } from './MarginByService';
import { MarginByStaff } from './MarginByStaff';
import { SleepingClients } from './SleepingClients';
import { ClientSegments } from './ClientSegments';
import { DataIssuesPage } from './DataIssuesPage';
import { SimplePage } from './PageHeader';
import { ErrorBoundary } from './ErrorBoundary';
import { useHashRouter } from '../hooks/useHashRouter';
import type { ReconciliationResult } from '../hooks/useReconciliationData';
import { runReconciliationCheck, useAutoReconciliationCheck } from '../hooks/useReconciliationData';
import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';

const ADMIN_TABS: AdminTab[] = ['sync', 'sync-history', 'reconciliation', 'api-logs', 'raw-api', 'staff-rates'];

interface Stats {
  clients: number;
  appointments: number;
  sales: number;
  revenue: number;
  lastSync: string | null;
}

const tableSectionMap: Record<string, MenuSection> = {
  'clients': 'client-card',
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
  const [reconciliationResult, setReconciliationResult] = useState<ReconciliationResult | null>(null);

  useAutoReconciliationCheck(useCallback((r: ReconciliationResult) => setReconciliationResult(r), []));

  // ── Keep-alive: mount on first visit, then hide with CSS ──
  const [visited, setVisited] = useState<Set<MenuSection>>(() => new Set([activeSection]));
  const sectionParamsRef = useRef<Partial<Record<MenuSection, Record<string, string>>>>({});
  const isInitialMount = useRef(true);

  useEffect(() => {
    setVisited(prev => prev.has(activeSection) ? prev : new Set(prev).add(activeSection));

    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (Object.keys(urlParams).length > 0) {
        sectionParamsRef.current[activeSection] = urlParams;
      }
      return;
    }
    const stored = sectionParamsRef.current[activeSection];
    if (stored && Object.keys(stored).length > 0) {
      setParams(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  const handleParamsChange = useCallback((params: Record<string, string>) => {
    sectionParamsRef.current[activeSection] = params;
    setParams(params);
  }, [activeSection, setParams]);

  // ── Stats ──

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
    runReconciliationCheck().then(r => setReconciliationResult(r)).catch(() => {});
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

  // Kept-alive pages read their filters from the URL only when mounted, so opening a report
  // with new filters remounts it.
  const [remounts, setRemounts] = useState<Partial<Record<MenuSection, number>>>({});
  const handleOpenReport = useCallback(({ section, params }: { section: MenuSection; params: Record<string, string> }) => {
    sectionParamsRef.current[section] = params;
    setRemounts(prev => ({ ...prev, [section]: (prev[section] || 0) + 1 }));
    navigate(section, params);
  }, [navigate]);

  // ── Keep-alive rendering helpers ──

  const sc = (id: MenuSection) =>
    `absolute inset-0 overflow-auto ${activeSection === id ? '' : 'invisible pointer-events-none'}`;

  const show = (id: MenuSection) => visited.has(id);

  const page = (id: MenuSection, node: ReactNode) => show(id) && (
    <div key={`${id}-${remounts[id] || 0}`} className={sc(id)} data-section-active={activeSection === id ? 'true' : undefined}>
      <ErrorBoundary scope={id}>{node}</ErrorBoundary>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        refreshTrigger={refreshTrigger}
      />
      <div className="flex-1 relative overflow-hidden">
        {reconciliationResult && !reconciliationResult.allOk && (
          <div className="absolute top-0 left-0 right-0 z-50 flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm shadow-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="font-medium">Reconciliation issues detected</span>
            <span className="text-amber-600">
              — {reconciliationResult.references.filter(r => !r.ok).length + reconciliationResult.cases.filter(c => !c.ok).length + reconciliationResult.baselineDrifts.length + reconciliationResult.unknownPaymentTypes.length} check(s) failed
            </span>
            <button
              onClick={() => navigate('reconciliation')}
              className="ml-auto text-xs font-medium text-amber-700 hover:text-amber-900 underline"
            >
              View details
            </button>
          </div>
        )}
        {page('overview', <SalesReportPage onOpenReport={handleOpenReport} urlParams={urlParams} onParamsChange={handleParamsChange} />)}

        {page('client-card', <ClientCard urlParams={urlParams} onParamsChange={handleParamsChange} />)}
        {page('expiring-packages', <ExpiringPackages onViewClient={handleViewClient} urlParams={urlParams} onParamsChange={handleParamsChange} />)}
        {page('sleeping-clients', <SleepingClients onViewClient={handleViewClient} urlParams={urlParams} onParamsChange={handleParamsChange} />)}
        {page('client-segments', <ClientSegments onViewClient={handleViewClient} urlParams={urlParams} onParamsChange={handleParamsChange} />)}

        {page('margin-by-service', <MarginByService urlParams={urlParams} onParamsChange={handleParamsChange} />)}
        {page('margin-by-staff', <MarginByStaff urlParams={urlParams} onParamsChange={handleParamsChange} />)}

        {page('references', <ReferenceTables onNavigate={handleNavigate} initialTab={urlParams.tab} initialStaffId={urlParams.staff} />)}
        {page('service-pricelist', <ServiceDetailsPage />)}
        {page('staff-pricelist', <StaffPricelist />)}

        {ADMIN_TABS.map(tab => page(tab, <ApiIntegration tab={tab} onSyncComplete={handleSyncComplete} onReconciliationResult={setReconciliationResult} />))}
        {page('data-issues', <DataIssuesPage onNavigate={handleNavigate} />)}
        {page('linkage-health', <DataLinkageHealthTab />)}
        {page('appointments', <AppointmentsView />)}
        {page('client-services', <ClientServicesView />)}
        {page('sales', <SalesExpandableView onNavigate={handleNavigate} />)}
        {page('sale-items', <TableView tableName="sale_items" displayName="Sale Items" section="sale-items" onNavigate={handleNavigate} selectedId={selectedId} />)}
        {page('pivot-reports', <SimplePage section="pivot-reports"><PivotTable /></SimplePage>)}

        {page('transactions', <TableView tableName="transactions" displayName="Transactions" section="transactions" onNavigate={handleNavigate} selectedId={selectedId} />)}
      </div>
    </div>
  );
}
