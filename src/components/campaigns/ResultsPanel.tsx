import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarRange, FileSpreadsheet, Loader2, Printer, RefreshCw } from 'lucide-react';
import { LocationFilter } from '../LocationFilter';
import { handlePrint, buildPrintFileName, rangePeriod } from '../../utils/printReport';
import { toLocalISO } from '../../utils/datePresets';
import { computeCampaign, type CampaignResult, type PeriodMode } from '../../utils/campaignResults';
import { exportCampaign } from '../../utils/campaignExport';
import type { ClientList, ListMember } from '../../utils/campaignLists';
import { ResultsTable } from './ResultsTable';
import { ResultsSummary } from './ResultsSummary';
import { formatLead } from './MatchReview';

interface ResultsPanelProps {
  list: ClientList;
  members: ListMember[];
  onViewClient?: (clientId: string) => void;
}

function previousMonthRange() {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const end = new Date(d.getFullYear(), d.getMonth(), 0);
  return { start: toLocalISO(start), end: toLocalISO(end) };
}

const dateInput = 'text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500';

export function ResultsPanel({ list, members, onViewClient }: ResultsPanelProps) {
  const hasLeadDates = members.some(m => m.lead_at);
  const [mode, setMode] = useState<PeriodMode>(hasLeadDates ? 'sinceLead' : 'fixed');
  const [range, setRange] = useState(previousMonthRange);
  const [location, setLocation] = useState('all');
  const [locationLabel, setLocationLabel] = useState('All locations');
  const [result, setResult] = useState<CampaignResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const printRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => toLocalISO(new Date()), []);

  useEffect(() => {
    if (mode === 'fixed' && (!range.start || !range.end || range.start > range.end)) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    computeCampaign({ members, mode, range, location, today, withComparison: true })
      .then(r => { if (!cancelled) setResult(r); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [members, mode, range, location, today, reload]);

  const periodLabel = result
    ? mode === 'sinceLead'
      ? `From each person's lead date to today (${formatLead(result.overallRange.start)} - ${formatLead(today)})`
      : `${formatLead(range.start)} - ${formatLead(range.end)}`
    : '';

  return (
    <div ref={printRef} className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          {hasLeadDates && (
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              {([['sinceLead', 'From each lead date'], ['fixed', 'Fixed period']] as const).map(([id, label]) => (
                <button key={id} onClick={() => setMode(id)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {mode === 'fixed' && (
            <div className="flex flex-wrap items-center gap-2">
              <CalendarRange className="w-4 h-4 text-slate-400" />
              <input type="month" aria-label="Month" value={range.start.slice(0, 7) === range.end.slice(0, 7) ? range.start.slice(0, 7) : ''}
                onChange={e => {
                  if (!e.target.value) return;
                  const [y, m] = e.target.value.split('-').map(Number);
                  setRange({ start: `${e.target.value}-01`, end: toLocalISO(new Date(y, m, 0)) });
                }} className={dateInput} />
              <input type="date" aria-label="From" value={range.start} onChange={e => setRange(r => ({ ...r, start: e.target.value }))} className={dateInput} />
              <span className="text-slate-400">-</span>
              <input type="date" aria-label="To" value={range.end} onChange={e => setRange(r => ({ ...r, end: e.target.value }))} className={dateInput} />
            </div>
          )}
          <LocationFilter value={location} onChange={(id, name) => { setLocation(id); setLocationLabel(name); }} />
        </div>
        <div className="flex items-center gap-2">
          {result && !loading && (
            <>
              <button onClick={() => exportCampaign(result, { listName: list.name, periodLabel, locationLabel, campaignCost: list.campaign_cost })}
                className="px-4 py-2 bg-white text-emerald-700 border border-emerald-600 rounded-lg text-sm font-medium hover:bg-emerald-50 transition-colors flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />Excel
              </button>
              <button onClick={() => handlePrint(printRef, { fileName: buildPrintFileName({ report: 'Campaign', period: rangePeriod(range.start, range.end), location: locationLabel, detail: list.name }) })}
                className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2">
                <Printer className="w-4 h-4" />Print / PDF
              </button>
            </>
          )}
          <button onClick={() => setReload(n => n + 1)} disabled={loading}
            className="p-2 text-slate-500 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors" aria-label="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {mode === 'fixed' && range.start > range.end && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">The start date is after the end date.</div>
      )}
      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">Could not calculate the results: {error}</div>}

      {loading && !result && (
        <div className="bg-white border border-slate-200 rounded-xl py-20 flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
          <span className="text-sm">Calculating money, visits and packages for {members.length} people</span>
        </div>
      )}

      {result && (
        <div className={`space-y-5 transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="hidden print:block">
            <h2 className="text-xl font-bold text-slate-900">{list.name}</h2>
            <p className="text-sm text-slate-600">{periodLabel} · {locationLabel}</p>
          </div>
          <div className="text-sm text-slate-500 print:hidden">{periodLabel} · {locationLabel}</div>
          <ResultsSummary result={result} campaignCost={list.campaign_cost} />
          <ResultsTable clients={result.clients} showLead={hasLeadDates} onViewClient={onViewClient} />
        </div>
      )}
    </div>
  );
}
