import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { loadUsage, cycleCost, formatUsd, FREE_CALLS_PER_CYCLE } from '../utils/mindbodyUsage';
import type { UsageSummary } from '../utils/mindbodyUsage';
import { errorMessage } from '../utils/errorMessage';

interface SyncCostConfirmProps {
  title: string;
  estimatedCalls: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SyncCostConfirm({ title, estimatedCalls, onConfirm, onCancel }: SyncCostConfirmProps) {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUsage().then(setUsage).catch(err => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const afterRun = usage ? usage.projected + estimatedCalls : null;
  const pushesOver = usage != null && afterRun! > FREE_CALLS_PER_CYCLE && usage.projected <= FREE_CALLS_PER_CYCLE;
  const over = afterRun != null && afterRun > FREE_CALLS_PER_CYCLE;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-200" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-start justify-between px-5 pt-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            <p className="text-sm text-slate-500 mt-1">Each request to Mindbody is billed once the cycle passes {FREE_CALLS_PER_CYCLE.toLocaleString()}.</p>
          </div>
          <button onClick={onCancel} className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-600">This run, approximately</span><span className="font-semibold text-slate-900">{estimatedCalls.toLocaleString()} requests</span></div>
          {error && <div className="text-red-700">Could not load current usage: {error}</div>}
          {!usage && !error && <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading current usage…</div>}
          {usage && (
            <>
              <div className="flex justify-between"><span className="text-slate-600">Used this cycle</span><span className="text-slate-900">{usage.cycleSoFar.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Projected for cycle with this run</span><span className={`font-semibold ${over ? 'text-amber-700' : 'text-slate-900'}`}>{afterRun!.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Projected bill</span><span className={`font-semibold ${over ? 'text-amber-700' : 'text-emerald-700'}`}>{formatUsd(cycleCost(afterRun!))}</span></div>
            </>
          )}
          {pushesOver && (
            <div className="flex gap-2 mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-900">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
              This run would take the cycle over the free limit, and then every request in the cycle is billed.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors">Start sync</button>
        </div>
      </div>
    </div>
  );
}
