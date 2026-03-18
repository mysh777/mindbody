import { useState } from 'react';
import { RefreshCw, Users, Calendar, DollarSign, MapPin, UserCog, Package, Database, Grid3x3, Tag, ShoppingCart, Link2, CreditCard, FileText, ChevronDown } from 'lucide-react';

interface SyncButtonProps {
  onSyncComplete?: () => void;
}

type SyncType = 'quick' | 'all' | 'sites' | 'locations' | 'staff' | 'programs' | 'services' | 'staff_services' | 'pricing_options' | 'clients' | 'appointments' | 'sales' | 'retail_products' | 'build_pricing_links' | 'client_services' | 'transactions';

interface SyncStatus {
  [key: string]: 'idle' | 'syncing' | 'success' | 'error';
}

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;
const availableYears = [currentYear, currentYear - 1, currentYear - 2];
const months = [
  { value: 0, label: 'All Year' },
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

export function SyncButton({ onSyncComplete }: SyncButtonProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({});
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [selectedYears, setSelectedYears] = useState<{ [key: string]: number }>({
    sales: currentYear,
    client_services: currentYear,
    transactions: currentYear,
    appointments: currentYear,
  });
  const [selectedMonths, setSelectedMonths] = useState<{ [key: string]: number }>({
    appointments: currentMonth,
    sales: currentMonth,
    transactions: currentMonth,
    client_services: currentMonth,
  });

  const handleYearChange = (syncType: string, year: number) => {
    setSelectedYears(prev => ({ ...prev, [syncType]: year }));
  };

  const handleMonthChange = (syncType: string, month: number) => {
    setSelectedMonths(prev => ({ ...prev, [syncType]: month }));
  };

  const handleSync = async (syncType: SyncType, year?: number, month?: number) => {
    const monthLabel = month ? `-${String(month).padStart(2, '0')}` : '';
    console.log(`Starting sync for: ${syncType}${year ? ` (period: ${year}${monthLabel})` : ''}`);
    setSyncStatus(prev => ({ ...prev, [syncType]: 'syncing' }));
    setError(null);
    setSyncResult(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const payload: { syncType: string; year?: number; month?: number } = { syncType };
      if (year) {
        payload.year = year;
      }
      if (month && month > 0) {
        payload.month = month;
      }

      console.log(`Calling edge function with payload:`, payload);

      const response = await fetch(`${supabaseUrl}/functions/v1/mindbody-sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      console.log(`Response status: ${response.status}`);

      const responseText = await response.text();
      console.log(`Response text:`, responseText);

      if (!response.ok) {
        throw new Error(`Sync failed with status ${response.status}: ${responseText}`);
      }

      const result = JSON.parse(responseText);
      console.log(`Result:`, result);

      if (result.error) {
        throw new Error(result.error);
      }

      setSyncStatus(prev => ({ ...prev, [syncType]: 'success' }));
      setSyncResult(JSON.stringify(result, null, 2));

      setTimeout(() => {
        setSyncStatus(prev => ({ ...prev, [syncType]: 'idle' }));
      }, 3000);

      if (onSyncComplete) {
        onSyncComplete();
      }
    } catch (err) {
      console.error(`Sync error:`, err);
      setSyncStatus(prev => ({ ...prev, [syncType]: 'error' }));
      setError(err instanceof Error ? err.message : 'Failed to sync data');
      setTimeout(() => {
        setSyncStatus(prev => ({ ...prev, [syncType]: 'idle' }));
      }, 5000);
    }
  };

  const syncButtons = [
    { type: 'sites' as SyncType, label: 'Sites', icon: Database, color: 'slate' },
    { type: 'locations' as SyncType, label: 'Locations', icon: MapPin, color: 'blue' },
    { type: 'staff' as SyncType, label: 'Staff', icon: UserCog, color: 'sky' },
    { type: 'programs' as SyncType, label: 'Service Categories', icon: Grid3x3, color: 'cyan' },
    { type: 'services' as SyncType, label: 'Services', icon: Tag, color: 'green' },
    { type: 'staff_services' as SyncType, label: 'Staff - Services', icon: Grid3x3, color: 'teal' },
    { type: 'pricing_options' as SyncType, label: 'Pricing Options', icon: Package, color: 'pink' },
    { type: 'build_pricing_links' as SyncType, label: 'Price - Service Links', icon: Link2, color: 'amber' },
    { type: 'retail_products' as SyncType, label: 'Retail Products', icon: ShoppingCart, color: 'slate' },
    { type: 'clients' as SyncType, label: 'Clients', icon: Users, color: 'orange' },
  ];

  const monthBasedButtons = [
    { type: 'appointments' as SyncType, label: 'Appointments', icon: Calendar, color: 'red', description: 'Appointments for period' },
    { type: 'sales' as SyncType, label: 'Sales', icon: DollarSign, color: 'emerald', description: 'Sales + Payments + Items' },
    { type: 'transactions' as SyncType, label: 'Transactions', icon: CreditCard, color: 'violet', description: 'Payment transactions detail' },
    { type: 'client_services' as SyncType, label: 'Client Services', icon: FileText, color: 'blue', description: 'Purchased packages/memberships' },
  ];

  const getButtonClass = (type: SyncType, color: string) => {
    const status = syncStatus[type] || 'idle';
    const baseClass = 'flex items-center gap-2 px-4 py-2 rounded-lg font-medium shadow-sm transition-all duration-200';

    if (status === 'syncing') {
      return `${baseClass} bg-gray-400 text-white cursor-wait`;
    }
    if (status === 'success') {
      return `${baseClass} bg-green-500 text-white`;
    }
    if (status === 'error') {
      return `${baseClass} bg-red-500 text-white`;
    }

    const colorClasses: { [key: string]: string } = {
      blue: 'bg-blue-600 hover:bg-blue-700',
      cyan: 'bg-cyan-600 hover:bg-cyan-700',
      pink: 'bg-pink-600 hover:bg-pink-700',
      slate: 'bg-slate-600 hover:bg-slate-700',
      sky: 'bg-sky-600 hover:bg-sky-700',
      green: 'bg-green-600 hover:bg-green-700',
      teal: 'bg-teal-600 hover:bg-teal-700',
      orange: 'bg-orange-600 hover:bg-orange-700',
      red: 'bg-red-600 hover:bg-red-700',
      emerald: 'bg-emerald-600 hover:bg-emerald-700',
      amber: 'bg-amber-600 hover:bg-amber-700',
      violet: 'bg-violet-600 hover:bg-violet-700',
    };

    return `${baseClass} ${colorClasses[color] || 'bg-gray-600 hover:bg-gray-700'} text-white`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <button
          onClick={() => handleSync('quick')}
          disabled={syncStatus['quick'] === 'syncing'}
          className={getButtonClass('quick', 'blue')}
        >
          <RefreshCw className={`w-5 h-5 ${syncStatus['quick'] === 'syncing' ? 'animate-spin' : ''}`} />
          {syncStatus['quick'] === 'syncing' ? 'Quick Syncing...' : 'Quick Sync (Main Tables)'}
        </button>

        <button
          onClick={() => handleSync('all')}
          disabled={syncStatus['all'] === 'syncing'}
          className={getButtonClass('all', 'slate')}
        >
          <RefreshCw className={`w-5 h-5 ${syncStatus['all'] === 'syncing' ? 'animate-spin' : ''}`} />
          {syncStatus['all'] === 'syncing' ? 'Full Syncing...' : 'Full Sync (All Data)'}
        </button>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Period-Based Sync (Year-Month):</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {monthBasedButtons.map(({ type, label, icon: Icon, color, description }) => (
            <div key={type} className="flex flex-col gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="w-5 h-5 text-gray-600" />
                  <span className="font-medium text-gray-800">{label}</span>
                </div>
                <div className="flex gap-2">
                  <div className="relative">
                    <select
                      value={selectedYears[type] || currentYear}
                      onChange={(e) => handleYearChange(type, parseInt(e.target.value))}
                      className="appearance-none bg-white border border-gray-300 rounded-md px-3 py-1.5 pr-8 text-sm font-medium text-gray-700 cursor-pointer hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {availableYears.map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  </div>
                  <div className="relative">
                    <select
                      value={selectedMonths[type] || 0}
                      onChange={(e) => handleMonthChange(type, parseInt(e.target.value))}
                      className="appearance-none bg-white border border-gray-300 rounded-md px-3 py-1.5 pr-8 text-sm font-medium text-gray-700 cursor-pointer hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {months.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500">{description}</p>
              <button
                onClick={() => handleSync(type, selectedYears[type], selectedMonths[type])}
                disabled={syncStatus[type] === 'syncing'}
                className={`${getButtonClass(type, color)} w-full justify-center`}
              >
                <RefreshCw className={`w-4 h-4 ${syncStatus[type] === 'syncing' ? 'animate-spin' : ''}`} />
                <span className="text-sm">
                  {syncStatus[type] === 'syncing' ? 'Syncing...' : `Sync ${selectedYears[type]}${selectedMonths[type] ? `-${String(selectedMonths[type]).padStart(2, '0')}` : ''}`}
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Sync Individual Tables:</h3>
        <div className="grid grid-cols-3 gap-2">
          {syncButtons.map(({ type, label, icon: Icon, color }) => (
            <button
              key={type}
              onClick={() => handleSync(type)}
              disabled={syncStatus[type] === 'syncing'}
              className={getButtonClass(type, color)}
            >
              <Icon className={`w-4 h-4 ${syncStatus[type] === 'syncing' ? 'animate-spin' : ''}`} />
              <span className="text-sm">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {syncResult && (
        <div className="text-xs text-gray-700 bg-gray-50 px-4 py-2 rounded-lg border border-gray-200 max-h-64 overflow-auto">
          <pre className="whitespace-pre-wrap">{syncResult}</pre>
        </div>
      )}
    </div>
  );
}
