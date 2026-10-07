import { SyncButton } from './SyncButton';
import { SyncHistory } from './SyncHistory';
import { ApiLogs } from './ApiLogs';
import { RawApiData } from './RawApiData';
import { ActivationCode } from './ActivationCode';
import { StaffRatesManager } from './StaffRatesManager';
import { ReconciliationPage } from './ReconciliationPage';
import { SimplePage } from './PageHeader';
import type { ReconciliationResult } from '../hooks/useReconciliationData';
import { Key } from 'lucide-react';

export type AdminTab = 'sync' | 'sync-history' | 'api-logs' | 'raw-api' | 'staff-rates' | 'reconciliation';

interface ApiIntegrationProps {
  tab: AdminTab;
  onSyncComplete?: () => void;
  onReconciliationResult?: (result: ReconciliationResult | null) => void;
}

export function ApiIntegration({ tab, onSyncComplete, onReconciliationResult }: ApiIntegrationProps) {
  if (tab === 'sync-history') return <SyncHistory />;

  return (
    <SimplePage section={tab}>
      {tab === 'sync' && (
        <div className="max-w-4xl space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 p-2 rounded-lg">
                <Key className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-blue-900 mb-1">Authentication Status</h3>
                <p className="text-sm text-blue-800">
                  System configured with Source Credentials. All read operations are working.
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

          <ActivationCode />
        </div>
      )}

      {tab === 'api-logs' && <ApiLogs />}
      {tab === 'raw-api' && <RawApiData />}

      {tab === 'staff-rates' && (
        <div className="max-w-5xl">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <StaffRatesManager />
          </div>
        </div>
      )}

      {tab === 'reconciliation' && (
        <div className="max-w-6xl">
          <ReconciliationPage onResultChange={onReconciliationResult} />
        </div>
      )}
    </SimplePage>
  );
}
