import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAllPages';
import { loadClientNames } from '../lib/clientNames';
import { computeMoneyReceived, type MoneyReceived } from '../hooks/useSalesMarginData';
import { loadUsage } from '../utils/mindbodyUsage';
import { CalendarDays, Clock, Users, DollarSign, Calendar, Scissors, RefreshCw, ChevronLeft, ChevronRight, Phone, AlertCircle, Wallet, Package, X, MapPin, Printer } from 'lucide-react';
import { handlePrint, buildPrintFileName } from '../utils/printReport';
import { formatApptTime, formatApptDate } from '../utils/formatDateTime';

// ─── Types ───

interface Appt {
  id: string;
  client_id: string | null;
  staff_id: string | null;
  location_id: string | null;
  session_type_id: string | null;
  start_datetime: string;
  end_datetime: string;
  duration_minutes: number | null;
  status: string | null;
  notes: string | null;
  client_service_id: string | null;
  raw_data: any;
}

interface StaffRow { id: string; first_name: string; last_name: string; mindbody_id: string; }
interface LocationRow { id: string; name: string; }
interface SessionTypeRow { id: string; name: string; default_duration_minutes: number | null; raw_data: any; }
interface ResourceRow { id: string; name: string; location_id: string | null; resource_type: string | null; }
interface ClientRow { id: string; first_name: string; last_name: string; mobile_phone: string | null; raw_data: any; }
interface ScheduleItem { id: string; kind: string; staff_id: string; location_id: string | null; start_datetime: string; end_datetime: string; description: string | null; }
interface ClientServiceRow { id: string; mindbody_id: string; client_id: string; name: string; count: number; remaining: number; current: boolean; }

type BookingTab = 'calendar' | 'sales' | 'staff-schedule' | 'services';

// ─── Shared data hook ───

function useReferenceData() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [sessionTypes, setSessionTypes] = useState<SessionTypeRow[]>([]);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [excludedNames, setExcludedNames] = useState<string[]>(['Admin', 'Test', 'Sauna Test']);

  useEffect(() => {
    Promise.all([
      fetchAllRows<StaffRow>('staff', 'id, first_name, last_name, mindbody_id'),
      fetchAllRows<LocationRow>('locations', 'id, name'),
      fetchAllRows<SessionTypeRow>('session_types', 'id, name, default_duration_minutes, raw_data'),
      fetchAllRows<ResourceRow>('resources', 'id, name, location_id, resource_type'),
    ]).then(([s, l, st, r]) => { setStaff(s); setLocations(l); setSessionTypes(st); setResources(r); });
    supabase.from('booking_settings').select('excluded_staff_names').eq('id', 1).maybeSingle()
      .then(({ data }) => { if (data?.excluded_staff_names) setExcludedNames(data.excluded_staff_names); });
  }, []);

  const staffMap = useMemo(() => new Map(staff.map(s => [s.id, s])), [staff]);
  const locationMap = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations]);
  const sessionTypeMap = useMemo(() => new Map(sessionTypes.map(st => [st.id, st])), [sessionTypes]);
  const resourceMap = useMemo(() => new Map(resources.map(r => [r.id, r])), [resources]);

  const isExcluded = useCallback((s: StaffRow) => {
    const full = `${s.first_name} ${s.last_name}`.toLowerCase();
    return excludedNames.some(n => full.includes(n.toLowerCase()));
  }, [excludedNames]);

  const staffByLocation = useMemo(() => staff.filter(s => !isExcluded(s)), [staff, isExcluded]);

  return { staff, locations, sessionTypes, resources, staffMap, locationMap, sessionTypeMap, resourceMap, staffByLocation, isExcluded, excludedNames };
}

// ─── Time helpers (UTC — no timezone shift; DB stores studio-local time tagged as UTC) ───

function apptTime(iso: string): string {
  return formatApptTime(iso);
}
function apptHour(iso: string): number {
  const d = new Date(iso);
  return d.getUTCHours();
}
function apptMinute(iso: string): number {
  const d = new Date(iso);
  return d.getUTCMinutes();
}
function toLocalDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const STATUS_COLORS: Record<string, string> = {
  'Booked': 'bg-blue-100 border-blue-400 text-blue-900',
  'Confirmed': 'bg-emerald-100 border-emerald-400 text-emerald-900',
  'Arrived': 'bg-green-100 border-green-400 text-green-900',
  'Completed': 'bg-green-100 border-green-400 text-green-900',
  'NoShow': 'bg-rose-100 border-rose-400 text-rose-900',
  'No-Show': 'bg-rose-100 border-rose-400 text-rose-900',
  'Cancelled': 'bg-slate-100 border-slate-300 text-slate-500 line-through',
};

// ─── Main component ───

export function BookingPage() {
  const [tab, setTab] = useState<BookingTab>('calendar');
  const data = useReferenceData();

  const tabs: { id: BookingTab; label: string; icon: typeof CalendarDays }[] = [
    { id: 'calendar', label: 'Appointment Book', icon: CalendarDays },
    { id: 'sales', label: 'Daily Sales', icon: DollarSign },
    { id: 'staff-schedule', label: 'Staff Schedules', icon: Clock },
    { id: 'services', label: 'Services & Prices', icon: Scissors },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg font-bold text-slate-900">Booking</h1>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">View only — editing comes in the next step</span>
        </div>
        <div className="mt-3 flex gap-1 overflow-x-auto">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  tab === t.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {tab === 'calendar' && <CalendarView data={data} />}
        {tab === 'sales' && <DailySalesView data={data} />}
        {tab === 'staff-schedule' && <StaffScheduleView data={data} />}
        {tab === 'services' && <ServicesView data={data} />}
      </div>
    </div>
  );
}

// ─── 2.1 Appointment Book ───

interface CalendarProps { data: ReturnType<typeof useReferenceData>; }

function CalendarView({ data }: CalendarProps) {
  const [date, setDate] = useState(todayStr());
  const [locationId, setLocationId] = useState<string>('all');
  const [showCancelled, setShowCancelled] = useState(false);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAppt, setSelectedAppt] = useState<Appt | null>(null);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [clientDetails, setClientDetails] = useState<Map<string, ClientRow>>(new Map());
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshBlocked, setRefreshBlocked] = useState(false);
  const [budgetBlocked, setBudgetBlocked] = useState(false);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [clientServices, setClientServices] = useState<ClientServiceRow[]>([]);
  const printRef = useRef<HTMLDivElement>(null);
  const { isExcluded } = data;

  const REFRESH_COOLDOWN_MS = 15 * 60 * 1000;

  // Shared cooldown — read from database so all users see the same lock
  const checkCooldown = useCallback(async () => {
    const { data: cd } = await supabase
      .from('booking_refresh_state')
      .select('last_refresh_at')
      .eq('id', 1)
      .maybeSingle();
    if (cd?.last_refresh_at) {
      const ts = new Date(cd.last_refresh_at).getTime();
      const elapsed = Date.now() - ts;
      setRefreshBlocked(elapsed < REFRESH_COOLDOWN_MS);
      setLastRefresh(new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    }
  }, []);

  useEffect(() => {
    checkCooldown();
    const interval = setInterval(checkCooldown, 30 * 1000);
    return () => clearInterval(interval);
  }, [checkCooldown]);

  // Check API call budget — disable refresh if projected cycle calls > 4500
  useEffect(() => {
    loadUsage().then(u => setBudgetBlocked(u.projected > 4500)).catch(() => {});
  }, []);

  const loadAppts = useCallback(async () => {
    setLoading(true);
    const dayStart = date + 'T00:00:00Z';
    const dayEnd = date + 'T23:59:59Z';
    let q = supabase.from('appointments').select('*').gte('start_datetime', dayStart).lte('start_datetime', dayEnd).order('start_datetime');
    if (locationId !== 'all') q = q.eq('location_id', locationId);
    const { data: apptRows, error } = await q;
    if (error) { console.error(error); setAppts([]); }
    else setAppts((apptRows || []) as Appt[]);

    // Load schedule items for the same day
    const { data: sched } = await supabase
      .from('staff_schedule_items')
      .select('id, kind, staff_id, location_id, start_datetime, end_datetime, description')
      .gte('start_datetime', dayStart)
      .lte('start_datetime', dayEnd)
      .eq('stale', false);
    setScheduleItems((sched || []) as ScheduleItem[]);

    setLoading(false);
  }, [date, locationId]);

  useEffect(() => { loadAppts(); }, [loadAppts]);

  useEffect(() => {
    loadClientNames().then(setClientNames).catch(() => {});
  }, []);

  // Load client details when an appointment is selected
  useEffect(() => {
    if (!selectedAppt?.client_id) return;
    supabase.from('clients').select('id, first_name, last_name, mobile_phone, raw_data')
      .eq('id', selectedAppt.client_id).maybeSingle()
      .then(({ data }) => {
        if (data) setClientDetails(prev => new Map(prev).set(data.id, data as ClientRow));
      });
    if (selectedAppt.client_service_id) {
      supabase.from('client_services').select('id, mindbody_id, client_id, name, count, remaining, current')
        .eq('mindbody_id', selectedAppt.client_service_id)
        .then(({ data }) => setClientServices((data || []) as ClientServiceRow[]));
    } else {
      setClientServices([]);
    }
  }, [selectedAppt]);

  // Refresh today button — writes timestamp to shared DB row
  const handleRefreshToday = useCallback(async () => {
    setRefreshing(true);
    try {
      await supabase
        .from('booking_refresh_state')
        .upsert({ id: 1, last_refresh_at: new Date().toISOString(), updated_by: 'booking-ui' });
      const { error } = await supabase.functions.invoke('mindbody-sync', {
        body: JSON.stringify({ syncType: 'refresh-today', scope: 'recent' }),
      });
      if (error) throw error;
      setLastRefresh(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
      setRefreshBlocked(true);
      await loadAppts();
    } catch (e) {
      console.error('Refresh failed:', e);
    } finally {
      setRefreshing(false);
    }
  }, [loadAppts]);

  const visibleAppts = useMemo(() =>
    appts.filter(a => showCancelled || (a.status !== 'Cancelled' && !a.stale)),
    [appts, showCancelled]
  );

  // Build columns: only staff/resources with activity that day, filtered by location + exclusion
  const columns = useMemo(() => {
    const activeIds = new Set<string>();
    visibleAppts.forEach(a => { if (a.staff_id) activeIds.add(a.staff_id); });
    scheduleItems.forEach(s => { if (s.staff_id) activeIds.add(s.staff_id); });

    return data.staffByLocation.filter(s => {
      if (!activeIds.has(s.id)) return false;
      if (locationId !== 'all') {
        const hasApptHere = visibleAppts.some(a => a.staff_id === s.id && a.location_id === locationId);
        const hasSchedHere = scheduleItems.some(si => si.staff_id === s.id && si.location_id === locationId);
        if (!hasApptHere && !hasSchedHere) return false;
      }
      return true;
    });
  }, [visibleAppts, scheduleItems, data.staffByLocation, locationId]);

  // Group schedule by staff
  const scheduleByStaff = useMemo(() => {
    const m = new Map<string, ScheduleItem[]>();
    for (const s of scheduleItems) {
      const arr = m.get(s.staff_id) || [];
      arr.push(s);
      m.set(s.staff_id, arr);
    }
    return m;
  }, [scheduleItems]);

  // Hours range — default 08:00–20:00, expand if appointments/schedules go beyond
  const hours = useMemo(() => {
    let min = 8, max = 20;
    for (const a of visibleAppts) {
      min = Math.min(min, apptHour(a.start_datetime));
      max = Math.max(max, apptHour(a.end_datetime) + (apptMinute(a.end_datetime) > 0 ? 1 : 0));
    }
    for (const s of scheduleItems) {
      min = Math.min(min, apptHour(s.start_datetime));
      max = Math.max(max, apptHour(s.end_datetime) + (apptMinute(s.end_datetime) > 0 ? 1 : 0));
    }
    return [Math.max(0, min), Math.min(23, max)];
  }, [visibleAppts, scheduleItems]);

  const dayCounters = useMemo(() => {
    const total = visibleAppts.length;
    const bookedMinutes = visibleAppts.reduce((s, a) => s + (a.duration_minutes || 0), 0);
    const perStaff = new Map<string, number>();
    for (const a of visibleAppts) {
      if (a.staff_id) perStaff.set(a.staff_id, (perStaff.get(a.staff_id) || 0) + 1);
    }
    return { total, bookedHours: Math.round(bookedMinutes / 60 * 10) / 10, perStaff };
  }, [visibleAppts]);

  const clientName = (id: string | null) => id ? (clientNames[id] || '…') : '—';
  const locationLabel = locationId === 'all' ? 'All locations' : (data.locationMap.get(locationId)?.name || '');

  const onPrint = () => handlePrint(printRef, { fileName: buildPrintFileName({ report: 'Appointment-Book', period: date, location: locationLabel }) });

  return (
    <div className="flex h-full" ref={printRef}>
      <div className="flex-1 overflow-auto p-4">
        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <button onClick={() => setDate(addDays(date, -1))} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => setDate(todayStr())} className="rounded-lg px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50">Today</button>
            <button onClick={() => setDate(addDays(date, 1))} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button>
            <span className="ml-2 text-sm font-semibold text-slate-900">{fmtDate(date)}</span>
          </div>
          <select value={locationId} onChange={e => setLocationId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
            <option value="all">All locations</option>
            {data.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} className="rounded" />
            Show cancelled
          </label>
          <button
            onClick={handleRefreshToday}
            disabled={refreshing || refreshBlocked || budgetBlocked}
            className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing…' : budgetBlocked ? 'API budget limit' : refreshBlocked ? 'Wait 15 min' : 'Refresh today'}
          </button>
          <button
            onClick={onPrint}
            disabled={loading || columns.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            Print / PDF
          </button>
        </div>
        {lastRefresh && <div className="mb-2 text-xs text-slate-500">Data as of {lastRefresh}</div>}

        {/* Counters */}
        <div className="mb-4 flex gap-4 text-sm">
          <span className="font-semibold text-slate-900">{dayCounters.total} appointments</span>
          <span className="text-slate-600">{dayCounters.bookedHours} booked hours</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500">Loading…</div>
        ) : columns.length === 0 ? (
          <div className="py-12 text-center text-slate-500">No appointments for this day.</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-fit">
              {/* Header row */}
              <div className="flex border-b border-slate-200">
                <div className="w-16 shrink-0 py-2 pr-2 text-right text-xs font-semibold text-slate-400">Time</div>
                {columns.map(s => (
                  <div key={s.id} className="w-40 shrink-0 border-l border-slate-100 px-2 py-2 text-xs font-semibold text-slate-700">
                    {s.first_name} {s.last_name}
                  </div>
                ))}
              </div>
              {/* Hour rows */}
              {Array.from({ length: hours[1] - hours[0] }, (_, i) => hours[0] + i).map(h => (
                <div key={h} className="flex border-b border-slate-50" style={{ minHeight: 48 }}>
                  <div className="w-16 shrink-0 py-1 pr-2 text-right text-xs text-slate-400">{String(h).padStart(2, '0')}:00</div>
                  {columns.map(s => {
                    const staffAppts = visibleAppts.filter(a => a.staff_id === s.id && apptHour(a.start_datetime) === h);
                    const staffSched = (scheduleByStaff.get(s.id) || []).filter(sc => apptHour(sc.start_datetime) <= h && apptHour(sc.end_datetime) > h);
                    const unavailBlocks = staffSched.filter(sc => sc.kind === 'unavailable');
                    const isOff = unavailBlocks.length > 0;
                    return (
                      <div key={s.id} className={`relative w-40 shrink-0 border-l border-slate-100 px-1 py-1 ${isOff ? 'bg-slate-200/60' : ''}`}>
                        {isOff && staffAppts.length === 0 && (
                          <div className="rounded bg-slate-200 px-1.5 py-1 text-xs text-slate-500">
                            {unavailBlocks[0]?.description || 'Unavailable'}
                          </div>
                        )}
                        {staffAppts.map(a => (
                          <button
                            key={a.id}
                            onClick={() => setSelectedAppt(a)}
                            className={`mb-1 block w-full rounded border-l-2 px-1.5 py-1 text-left text-xs transition-shadow hover:shadow-sm ${STATUS_COLORS[a.status] || 'bg-slate-50 border-slate-200 text-slate-700'}`}
                          >
                            <div className="font-medium">{apptTime(a.start_datetime)} {data.sessionTypeMap.get(a.session_type_id)?.name?.split(' ').slice(0, 3).join(' ') || '—'}</div>
                            <div className="truncate text-slate-600">{clientName(a.client_id)}</div>
                            {a.status === 'NoShow' && <div className="text-[10px] font-medium text-rose-600">No-Show</div>}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Print-only layout */}
      <div className="print-report hidden">
        <h1>Appointment Book — {fmtDate(date)}</h1>
        <div className="pr-sub">{locationLabel} · {dayCounters.total} appointments · {dayCounters.bookedHours} booked hours{lastRefresh ? ` · Data as of ${lastRefresh}` : ''}</div>
        <table>
          <thead>
            <tr>
              <th style={{ width: 60 }}>Time</th>
              {columns.map(s => (
                <th key={s.id}>{s.first_name} {s.last_name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: hours[1] - hours[0] }, (_, i) => hours[0] + i).map(h => (
              <tr key={h}>
                <td style={{ fontWeight: 600, textAlign: 'center' }}>{String(h).padStart(2, '0')}:00</td>
                {columns.map(s => {
                  const staffAppts = visibleAppts.filter(a => a.staff_id === s.id && apptHour(a.start_datetime) === h);
                  const staffSched = (scheduleByStaff.get(s.id) || []).filter(sc => apptHour(sc.start_datetime) <= h && apptHour(sc.end_datetime) > h);
                  const unavailBlocks = staffSched.filter(sc => sc.kind === 'unavailable');
                  const isOff = unavailBlocks.length > 0;
                  if (isOff && staffAppts.length === 0) return <td key={s.id} style={{ background: '#f5f5f5', color: '#999' }}>{unavailBlocks[0]?.description || 'Unavailable'}</td>;
                  if (staffAppts.length === 0) return <td key={s.id}></td>;
                  return (
                    <td key={s.id}>
                      {staffAppts.map(a => (
                        <div key={a.id} style={{ marginBottom: 2 }}>
                          <strong>{apptTime(a.start_datetime)}</strong>{' '}
                          {data.sessionTypeMap.get(a.session_type_id)?.name?.split(' ').slice(0, 3).join(' ') || '—'}
                          <br />
                          <span style={{ color: '#666' }}>{clientName(a.client_id)}</span>
                          {a.status === 'NoShow' && <span style={{ color: '#c33', fontSize: 9 }}> · No-Show</span>}
                          {a.status && a.status !== 'Booked' && a.status !== 'NoShow' && (
                            <span style={{ color: '#999', fontSize: 9 }}> · {a.status}</span>
                          )}
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 2.2 Appointment details side panel */}
      {selectedAppt && (
        <ApptDetailsPanel
          appt={selectedAppt}
          data={data}
          clientNames={clientNames}
          clientDetails={clientDetails}
          clientServices={clientServices}
          onClose={() => setSelectedAppt(null)}
        />
      )}
    </div>
  );
}

// ─── 2.2 Appointment Details Panel ───

function ApptDetailsPanel({ appt, data, clientNames, clientDetails, clientServices, onClose }: {
  appt: Appt;
  data: ReturnType<typeof useReferenceData>;
  clientNames: Record<string, string>;
  clientDetails: Map<string, ClientRow>;
  clientServices: ClientServiceRow[];
  onClose: () => void;
}) {
  const staff = appt.staff_id ? data.staffMap.get(appt.staff_id) : null;
  const loc = appt.location_id ? data.locationMap.get(appt.location_id) : null;
  const st = appt.session_type_id ? data.sessionTypeMap.get(appt.session_type_id) : null;
  const clientName = appt.client_id ? (clientNames[appt.client_id] || '…') : '—';
  const client = appt.client_id ? clientDetails.get(appt.client_id) : null;
  const balance = client?.raw_data?.AccountBalance;
  const redAlert = client?.raw_data?.RedAlert;
  const yellowAlert = client?.raw_data?.YellowAlert;
  const clientNotes = client?.raw_data?.Notes;
  const activeService = clientServices.find(cs => cs.current) || clientServices[0];

  return (
    <div className="w-80 shrink-0 border-l border-slate-200 bg-white overflow-y-auto">
      <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Appointment Details</h3>
        <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-4 p-4 text-sm">
        <div>
          <div className="text-xs font-semibold uppercase text-slate-400">Client</div>
          <div className="mt-1 font-medium text-slate-900">{clientName}</div>
          {client?.mobile_phone && <div className="mt-0.5 flex items-center gap-1 text-slate-600"><Phone className="h-3 w-3" />{client.mobile_phone}</div>}
          {(redAlert || yellowAlert) && (
            <div className={`mt-1 rounded px-2 py-1 text-xs ${redAlert ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'}`}>
              <AlertCircle className="mr-1 inline h-3 w-3" />{redAlert || yellowAlert}
            </div>
          )}
          {clientNotes && <div className="mt-1 text-xs text-slate-600">{clientNotes}</div>}
          {balance != null && Number(balance) !== 0 && (
            <div className="mt-1 flex items-center gap-1 text-xs text-slate-600"><Wallet className="h-3 w-3" />Balance: {balance} EUR</div>
          )}
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-slate-400">Service</div>
          <div className="mt-1 text-slate-900">{st?.name || '—'}</div>
          <div className="mt-0.5 text-slate-600">{appt.duration_minutes || st?.default_duration_minutes || '—'} min</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-slate-400">Staff</div>
          <div className="mt-1 text-slate-900">{staff ? `${staff.first_name} ${staff.last_name}` : '—'}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-slate-400">Location</div>
          <div className="mt-1 flex items-center gap-1 text-slate-900"><MapPin className="h-3 w-3" />{loc?.name || '—'}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-slate-400">Time</div>
          <div className="mt-1 text-slate-900">{apptTime(appt.start_datetime)} – {apptTime(appt.end_datetime)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-slate-400">Status</div>
          <div className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[appt.status] || 'bg-slate-100 text-slate-700'}`}>{appt.status || '—'}</div>
        </div>
        {activeService && (
          <div>
            <div className="text-xs font-semibold uppercase text-slate-400">Package</div>
            <div className="mt-1 flex items-center gap-1 text-slate-900"><Package className="h-3 w-3" />{activeService.name}</div>
            <div className="mt-0.5 text-xs text-slate-600">{activeService.remaining} of {activeService.count} visits remain</div>
          </div>
        )}
        {appt.notes && (
          <div>
            <div className="text-xs font-semibold uppercase text-slate-400">Notes</div>
            <div className="mt-1 text-slate-700">{appt.notes}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 2.4 Daily Sales ───

function DailySalesView({ data }: { data: ReturnType<typeof useReferenceData> }) {
  const [date, setDate] = useState(todayStr());
  const [locationId, setLocationId] = useState('all');
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [money, setMoney] = useState<MoneyReceived | null>(null);

  useEffect(() => { loadClientNames().then(setClientNames).catch(() => {}); }, []);

  const loadSales = useCallback(async () => {
    setLoading(true);
    const dayStart = date + 'T00:00:00';
    const dayEnd = date + 'T23:59:59';
    let q = supabase.from('sales').select('*').gte('sale_datetime', dayStart).lte('sale_datetime', dayEnd).order('sale_datetime');
    if (locationId !== 'all') q = q.eq('location_id', locationId);
    const { data: salesRows, error } = await q;
    if (error) console.error(error);
    setSales(salesRows || []);
    // Use the same shared function as Overview so totals can never diverge
    const m = await computeMoneyReceived({ start: dayStart.slice(0, 10), end: dayEnd.slice(0, 10) }, locationId);
    setMoney(m);
    setLoading(false);
  }, [date, locationId]);

  useEffect(() => { loadSales(); }, [loadSales]);

  const grandTotal = money ? money.cashIn + money.cashInGiftCards + money.cashInDeposits : 0;

  const clientName = (id: string | null) => id ? (clientNames[id] || '…') : '—';

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => setDate(addDays(date, -1))} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-semibold text-slate-900">{fmtDate(date)}</span>
          <button onClick={() => setDate(addDays(date, 1))} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <select value={locationId} onChange={e => setLocationId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
          <option value="all">All locations</option>
          {data.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {/* Money received breakdown — same function as Overview */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Money received</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">Cash / Card</div>
            <div className="text-sm font-semibold text-slate-900">{(money?.cashIn ?? 0).toFixed(2)} EUR</div>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">Gift cards sold</div>
            <div className="text-sm font-semibold text-slate-900">{(money?.cashInGiftCards ?? 0).toFixed(2)} EUR</div>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">Deposits</div>
            <div className="text-sm font-semibold text-slate-900">{(money?.cashInDeposits ?? 0).toFixed(2)} EUR</div>
          </div>
          <div className="rounded-lg bg-blue-50 px-3 py-2">
            <div className="text-xs text-blue-600">Total (Money received)</div>
            <div className="text-sm font-bold text-blue-900">{grandTotal.toFixed(2)} EUR</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-500">Loading…</div>
      ) : sales.length === 0 ? (
        <div className="py-12 text-center text-slate-500">No sales for this day.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Items</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales.map(s => {
                const items = (s.raw_data?.PurchasedItems || []).map((i: any) => i.Description).join(', ');
                const time = s.sale_time || (s.sale_datetime ? new Date(s.sale_datetime).toTimeString().slice(0, 5) : '—');
                return (
                  <tr key={s.id} onClick={() => setSelectedSale(s)} className="cursor-pointer hover:bg-blue-50/50">
                    <td className="px-3 py-2 text-slate-600">{time}</td>
                    <td className="px-3 py-2 text-slate-900">{clientName(s.client_id)}</td>
                    <td className="px-3 py-2 text-slate-600">{items}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-900">{Number(s.payment_amount || 0).toFixed(2)} EUR</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Sale detail modal */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setSelectedSale(null)}>
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Receipt {selectedSale.mindbody_id}</h3>
              <button onClick={() => setSelectedSale(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="text-slate-600">{clientName(selectedSale.client_id)} · {selectedSale.sale_time}</div>
              <div>
                <div className="text-xs font-semibold uppercase text-slate-400">Items</div>
                {(selectedSale.raw_data?.PurchasedItems || []).map((i: any, idx: number) => (
                  <div key={idx} className="flex justify-between py-1 text-slate-700">
                    <span>{i.Description}</span>
                    <span>{Number(i.TotalAmount || 0).toFixed(2)} EUR</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-slate-400">Payments</div>
                {(selectedSale.raw_data?.Payments || []).map((p: any, idx: number) => (
                  <div key={idx} className="flex justify-between py-1 text-slate-700">
                    <span>{p.Type}</span>
                    <span>{Number(p.Amount || 0).toFixed(2)} EUR</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
                <span>Total</span>
                <span>{Number(selectedSale.payment_amount || 0).toFixed(2)} EUR</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 2.5 Staff Schedules ───

function StaffScheduleView({ data }: { data: ReturnType<typeof useReferenceData> }) {
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d.toISOString().slice(0, 10);
  });
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const load = useCallback(async () => {
    setLoading(true);
    const start = weekStart + 'T00:00:00Z';
    const end = addDays(weekStart, 7) + 'T00:00:00Z';
    const [schedRes, apptRes] = await Promise.all([
      supabase.from('staff_schedule_items').select('id, kind, staff_id, location_id, start_datetime, end_datetime, description')
        .gte('start_datetime', start).lt('start_datetime', end).eq('stale', false),
      supabase.from('appointments').select('*').gte('start_datetime', start).lt('start_datetime', end),
    ]);
    setSchedule((schedRes.data || []) as ScheduleItem[]);
    setAppts((apptRes.data || []) as Appt[]);
    setLoading(false);
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);

  const staffSchedules = useMemo(() => {
    const m = new Map<string, ScheduleItem[]>();
    for (const s of schedule) {
      const arr = m.get(s.staff_id) || [];
      arr.push(s);
      m.set(s.staff_id, arr);
    }
    return m;
  }, [schedule]);

  const staffAppts = useMemo(() => {
    const m = new Map<string, Appt[]>();
    for (const a of appts) {
      if (!a.staff_id) continue;
      const arr = m.get(a.staff_id) || [];
      arr.push(a);
      m.set(a.staff_id, arr);
    }
    return m;
  }, [appts]);

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-sm font-semibold text-slate-900">{fmtDate(weekStart)} – {fmtDate(addDays(weekStart, 6))}</span>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-500">Loading…</div>
      ) : (
        <div className="space-y-3">
          {data.staffByLocation.map(s => {
            const sched = staffSchedules.get(s.id) || [];
            const sAppts = staffAppts.get(s.id) || [];
            const availMinutes = sched.filter(sc => sc.kind === 'available').reduce((sum, sc) => sum + (new Date(sc.end_datetime).getTime() - new Date(sc.start_datetime).getTime()) / 60000, 0);
            const bookedMinutes = sAppts.filter(a => a.status !== 'Cancelled').reduce((sum, a) => sum + (a.duration_minutes || 0), 0);
            const util = availMinutes > 0 ? Math.round(bookedMinutes / availMinutes * 100) : 0;
            return (
              <div key={s.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-slate-900">{s.first_name} {s.last_name}</div>
                  <div className="text-xs text-slate-500">{Math.round(bookedMinutes / 60 * 10) / 10}h booked / {Math.round(availMinutes / 60 * 10) / 10}h available · {util}% utilisation</div>
                </div>
                <div className="mt-2 grid grid-cols-7 gap-1">
                  {weekDays.map(day => {
                    const daySched = sched.filter(sc => toLocalDate(sc.start_datetime) === day);
                    const dayAppts = sAppts.filter(a => toLocalDate(a.start_datetime) === day && a.status !== 'Cancelled');
                    const isOff = daySched.some(sc => sc.kind === 'unavailable');
                    return (
                      <div key={day} className={`rounded p-1.5 text-xs ${isOff ? 'bg-slate-100' : 'bg-slate-50'}`}>
                        <div className="font-medium text-slate-500">{fmtDate(day).split(' ')[0]}</div>
                        {daySched.filter(sc => sc.kind === 'available').map(sc => (
                          <div key={sc.id} className="mt-0.5 text-slate-600">{apptTime(sc.start_datetime)}–{apptTime(sc.end_datetime)}</div>
                        ))}
                        {daySched.filter(sc => sc.kind === 'unavailable').map(sc => (
                          <div key={sc.id} className="mt-0.5 text-red-600">Off: {sc.description || ''}</div>
                        ))}
                        {dayAppts.length > 0 && <div className="mt-0.5 font-medium text-blue-700">{dayAppts.length} appts</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── 2.6 Services & Prices ───

function ServicesView({ data }: { data: ReturnType<typeof useReferenceData> }) {
  const [pricingOptions, setPricingOptions] = useState<any[]>([]);
  const [staffSessionTypes, setStaffSessionTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchAllRows<any>('pricing_options', 'id, name, price, session_count, duration, expiration_days, program_id, program_name, service_type'),
      fetchAllRows<any>('staff_session_types', 'staff_id, session_type_id, pay_rate'),
    ]).then(([po, sst]) => { setPricingOptions(po); setStaffSessionTypes(sst); setLoading(false); });
  }, []);

  const byCategory = useMemo(() => {
    const m = new Map<string, { st: SessionTypeRow; options: any[] }[]>();
    for (const st of data.sessionTypes) {
      if (!st.name) continue;
      const cat = st.raw_data?.Category || 'Other';
      const options = pricingOptions.filter(po => po.program_id === st.program_id || po.name?.includes(st.name?.split(' ')[0] || '___'));
      const arr = m.get(cat) || [];
      arr.push({ st, options });
      m.set(cat, arr);
    }
    return m;
  }, [data.sessionTypes, pricingOptions]);

  const staffForSessionType = (stId: string) => {
    const staffIds = staffSessionTypes.filter(sst => sst.session_type_id === stId).map(sst => sst.staff_id);
    return staffIds.map(id => data.staffMap.get(id)).filter(Boolean);
  };

  if (loading) return <div className="py-12 text-center text-slate-500">Loading…</div>;

  return (
    <div className="p-4">
      <div className="space-y-6">
        {Array.from(byCategory.entries()).map(([cat, services]) => (
          <div key={cat}>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">{cat}</h3>
            <div className="space-y-2">
              {services.map(({ st, options }) => (
                <div key={st.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-slate-900">{st.name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {st.default_duration_minutes || st.raw_data?.DefaultTimeLength || '—'} min
                        {st.raw_data?.ResourceRequired && ' · Resource required'}
                        {st.raw_data?.AvailableForAddOn && ' · Add-on available'}
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      {staffForSessionType(st.id).map(s => (
                        <div key={s.id}>{s.first_name} {s.last_name}</div>
                      ))}
                    </div>
                  </div>
                  {options.length > 0 && (
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {options.map(po => (
                        <div key={po.id} className="rounded bg-slate-50 px-3 py-2 text-xs">
                          <div className="font-medium text-slate-800">{po.name}</div>
                          <div className="mt-0.5 text-slate-600">
                            {Number(po.price || 0).toFixed(2)} EUR
                            {po.session_count > 1 && ` · ${po.session_count} sessions`}
                            {po.expiration_days && ` · ${po.expiration_days}d validity`}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
