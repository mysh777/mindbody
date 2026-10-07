import { runReconciliationCheck } from '../src/hooks/useReconciliationData';
runReconciliationCheck().then((r: any) => {
  console.log('allOk', r.allOk, 'errors', JSON.stringify(r.errors));
  for (const c of r.cases || []) if (!c.ok && c.ok !== undefined) console.log('FAIL', JSON.stringify(c).slice(0, 300));
  console.log('drifts', JSON.stringify(r.baselineDrifts).slice(0, 300));
  const st = r.storedTotals || [];
  console.log('storedTotals', st.length, 'fails', JSON.stringify(st.filter((s: any) => !s.ok)).slice(0, 600));
  console.log('months', [...new Set(st.map((s: any) => s.period))].join(','));
}).catch(e => console.error('ERR', e));
