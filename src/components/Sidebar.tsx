import { useState, useEffect, useCallback } from 'react';
import { Database, Settings, BarChart3, Users, Calendar, DollarSign, MapPin, UserCog, Grid3x3, Tag, Package, ShoppingBag, FileText, CreditCard, Wallet, ClipboardList, PieChart } from 'lucide-react';
import { supabase } from '../lib/supabase';

export type MenuSection =
  | 'api-integration'
  | 'pivot-reports'
  | 'sites'
  | 'locations'
  | 'staff'
  | 'staff-report'
  | 'service-categories'
  | 'services'
  | 'staff-services'
  | 'pricing-options'
  | 'clients'
  | 'clients-report'
  | 'appointments'
  | 'sales'
  | 'sales-report'
  | 'sales-by-pricing'
  | 'transactions'
  | 'sale-items'
  | 'client-services'
  | 'retail-products';

interface SidebarProps {
  activeSection: MenuSection;
  onSectionChange: (section: MenuSection) => void;
  refreshTrigger?: number;
}

interface MenuItem {
  id: MenuSection;
  label: string;
  icon: any;
  color: string;
  tableName?: string;
}

const tableNameMap: Record<MenuSection, string | null> = {
  'api-integration': null,
  'pivot-reports': null,
  'sites': 'sites',
  'locations': 'locations',
  'staff': 'staff',
  'staff-report': null,
  'service-categories': 'service_categories',
  'services': 'session_types',
  'staff-services': 'staff_session_types',
  'pricing-options': 'pricing_options',
  'clients': 'clients',
  'clients-report': null,
  'appointments': 'appointments',
  'sales': 'sales',
  'sales-report': null,
  'sales-by-pricing': null,
  'transactions': 'transactions',
  'sale-items': 'sale_items',
  'client-services': 'client_services',
  'retail-products': 'retail_products',
};

export function Sidebar({ activeSection, onSectionChange, refreshTrigger }: SidebarProps) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  const menuItems: MenuItem[] = [
    { id: 'api-integration', label: 'API Integration', icon: Settings, color: 'slate' },
    { id: 'pivot-reports', label: 'Pivot Reports', icon: BarChart3, color: 'blue' },
    { id: 'sites', label: 'Sites', icon: Database, color: 'slate' },
    { id: 'locations', label: 'Locations', icon: MapPin, color: 'blue' },
    { id: 'staff', label: 'Staff', icon: UserCog, color: 'sky' },
    { id: 'staff-report', label: 'Staff Report', icon: ClipboardList, color: 'sky' },
    { id: 'service-categories', label: 'Service Categories', icon: Grid3x3, color: 'cyan' },
    { id: 'services', label: 'Services', icon: Tag, color: 'green' },
    { id: 'staff-services', label: 'Staff - Services', icon: Grid3x3, color: 'teal' },
    { id: 'pricing-options', label: 'Pricing Options', icon: Package, color: 'lime' },
    { id: 'clients', label: 'Clients', icon: Users, color: 'orange' },
    { id: 'clients-report', label: 'Clients Report', icon: ClipboardList, color: 'orange' },
    { id: 'appointments', label: 'Appointments', icon: Calendar, color: 'red' },
    { id: 'sales', label: 'Sales', icon: DollarSign, color: 'emerald' },
    { id: 'sales-report', label: 'Sales Report', icon: PieChart, color: 'emerald' },
    { id: 'sales-by-pricing', label: 'Sales by Pricing', icon: FileText, color: 'emerald' },
    { id: 'transactions', label: 'Transactions', icon: CreditCard, color: 'sky' },
    { id: 'sale-items', label: 'Sale Items', icon: FileText, color: 'amber' },
    { id: 'client-services', label: 'Client Services', icon: Wallet, color: 'pink' },
    { id: 'retail-products', label: 'Retail Products', icon: ShoppingBag, color: 'rose' },
  ];

  const loadCounts = useCallback(async () => {
    const newCounts: Record<string, number> = {};

    const promises = Object.entries(tableNameMap).map(async ([section, tableName]) => {
      if (tableName) {
        try {
          const { count } = await supabase
            .from(tableName)
            .select('*', { count: 'exact', head: true });
          newCounts[section] = count || 0;
        } catch (error) {
          console.error(`Error loading count for ${tableName}:`, error);
          newCounts[section] = 0;
        }
      }
    });

    await Promise.all(promises);
    setCounts(newCounts);
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts, refreshTrigger]);

  const formatCount = (count: number) => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  const getItemClass = (itemId: MenuSection) => {
    const isActive = activeSection === itemId;
    return `w-full flex items-center gap-3 px-4 py-3 text-left transition-all rounded-lg ${
      isActive
        ? 'bg-blue-50 text-blue-900 border-l-4 border-blue-600 font-semibold'
        : 'text-slate-700 hover:bg-slate-50 border-l-4 border-transparent'
    }`;
  };

  return (
    <div className="w-64 bg-white border-r border-slate-200 h-screen overflow-y-auto flex-shrink-0">
      <div className="sticky top-0 bg-white border-b border-slate-200 p-6 z-10">
        <h1 className="text-2xl font-bold text-slate-900">Mindbody</h1>
        <p className="text-sm text-slate-600 mt-1">Analytics Dashboard</p>
      </div>

      <nav className="p-4 space-y-1">
        {menuItems.map((item) => {
          const count = counts[item.id];
          const hasCount = count !== undefined && count > 0;

          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={getItemClass(item.id)}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm flex-1 text-left">{item.label}</span>
              {hasCount && (
                <span className="ml-auto text-xs font-semibold px-2 py-0.5 bg-slate-200 text-slate-700 rounded-full">
                  {formatCount(count)}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
