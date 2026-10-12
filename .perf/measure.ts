import { stats } from './countFetch';
import { computeOverviewMonths } from '../src/utils/ownerOverview';
import { computeSalesByDateData } from '../src/hooks/useSalesByDateData';
import { computeMarginVisitsByMonth, computeMoneyReceivedByMonth, summarizeVisits } from '../src/hooks/useSalesMarginData';
import { loadStudioObligations } from '../src/utils/obligations';
import { loadMonthDetail } from '../src/utils/ownerMonthDetail';
import { loadSegmentData } from '../src/utils/clientSegments';
import { loadClientIndex } from '../src/utils/campaignMatch';

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const r0 = stats.requests, b0 = stats.bytes, t0 = Date.now();
  const out = await fn();
  console.log(JSON.stringify({ step: name, ms: Date.now() - t0, requests: stats.requests - r0, kb: Math.round((stats.bytes - b0) / 1024) }));
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
  const months = [{ start: '2026-08-01', end: '2026-08-31' }, { start: '2026-09-01', end: '2026-09-30' }];
  for (const range of months) {
    const label = range.start.slice(0, 7);
    const sales = await step(`margin-sale-basis ${label}`, () => computeSalesByDateData(range, 'all'));
    const visits = await step(`margin-visit-basis ${label}`, () => computeMarginVisitsByMonth(range));
    const money = await step(`money-received ${label}`, () => computeMoneyReceivedByMonth(range));
    let saleTotal = 0;
    for (const m of sales.byMonth.values()) for (const e of m.values()) saleTotal += e.revenue;
    const v = summarizeVisits(visits.get(`${label}|all`) || []);
    console.log(JSON.stringify({ check: label, saleBasisTotal: r2(saleTotal), rows: sales.rows.length,
      visitRevenue: r2(v.revenueEarned), staffCost: r2(v.staffCost), grossMargin: r2(v.grossMargin), visits: v.totalAppointments,
      moneyIn: r2(money.get(`${label}|all`)?.cashIn ?? 0) }));
  }
  const overview = await step('overview-compute 2026-08..09', () => computeOverviewMonths('2026-08', '2026-09'));
  console.log(JSON.stringify({ check: 'overview', rows: overview.filter(r => r.location === 'all').map(r => ({ m: r.month, ...r.metrics, moneyByType: undefined })) }));
  await step('overview-month-detail 2026-09', () => loadMonthDetail('2026-09', 'all'));
  await step('overview-obligations', () => loadStudioObligations());
  await step('margin-sale-basis 2026 full year', () => computeSalesByDateData({ start: '2026-01-01', end: '2026-12-31' }, 'all'));
  await step('margin-visit-basis 2026 full year', () => computeMarginVisitsByMonth({ start: '2026-01-01', end: '2026-12-31' }));
  await step('segments data', () => loadSegmentData());
  await step('campaigns client index', () => loadClientIndex([]));
}

main().then(() => process.exit(0)).catch(e => { console.error('FAILED', e?.message || e); process.exit(1); });
