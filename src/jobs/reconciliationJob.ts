import { runReconciliationCheck, saveReconciliationBaseline, resetSharedDepositData, type ReconciliationResult } from '../hooks/useReconciliationData';
import { loadDepositClientData } from '../hooks/useSalesByDateData';

export interface ReconciliationJobResult {
  allOk: boolean;
  checkedAt: string;
  provisionalMismatches: number;
  autoConfirmed: ReconciliationResult['autoConfirmed'];
  errors: string[];
  snapshotSaved: boolean;
  snapshotMessage: string | null;
  references: ReconciliationResult['references'];
  cases: ReconciliationResult['cases'];
}

export async function runReconciliationJob(): Promise<ReconciliationJobResult> {
  // Preload deposit-client data via the single RPC so runReconciliationCheck skips
  // the hundreds of per-client paginated fetches.
  resetSharedDepositData();
  try { await loadDepositClientData(); } catch { /* runReconciliationCheck will report the error */ }

  const result = await runReconciliationCheck();

  // Save a baseline snapshot when everything is green, same as the browser "Save baseline" button.
  let snapshotSaved = false;
  let snapshotMessage: string | null = null;
  if (result.allOk && result.errors.length === 0) {
    try {
      const saveResult = await saveReconciliationBaseline();
      snapshotSaved = saveResult.ok;
      snapshotMessage = saveResult.message;
    } catch (err) {
      snapshotMessage = `Snapshot save failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return {
    allOk: result.allOk,
    checkedAt: result.checkedAt,
    provisionalMismatches: result.provisionalMismatches,
    autoConfirmed: result.autoConfirmed,
    errors: result.errors,
    snapshotSaved,
    snapshotMessage,
    references: result.references,
    cases: result.cases,
  };
}
