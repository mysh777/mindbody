import { useState, useEffect, useCallback } from 'react';
import {
  Database, BarChart3, Calendar, DollarSign, FileText, Package,
  UserCog, HeartPulse, UserCircle, Flame, TrendingUp, UserCheck, Moon, Users, LayoutDashboard,
  RefreshCw, History, ShieldCheck, AlertTriangle, FileJson, ChevronRight, Settings, ListChecks,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PAGES, MENU_GROUPS, type MenuSection, type MenuGroup } from '../lib/pages';

interface SidebarProps {
  activeSection: MenuSection;
  onSectionChange: (section: MenuSection) => void;
  refreshTrigger?: number;
}

const ICONS: Record<MenuSection, typeof Database> = {
  'overview': LayoutDashboard,
  'client-card': UserCircle,
  'expiring-packages': Flame,
  'sleeping-clients': Moon,
  'client-segments': Users,
  'margin-by-service': TrendingUp,
  'margin-by-staff': UserCheck,
  'references': Database,
  'service-pricelist': ListChecks,
  'staff-pricelist': UserCog,
  'sync': RefreshCw,
  'sync-history': History,
  'reconciliation': ShieldCheck,
  'data-issues': AlertTriangle,
  'linkage-health': HeartPulse,
  'appointments': Calendar,
  'client-services': Package,
  'sales': DollarSign,
  'sale-items': FileText,
  'pivot-reports': BarChart3,
  'api-logs': FileText,
  'raw-api': FileJson,
  'staff-rates': UserCog,
};

const TABLE_COUNTS: Partial<Record<MenuSection, string>> = {
  'appointments': 'appointments',
  'sales': 'sales',
  'client-services': 'client_services',
  'sale-items': 'sale_items',
};

const SECTIONS = Object.keys(PAGES) as MenuSection[];
const sectionsOf = (group: MenuGroup) => SECTIONS.filter(s => PAGES[s].group === group);
const isAdminGroup = (s: MenuSection) => PAGES[s].group === 'admin';

export function Sidebar({ activeSection, onSectionChange, refreshTrigger }: SidebarProps) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [adminOpen, setAdminOpen] = useState(() => isAdminGroup(activeSection));

  useEffect(() => {
    if (isAdminGroup(activeSection)) setAdminOpen(true);
  }, [activeSection]);

  const loadCounts = useCallback(async () => {
    const newCounts: Record<string, number> = {};
    await Promise.all(Object.entries(TABLE_COUNTS).map(async ([section, tableName]) => {
      const { count, error } = await supabase.from(tableName!).select('*', { count: 'exact', head: true });
      if (error) console.error(`Error loading count for ${tableName}:`, error);
      newCounts[section] = count || 0;
    }));
    setCounts(newCounts);
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts, refreshTrigger]);

  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const renderItem = (id: MenuSection, compact = false) => {
    const Icon = ICONS[id];
    const isActive = activeSection === id;
    const count = counts[id];
    return (
      <button
        key={id}
        onClick={() => onSectionChange(id)}
        className={`w-full flex items-center gap-3 px-4 ${compact ? 'py-2' : 'py-2.5'} text-left transition-all rounded-lg border-l-4 ${
          isActive
            ? 'bg-blue-50 text-blue-900 border-blue-600 font-semibold'
            : 'text-slate-700 hover:bg-slate-50 border-transparent'
        }`}
      >
        <Icon className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} flex-shrink-0`} />
        <span className="text-sm flex-1 text-left">{PAGES[id].label}</span>
        {count !== undefined && count > 0 && (
          <span className="ml-auto text-xs font-semibold px-2 py-0.5 bg-slate-200 text-slate-700 rounded-full">
            {formatCount(count)}
          </span>
        )}
      </button>
    );
  };

  const groupHeading = (label: string) => (
    <div className="px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
  );

  const toggle = (label: string, open: boolean, onClick: () => void, Icon: typeof Database, nested = false) => (
    <button
      onClick={onClick}
      aria-expanded={open}
      className={`w-full flex items-center gap-2 px-4 py-2 rounded-lg text-left transition-colors hover:bg-slate-50 ${
        nested ? 'text-xs font-semibold text-slate-500' : 'text-[11px] font-semibold uppercase tracking-wider text-slate-500'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="flex-1">{label}</span>
      <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
    </button>
  );

  return (
    <div className="w-64 bg-white border-r border-slate-200 h-screen flex flex-col flex-shrink-0">
      <div className="bg-white border-b border-slate-200 p-6">
        <h1 className="text-2xl font-bold text-slate-900">Mindbody</h1>
        <p className="text-sm text-slate-600 mt-1">Analytics Dashboard</p>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-0.5">
        {MENU_GROUPS.filter(g => g.id !== 'admin').map(g => (
          <div key={g.id} className="space-y-0.5">
            {g.label && groupHeading(g.label)}
            {sectionsOf(g.id).map(id => renderItem(id))}
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-4 max-h-[55%] overflow-y-auto">
        {toggle('Admin', adminOpen, () => setAdminOpen(o => !o), Settings)}
        {adminOpen && (
          <div className="mt-1 space-y-0.5">
            {sectionsOf('admin').map(id => renderItem(id, true))}
          </div>
        )}
      </div>
    </div>
  );
}
