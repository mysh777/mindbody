import { useState } from 'react';
import { SyncButton } from './SyncButton';
import { SyncHistory } from './SyncHistory';
import { ApiLogs } from './ApiLogs';
import { RawApiData } from './RawApiData';
import { ActivationCode } from './ActivationCode';
import { StaffRatesManager } from './StaffRatesManager';
import { RefreshCw, History, FileText, FileJson, Key, UserCog } from 'lucide-react';

type ApiTab = 'sync' | 'history' | 'logs' | 'raw' | 'activation' | 'staff-rates';

interface ApiIntegrationProps {
  onSyncComplete?: () => void;
}

export function ApiIntegration({ onSyncComplete }: ApiIntegrationProps) {
  const [activeTab, setActiveTab] = useState<ApiTab>('sync');

  const tabs = [
    { id: 'sync' as ApiTab, label: 'Sync Data', icon: RefreshCw },
    { id: 'history' as ApiTab, label: 'Sync History', icon: History },
    { id: 'logs' as ApiTab, label: 'API Logs', icon: FileText },
    { id: 'raw' as ApiTab, label: 'Raw API Data', icon: FileJson },
    { id: 'activation' as ApiTab, label: 'Site Activation', icon: Key },
    { id: 'staff-rates' as ApiTab, label: 'Staff Rates', icon: UserCog },
  ];

  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="px-6 py-6">
          <h2 className="text-2xl font-bold text-slate-900">API Integration</h2>
          <p className="text-slate-600 mt-1">Manage Mindbody API connections and data synchronization</p>
        </div>

        <div className="flex border-t border-slate-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 bg-blue-50'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {activeTab === 'sync' && (
          <div className="max-w-4xl">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Key className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-blue-900 mb-1">Authentication Status</h3>
                  <p className="text-sm text-blue-800">
                    System configured with Source Credentials for Site ID: 197179. All read operations are working.
                  </p>
                  <p className="text-xs text-blue-700 mt-2">
                    Staff credentials are only needed for write operations (booking, payments, etc.)
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <SyncButton onSyncComplete={onSyncComplete} />
            </div>
          </div>
        )}

        {activeTab === 'history' && <SyncHistory />}
        {activeTab === 'logs' && <ApiLogs />}
        {activeTab === 'raw' && <RawApiData />}
        {activeTab === 'activation' && <ActivationCode />}
        {activeTab === 'staff-rates' && (
          <div className="max-w-5xl">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <StaffRatesManager />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
