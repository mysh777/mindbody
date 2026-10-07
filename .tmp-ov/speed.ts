import { loadOverviewSeries } from '../src/utils/ownerOverview';
import { loadStudioObligations } from '../src/utils/obligations';
(async () => {
  const t = Date.now();
  const [s] = await Promise.all([loadOverviewSeries(), loadStudioObligations()]);
  console.log('series+obligations ms', Date.now() - t, 'months', s.months.length, 'computedAt', s.computedAt);
  const m = s.metrics['2026-09|all'];
  console.log('sep money', m.moneyReceived, 'byType', JSON.stringify(m.moneyByType), 'gift', m.moneyGiftCards, 'dep', m.moneyDeposits, 'acct', m.paidFromAccount, 'gc', m.paidByGiftCard);
})();
