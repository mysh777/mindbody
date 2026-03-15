import { useState } from 'react';
import { RefreshCw, Users, Calendar, DollarSign, MapPin, UserCog, BookOpen, GraduationCap } from 'lucide-react';

interface SyncButtonProps {
  onSyncComplete?: () => void;
}

type SyncType = 'all' | 'locations' | 'staff' | 'class_descriptions' | 'classes' | 'clients' | 'appointments' | 'sales';

interface SyncStatus {
  [key: string]: 'idle' | 'syncing' | 'success' | 'error';
}

export function SyncButton({ onSyncComplete }: SyncButtonProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({});
  const [error, setError] = useState<string | null>(null);

  const handleSync = async (syncType: SyncType) => {
    setSyncStatus(prev => ({ ...prev, [syncType]: 'syncing' }));
    setError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/mindbody-sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ syncType }),
      });

      if (!response.ok) {
        throw new Error('Sync failed');
      }

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      setSyncStatus(prev => ({ ...prev, [syncType]: 'success' }));
      setTimeout(() => {
        setSyncStatus(prev => ({ ...prev, [syncType]: 'idle' }));
      }, 3000);

      if (onSyncComplete) {
        onSyncComplete();
      }
    } catch (err) {
      setSyncStatus(prev => ({ ...prev, [syncType]: 'error' }));
      setError(err instanceof Error ? err.message : 'Failed to sync data');
      setTimeout(() => {
        setSyncStatus(prev => ({ ...prev, [syncType]: 'idle' }));
      }, 5000);
    }
  };

  const syncButtons = [
    { type: 'locations' as SyncType, label: 'Locations', icon: MapPin, color: 'blue' },
    { type: 'staff' as SyncType, label: 'Staff', icon: UserCog, color: 'purple' },
    { type: 'class_descriptions' as SyncType, label: 'Class Types', icon: BookOpen, color: 'green' },
    { type: 'classes' as SyncType, label: 'Classes', icon: GraduationCap, color: 'teal' },
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
    return `${baseClass} bg-${color}-600 text-white hover:bg-${color}-700`;
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={() => handleSync('all')}
        disabled={syncStatus['all'] === 'syncing'}
        className={getButtonClass('all', 'blue')}
      >
        <RefreshCw className={`w-5 h-5 ${syncStatus['all'] === 'syncing' ? 'animate-spin' : ''}`} />
        {syncStatus['all'] === 'syncing' ? 'Syncing All...' : 'Sync All Data'}
      </button>

      <div className="border-t pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Sync Individual Tables:</h3>
        <div className="grid grid-cols-2 gap-2">
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
    </div>
  );
}
