import { useState } from 'react';
import { RefreshCw, Users, Calendar, DollarSign, MapPin, UserCog, Package, Database, Grid3x3, Tag, ShoppingCart } from 'lucide-react';

interface SyncButtonProps {
  onSyncComplete?: () => void;
}

type SyncType = 'quick' | 'all' | 'sites' | 'locations' | 'staff' | 'programs' | 'session_types' | 'staff_session_types' | 'pricing_options' | 'clients' | 'appointments' | 'sales' | 'retail_products';

interface SyncStatus {
  [key: string]: 'idle' | 'syncing' | 'success' | 'error';
}

export function SyncButton({ onSyncComplete }: SyncButtonProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({});
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const handleSync = async (syncType: SyncType) => {
    console.log(`🔄 Starting sync for: ${syncType}`);
    setSyncStatus(prev => ({ ...prev, [syncType]: 'syncing' }));
    setError(null);
    setSyncResult(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      console.log(`📡 Calling edge function: ${supabaseUrl}/functions/v1/mindbody-sync`);
      console.log(`📦 Payload:`, { syncType });

      const response = await fetch(`${supabaseUrl}/functions/v1/mindbody-sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ syncType }),
      });

      console.log(`📥 Response status: ${response.status}`);

      const responseText = await response.text();
      console.log(`📄 Response text:`, responseText);

      if (!response.ok) {
        throw new Error(`Sync failed with status ${response.status}: ${responseText}`);
      }

      const result = JSON.parse(responseText);
      console.log(`✅ Result:`, result);

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
      console.error(`❌ Sync error:`, err);
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
    { type: 'staff' as SyncType, label: 'Staff', icon: UserCog, color: 'purple' },
    { type: 'programs' as SyncType, label: 'Service Categories', icon: Grid3x3, color: 'cyan' },
    { type: 'session_types' as SyncType, label: 'Session Types', icon: Tag, color: 'green' },
    { type: 'staff_session_types' as SyncType, label: 'Staff ↔ Services', icon: Grid3x3, color: 'teal' },
    { type: 'pricing_options' as SyncType, label: 'Pricing Options', icon: Package, color: 'pink' },
    { type: 'retail_products' as SyncType, label: 'Retail Products', icon: ShoppingCart, color: 'indigo' },
    { type: 'clients' as SyncType, label: 'Clients', icon: Users, color: 'orange' },
    { type: 'appointments' as SyncType, label: 'Appointments', icon: Calendar, color: 'red' },
    { type: 'sales' as SyncType, label: 'Sales', icon: DollarSign, color: 'emerald' },
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
      purple: 'bg-purple-600 hover:bg-purple-700',
      green: 'bg-green-600 hover:bg-green-700',
      teal: 'bg-teal-600 hover:bg-teal-700',
      orange: 'bg-orange-600 hover:bg-orange-700',
      red: 'bg-red-600 hover:bg-red-700',
      emerald: 'bg-emerald-600 hover:bg-emerald-700',
      indigo: 'bg-indigo-600 hover:bg-indigo-700',
    };

    return `${baseClass} ${colorClasses[color] || 'bg-gray-600 hover:bg-gray-700'} text-white`;
  };

  return (
    <div className="flex flex-col gap-4">
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
