import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAllPages } from '../lib/fetchAllPages';
import { fetchByIds, chunkIds, mapLimited } from '../lib/fetchByIds';
import { NON_CASH_PAYMENT_TYPES, isPaymentOnAccount, isGiftCard } from './useSalesByDateData';
import { DateRange } from '../utils/salesFilters';
import { getSessionTypeMedianPrices } from '../utils/sessionTypeMedianPrice';
import type { MedianEntry } from '../utils/sessionTypeMedianPrice';
import { errorMessage } from '../utils/errorMessage';

export type NoDataReason = 'ok' | 'cs_not_synced' | 'no_pricing_option' | 'no_client_service';

export interface AppointmentRow {
  id: string;
  client_id: string | null;
  staff_id: string | null;
  session_type_id: string | null;
  location_id: string | null;
  start_datetime: string;
  status: string | null;
  client_service_id: string | null;
  staffName: string;
  clientName: string;
  sessionTypeName: string;
  locationName: string;
  pricingOptionName: string;
  revenueCategory: string;
  revenue: number | null;
  staffCost: number;
  margin: number | null;
  hasRevenueData: boolean;
  isEstimated: boolean;
  noDataReason: NoDataReason;
}

export interface SaleRow {
  id: string;
  client_id: string | null;
  sale_datetime: string | null;
  location_id: string | null;
  total: number;
  clientName: string;
  locationName: string;
  itemNames: string[];
}

export interface MoneyReceived {
  cashIn: number;
  cashInGiftCards: number;
  cashInDeposits: number;
  paidFromAccount: number;
  paidByGiftCard: number;
}

export interface MarginSummary extends MoneyReceived {
  revenueEarned: number;
  staffCost: number;
  grossMargin: number;
  marginPercent: number;
  avgMarginPerVisit: number;
  totalAppointments: number;
  appointmentsWithData: number;
  appointmentsEstimated: number;
  estimatedRevenue: number;
  appointmentsNoData: number;
  noDataCsNotSynced: number;
  noDataNoPricingOption: number;
  noDataNoClientService: number;
}

export interface ByServiceRow {
  sessionTypeId: string;
  sessionTypeName: string;
  pricingOptionKey: string;
  pricingOptionName: string;
  categoryName: string;
  visits: number;
  revenue: number;
  staffCost: number;
  margin: number;
  marginPercent: number;
  hasRevenueData: boolean;
  visitsNoData: number;
  visitsEstimated: number;
  estimatedRevenue: number;
}

export interface ByStaffRow {
  staffId: string;
  staffName: string;
  visits: number;
  revenue: number;
  staffCost: number;
  margin: number;
  marginPercent: number;
  visitsNoData: number;
  visitsEstimated: number;
  estimatedRevenue: number;
}

export type AppointmentStatusFilter = 'Completed' | 'Booked' | 'all';

interface UseSalesMarginDataProps {
  dateRange: DateRange;
  selectedLocation: string;
  statusFilter?: AppointmentStatusFilter;
}

export function useSalesMarginData({ dateRange, selectedLocation, statusFilter = 'Completed' }: UseSalesMarginDataProps) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [summary, setSummary] = useState<MarginSummary>({
    cashIn: 0, cashInGiftCards: 0, cashInDeposits: 0, paidFromAccount: 0, paidByGiftCard: 0,
    revenueEarned: 0, staffCost: 0, grossMargin: 0,
    marginPercent: 0, avgMarginPerVisit: 0,
    totalAppointments: 0, appointmentsWithData: 0, appointmentsEstimated: 0,
    estimatedRevenue: 0, appointmentsNoData: 0,
    noDataCsNotSynced: 0, noDataNoPricingOption: 0, noDataNoClientService: 0,
  });
  const [byService, setByService] = useState<ByServiceRow[]>([]);
  const [byStaff, setByStaff] = useState<ByStaffRow[]>([]);
  const [medianMap, setMedianMap] = useState<Map<string, MedianEntry>>(new Map());

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [staffRes, locationsMap, sessionTypesMap, pricingMap, allApptData, costRates] =
        await Promise.all([
          loadStaffMap(),
          loadLocationsMap(),
          loadSessionTypesMap(),
          loadPricingMap(),
          loadMarginAppointments(dateRange, statusFilter),
          loadCostRates(),
        ]);

      const csRevenueMap = await loadClientServiceRevenue(
        allApptData.map(a => a.client_service_id).filter(Boolean) as string[], pricingMap);
      // Estimates come from both studios together so a studio's figures add up to the "all" view.
      const { visits: allVisits, medianMap: stMedianMap } = priceVisits(allApptData, csRevenueMap, costRates);
      setMedianMap(stMedianMap);
      const atLocation = <T extends { location_id: string | null }>(rows: T[]) =>
        selectedLocation === 'all' ? rows : rows.filter(r => r.location_id === selectedLocation);
      const apptData = atLocation(allApptData);
      const visits = atLocation(allVisits);

      const salesData = await fetchAllPages<{ id: string; client_id: string | null; sale_datetime: string; location_id: string | null; total: number | null }>((from, to) => {
        let q = supabase
          .from('sales')
          .select('id, client_id, sale_datetime, location_id, total')
          .gte('sale_datetime', dateRange.start)
          .lte('sale_datetime', dateRange.end + 'T23:59:59');
        if (selectedLocation !== 'all') q = q.eq('location_id', selectedLocation);
        return q.order('id').range(from, to);
      });

      const clientsMap = await loadClientNames([
        ...apptData.map(a => a.client_id),
        ...salesData.map(s => s.client_id),
      ]);

      const processedAppts: AppointmentRow[] = visits.map(a => ({
        id: a.id,
        client_id: a.client_id,
        staff_id: a.staff_id,
        session_type_id: a.session_type_id,
        location_id: a.location_id,
        start_datetime: a.start_datetime,
        status: a.status,
        client_service_id: a.client_service_id,
        staffName: a.staff_id ? staffRes[a.staff_id] || a.staff_id : '-',
        clientName: a.client_id ? clientsMap[a.client_id] || a.client_id : '-',
        sessionTypeName: a.session_type_id ? sessionTypesMap[a.session_type_id]?.name || a.session_type_id : '-',
        locationName: a.location_id ? locationsMap[a.location_id] || a.location_id : '-',
        pricingOptionName: a.pricingOptionName,
        revenueCategory: a.revenueCategory,
        revenue: a.revenue,
        staffCost: a.staffCost,
        margin: a.revenue !== null ? a.revenue - a.staffCost : null,
        hasRevenueData: a.revenue !== null,
        isEstimated: a.isEstimated,
        noDataReason: a.noDataReason,
      }));

      setAppointments(processedAppts);

      const { money, itemsBySale } = await summarizeSalesMoney(salesData);

      const processedSales: SaleRow[] = salesData.map(s => ({
        id: s.id,
        client_id: s.client_id,
        sale_datetime: s.sale_datetime,
        location_id: s.location_id,
        total: Number(s.total) || 0,
        clientName: s.client_id ? clientsMap[s.client_id] || s.client_id : '-',
        locationName: s.location_id ? locationsMap[s.location_id] || s.location_id : '-',
        itemNames: itemsBySale[s.id] || [],
      }));

      setSales(processedSales);

      setSummary({ ...money, ...summarizeVisits(visits) });

      const serviceMap: Record<string, ByServiceRow> = {};
      processedAppts.forEach(a => {
        const poName = a.pricingOptionName;
        const key = poName ? `po__${poName}` : `st__${a.session_type_id || 'unknown'}`;
        if (!serviceMap[key]) {
          serviceMap[key] = {
            sessionTypeId: a.session_type_id || 'unknown',
            sessionTypeName: a.sessionTypeName,
            pricingOptionKey: key,
            pricingOptionName: poName || '',
            categoryName: a.revenueCategory || (a.session_type_id ? sessionTypesMap[a.session_type_id]?.category || '' : ''),
            visits: 0, revenue: 0, staffCost: 0, margin: 0,
            marginPercent: 0, hasRevenueData: false, visitsNoData: 0,
            visitsEstimated: 0, estimatedRevenue: 0,
          };
        }
        serviceMap[key].visits++;
        serviceMap[key].staffCost += a.staffCost;
        if (a.hasRevenueData) {
          serviceMap[key].revenue += a.revenue!;
          serviceMap[key].margin += a.margin!;
          serviceMap[key].hasRevenueData = true;
          if (a.isEstimated) {
            serviceMap[key].visitsEstimated++;
            serviceMap[key].estimatedRevenue += a.revenue!;
          }
        } else {
          serviceMap[key].visitsNoData++;
        }
      });
      const serviceRows = Object.values(serviceMap).map(r => ({
        ...r,
        marginPercent: r.revenue > 0 ? (r.margin / r.revenue) * 100 : 0,
      })).sort((a, b) => b.margin - a.margin);
      setByService(serviceRows);

      const staffMap2: Record<string, ByStaffRow> = {};
      processedAppts.forEach(a => {
        const key = a.staff_id || 'unknown';
        if (!staffMap2[key]) {
          staffMap2[key] = {
            staffId: key,
            staffName: a.staffName,
            visits: 0, revenue: 0, staffCost: 0, margin: 0,
            marginPercent: 0, visitsNoData: 0,
            visitsEstimated: 0, estimatedRevenue: 0,
          };
        }
        staffMap2[key].visits++;
        staffMap2[key].staffCost += a.staffCost;
        if (a.hasRevenueData) {
          staffMap2[key].revenue += a.revenue!;
          staffMap2[key].margin += a.margin!;
          if (a.isEstimated) {
            staffMap2[key].visitsEstimated++;
            staffMap2[key].estimatedRevenue += a.revenue!;
          }
        } else {
          staffMap2[key].visitsNoData++;
        }
      });
      const staffRows = Object.values(staffMap2).map(r => ({
        ...r,
        marginPercent: r.revenue > 0 ? (r.margin / r.revenue) * 100 : 0,
      })).sort((a, b) => b.margin - a.margin);
      setByStaff(staffRows);

    } catch (error) {
      console.error('Error loading margin data:', error);
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedLocation, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return { loading, loadError, appointments, sales, summary, byService, byStaff, medianMap, reload: loadData };
}

async function loadStaffMap(): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const { data } = await supabase.from('staff').select('id, first_name, last_name');
  (data || []).forEach(s => {
    map[s.id] = `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.id;
  });
  return map;
}

async function loadClientNames(ids: (string | null)[]): Promise<Record<string, string>> {
  const rows = await fetchByIds<{ id: string; first_name: string | null; last_name: string | null }>(
    'clients', 'id', ids.filter(Boolean) as string[], 'id, first_name, last_name');
  const map: Record<string, string> = {};
  rows.forEach(c => { map[c.id] = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.id; });
  return map;
}

async function loadLocationsMap(): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const { data } = await supabase.from('locations').select('id, name');
  (data || []).forEach(l => { map[l.id] = l.name; });
  return map;
}

async function loadSessionTypesMap(): Promise<Record<string, { name: string; category: string }>> {
  const map: Record<string, { name: string; category: string }> = {};
  const { data } = await supabase.from('session_types').select('id, name, category_name');
  (data || []).forEach(st => {
    map[st.id] = { name: st.name, category: st.category_name || '' };
  });
  return map;
}

async function loadStaffRatesMap(): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  const { data } = await supabase
    .from('staff_session_types')
    .select('staff_id, session_type_id, pay_rate');
  (data || []).forEach(r => {
    if (r.staff_id && r.session_type_id) {
      map[`${r.staff_id}__${r.session_type_id}`] = Number(r.pay_rate) || 0;
    }
  });
  return map;
}

async function loadPricingMap(): Promise<Record<string, { price: number; sessionCount: number; name: string; category: string }>> {
  const map: Record<string, { price: number; sessionCount: number; name: string; category: string }> = {};
  const { data, error } = await supabase
    .from('pricing_options')
    .select('id, name, price, session_count, revenue_category');
  // An empty map would silently mark every linked visit as "no pricing option".
  if (error || !data || data.length === 0) {
    throw new Error(`Pricing options failed to load: ${error?.message ?? 'no rows returned'}`);
  }
  data.forEach(po => {
    map[po.id] = {
      price: Number(po.price) || 0,
      sessionCount: po.session_count || 1,
      name: po.name || '',
      category: po.revenue_category || '',
    };
  });
  return map;
}

interface CsRevenueEntry {
  revenue: number | null;
  reason: NoDataReason;
  pricingOptionName: string;
  category: string;
}

async function loadClientServiceRevenue(
  clientServiceIds: string[],
  pricingMap: Record<string, { price: number; sessionCount: number; name: string; category: string }>
): Promise<Record<string, CsRevenueEntry>> {
  const revenueMap: Record<string, CsRevenueEntry> = {};
  if (clientServiceIds.length === 0) return revenueMap;

  const uniqueIds = [...new Set(clientServiceIds)];
  const orphanedCsIds: string[] = [];

  const allCsData = await fetchByIds<{ mindbody_id: string | null; pricing_option_id: string | null; count: number | null }>(
    'client_services', 'mindbody_id', uniqueIds, 'mindbody_id, pricing_option_id, count');
  const foundIds = new Set(allCsData.map(cs => cs.mindbody_id));
  uniqueIds.forEach(id => {
    if (!foundIds.has(id)) orphanedCsIds.push(id);
  });

  // Priority 0: for orphaned client_service_ids (no client_services row),
  // try sale_items.payment_ref_id as direct price source.
  // item_id maps to pricing_options.mindbody_id for session_count + name lookup.
  if (orphanedCsIds.length > 0) {
    // Build mindbody_id -> pricing info map for session_count lookup
    const poByMbId = new Map<string, { sessionCount: number; name: string; category: string }>();
    const { data: poMbData } = await supabase
      .from('pricing_options')
      .select('mindbody_id, session_count, name, revenue_category');
    (poMbData || []).forEach(po => {
      if (po.mindbody_id != null) {
        poByMbId.set(String(po.mindbody_id), {
          sessionCount: Math.max(po.session_count || 1, 1),
          name: po.name || '',
          category: po.revenue_category || '',
        });
      }
    });

    const directItems = await fetchByIds<{ payment_ref_id: string | null; total_amount: number | null; item_id: string | null }>(
      'sale_items', 'payment_ref_id', orphanedCsIds, 'payment_ref_id, total_amount, item_id',
      q => q.not('total_amount', 'is', null));
    {
      directItems.forEach(si => {
        if (si.payment_ref_id != null && si.total_amount != null) {
          const amt = Number(si.total_amount);
          const poInfo = si.item_id ? poByMbId.get(String(si.item_id)) : null;
          const sc = poInfo?.sessionCount ?? 1;
          const poName = poInfo?.name ?? '';
          revenueMap[String(si.payment_ref_id)] = { revenue: amt / sc, reason: 'ok', pricingOptionName: poName, category: poInfo?.category ?? '' };
        }
      });
    }
    orphanedCsIds.forEach(id => {
      if (!revenueMap[id]) {
        revenueMap[id] = { revenue: null, reason: 'cs_not_synced', pricingOptionName: '', category: '' };
      }
    });
  }

  const csMbIds = allCsData.map(cs => cs.mindbody_id).filter(Boolean) as string[];
  const refAmountMap = new Map<string, number>();
  const refItems = await fetchByIds<{ payment_ref_id: string | null; total_amount: number | null }>(
    'sale_items', 'payment_ref_id', csMbIds, 'payment_ref_id, total_amount',
    q => q.not('total_amount', 'is', null));
  {
    refItems.forEach(si => {
      if (si.payment_ref_id != null && si.total_amount != null) {
        refAmountMap.set(String(si.payment_ref_id), Number(si.total_amount));
      }
    });
  }

  for (const cs of allCsData) {
    const mbId = cs.mindbody_id!;
    const po = cs.pricing_option_id ? pricingMap[cs.pricing_option_id] : null;
    if (!po) {
      revenueMap[mbId] = { revenue: null, reason: 'no_pricing_option', pricingOptionName: '', category: '' };
      continue;
    }
    const csCount = cs.count != null && cs.count > 0 ? cs.count : null;
    const sc = csCount ?? (po.sessionCount > 0 ? po.sessionCount : 1);
    const directAmount = refAmountMap.get(mbId);
    if (directAmount !== undefined) {
      revenueMap[mbId] = { revenue: directAmount / sc, reason: 'ok', pricingOptionName: po.name, category: po.category };
    } else {
      revenueMap[mbId] = { revenue: po.price / sc, reason: 'ok', pricingOptionName: po.name, category: po.category };
    }
  }

  return revenueMap;
}

export interface MarginAppointment {
  id: string;
  client_id: string | null;
  staff_id: string | null;
  session_type_id: string | null;
  location_id: string | null;
  start_datetime: string;
  end_datetime: string | null;
  status: string | null;
  client_service_id: string | null;
}

export interface PricedVisit extends MarginAppointment {
  revenue: number | null;
  staffCost: number;
  isEstimated: boolean;
  noDataReason: NoDataReason;
  pricingOptionName: string;
  revenueCategory: string;
}

export type VisitTotals = Omit<MarginSummary, keyof MoneyReceived>;

async function loadMarginAppointments(dateRange: DateRange, statusFilter: AppointmentStatusFilter): Promise<MarginAppointment[]> {
  return fetchAllPages<MarginAppointment>((from, to) => {
    let q = supabase
      .from('appointments')
      .select('id, client_id, staff_id, session_type_id, location_id, start_datetime, end_datetime, status, client_service_id')
      .gte('start_datetime', dateRange.start)
      .lte('start_datetime', dateRange.end + 'T23:59:59')
      .eq('stale', false);
    q = statusFilter === 'all' ? q.in('status', ['Completed', 'Booked']) : q.eq('status', statusFilter);
    return q.order('id').range(from, to);
  });
}

// Visits without a resolvable price get the median of their session type within the same set of visits.
function priceVisits(appts: MarginAppointment[], csRevenueMap: Record<string, CsRevenueEntry>, costRates: CostRates) {
  const resolvedForMedian: { session_type_id: string; effective_price: number }[] = [];
  const firstPass = appts.map(a => {
    const csEntry = a.client_service_id ? csRevenueMap[a.client_service_id] : null;
    let noDataReason: NoDataReason = 'ok';
    let rev: number | null = null;
    if (!a.client_service_id) noDataReason = 'no_client_service';
    else if (!csEntry) noDataReason = 'cs_not_synced';
    else {
      rev = csEntry.revenue;
      noDataReason = csEntry.reason;
    }
    if (rev !== null && a.session_type_id) resolvedForMedian.push({ session_type_id: a.session_type_id, effective_price: rev });
    return { a, rev, noDataReason, poName: csEntry?.pricingOptionName || '', poCategory: csEntry?.category || '' };
  });

  const medianMap = getSessionTypeMedianPrices(resolvedForMedian);

  const visits: PricedVisit[] = firstPass.map(({ a, rev, noDataReason, poName, poCategory }) => {
    let revenue = rev;
    let isEstimated = false;
    if (revenue === null && a.session_type_id) {
      const medianEntry = medianMap.get(a.session_type_id);
      if (medianEntry?.sufficient) {
        revenue = medianEntry.median;
        isEstimated = true;
      }
    }
    return {
      ...a,
      revenue,
      staffCost: getAppointmentCost(a.staff_id as string, a.session_type_id as string, costRates),
      isEstimated,
      noDataReason,
      pricingOptionName: poName,
      revenueCategory: poCategory,
    };
  });
  return { visits, medianMap };
}

export function summarizeVisits(visits: PricedVisit[]): VisitTotals {
  const withData = visits.filter(a => a.revenue !== null);
  const estimated = visits.filter(a => a.isEstimated);
  const noData = visits.filter(a => a.revenue === null);
  const revenueEarned = withData.reduce((sum, a) => sum + (a.revenue || 0), 0);
  const staffCost = visits.reduce((sum, a) => sum + a.staffCost, 0);
  const grossMargin = revenueEarned - staffCost;
  return {
    revenueEarned,
    staffCost,
    grossMargin,
    marginPercent: revenueEarned > 0 ? (grossMargin / revenueEarned) * 100 : 0,
    avgMarginPerVisit: withData.length > 0 ? grossMargin / withData.length : 0,
    totalAppointments: visits.length,
    appointmentsWithData: withData.length,
    appointmentsEstimated: estimated.length,
    estimatedRevenue: estimated.reduce((sum, a) => sum + (a.revenue || 0), 0),
    appointmentsNoData: noData.length,
    noDataCsNotSynced: noData.filter(a => a.noDataReason === 'cs_not_synced').length,
    noDataNoPricingOption: noData.filter(a => a.noDataReason === 'no_pricing_option').length,
    noDataNoClientService: noData.filter(a => a.noDataReason === 'no_client_service').length,
  };
}

function groupByMonthAndLocation<T>(rows: T[], dateOf: (r: T) => string, locationOf: (r: T) => string | null): Map<string, T[]> {
  const out = new Map<string, T[]>();
  const add = (key: string, r: T) => {
    const list = out.get(key) ?? [];
    list.push(r);
    out.set(key, list);
  };
  for (const r of rows) {
    const m = dateOf(r).slice(0, 7);
    add(`${m}|all`, r);
    add(`${m}|${locationOf(r) ?? ''}`, r);
  }
  return out;
}

function groupByMonth<T>(rows: T[], dateOf: (r: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const m = dateOf(r).slice(0, 7);
    const list = out.get(m) ?? [];
    list.push(r);
    out.set(m, list);
  }
  return out;
}

// Same pricing as Margin by Staff run for one month: each month is priced once across both studios,
// then split into "YYYY-MM|location" groups (location "all" included), so the studios add up to "all".
export async function computeMarginVisitsByMonth(dateRange: DateRange): Promise<Map<string, PricedVisit[]>> {
  const [pricingMap, appts, costRates] = await Promise.all([
    loadPricingMap(),
    loadMarginAppointments(dateRange, 'Completed'),
    loadCostRates(),
  ]);
  const csRevenueMap = await loadClientServiceRevenue(
    appts.map(a => a.client_service_id).filter(Boolean) as string[], pricingMap);
  const out = new Map<string, PricedVisit[]>();
  for (const list of groupByMonth(appts, a => a.start_datetime).values()) {
    const priced = priceVisits(list, csRevenueMap, costRates).visits;
    for (const [key, group] of groupByMonthAndLocation(priced, v => v.start_datetime, v => v.location_id)) out.set(key, group);
  }
  return out;
}

// Prices an arbitrary set of visits (e.g. one client's) with the same rules as Margin by Staff.
export async function priceMarginVisits(appts: MarginAppointment[]): Promise<PricedVisit[]> {
  if (appts.length === 0) return [];
  const [pricingMap, costRates] = await Promise.all([loadPricingMap(), loadCostRates()]);
  const csRevenueMap = await loadClientServiceRevenue(
    appts.map(a => a.client_service_id).filter(Boolean) as string[], pricingMap);
  return priceVisits(appts, csRevenueMap, costRates).visits;
}

export interface TariffCoverage {
  totalVisits: number;
  packageWithoutTariff: number;
  visitsWithoutTariff: number;
}

// Same classification as Margin by Service (completed visits): a visit lands in "Visits without tariff" when no pricing option resolves.
export async function computeTariffCoverage(dateRange: DateRange, locationId: string): Promise<TariffCoverage> {
  const pricingMap = await loadPricingMap();
  const appts = await fetchAllPages<{ id: string; client_service_id: string | null }>((from, to) => {
    let q = supabase
      .from('appointments')
      .select('id, client_service_id')
      .gte('start_datetime', dateRange.start)
      .lte('start_datetime', dateRange.end + 'T23:59:59')
      .eq('status', 'Completed');
    if (locationId !== 'all') q = q.eq('location_id', locationId);
    return q.order('id').range(from, to);
  });
  const csIds = appts.map(a => a.client_service_id).filter(Boolean) as string[];
  const revenueMap = await loadClientServiceRevenue(csIds, pricingMap);
  let packageWithoutTariff = 0;
  let visitsWithoutTariff = 0;
  for (const a of appts) {
    const entry = a.client_service_id ? revenueMap[a.client_service_id] : null;
    if (entry?.reason === 'no_pricing_option') packageWithoutTariff++;
    if (!entry?.pricingOptionName) visitsWithoutTariff++;
  }
  return { totalVisits: appts.length, packageWithoutTariff, visitsWithoutTariff };
}

export interface CostRates {
  staffRatesMap: Record<string, number>;
  overrideRatesMap: Record<string, number>;
}

export async function loadCostRates(): Promise<CostRates> {
  const [staffRatesMap, overridesData] = await Promise.all([
    loadStaffRatesMap(),
    supabase
      .from('staff_appointment_rates')
      .select('staff_id, session_type_id, rate_per_appointment')
      .is('effective_to', null)
      .then(r => r.data || []),
  ]);

  const overrideRatesMap: Record<string, number> = {};
  for (const o of overridesData) {
    if (o.session_type_id) {
      overrideRatesMap[`${o.staff_id}__${o.session_type_id}`] = Number(o.rate_per_appointment) || 0;
    } else {
      overrideRatesMap[`${o.staff_id}__default`] = Number(o.rate_per_appointment) || 0;
    }
  }
  return { staffRatesMap, overrideRatesMap };
}

export function getAppointmentCost(staffId: string, sessionTypeId: string, rates: CostRates): number {
  const overrideKey = `${staffId}__${sessionTypeId}`;
  const defaultKey = `${staffId}__default`;
  if (rates.overrideRatesMap[overrideKey] !== undefined) return rates.overrideRatesMap[overrideKey];
  if (rates.overrideRatesMap[defaultKey] !== undefined) return rates.overrideRatesMap[defaultKey];
  return rates.staffRatesMap[`${staffId}__${sessionTypeId}`] || 0;
}

export interface StaffCostEntry {
  staffId: string;
  cost: number;
  visits: number;
}

export async function computeStaffCostByStaff(
  dateRange: DateRange,
  locationId: string,
  rates?: CostRates,
): Promise<StaffCostEntry[]> {
  const r = rates || await loadCostRates();

  const appts = await fetchAllPages<{ staff_id: string; session_type_id: string }>((from, to) => {
    let q = supabase
      .from('appointments')
      .select('staff_id, session_type_id')
      .gte('start_datetime', dateRange.start)
      .lte('start_datetime', dateRange.end + 'T23:59:59')
      .eq('status', 'Completed');
    if (locationId !== 'all') q = q.eq('location_id', locationId);
    return q.order('id').range(from, to);
  });
  const map = new Map<string, { cost: number; visits: number }>();
  for (const a of appts) {
    const cost = getAppointmentCost(a.staff_id, a.session_type_id, r);
    const entry = map.get(a.staff_id) || { cost: 0, visits: 0 };
    entry.cost += cost;
    entry.visits++;
    map.set(a.staff_id, entry);
  }
  return Array.from(map.entries()).map(([staffId, v]) => ({
    staffId,
    cost: Math.round(v.cost * 100) / 100,
    visits: v.visits,
  }));
}

export async function computeStaffCostByLocation(
  dateRange: DateRange,
  locationId: string,
): Promise<number> {
  const entries = await computeStaffCostByStaff(dateRange, locationId);
  return Math.round(entries.reduce((s, e) => s + e.cost, 0) * 100) / 100;
}

export type MoneyBreakdown = MoneyReceived & { byType: Record<string, number> };

async function summarizeSalesMoney(
  salesData: { id: string; total: number | null }[],
): Promise<{ money: MoneyReceived; byType: Record<string, number>; itemsBySale: Record<string, string[]> }> {
  const saleIds = salesData.map(s => s.id);
  const saleTotals = new Map(salesData.map(s => [s.id, Number(s.total) || 0]));
  const itemsBySale: Record<string, string[]> = {};
  const money: MoneyReceived = { cashIn: 0, cashInGiftCards: 0, cashInDeposits: 0, paidFromAccount: 0, paidByGiftCard: 0 };
  const byType: Record<string, number> = {};
  for (const batch of chunkIds(saleIds)) {
    const payments = await fetchAllPages<{ sale_id: string; type: string | null; amount: number | null }>((from, to) => supabase
      .from('payments')
      .select('sale_id, type, amount')
      .in('sale_id', batch)
      .order('id')
      .range(from, to));
    const moneyBySale = new Map<string, number>();
    payments.forEach(p => {
      const amt = Number(p.amount) || 0;
      const type = p.type || 'Unknown';
      byType[type] = (byType[type] || 0) + amt;
      if (p.type === 'Account') money.paidFromAccount += amt;
      else if (p.type === 'Prepaid Gift Card') money.paidByGiftCard += amt;
      else if (!NON_CASH_PAYMENT_TYPES.includes(p.type || '')) {
        money.cashIn += amt;
        moneyBySale.set(p.sale_id, (moneyBySale.get(p.sale_id) || 0) + amt);
      }
    });
    const items = await fetchAllPages<{ sale_id: string; item_id: string | null; item_name: string | null; description: string | null; total_amount: number | null }>((from, to) => supabase
      .from('sale_items')
      .select('sale_id, item_id, item_name, description, total_amount')
      .in('sale_id', batch)
      .order('id')
      .range(from, to));
    items.forEach(item => {
      if (!itemsBySale[item.sale_id]) itemsBySale[item.sale_id] = [];
      itemsBySale[item.sale_id].push(item.item_name || item.description || 'Unknown');
      const saleTotal = saleTotals.get(item.sale_id) || 0;
      if (saleTotal === 0) return;
      // Mixed-payment sales: attribute only the real-money share of the item
      const moneyShare = (Number(item.total_amount) || 0) * (moneyBySale.get(item.sale_id) || 0) / saleTotal;
      if (isPaymentOnAccount(item.item_id, item.description) || isPaymentOnAccount(null, item.item_name)) money.cashInDeposits += moneyShare;
      else if (isGiftCard(item.description) || isGiftCard(item.item_name)) money.cashInGiftCards += moneyShare;
    });
  }
  return { money, byType, itemsBySale };
}

export async function computeMoneyReceived(dateRange: DateRange, locationId: string): Promise<MoneyReceived> {
  const salesData = await fetchAllPages<{ id: string; total: number | null }>((from, to) => {
    let q = supabase
      .from('sales')
      .select('id, total')
      .gte('sale_datetime', dateRange.start)
      .lte('sale_datetime', dateRange.end + 'T23:59:59');
    if (locationId !== 'all') q = q.eq('location_id', locationId);
    return q.order('id').range(from, to);
  });
  const { money } = await summarizeSalesMoney(salesData);
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    cashIn: round(money.cashIn),
    cashInGiftCards: round(money.cashInGiftCards),
    cashInDeposits: round(money.cashInDeposits),
    paidFromAccount: round(money.paidFromAccount),
    paidByGiftCard: round(money.paidByGiftCard),
  };
}

// Keyed "YYYY-MM|location" (location "all" included), same rules as computeMoneyReceived.
export async function computeMoneyReceivedByMonth(dateRange: DateRange): Promise<Map<string, MoneyBreakdown>> {
  const salesData = await fetchAllPages<{ id: string; total: number | null; sale_datetime: string; location_id: string | null }>((from, to) => supabase
    .from('sales')
    .select('id, total, sale_datetime, location_id')
    .gte('sale_datetime', dateRange.start)
    .lte('sale_datetime', dateRange.end + 'T23:59:59')
    .order('id').range(from, to));
  // Money is additive per sale, so "all" is the sum of the location groups.
  const groups = [...groupByMonthAndLocation(salesData, s => s.sale_datetime, s => s.location_id)].filter(([key]) => !key.endsWith('|all'));
  const results = await mapLimited(groups, ([, list]) => summarizeSalesMoney(list), 4);
  const out = new Map<string, MoneyBreakdown>();
  const moneyKeys: (keyof MoneyReceived)[] = ['cashIn', 'cashInGiftCards', 'cashInDeposits', 'paidFromAccount', 'paidByGiftCard'];
  groups.forEach(([key], i) => {
    const { money, byType } = results[i];
    out.set(key, { ...money, byType });
    const allKey = `${key.slice(0, 7)}|all`;
    const total = out.get(allKey) ?? { cashIn: 0, cashInGiftCards: 0, cashInDeposits: 0, paidFromAccount: 0, paidByGiftCard: 0, byType: {} };
    moneyKeys.forEach(k => { total[k] += money[k]; });
    for (const [type, amount] of Object.entries(byType)) total.byType[type] = (total.byType[type] || 0) + amount;
    out.set(allKey, total);
  });
  return out;
}
