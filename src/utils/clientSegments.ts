import { supabase } from '../lib/supabase';
import { fetchAllPages } from '../lib/fetchAllPages';
import { chunkIds } from '../lib/fetchByIds';
import { isPackageActive, toLocalISO, PACKAGE_STATUS_COLUMNS } from './packageStatus';

export interface SegmentSettings {
  periodMonths: number;
  loyalMinActiveMonths: number;
  loyalIfActivePackage: boolean;
  oneoffMaxVisits: number;
  oneoffMinDaysSinceLast: number;
  secondVisitWindowDays: number;
  regularWindowDays: number;
  regularMinVisits: number;
  excludedClientIds: string[];
}

export const DEFAULT_SEGMENT_SETTINGS: SegmentSettings = {
  periodMonths: 6,
  loyalMinActiveMonths: 3,
  loyalIfActivePackage: true,
  oneoffMaxVisits: 2,
  oneoffMinDaysSinceLast: 30,
  secondVisitWindowDays: 60,
  regularWindowDays: 90,
  regularMinVisits: 3,
  excludedClientIds: [],
};

const SETTINGS_COLUMNS: Record<keyof SegmentSettings, string> = {
  periodMonths: 'period_months',
  loyalMinActiveMonths: 'loyal_min_active_months',
  loyalIfActivePackage: 'loyal_if_active_package',
  oneoffMaxVisits: 'oneoff_max_visits',
  oneoffMinDaysSinceLast: 'oneoff_min_days_since_last',
  secondVisitWindowDays: 'second_visit_window_days',
  regularWindowDays: 'regular_window_days',
  regularMinVisits: 'regular_min_visits',
  excludedClientIds: 'excluded_client_ids',
};

const OUR_DATA_START = '2025-01-01';
const SYSTEM_CLIENT_ID = '1';

export type SettingsSource = 'saved' | 'noTable' | 'noRow';

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205']);

export async function loadSegmentSettings(): Promise<{ settings: SegmentSettings; source: SettingsSource }> {
  const { data, error } = await supabase.from('client_segment_settings').select('*').eq('id', 'global').maybeSingle();
  if (error) {
    if (MISSING_TABLE_CODES.has(error.code)) return { settings: DEFAULT_SEGMENT_SETTINGS, source: 'noTable' };
    throw new Error(`Could not read segment settings: ${error.message}`);
  }
  if (!data) return { settings: DEFAULT_SEGMENT_SETTINGS, source: 'noRow' };
  const settings = { ...DEFAULT_SEGMENT_SETTINGS };
  for (const [key, col] of Object.entries(SETTINGS_COLUMNS) as [keyof SegmentSettings, string][]) {
    const value = data[col];
    if (value === null || value === undefined) continue;
    const valid = key === 'excludedClientIds'
      ? Array.isArray(value) && value.every(v => typeof v === 'string')
      : typeof value === typeof DEFAULT_SEGMENT_SETTINGS[key];
    if (!valid) throw new Error(`Segment setting "${col}" has an unexpected value`);
    (settings as Record<string, unknown>)[key] = value;
  }
  return { settings, source: 'saved' };
}

export async function saveSegmentSettings(settings: SegmentSettings): Promise<void> {
  const row: Record<string, unknown> = { id: 'global', updated_at: new Date().toISOString() };
  for (const [key, col] of Object.entries(SETTINGS_COLUMNS) as [keyof SegmentSettings, string][]) row[col] = settings[key];
  const { error } = await supabase.from('client_segment_settings').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export interface SegmentClient {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  promoEmail: boolean;
  promoSms: boolean;
  mindbodyFirstVisit: string | null;
  activePackage: string | null;
}

interface PaidVisit {
  date: string;
  locationId: string | null;
}

export interface SegmentData {
  visitsByClient: Map<string, PaidVisit[]>;
  freeVisitsByClient: Map<string, PaidVisit[]>;
  clientsWithFutureBooking: Set<string>;
  clients: Map<string, SegmentClient>;
  staleVisitsIgnored: number;
  today: string;
}

async function loadFreeClientServiceIds(): Promise<Set<string>> {
  const zeroItems = await fetchAllPages<{ sale_id: string; payment_ref_id: string | number }>((from, to) => supabase
    .from('sale_items').select('sale_id, payment_ref_id')
    .eq('total_amount', 0).not('payment_ref_id', 'is', null)
    .order('id').range(from, to));
  const saleIds = [...new Set(zeroItems.map(i => i.sale_id))];
  const typesBySale = new Map<string, Set<string>>();
  for (const batch of chunkIds(saleIds)) {
    const rows = await fetchAllPages<{ sale_id: string; type: string }>((from, to) => supabase
      .from('payments').select('sale_id, type').in('sale_id', batch).order('id').range(from, to));
    for (const p of rows) {
      const set = typesBySale.get(p.sale_id) ?? new Set<string>();
      set.add(p.type);
      typesBySale.set(p.sale_id, set);
    }
  }
  const free = new Set<string>();
  for (const item of zeroItems) {
    const types = typesBySale.get(item.sale_id);
    if (types && types.size > 0 && [...types].every(t => t === 'Comp/Guest')) free.add(String(item.payment_ref_id));
  }
  return free;
}

export async function loadSegmentData(): Promise<SegmentData> {
  const today = toLocalISO(new Date());

  const [appts, staleCount, future, freeRefs, packages] = await Promise.all([
    fetchAllPages<{ client_id: string | null; start_datetime: string; location_id: string | null; client_service_id: string | null }>((from, to) => supabase
      .from('appointments').select('client_id, start_datetime, location_id, client_service_id')
      .eq('status', 'Completed').eq('stale', false)
      .order('id').range(from, to)),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'Completed').eq('stale', true),
    fetchAllPages<{ client_id: string | null }>((from, to) => supabase
      .from('appointments').select('client_id')
      .in('status', ['Booked', 'Confirmed']).eq('stale', false).gte('start_datetime', today)
      .order('id').range(from, to)),
    loadFreeClientServiceIds(),
    fetchAllPages<any>((from, to) => supabase
      .from('client_services').select(`client_id, name, remaining, expiration_date, ${PACKAGE_STATUS_COLUMNS}`)
      .gt('remaining', 0).order('id').range(from, to)),
  ]);
  if (staleCount.error) throw new Error(staleCount.error.message);

  const visitsByClient = new Map<string, PaidVisit[]>();
  const freeVisitsByClient = new Map<string, PaidVisit[]>();
  for (const a of appts) {
    if (!a.client_id || a.client_id === SYSTEM_CLIENT_ID) continue;
    const isFree = !!a.client_service_id && freeRefs.has(String(a.client_service_id));
    const target = isFree ? freeVisitsByClient : visitsByClient;
    const list = target.get(a.client_id) ?? [];
    list.push({ date: a.start_datetime.slice(0, 10), locationId: a.location_id });
    target.set(a.client_id, list);
  }
  for (const list of visitsByClient.values()) list.sort((x, y) => x.date.localeCompare(y.date));

  const activePackageByClient = new Map<string, { name: string; remaining: number }>();
  for (const cs of packages) {
    if (!cs.client_id || !isPackageActive(cs, today)) continue;
    const prev = activePackageByClient.get(cs.client_id);
    if (!prev || cs.remaining > prev.remaining) activePackageByClient.set(cs.client_id, { name: cs.name || 'Package', remaining: cs.remaining });
  }

  const clients = new Map<string, SegmentClient>();
  const ids = [...visitsByClient.keys()];
  for (const batch of chunkIds(ids)) {
    const { data, error } = await supabase.from('clients')
      .select('id, first_name, last_name, email, mobile_phone, home_phone, fad:raw_data->>FirstAppointmentDate, promo_email:raw_data->SendPromotionalEmails, promo_sms:raw_data->SendPromotionalTexts')
      .in('id', batch);
    if (error) throw new Error(error.message);
    for (const c of (data || []) as any[]) {
      const pkg = activePackageByClient.get(c.id);
      clients.set(c.id, {
        id: c.id,
        firstName: c.first_name || '',
        lastName: c.last_name || '',
        phone: c.mobile_phone || c.home_phone || '',
        email: c.email || '',
        promoEmail: c.promo_email === true,
        promoSms: c.promo_sms === true,
        mindbodyFirstVisit: c.fad ? String(c.fad).slice(0, 10) : null,
        activePackage: pkg ? `${pkg.name} (${pkg.remaining} left)` : null,
      });
    }
  }

  return {
    visitsByClient,
    freeVisitsByClient,
    clientsWithFutureBooking: new Set(future.map(f => f.client_id).filter((id): id is string => !!id)),
    clients,
    staleVisitsIgnored: staleCount.count ?? 0,
    today,
  };
}

export type SegmentKey = 'loyal' | 'oneoff' | 'tooEarly' | 'irregular';

export interface SegmentRow {
  clientId: string;
  visitsInPeriod: number;
  lastVisit: string;
  isNew: boolean;
}

export interface CohortRow {
  month: string;
  newCount: number;
  returned: number;
  regular: number;
  returnedEver: number;
  returnedPartial: boolean;
  regularPartial: boolean;
  newIds: string[];
  returnedIds: string[];
  regularIds: string[];
}

export interface SegmentResult {
  months: string[];
  periodStart: string;
  periodEnd: string;
  segments: Record<SegmentKey, SegmentRow[]>;
  totalClients: number;
  newInPeriod: number;
  oneoffNew: number;
  excludedByMindbodyHistory: number;
  freeOnlyInPeriod: number;
  freeVisitsExcluded: number;
  excludedCards: number;
  cohorts: CohortRow[];
}

export function monthsEnding(endMonth: string, count: number): string[] {
  const [y, m] = endMonth.split('-').map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Several services on the same day count as one visit.
function visitDays(visits: PaidVisit[]): string[] {
  return [...new Set(visits.map(v => v.date))];
}

export function computeSegments(data: SegmentData, settings: SegmentSettings, endMonth: string, location: string): SegmentResult {
  const months = monthsEnding(endMonth, settings.periodMonths);
  const periodStart = `${months[0]}-01`;
  const periodEnd = lastDayOf(months[months.length - 1]);
  const monthSet = new Set(months);
  const atLocation = (v: PaidVisit) => location === 'all' || v.locationId === location;
  const excluded = new Set(settings.excludedClientIds);

  const segments: Record<SegmentKey, SegmentRow[]> = { loyal: [], oneoff: [], tooEarly: [], irregular: [] };
  const cohortMap = new Map<string, CohortRow>(months.map(m => [m, {
    month: m, newCount: 0, returned: 0, regular: 0, returnedEver: 0,
    returnedPartial: addDays(lastDayOf(m), settings.secondVisitWindowDays) > data.today,
    regularPartial: addDays(lastDayOf(m), settings.regularWindowDays) > data.today,
    newIds: [], returnedIds: [], regularIds: [],
  }]));
  const newIds = new Set<string>();
  let excludedByMindbodyHistory = 0;

  for (const [clientId, visits] of data.visitsByClient) {
    if (excluded.has(clientId)) continue;
    const client = data.clients.get(clientId);
    if (!client) continue;
    const days = visitDays(visits);
    const firstVisit = visits[0];

    const firstMonth = firstVisit.date.slice(0, 7);
    if (monthSet.has(firstMonth) && atLocation(firstVisit)) {
      if (client.mindbodyFirstVisit && client.mindbodyFirstVisit < OUR_DATA_START) {
        excludedByMindbodyHistory++;
      } else {
        newIds.add(clientId);
        const cohort = cohortMap.get(firstMonth)!;
        cohort.newCount++;
        cohort.newIds.push(clientId);
        if (days.length >= 2) cohort.returnedEver++;
        if (days.length >= 2 && daysBetween(days[0], days[1]) <= settings.secondVisitWindowDays) {
          cohort.returned++;
          cohort.returnedIds.push(clientId);
        }
        if (days.filter(d => daysBetween(days[0], d) <= settings.regularWindowDays).length >= settings.regularMinVisits) {
          cohort.regular++;
          cohort.regularIds.push(clientId);
        }
      }
    }

    const inPeriod = visits.filter(v => v.date >= periodStart && v.date <= periodEnd && atLocation(v));
    if (inPeriod.length === 0) continue;
    const periodDays = visitDays(inPeriod);
    const lastVisit = periodDays[periodDays.length - 1];
    const row: SegmentRow = { clientId, visitsInPeriod: periodDays.length, lastVisit, isNew: false };
    const activeMonths = new Set(periodDays.map(d => d.slice(0, 7))).size;

    if (activeMonths >= settings.loyalMinActiveMonths || (settings.loyalIfActivePackage && client.activePackage)) {
      segments.loyal.push(row);
      continue;
    }
    const hasLaterVisit = days[days.length - 1] > lastVisit;
    if (periodDays.length <= settings.oneoffMaxVisits && !hasLaterVisit && !data.clientsWithFutureBooking.has(clientId)) {
      if (daysBetween(lastVisit, data.today) >= settings.oneoffMinDaysSinceLast) segments.oneoff.push(row);
      else segments.tooEarly.push(row);
      continue;
    }
    segments.irregular.push(row);
  }

  let freeOnlyInPeriod = 0;
  let freeVisitsExcluded = 0;
  for (const [clientId, visits] of data.freeVisitsByClient) {
    if (excluded.has(clientId)) continue;
    freeVisitsExcluded += visits.length;
    if (data.visitsByClient.has(clientId)) continue;
    if (visits.some(v => v.date >= periodStart && v.date <= periodEnd && atLocation(v))) freeOnlyInPeriod++;
  }

  for (const list of Object.values(segments)) {
    for (const row of list) row.isNew = newIds.has(row.clientId);
    list.sort((a, b) => b.lastVisit.localeCompare(a.lastVisit));
  }

  return {
    months,
    periodStart,
    periodEnd,
    segments,
    totalClients: Object.values(segments).reduce((s, l) => s + l.length, 0),
    newInPeriod: newIds.size,
    oneoffNew: segments.oneoff.filter(r => r.isNew).length,
    excludedByMindbodyHistory,
    freeOnlyInPeriod,
    freeVisitsExcluded,
    excludedCards: excluded.size,
    cohorts: months.map(m => cohortMap.get(m)!),
  };
}

function normalizePhone(raw: string): string {
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (digits.startsWith('+')) return digits.length > 8 ? `+${digits.slice(1).replace(/\D/g, '')}` : '';
  digits = digits.replace(/\D/g, '');
  if (digits.length === 8) return `+371${digits}`;
  if (digits.length === 11 && digits.startsWith('371')) return `+${digits}`;
  return '';
}

export interface MetaRow {
  email: string;
  phone: string;
  fn: string;
  ln: string;
  country: string;
}

export function buildMetaRows(clientIds: string[], clients: Map<string, SegmentClient>): MetaRow[] {
  const rows: MetaRow[] = [];
  for (const id of clientIds) {
    const c = clients.get(id);
    if (!c) continue;
    const email = c.promoEmail ? c.email.trim().toLowerCase() : '';
    const phone = c.promoSms ? normalizePhone(c.phone) : '';
    if (!email && !phone) continue;
    rows.push({ email, phone, fn: c.firstName.trim(), ln: c.lastName.trim(), country: 'LV' });
  }
  return rows;
}
