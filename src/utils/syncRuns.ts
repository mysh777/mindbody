import type { SyncLog } from '../types/mindbody';

export type RunKind = 'nightly' | 'quick' | 'full' | 'manual' | 'maintenance' | 'time_grouped';
export type RunStatus = 'running' | 'error' | 'warning' | 'completed';
export type StepOutcome = 'ok' | 'warn' | 'err' | 'running';

export interface RunStep {
  log: SyncLog;
  label: string;
  outcome: StepOutcome;
  received: number | null;
  saved: number;
}

export interface SyncRunGroup {
  key: string;
  kind: RunKind;
  legacy: boolean;
  steps: RunStep[];
  startedAt: number;
  endedAt: number;
  status: RunStatus;
  counts: Record<StepOutcome, number>;
  records: number;
}

export const RUN_KIND_LABELS: Record<RunKind, string> = {
  nightly: 'Nightly sync',
  quick: 'Quick Sync',
  full: 'Full sync / backfill',
  manual: 'Manual step',
  maintenance: 'Maintenance',
  time_grouped: 'Run (grouped by time)',
};

const LEGACY_GAP_MS = 2 * 60 * 1000;
// Nightly steps are up to 9 minutes apart; a run without its final overview step is still in progress within this window.
const NIGHTLY_IDLE_MS = 15 * 60 * 1000;
const NIGHTLY_LAST_STEP = 'overview_totals';

export const friendlyType = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function stepOutcome(status: string): StepOutcome {
  switch (status) {
    case 'completed': return 'ok';
    case 'started': return 'running';
    case 'failed':
    case 'error':
    case 'timeout': return 'err';
    default: return 'warn';
  }
}

const ts = (iso: string | null) => (iso ? new Date(iso).getTime() : NaN);
const stepEnd = (l: SyncLog) => {
  const end = ts(l.completed_at);
  return Number.isFinite(end) ? end : ts(l.started_at);
};

function savedCounts(log: SyncLog): { received: number | null; saved: number } {
  const report = (log.raw_response as { save_report?: Record<string, { received?: number; saved?: number }> } | null)?.save_report;
  if (!report || typeof report !== 'object') return { received: null, saved: log.records_synced || 0 };
  const entries = Object.values(report).filter(e => e && typeof e.received === 'number');
  if (entries.length === 0) return { received: null, saved: log.records_synced || 0 };
  return {
    received: entries.reduce((s, e) => s + (e.received || 0), 0),
    saved: log.records_synced || 0,
  };
}

function buildSteps(logs: SyncLog[]): RunStep[] {
  const ordered = [...logs].sort((a, b) => ts(a.started_at) - ts(b.started_at));
  const totals = new Map<string, number>();
  for (const l of ordered) totals.set(l.sync_type, (totals.get(l.sync_type) || 0) + 1);
  const seen = new Map<string, number>();
  return ordered.map(log => {
    const n = (seen.get(log.sync_type) || 0) + 1;
    seen.set(log.sync_type, n);
    const total = totals.get(log.sync_type) || 1;
    return {
      log,
      label: total > 1 ? `${friendlyType(log.sync_type)} (${n}/${total})` : friendlyType(log.sync_type),
      outcome: stepOutcome(log.status),
      ...savedCounts(log),
    };
  });
}

function finalizeRun(key: string, kind: RunKind, legacy: boolean, logs: SyncLog[], now: number): SyncRunGroup {
  const steps = buildSteps(logs);
  const counts: Record<StepOutcome, number> = { ok: 0, warn: 0, err: 0, running: 0 };
  for (const s of steps) counts[s.outcome]++;
  const startedAt = ts(steps[0].log.started_at);
  const endedAt = Math.max(...steps.map(s => stepEnd(s.log)));
  const lastStart = ts(steps[steps.length - 1].log.started_at);
  const nightlyInProgress = kind === 'nightly' && !legacy
    && !steps.some(s => s.log.sync_type === NIGHTLY_LAST_STEP)
    && now - lastStart < NIGHTLY_IDLE_MS;

  const status: RunStatus = counts.running > 0 || nightlyInProgress ? 'running'
    : counts.err > 0 ? 'error'
    : counts.warn > 0 ? 'warning'
    : 'completed';

  return {
    key, kind, legacy, steps, startedAt, endedAt, status, counts,
    records: steps.reduce((s, st) => s + (st.log.records_synced || 0), 0),
  };
}

const KNOWN_KINDS = new Set<RunKind>(['nightly', 'quick', 'full', 'manual', 'maintenance']);

/*
 * Rows with run_id are grouped by it. Older rows (no run_id) are grouped by rule:
 * anything started 03:00–03:59 UTC is that night's nightly sync; other rows join the
 * previous row's run when they start within 2 minutes of its end, unless a new
 * multi-step run begins (every Quick Sync starts with "sites").
 */
export function groupSyncRuns(logs: SyncLog[], now = Date.now()): SyncRunGroup[] {
  const byRunId = new Map<string, SyncLog[]>();
  const legacyNightly = new Map<string, SyncLog[]>();
  const legacyOther: SyncLog[] = [];

  for (const l of logs) {
    if (l.run_id) {
      const list = byRunId.get(l.run_id);
      if (list) list.push(l); else byRunId.set(l.run_id, [l]);
    } else if (new Date(l.started_at).getUTCHours() === 3) {
      const day = new Date(l.started_at).toISOString().slice(0, 10);
      const list = legacyNightly.get(day);
      if (list) list.push(l); else legacyNightly.set(day, [l]);
    } else {
      legacyOther.push(l);
    }
  }

  const runs: SyncRunGroup[] = [];

  for (const [runId, list] of byRunId) {
    const kind = (list.find(l => l.run_type)?.run_type ?? 'manual') as RunKind;
    runs.push(finalizeRun(runId, KNOWN_KINDS.has(kind) ? kind : 'manual', false, list, now));
  }

  for (const [day, list] of legacyNightly) {
    runs.push(finalizeRun(`legacy-nightly-${day}`, 'nightly', true, list, now));
  }

  legacyOther.sort((a, b) => ts(a.started_at) - ts(b.started_at));
  const singleCallKind = (t: string): RunKind | null => (t === 'quick' ? 'quick' : t === 'all' ? 'full' : null);
  let current: SyncLog[] = [];
  const flush = () => {
    if (current.length === 0) return;
    const only = current.length === 1 ? current[0] : null;
    const kind: RunKind = only ? (singleCallKind(only.sync_type) ?? 'manual') : 'time_grouped';
    runs.push(finalizeRun(`legacy-${current[0].id}`, kind, true, current, now));
    current = [];
  };
  for (const l of legacyOther) {
    const prev = current[current.length - 1];
    const startsNewRun = !prev
      || ts(l.started_at) - stepEnd(prev) > LEGACY_GAP_MS
      || l.sync_type === 'sites'
      || singleCallKind(l.sync_type) !== null
      || singleCallKind(prev.sync_type) !== null;
    if (startsNewRun) flush();
    current.push(l);
  }
  flush();

  return runs.sort((a, b) => b.startedAt - a.startedAt);
}

export function runTitle(run: SyncRunGroup): string {
  if (run.kind === 'manual' && run.steps.length === 1) return `${RUN_KIND_LABELS.manual}: ${run.steps[0].label}`;
  return RUN_KIND_LABELS[run.kind];
}
