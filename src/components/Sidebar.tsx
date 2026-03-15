import { Database, Settings, BarChart3, Users, Calendar, DollarSign, MapPin, UserCog, Grid3x3, Tag, Package, ShoppingBag, FileText, FileJson, History, CreditCard } from 'lucide-react';

export type MenuSection =
  | 'api-integration'
  | 'pivot-reports'
  | 'sites'
  | 'locations'
  | 'staff'
  | 'service-categories'
  | 'services'
  | 'staff-services'
  | 'pricing-options'
  | 'clients'
  | 'appointments'
  | 'sales'
  | 'payments'
  | 'sale-items'
  | 'retail-products';

interface SidebarProps {
  activeSection: MenuSection;
  onSectionChange: (section: MenuSection) => void;
}

interface MenuItem {
  id: MenuSection;
  label: string;
  icon: any;
  color: string;
}

export function Sidebar({ activeSection, onSectionChange }: SidebarProps) {
  const menuItems: MenuItem[] = [
    { id: 'api-integration', label: 'API Integration', icon: Settings, color: 'slate' },
    { id: 'pivot-reports', label: 'Pivot Reports', icon: BarChart3, color: 'blue' },
    { id: 'sites', label: 'Sites', icon: Database, color: 'slate' },
    { id: 'locations', label: 'Locations', icon: MapPin, color: 'blue' },
    { id: 'staff', label: 'Staff', icon: UserCog, color: 'violet' },
    { id: 'service-categories', label: 'Service Categories', icon: Grid3x3, color: 'cyan' },
    { id: 'services', label: 'Services', icon: Tag, color: 'green' },
    { id: 'staff-services', label: 'Staff ↔ Services', icon: Grid3x3, color: 'teal' },
    { id: 'pricing-options', label: 'Pricing Options', icon: Package, color: 'lime' },
    { id: 'clients', label: 'Clients', icon: Users, color: 'orange' },
    { id: 'appointments', label: 'Appointments', icon: Calendar, color: 'red' },
    { id: 'sales', label: 'Sales', icon: DollarSign, color: 'emerald' },
    { id: 'payments', label: 'Payments', icon: CreditCard, color: 'sky' },
    { id: 'sale-items', label: 'Sale Items', icon: FileText, color: 'amber' },
    { id: 'retail-products', label: 'Retail Products', icon: ShoppingBag, color: 'rose' },
  ];

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
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            className={getItemClass(item.id)}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
