import { loadOverviewSeries } from '../src/utils/ownerOverview';
import { loadMonthDetail } from '../src/utils/ownerMonthDetail';
const r2 = (v: number) => Math.round(v * 100) / 100;
(async () => {
  let t = Date.now();
  const s = await loadOverviewSeries(true);
  console.log('series s', (Date.now() - t) / 1000);
  const show = (m: string, loc = 'all') => {
    const x = s.metrics[`${m}|${loc}`];
    console.log(m, loc, JSON.stringify({ sbs: x.salesByService, money: x.moneyReceived, rev: x.revenueEarned, cost: x.staffCost, gm: x.grossMargin, visits: x.visits, nc: x.newClients }));
  };
  for (const m of ['2025-01', '2025-09', '2026-07', '2026-08', '2026-09']) show(m);
  for (const loc of ['1', '3']) { show('2026-08', loc); show('2026-09', loc); }
  const sum = (m: string, f: 'salesByService' | 'visits' | 'staffCost' | 'newClients') => r2(s.metrics[`${m}|1`][f] + s.metrics[`${m}|3`][f]);
  console.log('loc sums 2026-09', sum('2026-09', 'salesByService'), sum('2026-09', 'visits'), sum('2026-09', 'staffCost'), sum('2026-09', 'newClients'));
  t = Date.now();
  const d = await loadMonthDetail('2026-08', 'all');
  console.log('detail s', (Date.now() - t) / 1000, 'visits', d.totalVisits, 'staff sum', d.staff.reduce((a, b) => a + b.visits, 0));
  for (const r of d.staff) console.log(r.isEquipment ? 'EQ' : '  ', r.staffId, r.name, 'work', r2(r.workHours), 'busy', r2(r.visitHours), 'v', r.visits, 'util', r.utilisation && r2(r.utilisation), 'rev', r2(r.revenueEarned), 'cost', r2(r.staffCost), 'ly', r2(r.revenueLastYear));
  const sat = d.heat.filter(c => c.weekday === 5 && c.hour === 10)[0];
  console.log('Sat 10', sat);
})().catch(e => console.error('ERR', e));
