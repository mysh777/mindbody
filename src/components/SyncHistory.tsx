import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { PagePurpose } from './PageHeader';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Timer,
  Database,
  Filter,
} from 'lucide-react';
import type { SyncLog } from '../types/mindbody';

type SortField = 'started_at' | 'sync_type' | 'status' | 'records_synced' | 'duration';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 30;

const STATUS_OPTIONS = ['completed', 'partial', 'error', 'failed', 'timeout', 'started'] as const;

const STATUS_COLORS: Record<string, { badge: string; icon: string }> = {
  completed: { badge: 'bg-emerald-100 text-emerald-700', icon: 'text-emerald-600' },
  partial:   { badge: 'bg-orange-100 text-orange-700',   icon: 'text-orange-600' },
  error:     { badge: 'bg-red-100 text-red-700',         icon: 'text-red-600' },
  failed:    { badge: 'bg-red-100 text-red-700',         icon: 'text-red-600' },
  timeout:   { badge: 'bg-amber-100 text-amber-700',     icon: 'text-amber-600' },
  started:   { badge: 'bg-blue-100 text-blue-700',       icon: 'text-blue-600' },
};

const statusIcon = (status: string) => {
  const cls = `w-4 h-4 ${STATUS_COLORS[status]?.icon ?? 'text-slate-400'}`;
  switch (status) {
    case 'completed': return <CheckCircle className={cls} />;
    case 'failed':
    case 'error':     return <XCircle className={cls} />;
    case 'timeout':   return <AlertCircle className={cls} />;
    case 'started':   return <Clock className={`${cls} animate-pulse`} />;
    default:          return <AlertCircle className={cls} />;
  }
};

const formatDuration = (started: string, completed: string | null) => {
  if (!completed) return '-';
  const diff = Math.round((new Date(completed).getTime() - new Date(started).getTime()) / 1000);
  if (diff < 0) return '-';
  if (diff < 60) return `${diff}s`;
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return `${m}m ${s}s`;
};

const durationSeconds = (started: string, completed: string | null) => {
  if (!completed) return null;
  return (new Date(completed).getTime() - new Date(started).getTime()) / 1000;
};

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
};

const friendlyType = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function SyncHistory() {
  const [allLogs, setAllLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeOptions, setTypeOptions] = useState<string[]>([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Sort & pagination
  const [sortField, setSortField] = useState<SortField>('started_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sync_logs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      const logs = data || [];
      setAllLogs(logs);
      const types = [...new Set(logs.map(l => l.sync_type))].sort();
      setTypeOptions(types);
    } catch (err) {
      console.error('Error loading sync logs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Filtered + sorted
  const filtered = useMemo(() => {
    let result = allLogs;

    if (statusFilter.size > 0) {
      result = result.filter(l => statusFilter.has(l.status));
    }
    if (typeFilter) {
      result = result.filter(l => l.sync_type === typeFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l =>
        l.sync_type.toLowerCase().includes(q) ||
        l.status.toLowerCase().includes(q) ||
        (l.error_message && l.error_message.toLowerCase().includes(q))
      );
    }
    if (dateFrom) {
      const from = new Date(`${dateFrom}T00:00:00`).getTime();
      result = result.filter(l => new Date(l.started_at).getTime() >= from);
    }
    if (dateTo) {
      const to = new Date(`${dateTo}T23:59:59`).getTime();
      result = result.filter(l => new Date(l.started_at).getTime() <= to);
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'started_at':
          cmp = new Date(a.started_at).getTime() - new Date(b.started_at).getTime();
          break;
        case 'sync_type':
          cmp = a.sync_type.localeCompare(b.sync_type);
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
        case 'records_synced':
          cmp = (a.records_synced || 0) - (b.records_synced || 0);
          break;
        case 'duration': {
          const da = durationSeconds(a.started_at, a.completed_at) ?? -1;
          const db = durationSeconds(b.started_at, b.completed_at) ?? -1;
          cmp = da - db;
          break;
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [allLogs, statusFilter, typeFilter, searchQuery, dateFrom, dateTo, sortField, sortDir]);

  // Stats
  const stats = useMemo(() => {
    const s = { total: filtered.length, completed: 0, failed: 0, timeout: 0, started: 0, totalRecords: 0 };
    for (const l of filtered) {
      if (l.status === 'completed') { s.completed++; s.totalRecords += l.records_synced || 0; }
      else if (l.status === 'failed' || l.status === 'error' || l.status === 'partial') s.failed++;
      else if (l.status === 'timeout') s.timeout++;
      else if (l.status === 'started') s.started++;
    }
    return s;
  }, [filtered]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePageNum = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(safePageNum * PAGE_SIZE, (safePageNum + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [statusFilter, typeFilter, searchQuery, dateFrom, dateTo, sortField, sortDir]);

  const toggleStatus = (s: string) => {
    setStatusFilter(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
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

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" />
      : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />;
  };

  const hasAnyFilter = statusFilter.size > 0 || typeFilter || searchQuery || dateFrom || dateTo;

  const clearAll = () => {
    setStatusFilter(new Set());
    setTypeFilter('');
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="w-full bg-slate-50 min-h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Database className="w-6 h-6 text-blue-500" />
          Sync History
        </h2>
        <PagePurpose section="sync-history" />
        <p className="text-slate-600 mt-1 text-sm">
          All synchronization logs from the Mindbody API&nbsp;&mdash;&nbsp;{allLogs.length} total entries stored, no automatic cleanup
        </p>
      </div>

      <div className="p-6 space-y-5">
        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total', value: stats.total, color: 'slate' },
            { label: 'Completed', value: stats.completed, color: 'emerald' },
            { label: 'Failed', value: stats.failed, color: 'red' },
            { label: 'Timeout', value: stats.timeout, color: 'amber' },
            { label: 'Records synced', value: stats.totalRecords.toLocaleString(), color: 'blue' },
          ].map(s => (
            <div key={s.label} className={`bg-white rounded-lg border border-slate-200 px-4 py-3`}>
              <div className={`text-xs font-medium text-${s.color}-600 uppercase tracking-wider mb-0.5`}>{s.label}</div>
              <div className={`text-xl font-bold text-${s.color}-900`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">Filters</span>
            {hasAnyFilter && (
              <button onClick={clearAll} className="ml-auto text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                <X className="w-3 h-3" /> Clear all
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-4">
            {/* Status toggles */}
            <div>
              <div className="text-xs text-slate-500 mb-1.5">Status</div>
              <div className="flex gap-1.5">
                {STATUS_OPTIONS.map(s => {
                  const active = statusFilter.has(s);
                  const colors = STATUS_COLORS[s];
                  return (
                    <button
                      key={s}
                      onClick={() => toggleStatus(s)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                        active
                          ? `${colors.badge} border-current shadow-sm`
                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Type select */}
            <div>
              <div className="text-xs text-slate-500 mb-1.5">Sync Type</div>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 min-w-[180px]"
              >
                <option value="">All types</option>
                {typeOptions.map(t => (
                  <option key={t} value={t}>{friendlyType(t)}</option>
                ))}
              </select>
            </div>

            {/* Date range */}
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

            {/* Search */}
            <div>
              <div className="text-xs text-slate-500 mb-1.5">Search</div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Type, status, error..."
                  className="pl-8 pr-7 py-1.5 border border-slate-300 rounded-lg text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Refresh */}
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

        {/* Table */}
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
                {hasAnyFilter ? 'No entries match the current filters' : 'No sync history available'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <button onClick={() => handleSort('started_at')} className="flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900">
                          Date/Time <SortIcon field="started_at" />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left">
                        <button onClick={() => handleSort('sync_type')} className="flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900">
                          Type <SortIcon field="sync_type" />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left">
                        <button onClick={() => handleSort('status')} className="flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900">
                          Status <SortIcon field="status" />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-right">
                        <button onClick={() => handleSort('duration')} className="flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900 ml-auto">
                          Duration <SortIcon field="duration" />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-right">
                        <button onClick={() => handleSort('records_synced')} className="flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900 ml-auto">
                          Records <SortIcon field="records_synced" />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageItems.map(log => {
                      const colors = STATUS_COLORS[log.status] || STATUS_COLORS.started;
                      return (
                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                            {formatDateTime(log.started_at)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-slate-900 font-medium">{friendlyType(log.sync_type)}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colors.badge}`}>
                              {statusIcon(log.status)}
                              {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap text-slate-600">
                            <span className="inline-flex items-center gap-1">
                              <Timer className="w-3 h-3 text-slate-400" />
                              {formatDuration(log.started_at, log.completed_at)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap font-medium text-slate-900">
                            {log.records_synced > 0 ? log.records_synced.toLocaleString() : '-'}
                          </td>
                          <td className="px-4 py-3 max-w-xs">
                            {log.error_message ? (
                              <span className="text-red-600 text-xs truncate block" title={log.error_message}>
                                {log.error_message.length > 80 ? log.error_message.slice(0, 80) + '...' : log.error_message}
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50">
                  <span className="text-xs text-slate-500">
                    Showing {safePageNum * PAGE_SIZE + 1}&ndash;{Math.min((safePageNum + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
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
                      if (totalPages <= 7) {
                        pageNum = i;
                      } else if (safePageNum < 4) {
                        pageNum = i;
                      } else if (safePageNum > totalPages - 5) {
                        pageNum = totalPages - 7 + i;
                      } else {
                        pageNum = safePageNum - 3 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                            safePageNum === pageNum
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-600 hover:bg-slate-200'
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
