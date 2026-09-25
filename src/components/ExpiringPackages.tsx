import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  Flame,
  RefreshCw,
  FileSpreadsheet,
  Printer,
  Phone,
  ChevronRight,
  AlertTriangle,
  Clock,
  Search,
  X,
} from 'lucide-react';
import { CopyLinkButton } from './CopyLinkButton';
import { exportToExcel } from '../utils/exportExcel';
import { isPackageActive, toLocalISO } from '../utils/packageStatus';

interface ServiceGroup {
  tariffName: string;
  remainingTotal: number;
  packagesCount: number;
  daysLeft: number | null;
  expirationDate: string | null;
}

interface ClientRow {
  clientId: string;
  firstName: string;
  lastName: string;
  phone: string;
  groups: ServiceGroup[];
  minRemaining: number;
  minDaysLeft: number | null;
}

type FilterMode = 'both' | 'visits' | 'days';

interface ExpiringPackagesProps {
  onViewClient?: (clientId: string) => void;
  urlParams?: Record<string, string>;
  onParamsChange?: (params: Record<string, string>) => void;
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
  } catch { return dateStr; }
};

export function ExpiringPackages({ onViewClient, urlParams, onParamsChange }: ExpiringPackagesProps) {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [totalServices, setTotalServices] = useState(0);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const initFilter = (urlParams?.filter === 'visits' || urlParams?.filter === 'days') ? urlParams.filter : 'both';
  const [filter, setFilter] = useState<FilterMode>(initFilter as FilterMode);
  const [searchQuery, setSearchQuery] = useState('');
  const autoRefreshRef = useRef(!!urlParams?.filter);

  const handleFilterChange = (f: FilterMode) => {
    setFilter(f);
    onParamsChange?.({ filter: f });
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data: csData } = await supabase
        .from('client_services')
        .select('client_id, name, count, remaining, expiration_date, pricing_option_id')
        .eq('current', true)
        .gt('remaining', 0);

      if (!csData || csData.length === 0) {
        setClients([]);
        setTotalServices(0);
        setGenerated(true);
        setLoading(false);
        return;
      }

      const today = toLocalISO(new Date());
      const now = new Date();

      const active = csData.filter(cs =>
        isPackageActive({ current: true, remaining: cs.remaining, expiration_date: cs.expiration_date }, today)
      );

      // Resolve pricing option names
      const poIds = [...new Set(active.map(cs => cs.pricing_option_id).filter(Boolean))] as string[];
      const poMap = new Map<string, string>();
      for (let i = 0; i < poIds.length; i += 200) {
        const batch = poIds.slice(i, i + 200);
        const { data: pos } = await supabase.from('pricing_options').select('id, name').in('id', batch);
        for (const po of (pos || [])) poMap.set(po.id, po.name);
      }

      // Group by client_id + tariff name
      const groupMap = new Map<string, {
        clientId: string; tariffName: string;
        remainingTotal: number; packagesCount: number;
        firstExp: string | null;
      }>();

      for (const cs of active) {
        const tariff = (cs.pricing_option_id ? poMap.get(cs.pricing_option_id) : null) || cs.name || '-';
        const key = `${cs.client_id}||${tariff}`;
        const existing = groupMap.get(key);
        if (existing) {
          existing.remainingTotal += cs.remaining;
          existing.packagesCount++;
          if (cs.expiration_date) {
            const ed = cs.expiration_date.slice(0, 10);
            if (!existing.firstExp || ed < existing.firstExp) existing.firstExp = ed;
          }
        } else {
          groupMap.set(key, {
            clientId: cs.client_id,
            tariffName: tariff,
            remainingTotal: cs.remaining,
            packagesCount: 1,
            firstExp: cs.expiration_date ? cs.expiration_date.slice(0, 10) : null,
          });
        }
      }

      // Filter to expiring groups
      type GroupEntry = { clientId: string; tariffName: string; remainingTotal: number; packagesCount: number; firstExp: string | null };
      const expiringGroups: GroupEntry[] = [];
      for (const g of groupMap.values()) {
        const daysLeft = g.firstExp
          ? Math.ceil((new Date(g.firstExp).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        if (g.remainingTotal <= 2 || (daysLeft !== null && daysLeft >= 0 && daysLeft < 14)) {
          expiringGroups.push(g);
        }
      }

      // Fetch client info
      const clientIds = [...new Set(expiringGroups.map(g => g.clientId))];
      const clientMap = new Map<string, { first_name: string; last_name: string; mobile_phone: string; home_phone: string }>();
      for (let i = 0; i < clientIds.length; i += 200) {
        const batch = clientIds.slice(i, i + 200);
        const { data: cl } = await supabase
          .from('clients')
          .select('id, first_name, last_name, mobile_phone, home_phone')
          .in('id', batch);
        for (const c of (cl || [])) clientMap.set(c.id, c);
      }

      // Build client rows
      const clientGroupsMap = new Map<string, ServiceGroup[]>();
      for (const g of expiringGroups) {
        const daysLeft = g.firstExp
          ? Math.ceil((new Date(g.firstExp).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        const sg: ServiceGroup = {
          tariffName: g.tariffName,
          remainingTotal: g.remainingTotal,
          packagesCount: g.packagesCount,
          daysLeft,
          expirationDate: g.firstExp,
        };
        const arr = clientGroupsMap.get(g.clientId) || [];
        arr.push(sg);
        clientGroupsMap.set(g.clientId, arr);
      }

      const result: ClientRow[] = [];
      for (const [clientId, groups] of clientGroupsMap) {
        const client = clientMap.get(clientId);
        if (!client) continue;
        groups.sort((a, b) => a.remainingTotal - b.remainingTotal || (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
        const minRem = Math.min(...groups.map(g => g.remainingTotal));
        const daysVals = groups.map(g => g.daysLeft).filter((d): d is number => d !== null);
        const minDays = daysVals.length > 0 ? Math.min(...daysVals) : null;
        result.push({
          clientId,
          firstName: client.first_name || '',
          lastName: client.last_name || '',
          phone: client.mobile_phone || client.home_phone || 'No phone',
          groups,
          minRemaining: minRem,
          minDaysLeft: minDays,
        });
      }

      result.sort((a, b) => {
        if (a.minRemaining !== b.minRemaining) return a.minRemaining - b.minRemaining;
        return (a.minDaysLeft ?? 9999) - (b.minDaysLeft ?? 9999);
      });

      setClients(result);
      setTotalServices(expiringGroups.length);
      setGenerated(true);
    } catch (err) {
      console.error('Error loading expiring packages:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoRefreshRef.current) {
      autoRefreshRef.current = false;
      refresh();
    }
  }, [refresh]);

  const filtered = useMemo(() => {
    return clients.map(c => {
      const groups = c.groups.filter(g => {
        if (filter === 'visits' && g.remainingTotal > 2) return false;
        if (filter === 'days' && !(g.daysLeft !== null && g.daysLeft >= 0 && g.daysLeft < 14)) return false;
        return true;
      });
      return { ...c, groups };
    }).filter(c => {
      if (c.groups.length === 0) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = `${c.firstName} ${c.lastName}`.toLowerCase();
        const tariffs = c.groups.map(g => g.tariffName.toLowerCase()).join(' ');
        return name.includes(q) || c.phone.toLowerCase().includes(q) || tariffs.includes(q);
      }
      return true;
    });
  }, [clients, filter, searchQuery]);

  const filteredServiceCount = useMemo(() =>
    filtered.reduce((s, c) => s + c.groups.length, 0), [filtered]);

  const handleExportExcel = () => {
    const data: Record<string, string | number>[] = [];
    for (const c of filtered) {
      for (const g of c.groups) {
        data.push({
          'Client': `${c.firstName} ${c.lastName}`,
          'Phone': c.phone,
          'Tariff': g.tariffName,
          'Visits Left': g.remainingTotal,
          'Packages': g.packagesCount,
          'Days Left': g.daysLeft ?? '-',
          'Expires': formatDate(g.expirationDate),
        });
      }
    }
    exportToExcel(data, 'expiring_packages');
  };

  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Flame className="w-6 h-6 text-orange-500" />
          Expiring Packages
        </h2>
        <p className="text-slate-600 mt-1">
          Clients with packages running low on visits or nearing expiration
        </p>
      </div>

      <div className="p-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by name, phone or tariff..."
                  className="pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex rounded-lg border border-slate-300 overflow-hidden">
                {(['both', 'visits', 'days'] as FilterMode[]).map(f => (
                  <button
                    key={f}
                    onClick={() => handleFilterChange(f)}
                    className={`px-3 py-2 text-xs font-medium transition-colors ${
                      filter === f
                        ? 'bg-orange-500 text-white'
                        : 'bg-white text-slate-700 hover:bg-slate-50'
                    } ${f !== 'both' ? 'border-l border-slate-300' : ''}`}
                  >
                    {f === 'both' ? 'Both' : f === 'visits' ? '1-2 visits left' : '< 14 days'}
                  </button>
                ))}
              </div>
              {generated && (
                <span className="text-sm text-slate-500">
                  {filtered.length} clients, {filteredServiceCount} services
                  {(filter !== 'both' || searchQuery) && (
                    <span className="text-slate-400"> of {clients.length} / {totalServices}</span>
                  )}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {generated && filtered.length > 0 && (<>
                <button
                  onClick={handleExportExcel}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Excel
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-slate-600 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  Print / PDF
                </button>
                <CopyLinkButton section="expiring-packages" params={{ filter }} />
              </>)}
              <button
                onClick={refresh}
                disabled={loading}
                className="px-5 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Refresh
              </button>
            </div>
          </div>
        </div>

        {generated && filtered.length === 0 && !loading && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <Flame className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No expiring packages found for this filter</p>
          </div>
        )}

        {generated && filtered.length > 0 && !loading && (
          <div className="space-y-3">
            {filtered.map(row => (
              <div
                key={row.clientId}
                className="bg-white rounded-xl shadow-sm border border-slate-200 px-5 py-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm mt-0.5">
                    {(row.firstName[0] || '?')}{(row.lastName[0] || '?')}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-slate-900">
                        {row.firstName} {row.lastName}
                      </span>
                      <span className="flex items-center gap-1.5 text-sm text-slate-500">
                        <Phone className="w-3.5 h-3.5" />
                        <span className={row.phone === 'No phone' ? 'italic text-slate-400' : ''}>{row.phone}</span>
                      </span>
                    </div>

                    <div className="mt-2 space-y-1.5">
                      {row.groups.map((g, i) => {
                        const lowVisits = g.remainingTotal <= 2;
                        const fewDays = g.daysLeft !== null && g.daysLeft >= 0 && g.daysLeft < 14;
                        return (
                          <div key={i} className="flex items-center gap-2 text-sm flex-wrap">
                            <span className="text-slate-400">{'\u2022'}</span>
                            <span className="text-slate-700 font-medium">{g.tariffName}</span>
                            <span className="text-slate-400">{'\u2014'}</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {lowVisits && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 inline-flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  {g.remainingTotal} visit{g.remainingTotal !== 1 ? 's' : ''} left
                                  {g.packagesCount > 1 && <span className="text-red-500"> ({g.packagesCount} pkg)</span>}
                                </span>
                              )}
                              {!lowVisits && (
                                <span className="text-xs text-slate-500">
                                  {g.remainingTotal} visit{g.remainingTotal !== 1 ? 's' : ''} left
                                  {g.packagesCount > 1 && ` (${g.packagesCount} pkg)`}
                                </span>
                              )}
                              {fewDays && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  expires in {g.daysLeft}d
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {onViewClient && (
                    <button
                      onClick={() => onViewClient(row.clientId)}
                      className="px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1 shrink-0 mt-0.5"
                    >
                      View Card
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!generated && !loading && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <Flame className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-600 mb-2">Click Refresh to load</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Shows clients with 1-2 visits remaining or packages expiring within 14 days.
            </p>
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <div className="w-8 h-8 border-3 border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-slate-600">Loading expiring packages...</p>
          </div>
        )}
      </div>

      {/* Print-only report */}
      {generated && filtered.length > 0 && (
        <div className="print-report hidden print:block">
          <h1>Expiring Packages</h1>
          <div className="pr-sub">
            Filter: {filter === 'both' ? 'Both (visits + days)' : filter === 'visits' ? '1-2 visits left' : '< 14 days'}
            {searchQuery && ` | Search: "${searchQuery}"`}
            {' | '}{filtered.length} clients, {filteredServiceCount} services
            {' | '}Generated: {new Date().toLocaleDateString('en-GB')}
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Client</th>
                <th>Phone</th>
                <th>Tariff</th>
                <th className="text-right">Visits Left</th>
                <th className="text-right">Packages</th>
                <th className="text-right">Days Left</th>
                <th>Expires</th>
                <th>Alert</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let idx = 0;
                return filtered.map(row =>
                  row.groups.map((g, gi) => {
                    idx++;
                    const lowVisits = g.remainingTotal <= 2;
                    const fewDays = g.daysLeft !== null && g.daysLeft >= 0 && g.daysLeft < 14;
                    return (
                      <tr key={`${row.clientId}-${gi}`}>
                        <td>{idx}</td>
                        <td>{gi === 0 ? `${row.firstName} ${row.lastName}` : ''}</td>
                        <td>{gi === 0 ? row.phone : ''}</td>
                        <td>{g.tariffName}</td>
                        <td className="text-right">{g.remainingTotal}</td>
                        <td className="text-right">{g.packagesCount}</td>
                        <td className="text-right">{g.daysLeft != null ? `${g.daysLeft}d` : '-'}</td>
                        <td>{formatDate(g.expirationDate)}</td>
                        <td>{[lowVisits && 'Low visits', fewDays && 'Expiring soon'].filter(Boolean).join(', ') || '-'}</td>
                      </tr>
                    );
                  })
                );
              })()}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Total: {filtered.length} clients</td>
                <td className="text-right" colSpan={5}>{filteredServiceCount} expiring services</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
