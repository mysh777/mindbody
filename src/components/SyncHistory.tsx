import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchAllRows } from '../lib/fetchAllPages';
import { errorMessage } from '../utils/errorMessage';
import { PagePurpose } from './PageHeader';
import { LoadErrorBanner } from './LoadErrorBanner';
import { SyncRunRow, STATUS_COLORS, StatusBadge, formatDate, formatTime, runStatusLabel } from './SyncRunRow';
import { groupSyncRuns, friendlyType, runTitle, RUN_KIND_LABELS } from '../utils/syncRuns';
import type { RunKind, RunStep, SyncRunGroup } from '../utils/syncRuns';
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Database,
  Filter,
  Moon,
} from 'lucide-react';
import type { SyncLog } from '../types/mindbody';

type SortField = 'started_at' | 'run' | 'status' | 'records' | 'duration';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 25;

const STATUS_OPTIONS = ['completed', 'warning', 'partial', 'error', 'failed', 'timeout', 'started'] as const;
const RUN_KIND_OPTIONS: RunKind[] = ['nightly', 'quick', 'full', 'manual', 'time_grouped'];
const STATUS_RANK: Record<SyncRunGroup['status'], number> = { error: 0, warning: 1, running: 2, completed: 3 };

export function SyncHistory() {
  const [allLogs, setAllLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showMaintenance, setShowMaintenance] = useState(false);

  const [sortField, setSortField] = useState<SortField>('started_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setAllLogs(await fetchAllRows<SyncLog>('sync_logs', '*'));
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const allRuns = useMemo(() => groupSyncRuns(allLogs), [allLogs]);
  const typeOptions = useMemo(() => [...new Set(allLogs.map(l => l.sync_type))].sort(), [allLogs]);
  const maintenanceCount = useMemo(() => allRuns.filter(r => r.kind === 'maintenance').length, [allRuns]);
  const lastNightly = useMemo(() => allRuns.find(r => r.kind === 'nightly'), [allRuns]);

  const hasStepFilter = statusFilter.size > 0 || !!typeFilter || !!searchQuery;
  const query = searchQuery.toLowerCase();

  const stepMatches = useCallback((step: RunStep) => {
    const l = step.log;
    if (statusFilter.size > 0 && !statusFilter.has(l.status)) return false;
    if (typeFilter && l.sync_type !== typeFilter) return false;
    if (query && !(
      l.sync_type.toLowerCase().includes(query) ||
      step.label.toLowerCase().includes(query) ||
      l.status.toLowerCase().includes(query) ||
      (l.error_message?.toLowerCase().includes(query) ?? false)
    )) return false;
    return true;
  }, [statusFilter, typeFilter, query]);

  const isHighlighted = useCallback((step: RunStep) => hasStepFilter && stepMatches(step), [hasStepFilter, stepMatches]);

  const filtered = useMemo(() => {
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;
    const result = allRuns.filter(run => {
      if (run.kind === 'maintenance' && !showMaintenance) return false;
      if (kindFilter && run.kind !== kindFilter) return false;
      if (from != null && run.startedAt < from) return false;
      if (to != null && run.startedAt > to) return false;
      if (!hasStepFilter) return true;
      return run.steps.some(stepMatches) || (!!query && runTitle(run).toLowerCase().includes(query) && statusFilter.size === 0 && !typeFilter);
    });

    return result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'started_at': cmp = a.startedAt - b.startedAt; break;
        case 'run': cmp = runTitle(a).localeCompare(runTitle(b)); break;
        case 'status': cmp = STATUS_RANK[a.status] - STATUS_RANK[b.status]; break;
        case 'records': cmp = a.records - b.records; break;
        case 'duration': cmp = (a.endedAt - a.startedAt) - (b.endedAt - b.startedAt); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [allRuns, showMaintenance, kindFilter, dateFrom, dateTo, hasStepFilter, stepMatches, query, statusFilter, typeFilter, sortField, sortDir]);

  const stats = useMemo(() => {
    const s = { total: filtered.length, completed: 0, warning: 0, error: 0, running: 0, records: 0 };
    for (const r of filtered) {
      s[r.status]++;
      s.records += r.records;
    }
    return s;
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePageNum = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(safePageNum * PAGE_SIZE, (safePageNum + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [statusFilter, typeFilter, kindFilter, searchQuery, dateFrom, dateTo, sortField, sortDir, showMaintenance]);

  const toggleStatus = (s: string) => {
    setStatusFilter(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  const toggleExpanded = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'started_at' ? 'desc' : 'asc');
    }
  };

  const SortHeader = ({ field, label, align = 'left' }: { field: SortField; label: string; align?: 'left' | 'right' }) => (
    <th className={`px-3 py-3 text-${align}`}>
      <button onClick={() => handleSort(field)} className={`flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900 ${align === 'right' ? 'ml-auto' : ''}`}>
        {label}
        {sortField !== field
          ? <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />
          : sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />}
      </button>
    </th>
  );

  const hasAnyFilter = hasStepFilter || !!kindFilter || !!dateFrom || !!dateTo;

  const clearAll = () => {
    setStatusFilter(new Set());
    setTypeFilter('');
    setKindFilter('');
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Database className="w-6 h-6 text-blue-500" />
          Sync History
        </h2>
        <PagePurpose section="sync-history" />
        <p className="text-slate-600 mt-1 text-sm">
          Synchronization runs from the Mindbody API, one row per run&nbsp;&mdash;&nbsp;{allRuns.length} runs, {allLogs.length} steps stored, no automatic cleanup
        </p>
        {lastNightly && (
          <button
            onClick={() => { setExpanded(prev => new Set(prev).add(lastNightly.key)); clearAll(); }}
            className="mt-3 inline-flex flex-wrap items-center gap-2 text-sm text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 transition-colors"
          >
            <Moon className="w-4 h-4 text-slate-500" />
            <span>Last nightly sync: <span className="font-medium text-slate-900">{formatDate(lastNightly.startedAt)} {formatTime(lastNightly.startedAt)}</span></span>
            <span className="text-slate-400">&mdash;</span>
            <StatusBadge status={lastNightly.status} />
            <span className="text-slate-500">
              {lastNightly.status === 'running' ? runStatusLabel(lastNightly).replace(/^Running /, '') : `(${lastNightly.steps.length} steps)`}
            </span>
          </button>
        )}
      </div>

      <div className="p-6 space-y-5">
        {loadError && <LoadErrorBanner title="Could not load sync history" message={loadError} onRetry={loadAll} />}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Runs', value: stats.total, label_cls: 'text-slate-600', value_cls: 'text-slate-900' },
            { label: 'Completed', value: stats.completed, label_cls: 'text-emerald-600', value_cls: 'text-emerald-900' },
            { label: 'Warning', value: stats.warning, label_cls: 'text-yellow-700', value_cls: 'text-yellow-900' },
            { label: 'Error', value: stats.error, label_cls: 'text-red-600', value_cls: 'text-red-900' },
            { label: 'Running', value: stats.running, label_cls: 'text-blue-600', value_cls: 'text-blue-900' },
            { label: 'Records synced', value: stats.records.toLocaleString(), label_cls: 'text-slate-600', value_cls: 'text-slate-900' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-lg border border-slate-200 px-4 py-3">
              <div className={`text-xs font-medium ${s.label_cls} uppercase tracking-wider mb-0.5`}>{s.label}</div>
              <div className={`text-xl font-bold ${s.value_cls}`}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">Filters</span>
            {hasStepFilter && <span className="text-xs text-slate-500">Runs with at least one matching step; matching steps are highlighted</span>}
            {hasAnyFilter && (
              <button onClick={clearAll} className="ml-auto text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                <X className="w-3 h-3" /> Clear all
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <div className="text-xs text-slate-500 mb-1.5">Step status</div>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_OPTIONS.map(s => {
                  const active = statusFilter.has(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggleStatus(s)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                        active ? `${STATUS_COLORS[s].badge} border-current shadow-sm` : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {s === 'started' ? 'Running' : s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500 mb-1.5">Run type</div>
              <select
                value={kindFilter}
                onChange={e => setKindFilter(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 min-w-[160px]"
              >
                <option value="">All runs</option>
                {RUN_KIND_OPTIONS.map(k => <option key={k} value={k}>{RUN_KIND_LABELS[k]}</option>)}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500 mb-1.5">Step</div>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 min-w-[180px]"
              >
                <option value="">All steps</option>
                {typeOptions.map(t => <option key={t} value={t}>{friendlyType(t)}</option>)}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500 mb-1.5">Date Range</div>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                />
                <span className="text-slate-400 text-xs">&ndash;</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                />
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500 mb-1.5">Search</div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Step, status, message..."
                  className="pl-8 pr-7 py-1.5 border border-slate-300 rounded-lg text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {maintenanceCount > 0 && (
              <label className="flex items-center gap-2 text-sm text-slate-600 self-end pb-1.5 cursor-pointer">
                <input type="checkbox" checked={showMaintenance} onChange={e => setShowMaintenance(e.target.checked)} className="rounded border-slate-300" />
                Show maintenance ({maintenanceCount})
              </label>
            )}

            <button
              onClick={loadAll}
              disabled={loading}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 ml-auto self-end"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-7 h-7 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-500">Loading sync history...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Database className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">
                {hasAnyFilter ? 'No runs match the current filters' : 'No sync history available'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="w-6" />
                      <SortHeader field="run" label="Run" />
                      <SortHeader field="started_at" label="Date" />
                      <th className="px-3 py-3 text-left font-medium text-slate-600">Time</th>
                      <SortHeader field="duration" label="Duration" align="right" />
                      <th className="px-3 py-3 text-right font-medium text-slate-600">Steps</th>
                      <th className="px-3 py-3 text-left font-medium text-slate-600">Result</th>
                      <SortHeader field="records" label="Records" align="right" />
                      <SortHeader field="status" label="Status" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageItems.map(run => (
                      <SyncRunRow
                        key={run.key}
                        run={run}
                        expanded={expanded.has(run.key)}
                        onToggle={() => toggleExpanded(run.key)}
                        isHighlighted={isHighlighted}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50">
                  <span className="text-xs text-slate-500">
                    Showing {safePageNum * PAGE_SIZE + 1}&ndash;{Math.min((safePageNum + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} runs
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={safePageNum === 0}
                      className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 7 || safePageNum < 4) pageNum = i;
                      else if (safePageNum > totalPages - 5) pageNum = totalPages - 7 + i;
                      else pageNum = safePageNum - 3 + i;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                            safePageNum === pageNum ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {pageNum + 1}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={safePageNum >= totalPages - 1}
                      className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
