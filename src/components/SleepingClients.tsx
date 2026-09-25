import { useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  Moon,
  RefreshCw,
  FileSpreadsheet,
  Printer,
  Phone,
  ChevronRight,
  ChevronDown,
  Star,
  Search,
  X,
  Settings,
  Save,
} from 'lucide-react';
import { CopyLinkButton } from './CopyLinkButton';
import { exportToExcel } from '../utils/exportExcel';
import { isPackageActive, toLocalISO } from '../utils/packageStatus';

// ── Types ──

interface GroupThreshold {
  groupKey: string;
  groupName: string;
  thresholdDays: number;
}

interface GlobalSettings {
  minVisits: number;
  lookbackDays: number;
  maxDaysSilent: number;
}

interface SleepingGroup {
  groupName: string;
  lastVisitDate: string;
  lastServiceName: string;
  daysSince: number;
  thresholdDays: number;
  visitCount: number;
  medianInterval: number | null;
  activePackage: {
    name: string;
    remaining: number;
    expirationDate: string | null;
  } | null;
}

interface SleepingClientRow {
  clientId: string;
  firstName: string;
  lastName: string;
  phone: string;
  groups: SleepingGroup[];
  hasActivePackage: boolean;
  maxOverdueRatio: number;
  locationId: string | null;
}

interface SleepingClientsProps {
  onViewClient?: (clientId: string) => void;
  urlParams?: Record<string, string>;
  onParamsChange?: (params: Record<string, string>) => void;
}

// ── Defaults ──

const DEFAULT_GLOBAL: GlobalSettings = { minVisits: 3, lookbackDays: 180, maxDaysSilent: 180 };

const DEFAULT_THRESHOLDS: Record<string, number> = {
  'Aquabike': 14,
  'ENDOTHERAPY': 21,
  'ENDOROLLER': 21,
  'EMS + EMRF FACE+DYNALINE': 21,
  'MASĀŽAS UN SEJA': 30,
  'LIMFODRENĀŽAS ZABAKI': 21,
  'LĀZEREPILĀCIJA': 45,
  'KRIOLIPOLĪZE': 60,
  'ĶERMEŅA PROCEDŪRAS': 30,
  'VELASHAPE': 30,
  'PHYTOMER PROCEDŪRAS': 30,
  'LIPOACTION': 30,
  'LIPOLYTIC': 30,
  'SEJAS ĶĪMISKIE PĪLINGI': 30,
  'SAUNA': 30,
  'Konsultācija': 30,
  'Pasūtīt Dāvanu karti': 30,
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
  } catch { return dateStr; }
};

function medianOf(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ── Component ──

export function SleepingClients({ onViewClient, urlParams, onParamsChange }: SleepingClientsProps) {
  const [clients, setClients] = useState<SleepingClientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyWithPackage, setOnlyWithPackage] = useState(urlParams?.pkg === '1');
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [saving, setSaving] = useState(false);

  // Settings state
  const [thresholds, setThresholds] = useState<GroupThreshold[]>([]);
  const [global, setGlobal] = useState<GlobalSettings>(DEFAULT_GLOBAL);
  const [allGroupNames, setAllGroupNames] = useState<string[]>([]);
  const [settingsTableExists, setSettingsTableExists] = useState(true);
  const [sleepingCountByGroup, setSleepingCountByGroup] = useState<Record<string, number>>({});

  // ── Load settings ──

  const loadSettings = useCallback(async (categories: { id: string; name: string }[]) => {
    const { data, error } = await supabase
      .from('sleeping_client_settings')
      .select('*');

    if (error && (error.code === 'PGRST205' || error.message?.includes('not find'))) {
      setSettingsTableExists(false);
      const rows: GroupThreshold[] = categories.map(c => ({
        groupKey: c.id,
        groupName: c.name,
        thresholdDays: DEFAULT_THRESHOLDS[c.name] ?? 30,
      }));
      setThresholds(rows);
      setGlobal(DEFAULT_GLOBAL);
      return { thresholds: rows, global: DEFAULT_GLOBAL };
    }

    setSettingsTableExists(true);

    if (!data || data.length === 0) {
      const rows: GroupThreshold[] = categories.map(c => ({
        groupKey: c.id,
        groupName: c.name,
        thresholdDays: DEFAULT_THRESHOLDS[c.name] ?? 30,
      }));
      setThresholds(rows);
      setGlobal(DEFAULT_GLOBAL);

      // Seed defaults
      const upsertRows = [
        ...rows.map(r => ({
          group_key: r.groupKey,
          group_name: r.groupName,
          threshold_days: r.thresholdDays,
          updated_at: new Date().toISOString(),
        })),
        {
          group_key: '__global',
          group_name: 'Global Settings',
          threshold_days: 0,
          min_visits: DEFAULT_GLOBAL.minVisits,
          lookback_days: DEFAULT_GLOBAL.lookbackDays,
          max_days_silent: DEFAULT_GLOBAL.maxDaysSilent,
          updated_at: new Date().toISOString(),
        },
      ];
      await supabase.from('sleeping_client_settings').upsert(upsertRows, { onConflict: 'group_key' });

      return { thresholds: rows, global: DEFAULT_GLOBAL };
    }

    const globalRow = data.find(r => r.group_key === '__global');
    const g: GlobalSettings = {
      minVisits: globalRow?.min_visits ?? DEFAULT_GLOBAL.minVisits,
      lookbackDays: globalRow?.lookback_days ?? DEFAULT_GLOBAL.lookbackDays,
      maxDaysSilent: globalRow?.max_days_silent ?? DEFAULT_GLOBAL.maxDaysSilent,
    };
    setGlobal(g);

    const existing = new Map(data.filter(r => r.group_key !== '__global').map(r => [r.group_key, r]));
    const rows: GroupThreshold[] = categories.map(c => {
      const e = existing.get(c.id);
      return {
        groupKey: c.id,
        groupName: c.name,
        thresholdDays: e?.threshold_days ?? DEFAULT_THRESHOLDS[c.name] ?? 30,
      };
    });
    setThresholds(rows);
    return { thresholds: rows, global: g };
  }, []);

  // ── Save settings ──

  const saveSettings = useCallback(async () => {
    if (!settingsTableExists) return;
    setSaving(true);
    try {
      const rows = [
        ...thresholds.map(t => ({
          group_key: t.groupKey,
          group_name: t.groupName,
          threshold_days: t.thresholdDays,
          updated_at: new Date().toISOString(),
        })),
        {
          group_key: '__global',
          group_name: 'Global Settings',
          threshold_days: 0,
          min_visits: global.minVisits,
          lookback_days: global.lookbackDays,
          max_days_silent: global.maxDaysSilent,
          updated_at: new Date().toISOString(),
        },
      ];
      await supabase.from('sleeping_client_settings').upsert(rows, { onConflict: 'group_key' });
    } finally {
      setSaving(false);
    }
  }, [thresholds, global, settingsTableExists]);

  // ── Main refresh ──

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Load categories (programs)
      const { data: cats } = await supabase.from('service_categories').select('id, name');
      const categories = cats || [];
      const catMap = new Map(categories.map(c => [c.id, c.name]));
      setAllGroupNames(categories.map(c => c.name).sort());

      // 2. Load session_types → program_id mapping
      const { data: stData } = await supabase.from('session_types').select('id, name, program_id');
      const stMap = new Map((stData || []).map(st => [st.id, { programId: st.program_id, name: st.name }]));

      // 3. Load settings
      const settings = await loadSettings(categories);
      const thresholdMap = new Map(settings.thresholds.map(t => [t.groupName, t.thresholdDays]));

      // 4. Load completed appointments (all, to evaluate history)
      const today = toLocalISO(new Date());
      const now = new Date();

      let allAppts: { client_id: string; session_type_id: string; start_datetime: string; location_id: string; status: string }[] = [];
      let offset = 0;
      while (true) {
        const { data } = await supabase
          .from('appointments')
          .select('client_id, session_type_id, start_datetime, location_id, status')
          .eq('status', 'Completed')
          .order('start_datetime', { ascending: false })
          .range(offset, offset + 999);
        if (!data || data.length === 0) break;
        allAppts = allAppts.concat(data);
        if (data.length < 1000) break;
        offset += 1000;
      }

      // 5. Load future bookings
      const futureStatuses = ['Booked', 'Confirmed'];
      const { data: futureData } = await supabase
        .from('appointments')
        .select('client_id')
        .in('status', futureStatuses)
        .gte('start_datetime', today);
      const clientsWithFuture = new Set((futureData || []).map(a => a.client_id));

      // 6. Load clients
      const clientIds = [...new Set(allAppts.map(a => a.client_id).filter(Boolean))];
      const clientMap = new Map<string, { first_name: string; last_name: string; mobile_phone: string; home_phone: string; status: string | null }>();
      for (let i = 0; i < clientIds.length; i += 200) {
        const batch = clientIds.slice(i, i + 200);
        const { data: cl } = await supabase
          .from('clients')
          .select('id, first_name, last_name, mobile_phone, home_phone, status')
          .in('id', batch);
        for (const c of (cl || [])) clientMap.set(c.id, c);
      }

      // 7. Group appointments by client + program
      type ApptEntry = { date: string; serviceName: string; locationId: string };
      const grouped = new Map<string, Map<string, ApptEntry[]>>();

      for (const a of allAppts) {
        if (!a.client_id || a.client_id === '1') continue;
        const st = stMap.get(a.session_type_id);
        if (!st) continue;
        const programName = (st.programId ? catMap.get(st.programId) : null) || 'Other';
        const dateStr = a.start_datetime.slice(0, 10);

        if (!grouped.has(a.client_id)) grouped.set(a.client_id, new Map());
        const clientGroups = grouped.get(a.client_id)!;
        if (!clientGroups.has(programName)) clientGroups.set(programName, []);
        clientGroups.get(programName)!.push({
          date: dateStr,
          serviceName: st.name,
          locationId: a.location_id,
        });
      }

      // 8. Load active client_services for package matching
      const { data: csData } = await supabase
        .from('client_services')
        .select('client_id, name, remaining, expiration_date, pricing_option_id, count')
        .gt('remaining', 0);

      const activeCS = (csData || []).filter(cs =>
        isPackageActive({ current: true, remaining: cs.remaining, expiration_date: cs.expiration_date }, today)
      );

      // Load pricing options for name resolution + program_id
      const poIds = [...new Set(activeCS.map(cs => cs.pricing_option_id).filter(Boolean))] as string[];
      const poMap = new Map<string, { name: string; programId: string | null }>();
      for (let i = 0; i < poIds.length; i += 200) {
        const batch = poIds.slice(i, i + 200);
        const { data: pos } = await supabase.from('pricing_options').select('id, name, program_id').in('id', batch);
        for (const po of (pos || [])) poMap.set(po.id, { name: po.name, programId: po.program_id });
      }

      // Group active packages by client + program
      const clientPackages = new Map<string, Map<string, { name: string; remaining: number; expirationDate: string | null }>>();
      for (const cs of activeCS) {
        const po = cs.pricing_option_id ? poMap.get(cs.pricing_option_id) : null;
        const programName = (po?.programId ? catMap.get(po.programId) : null) || 'Other';
        const key = cs.client_id;
        if (!clientPackages.has(key)) clientPackages.set(key, new Map());
        const pkgMap = clientPackages.get(key)!;
        const existing = pkgMap.get(programName);
        if (!existing || cs.remaining > existing.remaining) {
          pkgMap.set(programName, {
            name: po?.name || cs.name || '-',
            remaining: cs.remaining,
            expirationDate: cs.expiration_date,
          });
        }
      }

      // 9. Evaluate sleeping criteria
      const { minVisits, lookbackDays, maxDaysSilent } = settings.global;
      const result: SleepingClientRow[] = [];
      const groupCounts: Record<string, number> = {};

      for (const [clientId, programGroups] of grouped) {
        // Exclude future bookings
        if (clientsWithFuture.has(clientId)) continue;

        // Exclude inactive clients
        const client = clientMap.get(clientId);
        if (!client) continue;
        if (client.status === 'Declined') continue;

        const sleepingGroups: SleepingGroup[] = [];
        let locationId: string | null = null;

        for (const [programName, visits] of programGroups) {
          const threshold = thresholdMap.get(programName) ?? 30;
          // Sort by date desc
          visits.sort((a, b) => b.date.localeCompare(a.date));
          const lastVisit = visits[0];
          const lastDate = new Date(lastVisit.date);
          const daysSince = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

          // Check: sleeping window
          if (daysSince <= threshold || daysSince > maxDaysSilent) continue;

          // Check: regular visitor (min_visits in lookback period before last visit)
          const lookbackStart = new Date(lastDate);
          lookbackStart.setDate(lookbackStart.getDate() - lookbackDays);
          const lookbackStartStr = toLocalISO(lookbackStart);
          const visitsInPeriod = visits.filter(v => v.date >= lookbackStartStr && v.date <= lastVisit.date);
          if (visitsInPeriod.length < minVisits) continue;

          // Calculate median interval
          const dates = visitsInPeriod.map(v => new Date(v.date).getTime()).sort((a, b) => a - b);
          const intervals: number[] = [];
          for (let i = 1; i < dates.length; i++) {
            intervals.push(Math.round((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24)));
          }
          const med = medianOf(intervals.filter(d => d > 0));

          // Active package in this program?
          const pkg = clientPackages.get(clientId)?.get(programName) ?? null;

          if (!locationId) locationId = lastVisit.locationId;

          sleepingGroups.push({
            groupName: programName,
            lastVisitDate: lastVisit.date,
            lastServiceName: lastVisit.serviceName,
            daysSince,
            thresholdDays: threshold,
            visitCount: visitsInPeriod.length,
            medianInterval: med,
            activePackage: pkg,
          });

          groupCounts[programName] = (groupCounts[programName] || 0) + 1;
        }

        if (sleepingGroups.length === 0) continue;

        const hasActivePkg = sleepingGroups.some(g => g.activePackage !== null);
        const maxRatio = Math.max(...sleepingGroups.map(g => g.daysSince / g.thresholdDays));

        result.push({
          clientId,
          firstName: client.first_name || '',
          lastName: client.last_name || '',
          phone: client.mobile_phone || client.home_phone || 'No phone',
          groups: sleepingGroups,
          hasActivePackage: hasActivePkg,
          maxOverdueRatio: maxRatio,
          locationId,
        });
      }

      // Sort: active package first, then by overdue ratio desc
      result.sort((a, b) => {
        if (a.hasActivePackage !== b.hasActivePackage) return a.hasActivePackage ? -1 : 1;
        return b.maxOverdueRatio - a.maxOverdueRatio;
      });

      setClients(result);
      setSleepingCountByGroup(groupCounts);
      setGenerated(true);
    } catch (err) {
      console.error('Error loading sleeping clients:', err);
    } finally {
      setLoading(false);
    }
  }, [loadSettings]);

  // ── Filtering ──

  const filtered = useMemo(() => {
    return clients.filter(c => {
      if (onlyWithPackage && !c.hasActivePackage) return false;
      if (selectedGroups.size > 0 && !c.groups.some(g => selectedGroups.has(g.groupName))) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = `${c.firstName} ${c.lastName}`.toLowerCase();
        const services = c.groups.map(g => `${g.groupName} ${g.lastServiceName}`).join(' ').toLowerCase();
        return name.includes(q) || c.phone.toLowerCase().includes(q) || services.includes(q);
      }
      return true;
    });
  }, [clients, onlyWithPackage, selectedGroups, searchQuery]);

  const withPackageCount = useMemo(() => clients.filter(c => c.hasActivePackage).length, [clients]);

  // ── Export ──

  const handleExportExcel = () => {
    const data: Record<string, string | number>[] = [];
    for (const c of filtered) {
      for (const g of c.groups) {
        data.push({
          'Client': `${c.firstName} ${c.lastName}`,
          'Phone': c.phone,
          'Group': g.groupName,
          'Last visit': formatDate(g.lastVisitDate),
          'Last service': g.lastServiceName,
          'Days since': g.daysSince,
          'Usual interval': g.medianInterval ?? '-',
          'Visits (period)': g.visitCount,
          'Threshold': g.thresholdDays,
          'Active package': g.activePackage?.name ?? '-',
          'Visits left': g.activePackage?.remaining ?? '-',
        });
      }
    }
    exportToExcel(data, 'sleeping_clients');
  };

  // ── Group filter toggle ──

  const toggleGroup = (name: string) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  // ── Render ──

  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Moon className="w-6 h-6 text-indigo-500" />
          Sleeping Clients
        </h2>
        <p className="text-slate-600 mt-1">
          Regular clients who stopped visiting beyond their group threshold
        </p>
      </div>

      <div className="p-6">
        {/* Toolbar */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search name, phone, service..."
                  className="pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Only with package toggle */}
              <button
                onClick={() => setOnlyWithPackage(p => !p)}
                className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${
                  onlyWithPackage
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Star className="w-3.5 h-3.5" />
                With package only
              </button>

              {/* Group filter dropdown */}
              {allGroupNames.length > 0 && (
                <div className="relative group">
                  <button className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-1.5">
                    Groups {selectedGroups.size > 0 && `(${selectedGroups.size})`}
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1 w-64 max-h-72 overflow-y-auto hidden group-hover:block">
                    {selectedGroups.size > 0 && (
                      <button
                        onClick={() => setSelectedGroups(new Set())}
                        className="w-full text-left px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50"
                      >
                        Clear all
                      </button>
                    )}
                    {allGroupNames.map(name => (
                      <button
                        key={name}
                        onClick={() => toggleGroup(name)}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center justify-between ${
                          selectedGroups.has(name) ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700'
                        }`}
                      >
                        <span className="truncate">{name}</span>
                        {sleepingCountByGroup[name] && (
                          <span className="text-slate-400 ml-2 shrink-0">{sleepingCountByGroup[name]}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {generated && (
                <span className="text-sm text-slate-500">
                  {filtered.length} clients
                  {withPackageCount > 0 && (
                    <span className="text-amber-600 ml-1">({withPackageCount} with active package)</span>
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
                <CopyLinkButton section="sleeping-clients" params={{ pkg: onlyWithPackage ? '1' : '0' }} />
              </>)}
              <button
                onClick={() => setShowSettings(s => !s)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  showSettings
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                    : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Settings className="w-4 h-4" />
                Thresholds
              </button>
              <button
                onClick={refresh}
                disabled={loading}
                className="px-5 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
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

        {/* Settings panel */}
        {showSettings && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Thresholds by Service Group</h3>
              <button
                onClick={saveSettings}
                disabled={saving || !settingsTableExists}
                className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            </div>

            {!settingsTableExists && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                Settings table not yet created. Thresholds are stored in memory. Apply the migration to persist.
              </div>
            )}

            {/* Global params */}
            <div className="flex items-center gap-6 mb-4 pb-4 border-b border-slate-100">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                Min visits:
                <input
                  type="number" min={1} max={50} value={global.minVisits}
                  onChange={e => setGlobal(g => ({ ...g, minVisits: parseInt(e.target.value) || 3 }))}
                  className="w-16 px-2 py-1 border border-slate-300 rounded text-xs text-center"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                Lookback days:
                <input
                  type="number" min={30} max={365} value={global.lookbackDays}
                  onChange={e => setGlobal(g => ({ ...g, lookbackDays: parseInt(e.target.value) || 180 }))}
                  className="w-16 px-2 py-1 border border-slate-300 rounded text-xs text-center"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                Max days silent:
                <input
                  type="number" min={30} max={365} value={global.maxDaysSilent}
                  onChange={e => setGlobal(g => ({ ...g, maxDaysSilent: parseInt(e.target.value) || 180 }))}
                  className="w-16 px-2 py-1 border border-slate-300 rounded text-xs text-center"
                />
              </label>
            </div>

            {/* Per-group thresholds */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {thresholds.map((t, idx) => (
                <div key={t.groupKey} className="flex items-center gap-2 py-1">
                  <span className="text-xs text-slate-700 flex-1 truncate" title={t.groupName}>{t.groupName}</span>
                  <input
                    type="number" min={1} max={365}
                    value={t.thresholdDays}
                    onChange={e => {
                      const val = parseInt(e.target.value) || 30;
                      setThresholds(prev => prev.map((r, i) => i === idx ? { ...r, thresholdDays: val } : r));
                    }}
                    className="w-14 px-2 py-1 border border-slate-300 rounded text-xs text-center"
                  />
                  <span className="text-xs text-slate-400 w-5">d</span>
                  {sleepingCountByGroup[t.groupName] !== undefined && (
                    <span className="text-xs text-slate-400 w-8 text-right">{sleepingCountByGroup[t.groupName]}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!generated && !loading && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <Moon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-600 mb-2">Click Refresh to load</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Finds regular clients who stopped visiting beyond their service group threshold.
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-slate-600">Analyzing visit patterns...</p>
          </div>
        )}

        {/* No results */}
        {generated && filtered.length === 0 && !loading && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <Moon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No sleeping clients found for this filter</p>
          </div>
        )}

        {/* Results */}
        {generated && filtered.length > 0 && !loading && (
          <div className="space-y-3">
            {filtered.map(row => (
              <div
                key={row.clientId}
                className={`bg-white rounded-xl shadow-sm border px-5 py-4 hover:shadow-md transition-shadow ${
                  row.hasActivePackage ? 'border-amber-200' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 mt-0.5 shadow-sm ${
                    row.hasActivePackage
                      ? 'bg-gradient-to-br from-amber-400 to-amber-500'
                      : 'bg-gradient-to-br from-slate-400 to-slate-500'
                  }`}>
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

                    <div className="mt-2 space-y-2.5">
                      {row.groups.map((g, i) => (
                        <div key={i} className="text-sm">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-slate-400">{'\u2022'}</span>
                            <span className="font-medium text-slate-700">{g.groupName}</span>
                            <span className="text-slate-400">{'\u2014'}</span>
                            <span className="text-slate-600">
                              last visit {formatDate(g.lastVisitDate)} ({g.lastServiceName}),{' '}
                              <span className="font-semibold text-red-600">{g.daysSince} days ago</span>
                            </span>
                          </div>
                          <div className="ml-5 text-xs text-slate-400 mt-0.5">
                            {g.medianInterval !== null && (
                              <span>usually every {Math.round(g.medianInterval)} days</span>
                            )}
                            {' \u00b7 '}{g.visitCount} visits in {global.lookbackDays}d
                            {' \u00b7 '}threshold {g.thresholdDays}d
                          </div>
                          {g.activePackage && (
                            <div className="ml-5 mt-1 flex items-center gap-1.5 text-xs">
                              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                              <span className="font-medium text-amber-700">
                                Active package: {g.activePackage.name}
                                {' \u2014 '}{g.activePackage.remaining} visit{g.activePackage.remaining !== 1 ? 's' : ''} left
                                {g.activePackage.expirationDate && `, expires ${formatDate(g.activePackage.expirationDate)}`}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
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
      </div>

      {/* Print-only report */}
      {generated && filtered.length > 0 && (
        <div className="print-report hidden print:block">
          <h1>Sleeping Clients</h1>
          <div className="pr-sub">
            {onlyWithPackage ? 'With active package only' : 'All sleeping clients'}
            {selectedGroups.size > 0 && ` | Groups: ${[...selectedGroups].join(', ')}`}
            {searchQuery && ` | Search: "${searchQuery}"`}
            {' | '}{filtered.length} clients
            {' | '}Generated: {new Date().toLocaleDateString('en-GB')}
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Client</th>
                <th>Phone</th>
                <th>Group</th>
                <th>Last visit</th>
                <th>Last service</th>
                <th className="text-right">Days since</th>
                <th className="text-right">Interval</th>
                <th className="text-right">Visits</th>
                <th className="text-right">Threshold</th>
                <th>Active package</th>
                <th className="text-right">Left</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let idx = 0;
                return filtered.map(row =>
                  row.groups.map((g, gi) => {
                    idx++;
                    return (
                      <tr key={`${row.clientId}-${gi}`}>
                        <td>{idx}</td>
                        <td>{gi === 0 ? `${row.firstName} ${row.lastName}` : ''}</td>
                        <td>{gi === 0 ? row.phone : ''}</td>
                        <td>{g.groupName}</td>
                        <td>{formatDate(g.lastVisitDate)}</td>
                        <td>{g.lastServiceName}</td>
                        <td className="text-right">{g.daysSince}</td>
                        <td className="text-right">{g.medianInterval != null ? `${Math.round(g.medianInterval)}d` : '-'}</td>
                        <td className="text-right">{g.visitCount}</td>
                        <td className="text-right">{g.thresholdDays}d</td>
                        <td>{g.activePackage?.name ?? '-'}</td>
                        <td className="text-right">{g.activePackage?.remaining ?? '-'}</td>
                      </tr>
                    );
                  })
                );
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
