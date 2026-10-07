const fs=require('fs');const p='src/hooks/useSalesMarginData.ts';let s=fs.readFileSync(p,'utf8');
const start=s.indexOf('  const loadData = useCallback(async () => {');
const end=s.indexOf('      setAppointments(processedAppts);');
if(start<0||end<0) throw 'markers';
const newHead=`  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [staffRes, locationsMap, sessionTypesMap, pricingMap, apptData, costRates] =
        await Promise.all([
          loadStaffMap(),
          loadLocationsMap(),
          loadSessionTypesMap(),
          loadPricingMap(),
          loadMarginAppointments(dateRange, selectedLocation, statusFilter),
          loadCostRates(),
        ]);

      const csRevenueMap = await loadClientServiceRevenue(
        apptData.map(a => a.client_service_id).filter(Boolean) as string[], pricingMap);
      const { visits, medianMap: stMedianMap } = priceVisits(apptData, csRevenueMap, costRates);
      setMedianMap(stMedianMap);

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

`;
s=s.slice(0,start)+newHead+s.slice(end);
// remove old sales fetch block duplicated after setAppointments
const a=s.indexOf('      const salesData = await fetchAllPages', s.indexOf('      setAppointments(processedAppts);'));
const b=s.indexOf('      const { money, itemsBySale } = await summarizeSalesMoney(salesData);');
s=s.slice(0,a)+s.slice(b);
// summary via shared helper
const sa=s.indexOf('      const apptsWithData = processedAppts.filter');
const sb=s.indexOf('      const serviceMap: Record<string, ByServiceRow> = {};');
s=s.slice(0,sa)+`      setSummary({ ...money, ...summarizeVisits(visits) });

`+s.slice(sb);
// replace loadClientsMap with lazy names
const ca=s.indexOf('async function loadClientsMap()');
const cb=s.indexOf('async function loadLocationsMap()');
s=s.slice(0,ca)+`async function loadClientNames(ids: (string | null)[]): Promise<Record<string, string>> {
  const rows = await fetchByIds<{ id: string; first_name: string | null; last_name: string | null }>(
    'clients', 'id', ids.filter(Boolean) as string[], 'id, first_name, last_name');
  const map: Record<string, string> = {};
  rows.forEach(c => { map[c.id] = \`\${c.first_name || ''} \${c.last_name || ''}\`.trim() || c.id; });
  return map;
}

`+s.slice(cb);
fs.writeFileSync(p,s);
