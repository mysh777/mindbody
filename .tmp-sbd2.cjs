const fs=require('fs');const p='src/hooks/useSalesByDateData.ts';let s=fs.readFileSync(p,'utf8');
const old=s.slice(s.indexOf('      for (const clientId of poaClients) {'), s.indexOf('        const cPayBySale = groupBySaleId(cPayments);'));
const neu=`      const poaClientList = [...poaClients];
      const histories = await mapLimited(poaClientList, async clientId => {
        // Full sale history for this client
        const clientSales = await fetchAllPages<SaleRecord>((from, to) =>
          supabase.from('sales').select('id, client_id, location_id, sale_date')
            .eq('client_id', clientId)
            .order('sale_date', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
        );
        const cSaleIds = clientSales.map(s => s.id);
        const [cItems, cPayments] = await Promise.all([
          fetchByIds<RawItem>(
            'sale_items', 'sale_id', cSaleIds,
            'sale_id, item_id, total_amount, is_service, description, returned, category_id',
          ),
          fetchByIds<RawPayment>(
            'payments', 'sale_id', cSaleIds,
            'sale_id, type, amount',
          ),
        ]);
        return { clientSales, cItems, cPayments };
      }, 4);

      for (const [clientIndex, clientId] of poaClientList.entries()) {
        const { clientSales, cItems, cPayments } = histories[clientIndex];
`;
s=s.replace(old,neu);
s=s.replace("import { fetchByIds } from '../lib/fetchByIds';","import { fetchByIds, mapLimited } from '../lib/fetchByIds';");
s=s.replace(`      const periodItems = await fetchByIds<RawItem>(
        'sale_items', 'sale_id', saleIds,
        'sale_id, item_id, total_amount, is_service, description, returned, category_id',
      );
      const periodPayments = await fetchByIds<RawPayment>(
        'payments', 'sale_id', saleIds,
        'sale_id, type, amount',
      );`,`      const [periodItems, periodPayments] = await Promise.all([
        fetchByIds<RawItem>(
          'sale_items', 'sale_id', saleIds,
          'sale_id, item_id, total_amount, is_service, description, returned, category_id',
        ),
        fetchByIds<RawPayment>(
          'payments', 'sale_id', saleIds,
          'sale_id, type, amount',
        ),
      ]);`);
fs.writeFileSync(p,s);
