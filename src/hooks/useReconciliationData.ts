import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { computeSalesByDateData, type SalesByDateResult, type ClientTariffDetail } from './useSalesByDateData';
import { computeStaffCostByLocation, computeStaffCostByStaff, computeMoneyReceived, computeTariffCoverage, type MoneyReceived } from './useSalesMarginData';
import type { DateRange } from '../utils/salesFilters';
import { computeOverviewMonths, loadStoredOverviewRows, type MonthMetrics } from '../utils/ownerOverview';

const CASH_TYPES = new Set(['Visa/MC', 'AMEX', 'Check', 'Cash']);
const NON_CASH_TYPES = new Set(['Prepaid Gift Card', 'Account', 'Comp/Guest', 'Other']);
const KNOWN_TYPES = new Set([...CASH_TYPES, ...NON_CASH_TYPES]);

export interface RefCheck {
  period: string;
  metric: string;
  location: string;
  expected: number;
  actual: number | null;
  diff: number | null;
  ok: boolean;
  error: string | null;
}

export interface BaselineDrift {
  period: string;
  report: string;
  location: string;
  key: string;
  baselineQty: number;
  baselineValue: number;
  currentQty: number;
  currentValue: number;
}

export interface CaseCheck {
  caseNumber: number;
  description: string;
  period: string;
  clientId: string | null;
  tariffName: string | null;
  expectedValue: number | null;
  expectedQty: number | null;
  tolerance: number | null;
  actualValue: number | null;
  actualQty: number | null;
  ok: boolean;
  note: string | null;
  error: string | null;
  clientDetails: ClientTariffDetail[];
}

export interface UnknownPaymentType {
  type: string;
  saleCount: number;
  totalAmount: number;
}

export interface TariffQualityCheck {
  period: string;
  totalVisits: number;
  packageWithoutTariff: number;
  packageWithoutTariffPct: number;
  visitsWithoutTariff: number;
  visitsWithoutTariffPct: number;
  ok: boolean;
  error: string | null;
}

export interface StoredTotalsCheck {
  period: string;
  location: string;
  metric: string;
  stored: number | null;
  recomputed: number;
  ok: boolean;
}

const STORED_TOTALS_METRICS: (keyof MonthMetrics)[] = ['salesByService', 'moneyReceived', 'revenueEarned', 'staffCost', 'visits', 'newClients'];

export const TARIFF_QUALITY_THRESHOLD_PCT = 10;
const TARIFF_QUALITY_MONTHS = 3;

export interface ReconciliationResult {
  references: RefCheck[];
  baselineDrifts: BaselineDrift[];
  cases: CaseCheck[];
  unknownPaymentTypes: UnknownPaymentType[];
  tariffQuality: TariffQualityCheck[];
  storedTotals: StoredTotalsCheck[];
  allOk: boolean;
  checkedAt: string;
  baselineExists: boolean;
  errors: string[];
}

export interface BaselineSaveResult {
  ok: boolean;
  message: string;
}

function periodToDateRange(period: string): DateRange {
  const [y, m] = period.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

type SalesCacheEntry = { ok: true; result: SalesByDateResult } | { ok: false; error: string };
type SalesCache = Map<string, SalesCacheEntry>;

const moneyCache = new WeakMap<SalesCache, Map<string, Promise<MoneyReceived>>>();

function getMoneyForPeriod(cache: SalesCache, period: string, location: string): Promise<MoneyReceived> {
  if (!moneyCache.has(cache)) moneyCache.set(cache, new Map());
  const perCache = moneyCache.get(cache)!;
  const key = `${period}|${location}`;
  if (!perCache.has(key)) perCache.set(key, computeMoneyReceived(periodToDateRange(period), location));
  return perCache.get(key)!;
}

const MONEY_BASELINE_KEYS: (keyof MoneyReceived)[] = ['cashIn', 'cashInGiftCards', 'cashInDeposits', 'paidFromAccount', 'paidByGiftCard'];

async function getSalesForPeriod(cache: SalesCache, period: string, location: string): Promise<SalesCacheEntry> {
  const key = `${period}|${location}`;
  if (cache.has(key)) return cache.get(key)!;
  try {
    const dateRange = periodToDateRange(period);
    const result = await computeSalesByDateData(dateRange, location);
    const entry: SalesCacheEntry = { ok: true, result };
    cache.set(key, entry);
    return entry;
  } catch (err: any) {
    const msg = err?.message || String(err);
    const entry: SalesCacheEntry = { ok: false, error: `Sales load failed for ${period} ${location === 'all' ? 'all locations' : 'location ' + location}: ${msg}` };
    cache.set(key, entry);
    return entry;
  }
}

export interface ReferenceRow {
  period: string;
  metric: string;
  location: string;
  value: number;
}

async function loadReferences(): Promise<{ refs: ReferenceRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('reconciliation_references')
    .select('period, metric, location, value')
    .order('period');
  if (error) return { refs: [], error: `Failed to load references: ${error.message}` };
  return { refs: data || [], error: null };
}

async function evaluateReferences(refs: ReferenceRow[], cache: SalesCache): Promise<{ checks: RefCheck[]; errors: string[] }> {
  const checks: RefCheck[] = [];
  const errors: string[] = [];
  for (const ref of refs) {
    let actual: number | null = null;
    let checkError: string | null = null;

    if (ref.metric === 'sales_total' || ref.metric === 'sales_qty') {
      const entry = await getSalesForPeriod(cache, ref.period, ref.location);
      if (!entry.ok) {
        checkError = entry.error;
        errors.push(entry.error);
      } else {
        if (ref.metric === 'sales_total') {
          actual = Math.round(entry.result.rows.reduce((s, r) => s + r.revenue, 0) * 100) / 100;
        } else {
          actual = entry.result.rows.reduce((s, r) => s + r.qtySold, 0);
        }
      }
    } else if (ref.metric === 'money_received') {
      try {
        actual = (await getMoneyForPeriod(cache, ref.period, ref.location)).cashIn;
      } catch (err: any) {
        checkError = `Money received failed: ${err?.message || err}`;
        errors.push(checkError);
      }
    } else if (ref.metric === 'staff_cost') {
      try {
        const dateRange = periodToDateRange(ref.period);
        actual = await computeStaffCostByLocation(dateRange, ref.location);
      } catch (err: any) {
        checkError = `Staff cost failed: ${err?.message || err}`;
        errors.push(checkError);
      }
    }

    const diff = actual != null ? Math.round((actual - Number(ref.value)) * 100) / 100 : null;
    checks.push({
      period: ref.period,
      metric: ref.metric,
      location: ref.location,
      expected: Number(ref.value),
      actual,
      diff,
      ok: checkError == null && diff != null && Math.abs(diff) < 0.01,
      error: checkError,
    });
  }
  return { checks, errors };
}

async function checkBaseline(cache: SalesCache, periods: string[]): Promise<{ drifts: BaselineDrift[]; exists: boolean; errors: string[] }> {
  if (periods.length === 0) return { drifts: [], exists: false, errors: [] };
  const { data: baselines, error: fetchErr } = await supabase
    .from('reconciliation_baseline')
    .select('*')
    .in('period', periods);

  if (fetchErr) return { drifts: [], exists: false, errors: [`Failed to load baseline: ${fetchErr.message}`] };
  if (!baselines || baselines.length === 0) return { drifts: [], exists: false, errors: [] };

  const drifts: BaselineDrift[] = [];
  const errors: string[] = [];
  for (const b of baselines) {
    if (b.report === 'sales_by_tariff') {
      const entry = await getSalesForPeriod(cache, b.period, b.location);
      if (!entry.ok) {
        errors.push(entry.error);
        continue;
      }
      const row = entry.result.rows.find(r => r.pricingOptionName === b.key);
      const curVal = row ? Math.round(row.revenue * 100) / 100 : 0;
      const curQty = row ? row.qtySold : 0;
      const bVal = Math.round(Number(b.value) * 100) / 100;
      if (Math.abs(curVal - bVal) > 0.01 || curQty !== (b.qty ?? 0)) {
        drifts.push({
          period: b.period, report: b.report, location: b.location, key: b.key,
          baselineQty: b.qty ?? 0, baselineValue: bVal, currentQty: curQty, currentValue: curVal,
        });
      }
    } else if (b.report === 'staff_cost') {
      try {
        const dateRange = periodToDateRange(b.period);
        const actual = await computeStaffCostByLocation(dateRange, b.location);
        const bVal = Math.round(Number(b.value) * 100) / 100;
        if (Math.abs(actual - bVal) > 0.01) {
          drifts.push({
            period: b.period, report: b.report, location: b.location, key: b.key,
            baselineQty: b.qty ?? 0, baselineValue: bVal, currentQty: 0, currentValue: actual,
          });
        }
      } catch (err: any) {
        errors.push(`Staff cost baseline check failed: ${err?.message || err}`);
      }
    } else if (b.report === 'money_received') {
      try {
        const money = await getMoneyForPeriod(cache, b.period, b.location);
        const curVal = money[b.key as keyof MoneyReceived] ?? 0;
        const bVal = Math.round(Number(b.value) * 100) / 100;
        if (Math.abs(curVal - bVal) > 0.01) {
          drifts.push({
            period: b.period, report: b.report, location: b.location, key: b.key,
            baselineQty: 0, baselineValue: bVal, currentQty: 0, currentValue: curVal,
          });
        }
      } catch (err: any) {
        errors.push(`Money received baseline check failed: ${err?.message || err}`);
      }
    } else if (b.report === 'staff_cost_by_staff') {
      try {
        const dateRange = periodToDateRange(b.period);
        const entries = await computeStaffCostByStaff(dateRange, b.location);
        const match = entries.find(e => e.staffId === b.key);
        const curVal = match ? match.cost : 0;
        const curQty = match ? match.visits : 0;
        const bVal = Math.round(Number(b.value) * 100) / 100;
        if (Math.abs(curVal - bVal) > 0.01 || curQty !== (b.qty ?? 0)) {
          drifts.push({
            period: b.period, report: b.report, location: b.location, key: b.key,
            baselineQty: b.qty ?? 0, baselineValue: bVal, currentQty: curQty, currentValue: curVal,
          });
        }
      } catch (err: any) {
        errors.push(`Staff cost by staff baseline check failed: ${err?.message || err}`);
      }
    }
  }
  return { drifts, exists: true, errors };
}

async function checkCases(cache: SalesCache): Promise<{ checks: CaseCheck[]; errors: string[] }> {
  const { data: cases, error: fetchErr } = await supabase
    .from('reconciliation_cases')
    .select('*')
    .order('case_number');

  if (fetchErr) return { checks: [], errors: [`Failed to load cases: ${fetchErr.message}`] };

  const checks: CaseCheck[] = [];
  const errors: string[] = [];
  for (const c of cases || []) {
    let actualValue: number | null = null;
    let actualQty: number | null = null;
    let clientDetails: ClientTariffDetail[] = [];
    let checkError: string | null = null;

    const entry = await getSalesForPeriod(cache, c.period, c.location);
    if (!entry.ok) {
      checkError = entry.error;
      errors.push(entry.error);
    } else {
      const result = entry.result;
      if (c.tariff_name && c.client_id) {
        const ctKey = `${c.client_id}|${c.tariff_name}`;
        const ct = result.clientTariffBreakdown.get(ctKey);
        actualValue = ct ? Math.round(ct.revenue * 100) / 100 : 0;
        actualQty = ct ? ct.qty : 0;
        clientDetails = ct?.details || [];
      } else if (c.tariff_name) {
        const row = result.rows.find(r => r.pricingOptionName === c.tariff_name);
        actualValue = row ? Math.round(row.revenue * 100) / 100 : 0;
        actualQty = row ? row.qtySold : 0;
      } else if (c.case_number === 9) {
        actualValue = 0;
        actualQty = 0;
      }
    }

    let ok = checkError == null;
    const tol = c.tolerance != null ? Number(c.tolerance) : 0.005;
    if (ok && c.expected_value != null && actualValue != null) {
      ok = ok && Math.abs(actualValue - Number(c.expected_value)) <= tol + 0.001;
    }
    if (ok && c.expected_qty != null && actualQty != null) {
      ok = ok && actualQty === c.expected_qty;
    }

    checks.push({
      caseNumber: c.case_number,
      description: c.description,
      period: c.period,
      clientId: c.client_id,
      tariffName: c.tariff_name,
      expectedValue: c.expected_value != null ? Number(c.expected_value) : null,
      expectedQty: c.expected_qty,
      tolerance: c.tolerance != null ? Number(c.tolerance) : null,
      actualValue,
      actualQty,
      ok,
      note: c.note,
      error: checkError,
      clientDetails,
    });
  }
  return { checks, errors };
}

async function checkUnknownPaymentTypes(): Promise<{ types: UnknownPaymentType[]; errors: string[] }> {
  const unknowns: UnknownPaymentType[] = [];
  let offset = 0;
  const pageSize = 1000;
  const typeCounts = new Map<string, { count: number; total: number }>();

  while (true) {
    const { data, error } = await supabase
      .from('payments')
      .select('type, amount')
      .range(offset, offset + pageSize - 1);
    if (error) return { types: [], errors: [`Payment types query failed: ${error.message}`] };
    if (!data || data.length === 0) break;

    for (const p of data) {
      const t = (p.type || '').trim();
      if (!t || KNOWN_TYPES.has(t)) continue;
      const entry = typeCounts.get(t) || { count: 0, total: 0 };
      entry.count++;
      entry.total += Number(p.amount) || 0;
      typeCounts.set(t, entry);
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  for (const [t, v] of typeCounts) {
    unknowns.push({ type: t, saleCount: v.count, totalAmount: Math.round(v.total * 100) / 100 });
  }
  return { types: unknowns, errors: [] };
}

async function checkTariffQuality(): Promise<{ checks: TariffQualityCheck[]; errors: string[] }> {
  const now = new Date();
  const periods = Array.from({ length: TARIFF_QUALITY_MONTHS }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (TARIFF_QUALITY_MONTHS - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const errors: string[] = [];
  const checks = await Promise.all(periods.map(async (period): Promise<TariffQualityCheck> => {
    try {
      const c = await computeTariffCoverage(periodToDateRange(period), 'all');
      const pkgPct = pct(c.packageWithoutTariff, c.totalVisits);
      const visPct = pct(c.visitsWithoutTariff, c.totalVisits);
      return {
        period, totalVisits: c.totalVisits,
        packageWithoutTariff: c.packageWithoutTariff, packageWithoutTariffPct: pkgPct,
        visitsWithoutTariff: c.visitsWithoutTariff, visitsWithoutTariffPct: visPct,
        ok: pkgPct <= TARIFF_QUALITY_THRESHOLD_PCT && visPct <= TARIFF_QUALITY_THRESHOLD_PCT,
        error: null,
      };
    } catch (err: any) {
      const msg = `Tariff coverage failed for ${period}: ${err?.message || err}`;
      errors.push(msg);
      return { period, totalVisits: 0, packageWithoutTariff: 0, packageWithoutTariffPct: 0, visitsWithoutTariff: 0, visitsWithoutTariffPct: 0, ok: false, error: msg };
    }
  }));
  return { checks, errors };
}

// The Overview reads totals saved by the nightly job; they must equal a fresh calculation for the reference months.
async function checkStoredTotals(periods: string[]): Promise<{ checks: StoredTotalsCheck[]; errors: string[] }> {
  if (periods.length === 0) return { checks: [], errors: [] };
  const sorted = [...periods].sort();
  try {
    const [fresh, stored] = await Promise.all([
      computeOverviewMonths(sorted[0], sorted[sorted.length - 1]),
      loadStoredOverviewRows(sorted),
    ]);
    const storedByKey = new Map(stored.map(r => [`${r.month}|${r.location}`, r.metrics]));
    const checks: StoredTotalsCheck[] = [];
    for (const row of fresh) {
      if (!sorted.includes(row.month)) continue;
      const saved = storedByKey.get(`${row.month}|${row.location}`);
      for (const metric of STORED_TOTALS_METRICS) {
        const recomputed = row.metrics[metric] as number;
        const value = saved ? Number(saved[metric]) : null;
        checks.push({
          period: row.month, location: row.location, metric,
          stored: value, recomputed,
          ok: value !== null && Math.abs(value - recomputed) < 0.01,
        });
      }
    }
    return { checks, errors: [] };
  } catch (err: any) {
    return { checks: [], errors: [`Stored Overview totals check failed: ${err?.message || err}`] };
  }
}

function pct(n: number, d: number) {
  return d === 0 ? 0 : Math.round((n / d) * 1000) / 10;
}

export interface BaselineRow {
  period: string;
  report: string;
  location: string;
  key: string;
  value: number;
  qty: number | null;
}

export interface BaselinePlan {
  rows: BaselineRow[];
  includedPeriods: string[];
  skippedPeriods: { period: string; reasons: string[] }[];
  summary: string[];
}

export async function buildBaselinePlan(refs: ReferenceRow[], cache: SalesCache = new Map()): Promise<BaselinePlan> {
  const { checks } = await evaluateReferences(refs, cache);
  const byPeriod = new Map<string, RefCheck[]>();
  for (const c of checks) {
    if (!byPeriod.has(c.period)) byPeriod.set(c.period, []);
    byPeriod.get(c.period)!.push(c);
  }

  const plan: BaselinePlan = { rows: [], includedPeriods: [], skippedPeriods: [], summary: [] };

  for (const [period, periodChecks] of [...byPeriod.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const failed = periodChecks.filter(c => !c.ok);
    if (failed.length > 0) {
      plan.skippedPeriods.push({
        period,
        reasons: failed.map(c => c.error || `${c.metric} ${c.location}: expected ${c.expected}, got ${c.actual}`),
      });
      continue;
    }

    const rows: BaselineRow[] = [];
    const parts: string[] = [];

    const salesLocations = new Set(periodChecks.filter(c => c.metric === 'sales_total' || c.metric === 'sales_qty').map(c => c.location));
    for (const location of salesLocations) {
      const entry = await getSalesForPeriod(cache, period, location);
      if (!entry.ok) throw new Error(entry.error);
      for (const r of entry.result.rows) {
        rows.push({
          period, report: 'sales_by_tariff', location,
          key: r.pricingOptionName,
          value: Math.round(r.revenue * 100) / 100,
          qty: r.qtySold,
        });
      }
      parts.push(`${entry.result.rows.length} tariffs`);
    }

    const staffLocations = new Set(periodChecks.filter(c => c.metric === 'staff_cost').map(c => c.location));
    for (const location of staffLocations) {
      const staffEntries = await computeStaffCostByStaff(periodToDateRange(period), location);
      for (const entry of staffEntries) {
        rows.push({
          period, report: 'staff_cost_by_staff', location,
          key: entry.staffId,
          value: entry.cost,
          qty: entry.visits,
        });
      }
      rows.push({
        period, report: 'staff_cost', location,
        key: `location_${location}`,
        value: Math.round(staffEntries.reduce((s, e) => s + e.cost, 0) * 100) / 100,
        qty: null,
      });
      parts.push(`staff cost loc ${location}: ${staffEntries.length} staff`);
    }

    const moneyLocations = new Set(periodChecks.filter(c => c.metric === 'money_received').map(c => c.location));
    for (const location of moneyLocations) {
      const money = await getMoneyForPeriod(cache, period, location);
      for (const key of MONEY_BASELINE_KEYS) {
        rows.push({ period, report: 'money_received', location, key, value: money[key], qty: null });
      }
      parts.push(`money received loc ${location}`);
    }

    if (rows.length === 0) continue;
    plan.rows.push(...rows);
    plan.includedPeriods.push(period);
    plan.summary.push(`${period}: ${parts.join(', ')}`);
  }

  return plan;
}

export async function saveReconciliationBaseline(): Promise<BaselineSaveResult> {
  const { refs, error: loadErr } = await loadReferences();
  if (loadErr) return { ok: false, message: loadErr };

  const plan = await buildBaselinePlan(refs);
  const skippedNote = plan.skippedPeriods.length > 0
    ? ` Skipped (references not matching): ${plan.skippedPeriods.map(s => s.period).join(', ')}.`
    : '';

  if (plan.rows.length === 0) {
    return { ok: false, message: `No data to save.${skippedNote}` };
  }

  const { error } = await supabase
    .from('reconciliation_baseline')
    .upsert(plan.rows, { onConflict: 'period,report,location,key' });

  if (error) {
    return { ok: false, message: `Database error: ${error.message}` };
  }

  return {
    ok: true,
    message: `Baseline saved: ${plan.rows.length} rows (${plan.summary.join('; ')}).${skippedNote}`,
  };
}

async function persistCheckStatus(allOk: boolean, errorCount: number) {
  await supabase
    .from('reconciliation_status')
    .upsert({ id: 1, checked_at: new Date().toISOString(), all_ok: allOk, error_count: errorCount }, { onConflict: 'id' });
}

export async function getLastCheckStatus(): Promise<{ checkedAt: string | null; allOk: boolean }> {
  const { data } = await supabase
    .from('reconciliation_status')
    .select('checked_at, all_ok')
    .eq('id', 1)
    .maybeSingle();
  return { checkedAt: data?.checked_at ?? null, allOk: data?.all_ok ?? false };
}

export async function runReconciliationCheck(): Promise<ReconciliationResult> {
  const cache: SalesCache = new Map();
  const allErrors: string[] = [];

  const { refs, error: loadErr } = await loadReferences();
  if (loadErr) allErrors.push(loadErr);
  const { checks: references, errors: refErrors } = await evaluateReferences(refs, cache);
  allErrors.push(...refErrors);
  const refPeriods = [...new Set(refs.map(r => r.period))];

  const [{ drifts: baselineDrifts, exists: baselineExists, errors: blErrors }, { checks: cases, errors: caseErrors }, { types: unknownPaymentTypes, errors: ptErrors }, { checks: tariffQuality, errors: tqErrors }] = await Promise.all([
    checkBaseline(cache, refPeriods),
    checkCases(cache),
    checkUnknownPaymentTypes(),
    checkTariffQuality(),
  ]);
  allErrors.push(...blErrors, ...caseErrors, ...ptErrors, ...tqErrors);

  // Runs after the other checks: segment loading times out when it competes with them.
  const { checks: storedTotals, errors: stErrors } = await checkStoredTotals(refPeriods);
  allErrors.push(...stErrors);

  const hasErrors = allErrors.length > 0;
  const allOk =
    !hasErrors &&
    references.every(r => r.ok) &&
    baselineDrifts.length === 0 &&
    cases.every(c => c.ok) &&
    unknownPaymentTypes.length === 0 &&
    tariffQuality.every(t => t.ok) &&
    storedTotals.every(s => s.ok);

  await persistCheckStatus(allOk, allErrors.length);

  return {
    references, baselineDrifts, cases, unknownPaymentTypes, tariffQuality, storedTotals,
    allOk, checkedAt: new Date().toISOString(), baselineExists,
    errors: [...new Set(allErrors)],
  };
}

export function useReconciliationStatus() {
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const r = await runReconciliationCheck();
      setResult(r);
      return r;
    } finally {
      setLoading(false);
    }
  }, []);

  return { result, loading, check };
}

export function useAutoReconciliationCheck(onResult: (r: ReconciliationResult) => void) {
  const runningRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (runningRef.current) return;
      try {
        const status = await getLastCheckStatus();
        if (!status.checkedAt) {
          return;
        }

        const lastCheck = new Date(status.checkedAt).getTime();
        const now = Date.now();
        const hoursSinceCheck = (now - lastCheck) / (1000 * 60 * 60);

        const { data: lastSync } = await supabase
          .from('api_logs')
          .select('ended_at')
          .eq('status', 'success')
          .order('ended_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const lastSyncTime = lastSync?.ended_at ? new Date(lastSync.ended_at).getTime() : 0;
        const needsCheck = hoursSinceCheck >= 24 || lastSyncTime > lastCheck;

        if (!needsCheck) return;

        runningRef.current = true;
        const r = await runReconciliationCheck();
        if (!cancelled) onResult(r);
      } catch {
        // silent background check
      } finally {
        runningRef.current = false;
      }
    })();

    return () => { cancelled = true; };
  }, [onResult]);
}
