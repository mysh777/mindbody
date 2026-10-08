import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAllPages';
import { fetchByIds } from '../lib/fetchByIds';
import {
  Search,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Users,
  User,
  AlertCircle,
  Wrench,
} from 'lucide-react';
import { CopyLinkButton } from './CopyLinkButton';
import { LoadErrorBanner } from './LoadErrorBanner';
import { errorMessage } from '../utils/errorMessage';
import { exportToExcel } from '../utils/exportExcel';

// ── Types ──

interface StaffOption {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
}

interface SstRow {
  staffId: string;
  sessionTypeId: string;
  serviceName: string;
  duration: number | null;
  programName: string;
  payRateType: string;
  payRate: number;
  source: 'mindbody';
}

interface ManualRow {
  staffId: string;
  sessionTypeId: string | null;
  serviceName: string;
  ratePerAppointment: number;
  rateType: string;
  source: 'manual';
}

type RateRow = {
  staffId: string;
  sessionTypeId: string;
  serviceName: string;
  duration: number | null;
  programName: string;
  payRateType: string;
  payRate: number;
  source: 'mindbody' | 'manual';
  manualNote?: string;
};

interface ProgramGroup {
  name: string;
  rows: RateRow[];
}

interface Props {
  initialStaffId?: string;
}

// ── Helpers ──

const fmtRate = (type: string, rate: number): string => {
  if (type === 'No Pay' || rate === 0) return '—';
  if (type === 'Percent') return `${rate} %`;
  return `${rate.toFixed(2).replace('.', ',')} €`;
};

const fmtDuration = (mins: number | null): string => {
  if (!mins) return '—';
  return `${mins} min`;
};

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const ALL_STAFF = '__all__';

// ── Component ──

export function StaffPayRates({ initialStaffId }: Props) {
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>(initialStaffId || '');
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(true);

  const [sstRows, setSstRows] = useState<SstRow[]>([]);
  const [manualRows, setManualRows] = useState<ManualRow[]>([]);
  const [programMap, setProgramMap] = useState<Record<string, string>>({});
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refLoadError, setRefLoadError] = useState<string | null>(null);
  const [ratesLoadError, setRatesLoadError] = useState<string | null>(null);
  const loadError = refLoadError || ratesLoadError;
  const [reloadKey, setReloadKey] = useState(0);

  // ── Load reference data ──
  useEffect(() => {
    (async () => {
      setRefLoadError(null);
      let staffRows: any[];
      let programRows: { program_id: string; program_name: string }[];
      let lastSyncAt: string | null;
      try {
        const [staffData, progData, syncRes] = await Promise.all([
          fetchAllRows<any>('staff', 'id, first_name, last_name, raw_data'),
          fetchAllRows<{ program_id: string; program_name: string }>('pricing_options', 'program_id, program_name',
            q => q.not('program_id', 'is', null).not('program_name', 'is', null)),
          supabase.from('sync_logs').select('completed_at').eq('sync_type', 'staff_services').eq('status', 'completed').order('completed_at', { ascending: false }).limit(1),
        ]);
        if (syncRes.error) throw syncRes.error;
        staffRows = staffData;
        programRows = progData;
        lastSyncAt = syncRes.data?.[0]?.completed_at ?? null;
      } catch (error) {
        setRefLoadError(errorMessage(error));
        setLoading(false);
        return;
      }

      const staff: StaffOption[] = staffRows.map(s => ({
        id: s.id,
        firstName: (s.first_name || '').trim(),
        lastName: (s.last_name || '').trim(),
        active: s.raw_data?.Active !== false,
      })).sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
      setStaffList(staff);

      const pMap: Record<string, string> = {};
      programRows.forEach(p => { pMap[p.program_id] = p.program_name; });
      setProgramMap(pMap);

      if (lastSyncAt) setLastSync(lastSyncAt);

      if (!initialStaffId && staff.length > 0) {
        const realStaff = staff.filter(s => s.active);
        setSelectedStaff(realStaff[0]?.id || staff[0].id);
      }
    })();
  }, [initialStaffId, reloadKey]);

  // ── Load rate data ──
  useEffect(() => {
    if (!selectedStaff) return;
    setLoading(true);
    setRatesLoadError(null);

    (async () => {
      try {
      if (selectedStaff === ALL_STAFF) {
        const allSst = await fetchAllRows<any>('staff_session_types', 'staff_id, session_type_id, pay_rate, raw_data, time_length');
        const stIds = [...new Set(allSst.map(r => r.session_type_id))];
        const stMap = await loadSessionTypeMap(stIds);

        setSstRows(allSst.map(r => toSstRow(r, stMap)));

        const manData = await fetchAllRows<any>('staff_appointment_rates', 'staff_id, session_type_id, rate_per_appointment, rate_type',
          q => q.is('effective_to', null));
        const manStIds = (manData || []).map(r => r.session_type_id).filter(Boolean) as string[];
        const manStMap = await loadSessionTypeMap(manStIds);
        setManualRows((manData || []).map(r => ({
          staffId: r.staff_id,
          sessionTypeId: r.session_type_id,
          serviceName: r.session_type_id ? (manStMap[r.session_type_id] || r.session_type_id) : 'Default rate',
          ratePerAppointment: Number(r.rate_per_appointment) || 0,
          rateType: r.rate_type || 'fixed',
          source: 'manual' as const,
        })));
      } else {
        const [sstRes, manRes] = await Promise.all([
          supabase
            .from('staff_session_types')
            .select('staff_id, session_type_id, pay_rate, raw_data, time_length')
            .eq('staff_id', selectedStaff),
          supabase
            .from('staff_appointment_rates')
            .select('staff_id, session_type_id, rate_per_appointment, rate_type')
            .eq('staff_id', selectedStaff)
            .is('effective_to', null),
        ]);
        if (sstRes.error) throw sstRes.error;
        if (manRes.error) throw manRes.error;

        const stIds = [...new Set((sstRes.data || []).map(r => r.session_type_id))];
        const manStIds = (manRes.data || []).map(r => r.session_type_id).filter(Boolean) as string[];
        const allStIds = [...new Set([...stIds, ...manStIds])];
        const stMap = await loadSessionTypeMap(allStIds);

        setSstRows((sstRes.data || []).map(r => toSstRow(r, stMap)));

        setManualRows((manRes.data || []).map(r => ({
          staffId: r.staff_id,
          sessionTypeId: r.session_type_id,
          serviceName: r.session_type_id ? (stMap[r.session_type_id] || r.session_type_id) : 'Default rate',
          ratePerAppointment: Number(r.rate_per_appointment) || 0,
          rateType: r.rate_type || 'fixed',
          source: 'manual' as const,
        })));
      }
      } catch (error) {
        console.error('Error loading staff pay rates:', error);
        setSstRows([]);
        setManualRows([]);
        setRatesLoadError(errorMessage(error));
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedStaff, programMap, reloadKey]);

  async function loadSessionTypeMap(ids: string[]): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    const data = await fetchByIds<{ id: string; name: string | null }>('session_types', 'id', ids, 'id, name');
    data.forEach(st => { map[st.id] = st.name || st.id; });
    return map;
  }

  function toSstRow(r: any, stMap: Record<string, string>): SstRow {
    return {
      staffId: r.staff_id,
      sessionTypeId: r.session_type_id,
      serviceName: stMap[r.session_type_id] || r.session_type_id,
      duration: r.time_length || r.raw_data?.TimeLength || null,
      programName: programMap[r.raw_data?.ProgramId?.toString()] || 'Other',
      payRateType: r.raw_data?.PayRateType || (Number(r.pay_rate) > 0 ? 'Flat' : 'No Pay'),
      payRate: Number(r.pay_rate) || 0,
      source: 'mindbody',
    };
  }

  // ── Merge rows ──
  const mergedRows: RateRow[] = useMemo(() => {
    const sstSet = new Set(sstRows.map(r => `${r.staffId}__${r.sessionTypeId}`));
    const rows: RateRow[] = sstRows.map(r => ({
      ...r,
    }));

    // Manual overrides that exist in sst — add note
    const manualInSst: ManualRow[] = [];
    const manualOutside: ManualRow[] = [];
    manualRows.forEach(m => {
      if (m.sessionTypeId && sstSet.has(`${m.staffId}__${m.sessionTypeId}`)) {
        manualInSst.push(m);
      } else {
        manualOutside.push(m);
      }
    });

    // Mark sst rows that have manual override
    const manualMap = new Map<string, ManualRow>();
    manualInSst.forEach(m => manualMap.set(`${m.staffId}__${m.sessionTypeId}`, m));
    rows.forEach(r => {
      const key = `${r.staffId}__${r.sessionTypeId}`;
      const m = manualMap.get(key);
      if (m) {
        r.manualNote = `Manual override: ${m.ratePerAppointment.toFixed(2).replace('.', ',')} €`;
      }
    });

    // Manual-only rows (not in sst)
    manualOutside.forEach(m => {
      rows.push({
        staffId: m.staffId,
        sessionTypeId: m.sessionTypeId || '',
        serviceName: m.serviceName,
        duration: null,
        programName: 'Manual overrides',
        payRateType: m.rateType === 'fixed' ? 'Flat' : 'Percent',
        payRate: m.ratePerAppointment,
        source: 'manual',
        manualNote: 'Added manually — not returned by Mindbody API',
      });
    });

    return rows;
  }, [sstRows, manualRows]);

  // ── Filter + group ──
  const filteredRows = useMemo(() => {
    if (!search.trim()) return mergedRows;
    const terms = search.toLowerCase().split(/\s+/);
    return mergedRows.filter(r =>
      terms.every(t => r.serviceName.toLowerCase().includes(t) || r.programName.toLowerCase().includes(t))
    );
  }, [mergedRows, search]);

  const staffFilteredRows = useMemo(() => {
    if (selectedStaff === ALL_STAFF) return filteredRows;
    return filteredRows.filter(r => r.staffId === selectedStaff);
  }, [filteredRows, selectedStaff]);

  const groups: ProgramGroup[] = useMemo(() => {
    const gMap: Record<string, RateRow[]> = {};
    staffFilteredRows.forEach(r => {
      const g = r.programName || 'Other';
      if (!gMap[g]) gMap[g] = [];
      gMap[g].push(r);
    });
    return Object.entries(gMap)
      .map(([name, rows]) => ({
        name,
        rows: rows.sort((a, b) => a.serviceName.localeCompare(b.serviceName)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [staffFilteredRows]);

  // Expand all by default when groups change
  useEffect(() => {
    setExpandedGroups(new Set(groups.map(g => g.name)));
    setAllExpanded(true);
  }, [groups.length, selectedStaff]);

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedGroups(new Set());
      setAllExpanded(false);
    } else {
      setExpandedGroups(new Set(groups.map(g => g.name)));
      setAllExpanded(true);
    }
  };

  // ── Stats ──
  const staffObj = staffList.find(s => s.id === selectedStaff);
  const staffLabel = staffObj ? `${staffObj.firstName} ${staffObj.lastName}` : '';

  const stats = useMemo(() => {
    const myRows = selectedStaff === ALL_STAFF ? mergedRows : mergedRows.filter(r => r.staffId === selectedStaff);
    const mbRows = myRows.filter(r => r.source === 'mindbody');
    const paid = mbRows.filter(r => r.payRateType !== 'No Pay' && r.payRate > 0).length;
    const noPay = mbRows.length - paid;
    const manual = myRows.filter(r => r.source === 'manual').length;
    const manualOverrides = myRows.filter(r => r.source === 'mindbody' && r.manualNote).length;
    return { total: mbRows.length, paid, noPay, manual, manualOverrides };
  }, [mergedRows, selectedStaff]);

  // ── Visible staff list ──
  const visibleStaff = useMemo(() => {
    return showInactive ? staffList : staffList.filter(s => s.active);
  }, [staffList, showInactive]);

  // ── Export ──
  const handleExport = useCallback(() => {
    const staffMap = new Map(staffList.map(s => [s.id, `${s.firstName} ${s.lastName}`]));
    const data = staffFilteredRows.map(r => ({
      Staff: staffMap.get(r.staffId) || r.staffId,
      Program: r.programName,
      Service: r.serviceName,
      Duration: r.duration ? `${r.duration} min` : '',
      'Pay rate type': r.payRateType,
      'Pay rate': r.payRate,
      Source: r.source === 'manual' ? 'Manual' : 'Mindbody',
    }));
    const suffix = selectedStaff === ALL_STAFF ? 'all-staff' : staffLabel.replace(/\s+/g, '-');
    exportToExcel(data, `staff-pay-rates-${suffix}`);
  }, [staffFilteredRows, staffList, selectedStaff, staffLabel]);

  // ── "All staff" mode columns ──
  const isAllStaff = selectedStaff === ALL_STAFF;
  const staffMap = useMemo(() => new Map(staffList.map(s => [s.id, `${s.firstName} ${s.lastName}`])), [staffList]);

  // ── Render ──
  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <select
            value={selectedStaff}
            onChange={e => { setSelectedStaff(e.target.value); setSearch(''); }}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none max-w-xs"
          >
            <option value={ALL_STAFF}>All staff</option>
            {visibleStaff.map(s => (
              <option key={s.id} value={s.id}>
                {s.firstName} {s.lastName}{!s.active ? ' (inactive)' : ''}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
              className="rounded border-slate-300"
            />
            Show inactive
          </label>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search services..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm w-56 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <button onClick={handleExport} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4" /> Export
          </button>

          <CopyLinkButton
            section="references"
            params={{ tab: 'staff-pay-rates', ...(selectedStaff !== ALL_STAFF ? { staff: selectedStaff } : {}) }}
          />
        </div>
      </div>

      {/* Staff header */}
      {!isAllStaff && staffObj && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">{staffLabel}</h3>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
            <span>Services: <strong>{stats.total}</strong></span>
            <span>Paid: <strong>{stats.paid}</strong></span>
            <span>No Pay / 0: <strong>{stats.noPay}</strong></span>
            <span>Manual overrides: <strong>{stats.manualOverrides + stats.manual}</strong></span>
          </div>
          {lastSync && (
            <p className="text-xs text-slate-400 mt-2">Rates synced from Mindbody: {fmtDate(lastSync)}</p>
          )}
        </div>
      )}

      {/* All-staff header */}
      {isAllStaff && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-slate-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">All staff</h3>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
            <span>Mindbody rows: <strong>{sstRows.length}</strong></span>
            <span>Manual overrides outside list: <strong>{manualRows.filter(m => !sstRows.some(r => r.staffId === m.staffId && r.sessionTypeId === m.sessionTypeId)).length}</strong></span>
            <span>Total: <strong>{staffFilteredRows.length}</strong></span>
          </div>
          {lastSync && (
            <p className="text-xs text-slate-400 mt-2">Rates synced from Mindbody: {fmtDate(lastSync)}</p>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading rates...</div>
      ) : loadError ? (
        <LoadErrorBanner title="Could not load Staff Pay Rates." message={loadError} onRetry={() => setReloadKey(k => k + 1)} />
      ) : staffFilteredRows.length === 0 ? (
        <div className="text-center py-12 text-slate-400">No rates found</div>
      ) : (
        <>
          {/* Expand / collapse */}
          <div className="flex justify-end mb-2">
            <button onClick={toggleAll} className="text-xs text-blue-600 hover:text-blue-800">
              {allExpanded ? 'Collapse all' : 'Expand all'}
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {isAllStaff && <th className="text-left px-4 py-2.5 font-semibold text-slate-700">Staff</th>}
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-700">Service</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-slate-700 w-24">Duration</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-700 w-32">Pay rate type</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-slate-700 w-28">Pay rate</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(group => (
                  <ProgramSection
                    key={group.name}
                    group={group}
                    isOpen={expandedGroups.has(group.name)}
                    onToggle={() => toggleGroup(group.name)}
                    isAllStaff={isAllStaff}
                    staffMap={staffMap}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Program group section ──

function ProgramSection({
  group, isOpen, onToggle, isAllStaff, staffMap,
}: {
  group: ProgramGroup;
  isOpen: boolean;
  onToggle: () => void;
  isAllStaff: boolean;
  staffMap: Map<string, string>;
}) {
  const colSpan = isAllStaff ? 5 : 4;
  return (
    <>
      <tr
        className="bg-slate-100 border-t border-slate-200 cursor-pointer hover:bg-slate-150 select-none"
        onClick={onToggle}
      >
        <td colSpan={colSpan} className="px-4 py-2 font-semibold text-slate-700">
          <div className="flex items-center gap-2">
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            {group.name}
            <span className="text-xs font-normal text-slate-400 ml-1">({group.rows.length})</span>
          </div>
        </td>
      </tr>
      {isOpen && group.rows.map((r, i) => {
        const isNoPay = r.payRateType === 'No Pay' || r.payRate === 0;
        const rowCls = isNoPay ? 'text-slate-400' : 'text-slate-700';
        return (
          <tr key={`${r.staffId}-${r.sessionTypeId}-${i}`} className={`border-t border-slate-100 ${rowCls} hover:bg-slate-50`}>
            {isAllStaff && <td className="px-4 py-2">{staffMap.get(r.staffId) || r.staffId}</td>}
            <td className="px-4 py-2">
              <div className="flex items-center gap-2">
                {r.source === 'manual' && <Wrench className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                <span>{r.serviceName}</span>
                {r.manualNote && (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                    <AlertCircle className="w-3 h-3" />{r.manualNote}
                  </span>
                )}
              </div>
            </td>
            <td className="px-4 py-2 text-right">{fmtDuration(r.duration)}</td>
            <td className="px-4 py-2">{r.payRateType}</td>
            <td className="px-4 py-2 text-right font-medium">{fmtRate(r.payRateType, r.payRate)}</td>
          </tr>
        );
      })}
    </>
  );
}
