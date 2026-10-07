import { useState, useCallback } from 'react';
import {
  useReconciliationStatus,
  saveReconciliationBaseline,
  type RefCheck,
  type CaseCheck,
  type BaselineDrift,
  type UnknownPaymentType,
  type TariffQualityCheck,
  type StoredTotalsCheck,
  TARIFF_QUALITY_THRESHOLD_PCT,
  type ReconciliationResult,
} from '../hooks/useReconciliationData';
import { supabase } from '../lib/supabase';
import {
  ShieldCheck,
  ShieldAlert,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Save,
  Plus,
  ChevronDown,
  ChevronRight,
  Info,
} from 'lucide-react';

const fmt = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);

const fmtNum = (n: number) =>
  new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function StatusBadge({ ok, label, error }: { ok: boolean; label?: string; error?: string | null }) {
  if (error) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
      <AlertTriangle className="w-3 h-3" /> Error
    </span>
  );
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
      ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
         : 'bg-red-50 text-red-700 border border-red-200'
    }`}>
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label ?? (ok ? 'Pass' : 'Fail')}
    </span>
  );
}

function SectionHeader({ title, count, failCount, expanded, onToggle, extra }: {
  title: string; count: number; failCount: number;
  expanded: boolean; onToggle: () => void; extra?: React.ReactNode;
}) {
  return (
    <button onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors">
      <div className="flex items-center gap-3">
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
        <span className="font-semibold text-slate-800">{title}</span>
        <span className="text-xs text-slate-500">({count})</span>
      </div>
      <div className="flex items-center gap-2">
        {extra}
        {count > 0 && (failCount > 0
          ? <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">{failCount} failed</span>
          : <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">All pass</span>
        )}
      </div>
    </button>
  );
}

function ReferencesTable({ checks }: { checks: RefCheck[] }) {
  if (checks.length === 0) return <p className="text-sm text-slate-500 px-4 py-2">No reference values configured.</p>;
  const metricLabels: Record<string, string> = { sales_total: 'Sales total', sales_qty: 'Sales qty', staff_cost: 'Staff cost', money_received: 'Money received' };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left px-4 py-2 font-medium text-slate-600">Period</th>
            <th className="text-left px-4 py-2 font-medium text-slate-600">Metric</th>
            <th className="text-left px-4 py-2 font-medium text-slate-600">Location</th>
            <th className="text-right px-4 py-2 font-medium text-slate-600">Expected</th>
            <th className="text-right px-4 py-2 font-medium text-slate-600">Actual</th>
            <th className="text-right px-4 py-2 font-medium text-slate-600">Diff</th>
            <th className="text-center px-4 py-2 font-medium text-slate-600">Status</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c, i) => (
            <tr key={i} className={`border-b border-slate-100 ${c.error ? 'bg-amber-50/50' : !c.ok ? 'bg-red-50/50' : ''}`}>
              <td className="px-4 py-2 font-mono text-slate-700">{c.period}</td>
              <td className="px-4 py-2 text-slate-700">{metricLabels[c.metric] || c.metric}</td>
              <td className="px-4 py-2 text-slate-600">{c.location === 'all' ? 'All' : `#${c.location}`}</td>
              <td className="px-4 py-2 text-right font-mono text-slate-700">{fmtNum(c.expected)}</td>
              <td className="px-4 py-2 text-right font-mono text-slate-700">{c.error ? <span className="text-amber-600 text-xs">Error</span> : c.actual != null ? fmtNum(c.actual) : '--'}</td>
              <td className={`px-4 py-2 text-right font-mono ${c.diff && Math.abs(c.diff) > 0.01 ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                {c.error ? '--' : c.diff != null ? (c.diff >= 0 ? '+' : '') + fmtNum(c.diff) : '--'}
              </td>
              <td className="px-4 py-2 text-center"><StatusBadge ok={c.ok} error={c.error} /></td>
              {c.error && <td colSpan={7} className="px-4 py-1 text-xs text-amber-700 bg-amber-50">{c.error}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BaselineDriftsTable({ drifts }: { drifts: BaselineDrift[] }) {
  if (drifts.length === 0) return <p className="text-sm text-slate-500 px-4 py-2">No baseline drifts detected.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left px-4 py-2 font-medium text-slate-600">Period</th>
            <th className="text-left px-4 py-2 font-medium text-slate-600">Report</th>
            <th className="text-left px-4 py-2 font-medium text-slate-600">Key</th>
            <th className="text-right px-4 py-2 font-medium text-slate-600">Baseline</th>
            <th className="text-right px-4 py-2 font-medium text-slate-600">Current</th>
          </tr>
        </thead>
        <tbody>
          {drifts.map((d, i) => (
            <tr key={i} className="border-b border-slate-100 bg-amber-50/50">
              <td className="px-4 py-2 font-mono text-slate-700">{d.period}</td>
              <td className="px-4 py-2 text-slate-600">{d.report}</td>
              <td className="px-4 py-2 text-slate-700 max-w-[300px] truncate">{d.key}</td>
              <td className="px-4 py-2 text-right font-mono text-slate-600">{fmt(d.baselineValue)}{d.baselineQty ? ` (x${d.baselineQty})` : ''}</td>
              <td className="px-4 py-2 text-right font-mono text-amber-700 font-semibold">{fmt(d.currentValue)}{d.currentQty ? ` (x${d.currentQty})` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CasesTable({ cases }: { cases: CaseCheck[] }) {
  const [expandedCase, setExpandedCase] = useState<number | null>(null);
  if (cases.length === 0) return <p className="text-sm text-slate-500 px-4 py-2">No test cases configured.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-center px-3 py-2 font-medium text-slate-600">#</th>
            <th className="text-left px-3 py-2 font-medium text-slate-600">Description</th>
            <th className="text-left px-3 py-2 font-medium text-slate-600">Period</th>
            <th className="text-right px-3 py-2 font-medium text-slate-600">Exp.</th>
            <th className="text-right px-3 py-2 font-medium text-slate-600">Act.</th>
            <th className="text-right px-3 py-2 font-medium text-slate-600">Qty E/A</th>
            <th className="text-center px-3 py-2 font-medium text-slate-600">Status</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <>
              <tr key={c.caseNumber}
                className={`border-b border-slate-100 ${c.error ? 'bg-amber-50/50' : !c.ok ? 'bg-red-50/50' : ''} ${c.clientDetails.length > 0 ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                onClick={() => c.clientDetails.length > 0 && setExpandedCase(expandedCase === c.caseNumber ? null : c.caseNumber)}>
                <td className="px-3 py-2 text-center text-slate-500 font-mono">
                  {c.clientDetails.length > 0 && (
                    expandedCase === c.caseNumber
                      ? <ChevronDown className="w-3 h-3 inline mr-1" />
                      : <ChevronRight className="w-3 h-3 inline mr-1" />
                  )}
                  {c.caseNumber}
                </td>
                <td className="px-3 py-2 text-slate-700 max-w-[250px]">
                  <div className="truncate">{c.description}</div>
                  {c.note && <div className="text-xs text-slate-400 truncate mt-0.5">{c.note}</div>}
                </td>
                <td className="px-3 py-2 font-mono text-slate-600">{c.period}</td>
                <td className="px-3 py-2 text-right font-mono text-slate-600">{c.expectedValue != null ? fmtNum(c.expectedValue) : '--'}{c.tolerance != null ? ` \u00b1${fmtNum(c.tolerance)}` : ''}</td>
                <td className="px-3 py-2 text-right font-mono text-slate-700">{c.error ? <span className="text-amber-600 text-xs">Error</span> : c.actualValue != null ? fmtNum(c.actualValue) : '--'}</td>
                <td className="px-3 py-2 text-right font-mono text-slate-600">
                  {c.expectedQty != null ? c.expectedQty : '--'} / {c.actualQty != null ? c.actualQty : '--'}
                </td>
                <td className="px-3 py-2 text-center"><StatusBadge ok={c.ok} error={c.error} /></td>
              </tr>
              {expandedCase === c.caseNumber && c.clientDetails.length > 0 && (
                <tr key={`${c.caseNumber}-detail`}>
                  <td colSpan={7} className="px-6 py-2 bg-slate-50">
                    <div className="text-xs text-slate-600 mb-1 font-medium">Client rows for {c.clientId}:</div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-500">
                          <th className="text-left py-1 pr-4">Date</th>
                          <th className="text-left py-1 pr-4">Sale ID</th>
                          <th className="text-right py-1 pr-4">Amount</th>
                          <th className="text-left py-1">Rule</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.clientDetails.map((d, i) => (
                          <tr key={i} className="border-t border-slate-200/50">
                            <td className="py-1 pr-4 font-mono">{d.saleDate}</td>
                            <td className="py-1 pr-4 font-mono text-slate-500">{d.saleId}</td>
                            <td className="py-1 pr-4 text-right font-mono">{fmt(d.amount)}</td>
                            <td className="py-1 text-slate-500">{d.rule === 'fifo' ? 'FIFO' : 'Cash'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UnknownTypesTable({ types }: { types: UnknownPaymentType[] }) {
  if (types.length === 0) return <p className="text-sm text-emerald-600 px-4 py-2">All payment types are recognized.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left px-4 py-2 font-medium text-slate-600">Payment Type</th>
            <th className="text-right px-4 py-2 font-medium text-slate-600">Count</th>
            <th className="text-right px-4 py-2 font-medium text-slate-600">Total Amount</th>
          </tr>
        </thead>
        <tbody>
          {types.map((t, i) => (
            <tr key={i} className="border-b border-slate-100 bg-amber-50/50">
              <td className="px-4 py-2 font-mono text-amber-800">{t.type}</td>
              <td className="px-4 py-2 text-right text-slate-700">{t.saleCount}</td>
              <td className="px-4 py-2 text-right font-mono text-slate-700">{fmt(t.totalAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TariffQualityTable({ checks }: { checks: TariffQualityCheck[] }) {
  return (
    <div className="overflow-x-auto">
      <p className="text-xs text-slate-500 px-4 pt-3">
        Completed visits per month. Flagged when either share exceeds {TARIFF_QUALITY_THRESHOLD_PCT}% of the month's visits.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left px-4 py-2 font-medium text-slate-600">Period</th>
            <th className="text-right px-4 py-2 font-medium text-slate-600">Visits</th>
            <th className="text-right px-4 py-2 font-medium text-slate-600">Package without tariff</th>
            <th className="text-right px-4 py-2 font-medium text-slate-600">"Visits without tariff" (Margin by Service)</th>
            <th className="text-center px-4 py-2 font-medium text-slate-600">Status</th>
          </tr>
        </thead>
        <tbody>
          {checks.map(c => {
            const pkgBad = c.packageWithoutTariffPct > TARIFF_QUALITY_THRESHOLD_PCT;
            const visBad = c.visitsWithoutTariffPct > TARIFF_QUALITY_THRESHOLD_PCT;
            return (
              <tr key={c.period} className={`border-b border-slate-100 ${c.error ? 'bg-amber-50/50' : !c.ok ? 'bg-red-50/50' : ''}`}>
                <td className="px-4 py-2 font-mono text-slate-700">{c.period}</td>
                <td className="px-4 py-2 text-right font-mono text-slate-700">{c.error ? '--' : c.totalVisits}</td>
                <td className={`px-4 py-2 text-right font-mono ${pkgBad ? 'text-red-600 font-semibold' : 'text-slate-700'}`}>
                  {c.error ? '--' : `${c.packageWithoutTariff} (${c.packageWithoutTariffPct}%)`}
                </td>
                <td className={`px-4 py-2 text-right font-mono ${visBad ? 'text-red-600 font-semibold' : 'text-slate-700'}`}>
                  {c.error ? '--' : `${c.visitsWithoutTariff} (${c.visitsWithoutTariffPct}%)`}
                </td>
                <td className="px-4 py-2 text-center"><StatusBadge ok={c.ok} error={c.error} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const LOCATION_LABELS: Record<string, string> = { all: 'All', '1': 'Center', '3': 'Alfa' };

function StoredTotalsTable({ checks }: { checks: StoredTotalsCheck[] }) {
  if (checks.length === 0) return <p className="text-sm text-slate-400 px-4 py-3">No reference months to check.</p>;
  return (
    <div className="overflow-x-auto">
      <p className="text-xs text-slate-500 px-4 pt-3">
        The Overview reads totals saved by the nightly job. For each reference month they are recalculated now and must match.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left px-4 py-2 font-medium text-slate-600">Period</th>
            <th className="text-left px-4 py-2 font-medium text-slate-600">Location</th>
            <th className="text-left px-4 py-2 font-medium text-slate-600">Metric</th>
            <th className="text-right px-4 py-2 font-medium text-slate-600">Saved</th>
            <th className="text-right px-4 py-2 font-medium text-slate-600">Recalculated</th>
            <th className="text-center px-4 py-2 font-medium text-slate-600">Status</th>
          </tr>
        </thead>
        <tbody>
          {checks.map(c => (
            <tr key={`${c.period}|${c.location}|${c.metric}`} className={`border-b border-slate-100 ${!c.ok ? 'bg-red-50/50' : ''}`}>
              <td className="px-4 py-2 font-mono text-slate-700">{c.period}</td>
              <td className="px-4 py-2 text-slate-700">{LOCATION_LABELS[c.location] || c.location}</td>
              <td className="px-4 py-2 text-slate-700">{c.metric}</td>
              <td className="px-4 py-2 text-right font-mono text-slate-700">{c.stored === null ? 'not saved' : c.stored.toFixed(2)}</td>
              <td className="px-4 py-2 text-right font-mono text-slate-700">{c.recomputed.toFixed(2)}</td>
              <td className="px-4 py-2 text-center"><StatusBadge ok={c.ok} error={null} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddReferenceForm({ onAdded }: { onAdded: () => void }) {
  const [period, setPeriod] = useState('');
  const [metric, setMetric] = useState('sales_total');
  const [location, setLocation] = useState('all');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!period || !value) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('reconciliation_references').upsert(
        { period, metric, location, value: parseFloat(value) },
        { onConflict: 'period,metric,location' },
      );
      if (error) throw error;
      setPeriod(''); setValue('');
      onAdded();
    } catch (err) {
      console.error('Failed to save reference:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3 px-4 py-3 bg-slate-50 rounded-lg flex-wrap">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Period</label>
        <input type="text" placeholder="2026-07" value={period} onChange={(e) => setPeriod(e.target.value)}
          className="w-28 px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Metric</label>
        <select value={metric} onChange={(e) => setMetric(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
          <option value="sales_total">Sales Total</option>
          <option value="sales_qty">Sales Qty</option>
          <option value="staff_cost">Staff cost</option>
          <option value="money_received">Money received</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Location</label>
        <input type="text" placeholder="all" value={location} onChange={(e) => setLocation(e.target.value)}
          className="w-20 px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Value (Mindbody)</label>
        <input type="number" step="0.01" placeholder="18634.75" value={value} onChange={(e) => setValue(e.target.value)}
          className="w-36 px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
      </div>
      <button type="submit" disabled={saving || !period || !value}
        className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-md transition-colors">
        <Plus className="w-4 h-4" /> Add
      </button>
    </form>
  );
}

export interface ReconciliationPageProps {
  onResultChange?: (result: ReconciliationResult | null) => void;
}

export function ReconciliationPage({ onResultChange }: ReconciliationPageProps) {
  const { result, loading, check } = useReconciliationStatus();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    references: true, baseline: true, cases: true, unknown: true, tariff: true, stored: true,
  });
  const [savingBaseline, setSavingBaseline] = useState(false);
  const [baselineMsg, setBaselineMsg] = useState<string | null>(null);
  const [showAddRef, setShowAddRef] = useState(false);

  const toggle = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const handleCheck = useCallback(async () => {
    const r = await check();
    onResultChange?.(r ?? null);
  }, [check, onResultChange]);

  const handleSaveBaseline = useCallback(async () => {
    if (!result || !result.references.every(r => r.ok)) return;
    setSavingBaseline(true);
    setBaselineMsg(null);
    try {
      const saveResult = await saveReconciliationBaseline();
      setBaselineMsg(saveResult.message);
      if (saveResult.ok) handleCheck();
    } catch (err: any) {
      setBaselineMsg(`Failed to save baseline: ${err?.message || err}`);
    } finally {
      setSavingBaseline(false);
    }
  }, [result, handleCheck]);

  const refFails = result ? result.references.filter(r => !r.ok).length : 0;
  const caseFails = result ? result.cases.filter(c => !c.ok).length : 0;
  const tariffFails = result ? result.tariffQuality.filter(t => !t.ok) : [];
  const storedFails = result ? result.storedTotals.filter(s => !s.ok).length : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {result ? (
            result.allOk ? (
              <div className="p-2 bg-emerald-100 rounded-lg"><ShieldCheck className="w-6 h-6 text-emerald-600" /></div>
            ) : (
              <div className="p-2 bg-red-100 rounded-lg"><ShieldAlert className="w-6 h-6 text-red-600" /></div>
            )
          ) : (
            <div className="p-2 bg-slate-100 rounded-lg"><ShieldCheck className="w-6 h-6 text-slate-400" /></div>
          )}
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Reconciliation Checks</h3>
            {result && <p className="text-xs text-slate-500 mt-0.5">Last checked: {new Date(result.checkedAt).toLocaleString('de-DE')}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {result && result.allOk && (
            <button onClick={handleSaveBaseline} disabled={savingBaseline}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors disabled:opacity-50">
              {savingBaseline ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save as Baseline
            </button>
          )}
          <button onClick={handleCheck} disabled={loading}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors shadow-sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {loading ? 'Checking...' : 'Check Now'}
          </button>
        </div>
      </div>

      {baselineMsg && (
        <div className={`px-4 py-2 rounded-lg text-sm ${baselineMsg.includes('success') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
          {baselineMsg}
        </div>
      )}

      {!result && !loading && (
        <div className="text-center py-12 text-slate-400">
          <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Press "Check Now" to run all reconciliation checks.</p>
        </div>
      )}

      {loading && !result && (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 mx-auto mb-3 text-blue-500 animate-spin" />
          <p className="text-sm text-slate-500">Running FIFO calculations for each period...</p>
          <p className="text-xs text-slate-400 mt-1">This may take a moment</p>
        </div>
      )}

      {result && (
        <>
          {result.allOk ? (
            <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="text-sm font-medium text-emerald-800">
                All checks passed — report totals match Mindbody reference values.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              <span className="text-sm font-medium text-red-800">
                {refFails + caseFails + result.baselineDrifts.length + result.unknownPaymentTypes.length + tariffFails.length + storedFails} issue(s) detected.
              </span>
            </div>
          )}

          {tariffFails.some(t => !t.error) && (
            <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-300 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <span className="text-sm text-amber-900">
                <span className="font-semibold">Data quality warning:</span> over {TARIFF_QUALITY_THRESHOLD_PCT}% of visits have no tariff in{' '}
                {tariffFails.filter(t => !t.error).map(t => t.period).join(', ')}. Revenue and margin for these months are understated; check the package sync.
              </span>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0" /> Data loading errors:
              </div>
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-amber-700 pl-6">{e}</p>
              ))}
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <SectionHeader title="Mindbody Reference Values" count={result.references.length}
              failCount={refFails} expanded={expanded.references} onToggle={() => toggle('references')} />
            {expanded.references && (
              <div className="border-t border-slate-100">
                <ReferencesTable checks={result.references} />
                <div className="px-4 py-2 border-t border-slate-100">
                  <button onClick={() => setShowAddRef(!showAddRef)}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                    <Plus className="w-3 h-3" /> {showAddRef ? 'Hide form' : 'Add reference value'}
                  </button>
                  {showAddRef && <div className="mt-2"><AddReferenceForm onAdded={handleCheck} /></div>}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <SectionHeader title="Baseline Drifts" count={result.baselineDrifts.length}
              failCount={result.baselineDrifts.length} expanded={expanded.baseline}
              onToggle={() => toggle('baseline')}
              extra={!result.baselineExists ? (
                <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  <Info className="w-3 h-3" /> Baseline not created
                </span>
              ) : undefined} />
            {expanded.baseline && (
              <div className="border-t border-slate-100">
                {!result.baselineExists
                  ? <p className="text-sm text-amber-600 px-4 py-3">No baseline snapshot has been saved yet. Run checks and click "Save as Baseline" when all references pass.</p>
                  : <BaselineDriftsTable drifts={result.baselineDrifts} />}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <SectionHeader title="Test Cases" count={result.cases.length} failCount={caseFails}
              expanded={expanded.cases} onToggle={() => toggle('cases')} />
            {expanded.cases && (
              <div className="border-t border-slate-100">
                <CasesTable cases={result.cases} />
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <SectionHeader title="Unknown Payment Types" count={result.unknownPaymentTypes.length}
              failCount={result.unknownPaymentTypes.length} expanded={expanded.unknown}
              onToggle={() => toggle('unknown')} />
            {expanded.unknown && (
              <div className="border-t border-slate-100">
                <UnknownTypesTable types={result.unknownPaymentTypes} />
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <SectionHeader title="Data Quality: Visits Without Tariff" count={result.tariffQuality.length}
              failCount={tariffFails.length} expanded={expanded.tariff}
              onToggle={() => toggle('tariff')} />
            {expanded.tariff && (
              <div className="border-t border-slate-100">
                <TariffQualityTable checks={result.tariffQuality} />
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <SectionHeader title="Saved Overview Totals = Recalculation" count={result.storedTotals.length}
              failCount={storedFails} expanded={expanded.stored}
              onToggle={() => toggle('stored')} />
            {expanded.stored && (
              <div className="border-t border-slate-100">
                <StoredTotalsTable checks={result.storedTotals} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
