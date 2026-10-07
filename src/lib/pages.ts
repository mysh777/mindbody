export type MenuSection =
  | 'overview'
  | 'client-card'
  | 'expiring-packages'
  | 'sleeping-clients'
  | 'client-segments'
  | 'margin-by-service'
  | 'margin-by-staff'
  | 'references'
  | 'service-pricelist'
  | 'staff-pricelist'
  | 'sync'
  | 'sync-history'
  | 'reconciliation'
  | 'data-issues'
  | 'linkage-health'
  | 'appointments'
  | 'client-services'
  | 'sales'
  | 'sale-items'
  | 'pivot-reports'
  | 'api-logs'
  | 'raw-api'
  | 'staff-rates'
  | 'transactions';

export type MenuGroup = 'overview' | 'clients' | 'finance' | 'reference' | 'admin' | 'legacy';

export interface PageInfo {
  label: string;
  purpose: string;
  group: MenuGroup;
}

export const DEFAULT_SECTION: MenuSection = 'overview';

export const PAGES: Record<MenuSection, PageInfo> = {
  'overview': { group: 'overview', label: 'Overview', purpose: 'Key studio figures for the month: sales, money, margin, visits and clients.' },

  'client-card': { group: 'clients', label: 'Client Card', purpose: 'Everything about one client: purchases, visits, package balances and account balance. Above it, the list of all clients with unused visits.' },
  'expiring-packages': { group: 'clients', label: 'Expiring Packages', purpose: 'Whose package is about to run out — who to remind about renewal.' },
  'sleeping-clients': { group: 'clients', label: 'Sleeping Clients', purpose: 'Clients who have not come for a long time — who is worth winning back.' },
  'client-segments': { group: 'clients', label: 'Client Segments', purpose: 'Regular, one-off and new clients — what the client base is made of.' },

  'margin-by-service': { group: 'finance', label: 'Margin by Service', purpose: 'What each service and pricing option brings in after staff pay.' },
  'margin-by-staff': { group: 'finance', label: 'Margin by Staff', purpose: 'How much revenue each staff member brings in and how much we pay them.' },

  'references': { group: 'reference', label: 'Reference Tables', purpose: 'Mindbody reference data: locations, staff, services, pricing options and staff rates.' },
  'service-pricelist': { group: 'reference', label: 'Service Pricelist', purpose: 'Average price, visits and staff cost per service for a period.' },
  'staff-pricelist': { group: 'reference', label: 'Staff Pricelist', purpose: 'Visits and cost of work for each staff member by service.' },

  'sync': { group: 'admin', label: 'Sync Data', purpose: 'Manually load fresh data from Mindbody and connect the site.' },
  'sync-history': { group: 'admin', label: 'Sync History', purpose: 'Log of data loads: when, what was loaded and how it ended.' },
  'reconciliation': { group: 'admin', label: 'Reconciliation', purpose: 'Checks dashboard figures against Mindbody reports — does everything match.' },
  'data-issues': { group: 'admin', label: 'Data Issues', purpose: 'Visits whose price could not be determined — what to fix in the data.' },
  'linkage-health': { group: 'admin', label: 'Linkage Health', purpose: 'How completely visits are linked to packages and pricing options.' },
  'appointments': { group: 'admin', label: 'Appointments', purpose: 'Full list of appointments with filters.' },
  'client-services': { group: 'admin', label: 'Client Services', purpose: 'All client packages and memberships with remaining visits.' },
  'sales': { group: 'admin', label: 'Sales Journal', purpose: 'Log of all sales with items and payment methods.' },
  'sale-items': { group: 'admin', label: 'Sale Items', purpose: 'All sale lines as received.' },
  'pivot-reports': { group: 'admin', label: 'Pivot Reports', purpose: 'Build your own pivot table on any data.' },
  'api-logs': { group: 'admin', label: 'API Logs', purpose: 'Technical log of requests to Mindbody.' },
  'raw-api': { group: 'admin', label: 'Raw API Data', purpose: 'Unprocessed Mindbody responses.' },
  'staff-rates': { group: 'admin', label: 'Staff Rates', purpose: 'Staff pay rates for treatments.' },

  'transactions': { group: 'legacy', label: 'Transactions', purpose: 'Old page: payment transactions from Mindbody.' },
};

export const MENU_GROUPS: { id: MenuGroup; label: string }[] = [
  { id: 'overview', label: '' },
  { id: 'clients', label: 'Clients' },
  { id: 'finance', label: 'Finance' },
  { id: 'reference', label: 'Reference' },
  { id: 'admin', label: 'Admin' },
  { id: 'legacy', label: 'Legacy' },
];

const REDIRECTS: Record<string, MenuSection> = {
  'sales-report': 'overview',
  'profitability': 'overview',
  'api-integration': 'sync',
  'client-activity': 'client-card',
  'clients-report': 'client-card',
  'client-balance': 'client-card',
  'expired': 'client-card',
  'staff-report': 'margin-by-staff',
  'sales-by-pricing': 'margin-by-service',
  'by-service': 'margin-by-service',
};

const REDIRECT_PARAMS: Record<string, Record<string, string>> = {
  'sales-by-pricing': { basis: 'sale' },
  'by-service': { basis: 'visit' },
};

export function resolveSection(path: string): { section: MenuSection; redirected: boolean; params?: Record<string, string> } {
  if (path in PAGES) return { section: path as MenuSection, redirected: false };
  if (path in REDIRECTS) return { section: REDIRECTS[path], redirected: true, params: REDIRECT_PARAMS[path] };
  return { section: DEFAULT_SECTION, redirected: path !== '' };
}
