import { useState, useRef } from 'react';
import { RefreshCw, Users, Calendar, DollarSign, MapPin, UserCog, Package, Database, Grid3x3, Tag, ShoppingCart, Link2, CreditCard, FileText, ChevronDown, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface SyncButtonProps {
  onSyncComplete?: () => void;
}

type SyncType = 'quick' | 'all' | 'sites' | 'locations' | 'staff' | 'programs' | 'services' | 'staff_services' | 'pricing_options' | 'clients' | 'appointments' | 'sales' | 'retail_products' | 'build_pricing_links' | 'client_services' | 'transactions' | 'sst_diag_plain' | 'sst_diag_plain_with_token' | 'sst_diag_request_dot' | 'sst_diag_request_dot_with_token';

interface SyncStatus {
  [key: string]: 'idle' | 'syncing' | 'success' | 'error';
}

interface QuickSyncStep {
  label: string;
  payload: Record<string, unknown>;
}

interface QuickStepResult {
  label: string;
  status: 'success' | 'error' | 'pending' | 'running';
  records?: number;
  durationSec?: number;
  error?: string;
}

const QUICK_SYNC_STEPS: QuickSyncStep[] = [
  { label: 'Sites', payload: { syncType: 'sites' } },
  { label: 'Locations', payload: { syncType: 'locations' } },
  { label: 'Staff', payload: { syncType: 'staff' } },
  { label: 'Service Categories', payload: { syncType: 'programs' } },
  { label: 'Session Types', payload: { syncType: 'services' } },
  { label: 'Staff Services', payload: { syncType: 'staff_services' } },
  { label: 'Pricing Options (1/3)', payload: { syncType: 'pricing_options', pageOffset: 0, pageLimit: 100 } },
  { label: 'Pricing Options (2/3)', payload: { syncType: 'pricing_options', pageOffset: 100, pageLimit: 100 } },
  { label: 'Pricing Options (3/3)', payload: { syncType: 'pricing_options', pageOffset: 200, pageLimit: 100 } },
  { label: 'Price-Service Links', payload: { syncType: 'build_pricing_links' } },
  { label: 'Clients', payload: { syncType: 'clients' } },
  { label: 'Appointments', payload: { syncType: 'appointments', month: new Date().getMonth() + 1 } },
  { label: 'Sales', payload: { syncType: 'sales', month: new Date().getMonth() + 1 } },
  { label: 'Client Services', payload: { syncType: 'client_services', month: new Date().getMonth() + 1 } },
  { label: 'Retail Products', payload: { syncType: 'retail_products' } },
];

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

async function callEdgeFunction(payload: Record<string, unknown>): Promise<{ ok: boolean; data?: any; error?: string }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(`${supabaseUrl}/functions/v1/mindbody-sync`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok || data?.error) {
    return { ok: false, error: data?.error || data?.message || `HTTP ${response.status}` };
  }
  return { ok: true, data };
}

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

  const [quickSteps, setQuickSteps] = useState<QuickStepResult[]>([]);
  const [quickRunning, setQuickRunning] = useState(false);
  const [quickSummary, setQuickSummary] = useState<string | null>(null);
  const abortRef = useRef(false);

  const handleYearChange = (syncType: string, year: number) => {
    setSelectedYears(prev => ({ ...prev, [syncType]: year }));
  };

  const handleMonthChange = (syncType: string, month: number) => {
    setSelectedMonths(prev => ({ ...prev, [syncType]: month }));
  };

  const handleQuickSync = async () => {
    if (quickRunning) return;
    abortRef.current = false;
    setQuickRunning(true);
    setQuickSummary(null);
    setError(null);
    setSyncResult(null);

    const steps: QuickStepResult[] = QUICK_SYNC_STEPS.map(s => ({
      label: s.label,
      status: 'pending' as const,
    }));
    setQuickSteps([...steps]);

    const overallStart = Date.now();
    let successCount = 0;
    let errorCount = 0;
    let totalRecords = 0;

    for (let i = 0; i < QUICK_SYNC_STEPS.length; i++) {
      if (abortRef.current) break;

      steps[i] = { ...steps[i], status: 'running' };
      setQuickSteps([...steps]);

      const stepStart = Date.now();
      const result = await callEdgeFunction(QUICK_SYNC_STEPS[i].payload);
      const durationSec = Math.round((Date.now() - stepStart) / 1000);

      if (result.ok) {
        const records = result.data?.totalRecords ?? result.data?.records_synced ?? 0;
        steps[i] = { ...steps[i], status: 'success', records, durationSec };
        successCount++;
        totalRecords += typeof records === 'number' ? records : 0;
      } else {
        steps[i] = { ...steps[i], status: 'error', error: result.error, durationSec };
        errorCount++;
      }
      setQuickSteps([...steps]);
    }

    const totalSec = Math.round((Date.now() - overallStart) / 1000);
    const totalMin = Math.floor(totalSec / 60);
    const remainSec = totalSec % 60;
    const timeStr = totalMin > 0 ? `${totalMin}m ${remainSec}s` : `${totalSec}s`;

    setQuickSummary(
      `Done in ${timeStr}: ${successCount} succeeded, ${errorCount} failed, ${totalRecords} records total`
    );
    setQuickRunning(false);

    if (onSyncComplete) onSyncComplete();
  };

  const handleSync = async (syncType: SyncType, year?: number, month?: number) => {
    if (syncType === 'quick') {
      handleQuickSync();
      return;
    }

    const monthLabel = month ? `-${String(month).padStart(2, '0')}` : '';
    console.log(`Starting sync for: ${syncType}${year ? ` (period: ${year}${monthLabel})` : ''}`);
    setSyncStatus(prev => ({ ...prev, [syncType]: 'syncing' }));
    setError(null);
    setSyncResult(null);

    try {
      const payload: Record<string, unknown> = { syncType };
      if (year) payload.year = year;
      if (month && month > 0) payload.month = month;

      const result = await callEdgeFunction(payload);

      if (!result.ok) {
        throw new Error(result.error || 'Sync failed');
      }

      setSyncStatus(prev => ({ ...prev, [syncType]: 'success' }));
      setSyncResult(JSON.stringify(result.data, null, 2));

      setTimeout(() => {
        setSyncStatus(prev => ({ ...prev, [syncType]: 'idle' }));
      }, 3000);

      if (onSyncComplete) onSyncComplete();
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
    { type: 'staff_services' as SyncType, label: 'Staff Services & Pay Rates', icon: Grid3x3, color: 'teal' },
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

  const currentStepIndex = quickSteps.findIndex(s => s.status === 'running');
  const quickProgressLabel = quickRunning && currentStepIndex >= 0
    ? `Step ${currentStepIndex + 1} of ${QUICK_SYNC_STEPS.length}: ${quickSteps[currentStepIndex].label}...`
    : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Quick Sync */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <button
            onClick={() => handleSync('quick')}
            disabled={quickRunning}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium shadow-sm transition-all duration-200 ${
              quickRunning
                ? 'bg-gray-400 text-white cursor-wait'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            <RefreshCw className={`w-5 h-5 ${quickRunning ? 'animate-spin' : ''}`} />
            {quickRunning ? 'Quick Syncing...' : 'Quick Sync (Main Tables)'}
          </button>

          <button
            onClick={() => handleSync('all')}
            disabled={syncStatus['all'] === 'syncing' || quickRunning}
            className={getButtonClass('all', 'slate')}
          >
            <RefreshCw className={`w-5 h-5 ${syncStatus['all'] === 'syncing' ? 'animate-spin' : ''}`} />
            {syncStatus['all'] === 'syncing' ? 'Full Syncing...' : 'Full Sync (All Data)'}
          </button>
        </div>

        {/* Quick Sync progress panel */}
        {(quickSteps.length > 0) && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
            {quickProgressLabel && (
              <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                <Loader2 className="w-4 h-4 animate-spin" />
                {quickProgressLabel}
              </div>
            )}

            <div className="grid grid-cols-3 gap-1.5">
              {quickSteps.map((step, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded ${
                    step.status === 'success' ? 'bg-green-50 text-green-700' :
                    step.status === 'error' ? 'bg-red-50 text-red-700' :
                    step.status === 'running' ? 'bg-blue-50 text-blue-700' :
                    'bg-gray-100 text-gray-400'
                  }`}
                >
                  {step.status === 'success' && <CheckCircle2 className="w-3 h-3 flex-shrink-0" />}
                  {step.status === 'error' && <XCircle className="w-3 h-3 flex-shrink-0" />}
                  {step.status === 'running' && <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />}
                  {step.status === 'pending' && <div className="w-3 h-3 rounded-full border border-gray-300 flex-shrink-0" />}
                  <span className="truncate">{step.label}</span>
                  {step.durationSec != null && (
                    <span className="ml-auto text-[10px] opacity-70 flex-shrink-0">{step.durationSec}s</span>
                  )}
                </div>
              ))}
            </div>

            {quickSummary && (
              <div className="text-xs font-medium text-gray-600 pt-1 border-t border-gray-200">
                {quickSummary}
              </div>
            )}

            {quickSteps.some(s => s.status === 'error' && s.error) && (
              <div className="text-xs text-red-600 space-y-0.5 pt-1">
                {quickSteps.filter(s => s.status === 'error' && s.error).map((s, i) => (
                  <div key={i}><span className="font-medium">{s.label}:</span> {s.error}</div>
                ))}
              </div>
            )}
          </div>
        )}
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
                disabled={syncStatus[type] === 'syncing' || quickRunning}
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
              disabled={syncStatus[type] === 'syncing' || quickRunning}
              className={getButtonClass(type, color)}
            >
              <Icon className={`w-4 h-4 ${syncStatus[type] === 'syncing' ? 'animate-spin' : ''}`} />
              <span className="text-sm">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-sm font-semibold text-red-700 mb-2">SST Diagnostic (tests first 3 staff, 4 URL variants):</h3>
        <div className="grid grid-cols-2 gap-2">
          {([
            { type: 'sst_diag_plain' as SyncType, label: 'staffsessiontypes?staffId=X', desc: 'Current URL, source headers' },
            { type: 'sst_diag_plain_with_token' as SyncType, label: 'staffsessiontypes?staffId=X + Token', desc: 'Current URL, Bearer token' },
            { type: 'sst_diag_request_dot' as SyncType, label: 'sessiontypes?request.staffId=X', desc: 'Alt URL, source headers' },
            { type: 'sst_diag_request_dot_with_token' as SyncType, label: 'sessiontypes?request.staffId=X + Token', desc: 'Alt URL, Bearer token' },
          ]).map(({ type, label, desc }) => (
            <button
              key={type}
              onClick={() => handleSync(type)}
              disabled={syncStatus[type] === 'syncing' || quickRunning}
              className={`flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg font-medium shadow-sm transition-all duration-200 text-left ${
                syncStatus[type] === 'syncing' ? 'bg-gray-400 text-white cursor-wait' :
                syncStatus[type] === 'success' ? 'bg-green-500 text-white' :
                syncStatus[type] === 'error' ? 'bg-red-500 text-white' :
                'bg-red-700 hover:bg-red-800 text-white'
              }`}
            >
              <span className="text-xs font-mono leading-tight">{label}</span>
              <span className="text-[10px] opacity-75">{desc}</span>
              {syncStatus[type] === 'syncing' && <RefreshCw className="w-3 h-3 animate-spin" />}
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
