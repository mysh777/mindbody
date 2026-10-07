import { fetchByIds } from '../src/lib/fetchByIds';
import { loadStudioObligations, computeObligations } from '../src/utils/obligations';
import { resolveServicePrices } from '../src/utils/resolveServicePrices';
import { PACKAGE_STATUS_COLUMNS } from '../src/utils/packageStatus';
(async () => {
  const s = await loadStudioObligations();
  const ids = [...s.byClient.keys()];
  const svcs = await fetchByIds<any>('client_services', 'client_id', ids, `id, mindbody_id, client_id, count, remaining, pricing_option_id, active_date, expiration_date, ${PACKAGE_STATUS_COLUMNS}`);
  const sales = await fetchByIds<any>('sales', 'client_id', ids, 'id, client_id, sale_datetime');
  const items = await fetchByIds<any>('sale_items', 'sale_id', sales.map(x => x.id), 'id, sale_id, item_id, total_amount, payment_ref_id');
  const pos = await fetchByIds<any>('pricing_options', 'id', [...new Set(svcs.map(x => x.pricing_option_id).filter(Boolean))], 'id, mindbody_id, price');
  let cardSum = 0; const diffs: any[] = [];
  for (const id of ids) {
    const cs = svcs.filter(x => x.client_id === id);
    const cSales = sales.filter(x => x.client_id === id);
    const saleIds = new Set(cSales.map(x => x.id));
    const prices = resolveServicePrices(cs.map(x => ({ id: x.id, mindbody_id: x.mindbody_id, pricing_option_id: x.pricing_option_id, payment_date: null, active_date: x.active_date })), pos, items.filter(i => saleIds.has(i.sale_id)), cSales);
    const card = computeObligations(cs.map(x => { const rp = prices.get(x.id) || { price: 0, source: 'no_data' as const }; return { ...x, paid_price: rp.price, price_source: rp.source }; })).total;
    cardSum += card;
    const list = s.byClient.get(id)!.value;
    if (Math.abs(card - list) > 0.005) diffs.push({ id, card: card.toFixed(2), list: list.toFixed(2) });
  }
  console.log({ clients: ids.length, cardSum: cardSum.toFixed(2), total: s.total.toFixed(2), diffs });
})();
