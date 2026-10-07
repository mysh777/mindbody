const fs=require('fs');const p='src/hooks/useSalesByDateData.ts';let s=fs.readFileSync(p,'utf8');
const rep=(a,b)=>{ if(!s.includes(a)) throw new Error('missing '+a.slice(0,60)); s=s.replace(a,b); };
rep(`  clientTariffBreakdown: Map<string, ClientTariffEntry>;
}`,`  clientTariffBreakdown: Map<string, ClientTariffEntry>;
  byMonth: Map<string, Map<string, { category: string; revenue: number }>>;
}`);
rep(`        return { rows: [], totalReturned: 0, unallocatedAmount: 0, clientTariffBreakdown: new Map() };`,`        return { rows: [], totalReturned: 0, unallocatedAmount: 0, clientTariffBreakdown: new Map(), byMonth: new Map() };`);
rep(`      let returnedTotal = 0;
      const poaClients = new Set<string>();`,`      let returnedTotal = 0;
      const poaClients = new Set<string>();
      const byMonth: SalesByDateResult['byMonth'] = new Map();
      const addToMonth = (date: string, tariff: string, category: string, revenue: number) => {
        const month = date.slice(0, 7);
        const tariffs = byMonth.get(month) ?? new Map<string, { category: string; revenue: number }>();
        const entry = tariffs.get(tariff) ?? { category, revenue: 0 };
        entry.revenue += revenue;
        tariffs.set(tariff, entry);
        byMonth.set(month, tariffs);
      };`);
rep(`        if (si.returned) tariffMap[key].returnedCount++;

        const sale = salesById.get(si.sale_id);`,`        if (si.returned) tariffMap[key].returnedCount++;

        const sale = salesById.get(si.sale_id);
        addToMonth(sale?.sale_date || '', tariffName, tariffCategory, revenue);`);
rep(`          agg.revenue += m.amount;
          agg.creditIdxes.add(m.credit.idx);`,`          agg.revenue += m.amount;
          agg.creditIdxes.add(m.credit.idx);
          addToMonth(cd, tName, m.debit.tariffCategory || '', m.amount);`);
rep(`clientTariffBreakdown: ctBreakdown };`,`clientTariffBreakdown: ctBreakdown, byMonth };`);
fs.writeFileSync(p,s);
