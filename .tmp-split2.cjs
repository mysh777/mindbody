const fs=require('fs');const p='src/hooks/useSalesMarginData.ts';let s=fs.readFileSync(p,'utf8');
const a=`  const groups = [...groupByMonthAndLocation(salesData, s => s.sale_datetime, s => s.location_id)];
  const results = await mapLimited(groups, ([, list]) => summarizeSalesMoney(list), 4);
  return new Map(groups.map(([key], i) => [key, results[i].money]));`;
const b=`  // Money is additive per sale, so "all" is the sum of the location groups.
  const groups = [...groupByMonthAndLocation(salesData, s => s.sale_datetime, s => s.location_id)].filter(([key]) => !key.endsWith('|all'));
  const results = await mapLimited(groups, ([, list]) => summarizeSalesMoney(list), 4);
  const out = new Map<string, MoneyReceived>();
  groups.forEach(([key], i) => {
    const money = results[i].money;
    out.set(key, money);
    const allKey = \`\${key.slice(0, 7)}|all\`;
    const total = out.get(allKey) ?? { cashIn: 0, cashInGiftCards: 0, cashInDeposits: 0, paidFromAccount: 0, paidByGiftCard: 0 };
    (Object.keys(total) as (keyof MoneyReceived)[]).forEach(k => { total[k] += money[k]; });
    out.set(allKey, total);
  });
  return out;`;
if(!s.includes(a)) throw 'x'; s=s.replace(a,b); fs.writeFileSync(p,s);
