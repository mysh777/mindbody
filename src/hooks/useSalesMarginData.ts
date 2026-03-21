import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { DateRange } from '../utils/salesFilters';

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
  revenue: number | null;
  staffCost: number;
  margin: number | null;
  hasRevenueData: boolean;
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

export interface MarginSummary {
  cashIn: number;
  revenueEarned: number;
  staffCost: number;
  grossMargin: number;
  marginPercent: number;
  deferredRevenue: number;
  avgMarginPerVisit: number;
  totalAppointments: number;
  appointmentsWithData: number;
  appointmentsNoData: number;
  noDataCsNotSynced: number;
  noDataNoPricingOption: number;
  noDataNoClientService: number;
}

export interface ByServiceRow {
  sessionTypeId: string;
  sessionTypeName: string;
  categoryName: string;
  visits: number;
  revenue: number;
  staffCost: number;
  margin: number;
  marginPercent: number;
  hasRevenueData: boolean;
  visitsNoData: number;
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
}

interface UseSalesMarginDataProps {
  dateRange: DateRange;
  selectedLocation: string;
}

export function useSalesMarginData({ dateRange, selectedLocation }: UseSalesMarginDataProps) {
  const [loading, setLoading] = useState(false);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [summary, setSummary] = useState<MarginSummary>({
    cashIn: 0, revenueEarned: 0, staffCost: 0, grossMargin: 0,
    marginPercent: 0, deferredRevenue: 0, avgMarginPerVisit: 0,
    totalAppointments: 0, appointmentsWithData: 0, appointmentsNoData: 0,
    noDataCsNotSynced: 0, noDataNoPricingOption: 0, noDataNoClientService: 0,
  });
  const [byService, setByService] = useState<ByServiceRow[]>([]);
  const [byStaff, setByStaff] = useState<ByStaffRow[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [staffRes, clientsMap, locationsMap, sessionTypesMap, staffRatesMap, pricingMap] =
        await Promise.all([
          loadStaffMap(),
          loadClientsMap(),
          loadLocationsMap(),
          loadSessionTypesMap(),
          loadStaffRatesMap(),
          loadPricingMap(),
        ]);

      let apptQuery = supabase
        .from('appointments')
        .select('id, client_id, staff_id, session_type_id, location_id, start_datetime, status, client_service_id')
        .gte('start_datetime', dateRange.start)
        .lte('start_datetime', dateRange.end + 'T23:59:59')
        .eq('status', 'Completed');

      if (selectedLocation !== 'all') {
        apptQuery = apptQuery.eq('location_id', selectedLocation);
      }

      const { data: apptData } = await apptQuery;

      const clientServiceIds = (apptData || [])
        .map(a => a.client_service_id)
        .filter(Boolean) as string[];

      const csRevenueMap = await loadClientServiceRevenue(clientServiceIds, pricingMap);

      let overrideRatesMap: Record<string, number> = {};
      const { data: overridesData } = await supabase
        .from('staff_appointment_rates')
        .select('staff_id, session_type_id, rate_per_appointment')
        .is('effective_to', null);

      if (overridesData) {
        overridesData.forEach(o => {
          if (o.session_type_id) {
            overrideRatesMap[`${o.staff_id}__${o.session_type_id}`] = Number(o.rate_per_appointment) || 0;
          } else {
            overrideRatesMap[`${o.staff_id}__default`] = Number(o.rate_per_appointment) || 0;
          }
        });
      }

      const processedAppts: AppointmentRow[] = (apptData || []).map(a => {
        const csEntry = a.client_service_id ? csRevenueMap[a.client_service_id] : null;
        let noDataReason: NoDataReason = 'ok';
        let rev: number | null = null;

        if (!a.client_service_id) {
          noDataReason = 'no_client_service';
        } else if (!csEntry) {
          noDataReason = 'cs_not_synced';
        } else {
          rev = csEntry.revenue;
          noDataReason = csEntry.reason;
        }

        const hasRevenueData = rev !== null;

        let cost = 0;
        const overrideKey = `${a.staff_id}__${a.session_type_id}`;
        const defaultKey = `${a.staff_id}__default`;
        if (overrideRatesMap[overrideKey] !== undefined) {
          cost = overrideRatesMap[overrideKey];
        } else if (overrideRatesMap[defaultKey] !== undefined) {
          cost = overrideRatesMap[defaultKey];
        } else {
          const rateKey = `${a.staff_id}__${a.session_type_id}`;
          cost = staffRatesMap[rateKey] || 0;
        }

        return {
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
          revenue: hasRevenueData ? rev! : null,
          staffCost: cost,
          margin: hasRevenueData ? rev! - cost : null,
          hasRevenueData,
          noDataReason,
        };
      });

      setAppointments(processedAppts);

      let salesQuery = supabase
        .from('sales')
        .select('id, client_id, sale_datetime, location_id, total')
        .gte('sale_datetime', dateRange.start)
        .lte('sale_datetime', dateRange.end + 'T23:59:59');

      if (selectedLocation !== 'all') {
        salesQuery = salesQuery.eq('location_id', selectedLocation);
      }

      const { data: salesData } = await salesQuery;

      const saleIds = (salesData || []).map(s => s.id);
      const itemsBySale: Record<string, string[]> = {};
      for (let i = 0; i < saleIds.length; i += 500) {
        const batch = saleIds.slice(i, i + 500);
        const { data: items } = await supabase
          .from('sale_items')
          .select('sale_id, item_name, description')
          .in('sale_id', batch);
        (items || []).forEach(item => {
          if (!itemsBySale[item.sale_id]) itemsBySale[item.sale_id] = [];
          itemsBySale[item.sale_id].push(item.item_name || item.description || 'Unknown');
        });
      }

      const processedSales: SaleRow[] = (salesData || []).map(s => ({
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

      const totalCashIn = processedSales.reduce((sum, s) => sum + s.total, 0);
      const apptsWithData = processedAppts.filter(a => a.hasRevenueData);
      const apptsNoData = processedAppts.filter(a => !a.hasRevenueData);
      const totalRevenue = apptsWithData.reduce((sum, a) => sum + (a.revenue || 0), 0);
      const totalStaffCost = processedAppts.reduce((sum, a) => sum + a.staffCost, 0);
      const grossMargin = totalRevenue - totalStaffCost;

      setSummary({
        cashIn: totalCashIn,
        revenueEarned: totalRevenue,
        staffCost: totalStaffCost,
        grossMargin,
        marginPercent: totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0,
        deferredRevenue: totalCashIn - totalRevenue,
        avgMarginPerVisit: apptsWithData.length > 0 ? grossMargin / apptsWithData.length : 0,
        totalAppointments: processedAppts.length,
        appointmentsWithData: apptsWithData.length,
        appointmentsNoData: apptsNoData.length,
        noDataCsNotSynced: apptsNoData.filter(a => a.noDataReason === 'cs_not_synced').length,
        noDataNoPricingOption: apptsNoData.filter(a => a.noDataReason === 'no_pricing_option').length,
        noDataNoClientService: apptsNoData.filter(a => a.noDataReason === 'no_client_service').length,
      });

      const serviceMap: Record<string, ByServiceRow> = {};
      processedAppts.forEach(a => {
        const key = a.session_type_id || 'unknown';
        if (!serviceMap[key]) {
          serviceMap[key] = {
            sessionTypeId: key,
            sessionTypeName: a.sessionTypeName,
            categoryName: a.session_type_id ? sessionTypesMap[a.session_type_id]?.category || '' : '',
            visits: 0, revenue: 0, staffCost: 0, margin: 0,
            marginPercent: 0, hasRevenueData: false, visitsNoData: 0,
          };
        }
        serviceMap[key].visits++;
        serviceMap[key].staffCost += a.staffCost;
        if (a.hasRevenueData) {
          serviceMap[key].revenue += a.revenue!;
          serviceMap[key].margin += a.margin!;
          serviceMap[key].hasRevenueData = true;
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
          };
        }
        staffMap2[key].visits++;
        staffMap2[key].staffCost += a.staffCost;
        if (a.hasRevenueData) {
          staffMap2[key].revenue += a.revenue!;
          staffMap2[key].margin += a.margin!;
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
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedLocation]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return { loading, appointments, sales, summary, byService, byStaff, reload: loadData };
}

async function loadStaffMap(): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const { data } = await supabase.from('staff').select('id, first_name, last_name');
  (data || []).forEach(s => {
    map[s.id] = `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.id;
  });
  return map;
}

async function loadClientsMap(): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const { data } = await supabase
      .from('clients')
      .select('id, first_name, last_name')
      .range(offset, offset + 999);
    if (data && data.length > 0) {
      data.forEach(c => {
        map[c.id] = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.id;
      });
      offset += 1000;
      hasMore = data.length === 1000;
    } else {
      hasMore = false;
    }
  }
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

async function loadPricingMap(): Promise<Record<string, { price: number; sessionCount: number }>> {
  const map: Record<string, { price: number; sessionCount: number }> = {};
  const { data } = await supabase
    .from('pricing_options')
    .select('id, price, session_count');
  (data || []).forEach(po => {
    map[po.id] = {
      price: Number(po.price) || 0,
      sessionCount: po.session_count || 1,
    };
  });
  return map;
}

interface CsRevenueEntry {
  revenue: number | null;
  reason: NoDataReason;
}

async function loadClientServiceRevenue(
  clientServiceIds: string[],
  pricingMap: Record<string, { price: number; sessionCount: number }>
): Promise<Record<string, CsRevenueEntry>> {
  const revenueMap: Record<string, CsRevenueEntry> = {};
  if (clientServiceIds.length === 0) return revenueMap;

  const uniqueIds = [...new Set(clientServiceIds)];

  for (let i = 0; i < uniqueIds.length; i += 500) {
    const batch = uniqueIds.slice(i, i + 500);
    const { data } = await supabase
      .from('client_services')
      .select('mindbody_id, pricing_option_id')
      .in('mindbody_id', batch);

    const foundIds = new Set((data || []).map(cs => cs.mindbody_id));

    batch.forEach(id => {
      if (!foundIds.has(id)) {
        revenueMap[id] = { revenue: null, reason: 'cs_not_synced' };
      }
    });

    (data || []).forEach(cs => {
      if (cs.pricing_option_id && pricingMap[cs.pricing_option_id]) {
        const po = pricingMap[cs.pricing_option_id];
        revenueMap[cs.mindbody_id!] = {
          revenue: po.sessionCount > 0 ? po.price / po.sessionCount : po.price,
          reason: 'ok',
        };
      } else {
        revenueMap[cs.mindbody_id!] = { revenue: null, reason: 'no_pricing_option' };
      }
    });
  }

  return revenueMap;
}
