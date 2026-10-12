import { runReconciliationCheck } from '../src/hooks/useReconciliationData';

const r = await runReconciliationCheck();
const failedRefs = r.references.filter(x => !x.ok && !x.provisional).length;
const failedCases = r.cases.filter(x => !x.ok && !x.provisional).length;
const drifts = r.baselineDrifts.filter(d => !d.provisional).length;
console.log(JSON.stringify({ allOk: r.allOk, references: r.references.length, cases: r.cases.length, failedRefs, failedCases, drifts, unknownPaymentTypes: r.unknownPaymentTypes.length }));
