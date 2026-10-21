export interface ReconciliationJobResult {
  allOk: boolean;
  checkedAt: string;
  provisionalMismatches: number;
  autoConfirmed: unknown[];
  errors: string[];
  snapshotSaved: boolean;
  snapshotMessage: string | null;
}
