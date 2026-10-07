const fs=require('fs');
let p='src/hooks/useSalesByDateData.ts';let s=fs.readFileSync(p,'utf8');
const rep=(a,b)=>{ if(!s.includes(a)) throw new Error('missing '+a.slice(0,70)); s=s.replace(a,b); };
rep(`  byMonth: Map<string, Map<string, { category: string; revenue: number }>>;`,`  // Keyed "YYYY-MM|locationId": sale date for direct sales, deposit date and location for FIFO.
  byMonth: Map<string, Map<string, { category: string; revenue: number }>>;`);
rep(`      const addToMonth = (date: string, tariff: string, category: string, revenue: number) => {
        const month = date.slice(0, 7);`,`      const addToMonth = (date: string, locationId: string, tariff: string, category: string, revenue: number) => {
        const month = \`\${date.slice(0, 7)}|\${locationId}\`;`);
rep(`addToMonth(sale?.sale_date || '', tariffName,`,`addToMonth(sale?.sale_date || '', sale?.location_id || '', tariffName,`);
rep(`addToMonth(cd, tName,`,`addToMonth(cd, m.credit.locationId, tName,`);
fs.writeFileSync(p,s);

p='src/hooks/useSalesMarginData.ts';s=fs.readFileSync(p,'utf8');
rep(`// Same pricing as Margin by Staff, applied month by month so each month matches that report for the same month.
export async function computeMarginVisitsByMonth(dateRange: DateRange, location: string): Promise<Map<string, PricedVisit[]>> {
  const [pricingMap, appts, costRates] = await Promise.all([
    loadPricingMap(),
    loadMarginAppointments(dateRange, location, 'Completed'),
    loadCostRates(),
  ]);`,`function groupByMonthAndLocation<T>(rows: T[], dateOf: (r: T) => string, locationOf: (r: T) => string | null): Map<string, T[]> {
  const out = new Map<string, T[]>();
  const add = (key: string, r: T) => {
    const list = out.get(key) ?? [];
    list.push(r);
    out.set(key, list);
  };
  for (const r of rows) {
    const m = dateOf(r).slice(0, 7);
    add(\`\${m}|all\`, r);
    add(\`\${m}|\${locationOf(r) ?? ''}\`, r);
  }
  return out;
}

// Same pricing as Margin by Staff, applied per "YYYY-MM|location" group (location "all" included),
// so every group equals that report run for the same month and location.
export async function computeMarginVisitsByMonth(dateRange: DateRange): Promise<Map<string, PricedVisit[]>> {
  const [pricingMap, appts, costRates] = await Promise.all([
    loadPricingMap(),
    loadMarginAppointments(dateRange, 'all', 'Completed'),
    loadCostRates(),
  ]);`);
rep(`  const byMonth = new Map<string, MarginAppointment[]>();
  for (const a of appts) {
    const m = a.start_datetime.slice(0, 7);
    const list = byMonth.get(m) ?? [];
    list.push(a);
    byMonth.set(m, list);
  }
  const out = new Map<string, PricedVisit[]>();
  for (const [m, list] of byMonth) out.set(m, priceVisits(list, csRevenueMap, costRates).visits);`,`  const out = new Map<string, PricedVisit[]>();
  for (const [key, list] of groupByMonthAndLocation(appts, a => a.start_datetime, a => a.location_id)) {
    out.set(key, priceVisits(list, csRevenueMap, costRates).visits);
  }`);
rep(`export async function computeMoneyReceivedByMonth(dateRange: DateRange, locationId: string): Promise<Map<string, MoneyReceived>> {
  const salesData = await fetchAllPages<{ id: string; total: number | null; sale_datetime: string }>((from, to) => {
    let q = supabase
      .from('sales')
      .select('id, total, sale_datetime')
      .gte('sale_datetime', dateRange.start)
      .lte('sale_datetime', dateRange.end + 'T23:59:59');
    if (locationId !== 'all') q = q.eq('location_id', locationId);
    return q.order('id').range(from, to);
  });
  const byMonth = new Map<string, typeof salesData>();
  for (const s of salesData) {
    const m = s.sale_datetime.slice(0, 7);
    const list = byMonth.get(m) ?? [];
    list.push(s);
    byMonth.set(m, list);
  }
  const out = new Map<string, MoneyReceived>();
  await Promise.all([...byMonth].map(async ([m, list]) => {
    out.set(m, (await summarizeSalesMoney(list)).money);
  }));
  return out;
}`,`// Keyed "YYYY-MM|location" (location "all" included), same rules as computeMoneyReceived.
export async function computeMoneyReceivedByMonth(dateRange: DateRange): Promise<Map<string, MoneyReceived>> {
  const salesData = await fetchAllPages<{ id: string; total: number | null; sale_datetime: string; location_id: string | null }>((from, to) => supabase
    .from('sales')
    .select('id, total, sale_datetime, location_id')
    .gte('sale_datetime', dateRange.start)
    .lte('sale_datetime', dateRange.end + 'T23:59:59')
    .order('id').range(from, to));
  const groups = [...groupByMonthAndLocation(salesData, s => s.sale_datetime, s => s.location_id)];
  const results = await mapLimited(groups, ([, list]) => summarizeSalesMoney(list), 4);
  return new Map(groups.map(([key], i) => [key, results[i].money]));
}`);
rep(`import { fetchByIds, chunkIds } from '../lib/fetchByIds';`,`import { fetchByIds, chunkIds, mapLimited } from '../lib/fetchByIds';`);
fs.writeFileSync(p,s);
