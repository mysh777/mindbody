import { supabase } from '../src/lib/supabase';
import { loadStudioObligations } from '../src/utils/obligations';
import { priceMarginVisits, summarizeVisits } from '../src/hooks/useSalesMarginData';
(async () => {
  const t0 = Date.now();
  const s = await loadStudioObligations();
  let sum = 0, visits = 0; for (const c of s.byClient.values()) { sum += c.value; visits += c.visits; }
  console.log({ ms: Date.now() - t0, total: s.total.toFixed(2), listSum: sum.toFixed(2), clients: s.clients, listRows: s.byClient.size, remaining: s.remainingVisits, listVisits: visits, paid: s.paidPart.toFixed(2), catalog: s.catalogPart.toFixed(2) });
  for (const id of ['100004808', '100006882', '100011238']) {
    const { data } = await supabase.from('appointments').select('id, client_id, staff_id, session_type_id, location_id, start_datetime, end_datetime, status, client_service_id').eq('client_id', id).eq('stale', false).eq('status', 'Completed');
    const priced = await priceMarginVisits(data || []);
    const sv = summarizeVisits(priced);
    console.log(id, { obligations: s.byClient.get(id)?.value.toFixed(2) ?? '0', visitsLeft: s.byClient.get(id)?.visits ?? 0, completed: priced.length, revenueEarned: sv.revenueEarned.toFixed(2), staffCost: (sv as any).staffCost?.toFixed?.(2) });
  }
})();
