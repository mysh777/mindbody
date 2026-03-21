import { useState, useEffect, useCallback } from 'react';
import { Database, Settings, BarChart3, Calendar, DollarSign, FileText, ClipboardList, PieChart, Package, ShoppingBag, Wallet, UserCog, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';

export type MenuSection =
  | 'api-integration'
  | 'references'
  | 'pivot-reports'
  | 'clients-report'
  | 'staff-report'
  | 'staff-pricelist'
  | 'appointments'
  | 'sales'
  | 'sales-report'
  | 'sales-by-pricing'
  | 'client-services'
  | 'transactions'
  | 'sale-items'
  | 'client-activity';

interface SidebarProps {
  activeSection: MenuSection;
  onSectionChange: (section: MenuSection) => void;
  refreshTrigger?: number;
}

interface MenuItem {
  id: MenuSection;
  label: string;
  icon: any;
  tableName?: string;
  dividerBefore?: boolean;
}

const tableNameMap: Record<MenuSection, string | null> = {
  'api-integration': null,
  'references': null,
  'pivot-reports': null,
  'clients-report': null,
  'staff-report': null,
  'staff-pricelist': null,
  'appointments': 'appointments',
  'sales': 'sales',
  'sales-report': null,
  'sales-by-pricing': null,
  'client-services': 'client_services',
  'transactions': 'transactions',
  'sale-items': 'sale_items',
  'client-activity': null,
};

export function Sidebar({ activeSection, onSectionChange, refreshTrigger }: SidebarProps) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  const menuItems: MenuItem[] = [
    { id: 'api-integration', label: 'API Integration', icon: Settings },
    { id: 'references', label: 'Reference Tables', icon: Database, dividerBefore: true },
    { id: 'pivot-reports', label: 'Pivot Reports', icon: BarChart3, dividerBefore: true },
    { id: 'clients-report', label: 'Client Balance', icon: Wallet },
    { id: 'staff-report', label: 'Staff Report', icon: ClipboardList },
    { id: 'staff-pricelist', label: 'Staff Pricelist', icon: UserCog },
    { id: 'client-activity', label: 'Client Activity', icon: Activity },
    { id: 'appointments', label: 'Appointments', icon: Calendar, dividerBefore: true },
    { id: 'client-services', label: 'Client Services', icon: Package },
    { id: 'sales', label: 'Sales Journal', icon: DollarSign, dividerBefore: true },
    { id: 'sales-report', label: 'Sales Report', icon: PieChart },
    { id: 'sales-by-pricing', label: 'Sales by Pricing', icon: FileText },
    { id: 'transactions', label: 'Transactions', icon: ShoppingBag },
    { id: 'sale-items', label: 'Sale Items', icon: FileText },
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
            <div key={item.id}>
              {item.dividerBefore && (
                <div className="my-3 border-t border-slate-200" />
              )}
              <button
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
            </div>
          );
        })}
      </nav>
    </div>
  );
}
