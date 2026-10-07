import { supabase } from '../lib/supabase';
import { fetchAllPages } from '../lib/fetchAllPages';
import { computeMarginVisitsByMonth, type PricedVisit } from '../hooks/useSalesMarginData';
import { toLocalISO } from './datePresets';
import { lastDayOfMonth, shiftMonth } from './ownerFormat';
import { seriesKey } from './ownerOverview';

// Appointment and schedule times are studio-local times stored with a UTC label,
// so all calendar math here uses the UTC getters to avoid a timezone shift.
const HOUR = 3600000;
export const HEAT_HOURS = Array.from({ length: 15 }, (_, i) => i + 7);
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const EQUIPMENT_STAFF_IDS = new Set(['6', '100000023', '3', '100000039', '100000040']);

type Interval = [number, number];

function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  const out: Interval[] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

function subtractIntervals(base: Interval[], cut: Interval[]): Interval[] {
  let result = base;
  for (const [cs, ce] of cut) {
    const next: Interval[] = [];
    for (const [s, e] of result) {
      if (ce <= s || cs >= e) { next.push([s, e]); continue; }
      if (cs > s) next.push([s, cs]);
      if (ce < e) next.push([ce, e]);
    }
    result = next;
  }
  return result;
}

const totalHours = (list: Interval[]) => list.reduce((s, [a, b]) => s + (b - a), 0) / HOUR;

const weekdayOf = (ms: number) => (new Date(ms).getUTCDay() + 6) % 7;

// Spreads each interval over the hour cells it touches, in hours.
function addToCells(cells: Map<string, number>, [s, e]: Interval) {
  let t = s;
  while (t < e) {
    const d = new Date(t);
    const hourStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours());
    const until = Math.min(e, hourStart + HOUR);
    const key = `${weekdayOf(t)}|${d.getUTCHours()}`;
    cells.set(key, (cells.get(key) || 0) + (until - t) / HOUR);
    t = until;
  }
}

const parseMs = (iso: string) => Date.parse(iso);

export interface StaffLoadRow {
  staffId: string;
  name: string;
  isEquipment: boolean;
  workHours: number;
  visitHours: number;
  visits: number;
  utilisation: number | null;
  revenueEarned: number;
  revenuePerHour: number | null;
  staffCost: number;
  revenueLastYear: number;
}

export interface HeatCell {
  weekday: number;
  hour: number;
  avgClients: number;
  avgStarts: number;
  fillPercent: number | null;
}

export interface MonthDetail {
  staff: StaffLoadRow[];
  heat: HeatCell[];
  totalVisits: number;
  daysCounted: number;
  hasSchedule: boolean;
}

interface ScheduleRow {
  staff_id: string;
  kind: 'available' | 'unavailable';
  location_id: string | null;
  start_datetime: string;
  end_datetime: string;
}

export async function loadMonthDetail(month: string, location: string): Promise<MonthDetail> {
  const lastYear = shiftMonth(month, -12);
  const start = `${month}-01`;
  const end = lastDayOfMonth(month);

  const [current, previous, schedule, staffRes] = await Promise.all([
    computeMarginVisitsByMonth({ start, end }),
    computeMarginVisitsByMonth({ start: `${lastYear}-01`, end: lastDayOfMonth(lastYear) }),
    fetchAllPages<ScheduleRow>((from, to) => supabase
      .from('staff_schedule_items')
      .select('staff_id, kind, location_id, start_datetime, end_datetime')
      .gte('start_datetime', start)
      .lte('start_datetime', `${end}T23:59:59`)
      .eq('stale', false)
      .order('id').range(from, to)),
    supabase.from('staff').select('id, first_name, last_name'),
  ]);
  if (staffRes.error) throw new Error(staffRes.error.message);
  const names = new Map((staffRes.data || []).map(s => [s.id, `${s.first_name || ''} ${s.last_name || ''}`.replace(/\s+/g, ' ').trim() || s.id]));

  const visits = current.get(seriesKey(month, location)) || [];
  const lastYearVisits = previous.get(seriesKey(lastYear, location)) || [];

  const availableByStaff = new Map<string, Interval[]>();
  const unavailableByStaff = new Map<string, Interval[]>();
  for (const row of schedule) {
    const iv: Interval = [parseMs(row.start_datetime), parseMs(row.end_datetime)];
    if (row.kind === 'available') {
      if (location !== 'all' && row.location_id !== location) continue;
      availableByStaff.set(row.staff_id, [...(availableByStaff.get(row.staff_id) || []), iv]);
    } else {
      unavailableByStaff.set(row.staff_id, [...(unavailableByStaff.get(row.staff_id) || []), iv]);
    }
  }
  const workByStaff = new Map<string, Interval[]>();
  for (const [staffId, list] of availableByStaff) {
    workByStaff.set(staffId, subtractIntervals(mergeIntervals(list), mergeIntervals(unavailableByStaff.get(staffId) || [])));
  }

  const visitsByStaff = new Map<string, PricedVisit[]>();
  for (const v of visits) {
    const id = v.staff_id || 'unknown';
    visitsByStaff.set(id, [...(visitsByStaff.get(id) || []), v]);
  }
  const lastYearRevenue = new Map<string, number>();
  for (const v of lastYearVisits) {
    const id = v.staff_id || 'unknown';
    lastYearRevenue.set(id, (lastYearRevenue.get(id) || 0) + (v.revenue ?? 0));
  }

  const intervalOf = (v: PricedVisit): Interval | null =>
    v.end_datetime ? [parseMs(v.start_datetime), parseMs(v.end_datetime)] : null;

  const staffIds = new Set([...visitsByStaff.keys(), ...workByStaff.keys()]);
  const staff: StaffLoadRow[] = [];
  for (const staffId of staffIds) {
    const list = visitsByStaff.get(staffId) || [];
    const work = workByStaff.get(staffId) || [];
    const workHours = totalHours(work);
    if (list.length === 0 && workHours === 0) continue;
    // Overlapping bookings of one staff member count once.
    const visitHours = totalHours(mergeIntervals(list.map(intervalOf).filter((x): x is Interval => !!x)));
    const revenueEarned = list.reduce((s, v) => s + (v.revenue ?? 0), 0);
    const name = names.get(staffId) || (staffId === 'unknown' ? 'No staff' : staffId);
    staff.push({
      staffId,
      name,
      isEquipment: EQUIPMENT_STAFF_IDS.has(staffId),
      workHours,
      visitHours,
      visits: list.length,
      utilisation: workHours > 0 ? (visitHours / workHours) * 100 : null,
      revenueEarned,
      revenuePerHour: workHours > 0 ? revenueEarned / workHours : null,
      staffCost: list.reduce((s, v) => s + v.staffCost, 0),
      revenueLastYear: lastYearRevenue.get(staffId) || 0,
    });
  }
  staff.sort((a, b) => b.revenueEarned - a.revenueEarned);

  // Heatmap: days of the month that already happened, counted per weekday.
  const today = toLocalISO(new Date());
  const lastCounted = end < today ? end : today;
  const weekdayCount = new Array(7).fill(0);
  let daysCounted = 0;
  for (let d = Date.parse(`${start}T00:00:00Z`); d <= Date.parse(`${lastCounted}T00:00:00Z`); d += 24 * HOUR) {
    weekdayCount[weekdayOf(d)]++;
    daysCounted++;
  }

  const clientHours = new Map<string, number>();
  const starts = new Map<string, number>();
  const busyStaffHours = new Map<string, number>();
  const workCells = new Map<string, number>();

  const byClientDay = new Map<string, Interval[]>();
  for (const v of visits) {
    const iv = intervalOf(v);
    const startMs = parseMs(v.start_datetime);
    const startKey = `${weekdayOf(startMs)}|${new Date(startMs).getUTCHours()}`;
    starts.set(startKey, (starts.get(startKey) || 0) + 1);
    if (!iv) continue;
    const key = `${v.client_id || v.id}|${v.start_datetime.slice(0, 10)}`;
    byClientDay.set(key, [...(byClientDay.get(key) || []), iv]);
  }
  // A client with two services at once is one person in the studio.
  for (const list of byClientDay.values()) mergeIntervals(list).forEach(iv => addToCells(clientHours, iv));
  for (const list of visitsByStaff.values()) {
    mergeIntervals(list.map(intervalOf).filter((x): x is Interval => !!x)).forEach(iv => addToCells(busyStaffHours, iv));
  }
  for (const list of workByStaff.values()) list.forEach(iv => addToCells(workCells, iv));

  const heat: HeatCell[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    for (const hour of HEAT_HOURS) {
      const key = `${weekday}|${hour}`;
      const days = weekdayCount[weekday] || 0;
      const work = workCells.get(key) || 0;
      heat.push({
        weekday,
        hour,
        avgClients: days ? (clientHours.get(key) || 0) / days : 0,
        avgStarts: days ? (starts.get(key) || 0) / days : 0,
        fillPercent: work > 0 ? ((busyStaffHours.get(key) || 0) / work) * 100 : null,
      });
    }
  }

  return { staff, heat, totalVisits: visits.length, daysCounted, hasSchedule: workByStaff.size > 0 };
}
