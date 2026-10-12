import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Sidebar } from './Sidebar';
import { PageLoadTimer } from './PageLoadTimer';
import type { MenuSection } from '../lib/pages';
import { PAGES } from '../lib/pages';
import type { AdminTab } from './ApiIntegration';
import { ErrorBoundary } from './ErrorBoundary';
import { useHashRouter } from '../hooks/useHashRouter';
import type { ReconciliationResult } from '../hooks/useReconciliationData';
import { runReconciliationCheck, useAutoReconciliationCheck } from '../hooks/useReconciliationData';
import { AlertTriangle, Loader2, Menu } from 'lucide-react';
import type { ReactNode } from 'react';

const ApiIntegration = lazy(() => import('./ApiIntegration').then(m => ({ default: m.ApiIntegration })));
const PivotTable = lazy(() => import('./PivotTable').then(m => ({ default: m.PivotTable })));
const TableView = lazy(() => import('./TableView').then(m => ({ default: m.TableView })));
const ReferenceTables = lazy(() => import('./ReferenceTables').then(m => ({ default: m.ReferenceTables })));
const SalesExpandableView = lazy(() => import('./SalesExpandableView').then(m => ({ default: m.SalesExpandableView })));
const SalesReportPage = lazy(() => import('./SalesReportPage').then(m => ({ default: m.SalesReportPage })));
const ServiceDetailsPage = lazy(() => import('./ServiceDetailsPage').then(m => ({ default: m.ServiceDetailsPage })));
const AppointmentsView = lazy(() => import('./AppointmentsView').then(m => ({ default: m.AppointmentsView })));
const ClientServicesView = lazy(() => import('./ClientServicesView').then(m => ({ default: m.ClientServicesView })));
const StaffPricelist = lazy(() => import('./StaffPricelist').then(m => ({ default: m.StaffPricelist })));
const DataLinkageHealthTab = lazy(() => import('./DataLinkageHealthTab').then(m => ({ default: m.DataLinkageHealthTab })));
const ClientCard = lazy(() => import('./ClientCard').then(m => ({ default: m.ClientCard })));
const ExpiringPackages = lazy(() => import('./ExpiringPackages').then(m => ({ default: m.ExpiringPackages })));
const MarginByService = lazy(() => import('./MarginByService').then(m => ({ default: m.MarginByService })));
const MarginByStaff = lazy(() => import('./MarginByStaff').then(m => ({ default: m.MarginByStaff })));
const SleepingClients = lazy(() => import('./SleepingClients').then(m => ({ default: m.SleepingClients })));
const ClientSegments = lazy(() => import('./ClientSegments').then(m => ({ default: m.ClientSegments })));
const Campaigns = lazy(() => import('./Campaigns').then(m => ({ default: m.Campaigns })));
const DataIssuesPage = lazy(() => import('./DataIssuesPage').then(m => ({ default: m.DataIssuesPage })));
const SimplePage = lazy(() => import('./PageHeader').then(m => ({ default: m.SimplePage })));

function PageLoading() {
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="ml-2 text-sm">Loading page…</span>
    </div>
  );
}

const ADMIN_TABS: AdminTab[] = ['sync', 'sync-history', 'reconciliation', 'api-logs', 'raw-api', 'staff-rates'];

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
  'client_services': 'client-services',
  'retail_products': 'references',
};

export function Dashboard() {
  const { section: activeSection, params: urlParams, navigate, setParams } = useHashRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [reconciliationResult, setReconciliationResult] = useState<ReconciliationResult | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const handleSyncComplete = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
    runReconciliationCheck().then(r => setReconciliationResult(r)).catch(() => {});
  }, []);

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
    setMobileMenuOpen(false);
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
      <ErrorBoundary scope={id}><Suspense fallback={<PageLoading />}>{node}</Suspense></ErrorBoundary>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        refreshTrigger={refreshTrigger}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      <div className="flex-1 min-w-0 flex flex-col">
      <header className="md:hidden flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open menu"
          className="-ml-2 rounded-lg p-2 text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="truncate text-sm font-semibold text-slate-900">{PAGES[activeSection].label}</span>
      </header>
      <div className="flex-1 relative overflow-hidden">
        {reconciliationResult && !reconciliationResult.allOk && (
          <div className="absolute top-0 left-0 right-0 z-50 flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm shadow-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="font-medium">Reconciliation issues detected</span>
            <span className="text-amber-600">
              — {reconciliationResult.references.filter(r => !r.ok && !r.provisional).length + reconciliationResult.cases.filter(c => !c.ok && !c.provisional).length + reconciliationResult.baselineDrifts.filter(d => !d.provisional).length + reconciliationResult.unknownPaymentTypes.length} check(s) failed
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
        {page('client-segments', <ClientSegments onViewClient={handleViewClient} urlParams={urlParams} onParamsChange={handleParamsChange} onOpenCampaignList={id => navigate('campaigns', { list: id })} />)}
        {page('campaigns', <Campaigns active={activeSection === 'campaigns'} onViewClient={handleViewClient} urlParams={urlParams} onParamsChange={handleParamsChange} />)}

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
      </div>
      </div>
      <PageLoadTimer page={activeSection} />
    </div>
  );
}
