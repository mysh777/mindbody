import { supabase } from '../lib/supabase';
import { fetchAllPages } from '../lib/fetchAllPages';
import { computeMarginVisitsByMonth, computeMoneyReceivedByMonth, summarizeVisits } from '../hooks/useSalesMarginData';
import { computeSalesByDateData } from '../hooks/useSalesByDateData';
import { loadSegmentData, loadSegmentSettings, computeSegments } from './clientSegments';
import { lastDayOfMonth } from './ownerFormat';

export const OVERVIEW_LOCATIONS = [
  { id: 'all', label: 'All' },
  { id: '1', label: 'Center' },
  { id: '3', label: 'Alfa' },
] as const;
export type OverviewLocation = typeof OVERVIEW_LOCATIONS[number]['id'];

export const SERIES_START_MONTH = '2025-01';

export interface MonthMetrics {
  salesByService: number;
  moneyReceived: number;
  moneyGiftCards: number;
  moneyDeposits: number;
  paidFromAccount: number;
  paidByGiftCard: number;
  moneyByType: Record<string, number>;
  revenueEarned: number;
  staffCost: number;
  grossMargin: number;
  marginPercent: number;
  visits: number;
  avgPerVisit: number;
  newClients: number;
}

export interface OverviewRow {
  month: string;
  location: string;
  metrics: MonthMetrics;
  categories: Record<string, number>;
  tariffs: Record<string, number>;
}

export interface OverviewSeries {
  computedAt: string | null;
  months: string[];
  // Keys are "YYYY-MM|location".
  metrics: Record<string, MonthMetrics>;
  categories: Record<string, Record<string, number>>;
  tariffs: Record<string, Record<string, number>>;
}

export const seriesKey = (month: string, location: string) => `${month}|${location}`;

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const roundValues = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, round2(v)]));

// Every figure comes from the same functions as the detailed reports. Used by the nightly job and by Reconciliation.
export async function computeOverviewMonths(fromMonth: string, toMonth: string): Promise<OverviewRow[]> {
  const months = monthsBetween(fromMonth, toMonth);
  const range = { start: `${fromMonth}-01`, end: lastDayOfMonth(toMonth) };

  // Segment queries scan whole tables and time out when they compete with the heavy loads below.
  const [segmentData, segmentSettings] = await Promise.all([loadSegmentData(), loadSegmentSettings()]);
  const [sales, visitsByKey, moneyByKey] = await Promise.all([
    computeSalesByDateData(range, 'all'),
    computeMarginVisitsByMonth(range),
    computeMoneyReceivedByMonth(range),
  ]);

  const rows: OverviewRow[] = [];
  for (const loc of OVERVIEW_LOCATIONS) {
    const cohorts = computeSegments(segmentData, { ...segmentSettings.settings, periodMonths: months.length }, toMonth, loc.id).cohorts;
    const newByMonth = new Map(cohorts.map(c => [c.month, c.newCount]));

    for (const month of months) {
      const key = seriesKey(month, loc.id);
      const categories: Record<string, number> = {};
      const tariffs: Record<string, number> = {};
      let salesTotal = 0;
      for (const [salesKey, tariffMap] of sales.byMonth) {
        const [m, saleLoc] = salesKey.split('|');
        if (m !== month || (loc.id !== 'all' && saleLoc !== loc.id)) continue;
        for (const [name, entry] of tariffMap) {
          salesTotal += entry.revenue;
          const category = entry.category || 'Other services';
          categories[category] = (categories[category] || 0) + entry.revenue;
          tariffs[name] = (tariffs[name] || 0) + entry.revenue;
        }
      }

      const v = summarizeVisits(visitsByKey.get(key) || []);
      const money = moneyByKey.get(key);
      rows.push({
        month,
        location: loc.id,
        categories: roundValues(categories),
        tariffs: roundValues(tariffs),
        metrics: {
          salesByService: round2(salesTotal),
          moneyReceived: round2(money?.cashIn ?? 0),
          moneyGiftCards: round2(money?.cashInGiftCards ?? 0),
          moneyDeposits: round2(money?.cashInDeposits ?? 0),
          paidFromAccount: round2(money?.paidFromAccount ?? 0),
          paidByGiftCard: round2(money?.paidByGiftCard ?? 0),
          moneyByType: roundValues(money?.byType ?? {}),
          revenueEarned: round2(v.revenueEarned),
          staffCost: round2(v.staffCost),
          grossMargin: round2(v.grossMargin),
          marginPercent: v.marginPercent,
          visits: v.totalAppointments,
          avgPerVisit: v.totalAppointments > 0 ? round2(v.revenueEarned / v.totalAppointments) : 0,
          newClients: newByMonth.get(month) ?? 0,
        },
      });
    }
  }
  return rows;
}

interface StoredRow {
  month: string;
  location: string;
  metrics: MonthMetrics;
  categories: Record<string, number>;
  tariffs: Record<string, number>;
  computed_at: string;
}

export async function loadStoredOverviewRows(months?: string[]): Promise<StoredRow[]> {
  return fetchAllPages<StoredRow>((from, to) => {
    let q = supabase.from('overview_monthly_totals').select('month, location, metrics, categories, tariffs, computed_at');
    if (months) q = q.in('month', months);
    return q.order('month').order('location').range(from, to);
  });
}

// Totals are computed nightly by the overview-totals job; the page only reads them.
export async function loadOverviewSeries(): Promise<OverviewSeries> {
  const rows = await loadStoredOverviewRows();
  const series: OverviewSeries = { computedAt: null, months: [], metrics: {}, categories: {}, tariffs: {} };
  const months = new Set<string>();
  for (const r of rows) {
    const key = seriesKey(r.month, r.location);
    series.metrics[key] = r.metrics;
    series.categories[key] = r.categories || {};
    series.tariffs[key] = r.tariffs || {};
    months.add(r.month);
    if (!series.computedAt || r.computed_at > series.computedAt) series.computedAt = r.computed_at;
  }
  series.months = [...months].sort();
  return series;
}

export interface ObligationSnapshot {
  as_of_date: string;
  total: number;
  remaining_visits: number;
  clients: number;
  computed_at: string;
}

export async function loadObligationSnapshots(): Promise<ObligationSnapshot[]> {
  const { data, error } = await supabase
    .from('obligation_snapshots')
    .select('as_of_date, total, remaining_visits, clients, computed_at')
    .order('as_of_date', { ascending: false })
    .limit(400);
  if (error) throw new Error(error.message);
  return (data || []).map(r => ({ ...r, total: Number(r.total) }));
}

export async function requestOverviewRecompute(body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/overview-totals`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.error || `Recalculation failed (${res.status})`);
}
