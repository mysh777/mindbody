import { CheckCircle, XCircle, AlertCircle, AlertTriangle, Clock, ChevronRight, Timer } from 'lucide-react';
import type { SyncRunGroup, RunStep, RunStatus } from '../utils/syncRuns';
import { runTitle } from '../utils/syncRuns';

export const STATUS_COLORS: Record<string, { badge: string; icon: string }> = {
  completed: { badge: 'bg-emerald-100 text-emerald-700', icon: 'text-emerald-600' },
  warning:   { badge: 'bg-yellow-100 text-yellow-800',   icon: 'text-yellow-600' },
  partial:   { badge: 'bg-orange-100 text-orange-700',   icon: 'text-orange-600' },
  error:     { badge: 'bg-red-100 text-red-700',         icon: 'text-red-600' },
  failed:    { badge: 'bg-red-100 text-red-700',         icon: 'text-red-600' },
  timeout:   { badge: 'bg-amber-100 text-amber-700',     icon: 'text-amber-600' },
  started:   { badge: 'bg-blue-100 text-blue-700',       icon: 'text-blue-600' },
  running:   { badge: 'bg-blue-100 text-blue-700',       icon: 'text-blue-600' },
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.started;
  const cls = `w-3.5 h-3.5 ${colors.icon}`;
  const icon = status === 'completed' ? <CheckCircle className={cls} />
    : status === 'failed' || status === 'error' ? <XCircle className={cls} />
    : status === 'warning' || status === 'partial' ? <AlertTriangle className={cls} />
    : status === 'started' || status === 'running' ? <Clock className={`${cls} animate-pulse`} />
    : <AlertCircle className={cls} />;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${colors.badge}`}>
      {icon}
      {status === 'started' ? 'Running' : capitalize(status)}
    </span>
  );
}

const pad = (n: number) => n.toString().padStart(2, '0');
export const formatDate = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};
export const formatTime = (t: number, withSeconds = false) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}${withSeconds ? `:${pad(d.getSeconds())}` : ''}`;
};
export const formatSpan = (ms: number) => {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec} s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
};
const formatStepDuration = (started: string, completed: string | null) => {
  if (!completed) return '-';
  const diff = Math.round((new Date(completed).getTime() - new Date(started).getTime()) / 1000);
  if (diff < 0) return '-';
  if (diff < 60) return `${diff}s`;
  return `${Math.floor(diff / 60)}m ${diff % 60}s`;
};
const num = (n: number) => n.toLocaleString('en-US').replace(/,/g, '\u202f');

export function runStatusLabel(run: SyncRunGroup): string {
  if (run.status === 'running') return `Running (${run.steps.length - run.counts.running} steps done)`;
  const map: Record<RunStatus, string> = { running: 'Running', error: 'Error', warning: 'Warning', completed: 'Completed' };
  return map[run.status];
}

function OutcomeCounts({ run }: { run: SyncRunGroup }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-xs font-medium whitespace-nowrap">
      <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle className="w-3.5 h-3.5" />{run.counts.ok}</span>
      {run.counts.warn > 0 && <span className="inline-flex items-center gap-1 text-yellow-700"><AlertTriangle className="w-3.5 h-3.5" />{run.counts.warn}</span>}
      <span className={`inline-flex items-center gap-1 ${run.counts.err > 0 ? 'text-red-700' : 'text-slate-400'}`}><XCircle className="w-3.5 h-3.5" />{run.counts.err}</span>
      {run.counts.running > 0 && <span className="inline-flex items-center gap-1 text-blue-700"><Clock className="w-3.5 h-3.5" />{run.counts.running}</span>}
    </span>
  );
}

interface SyncRunRowProps {
  run: SyncRunGroup;
  expanded: boolean;
  onToggle: () => void;
  isHighlighted: (step: RunStep) => boolean;
}

export function SyncRunRow({ run, expanded, onToggle, isHighlighted }: SyncRunRowProps) {
  const sameDay = formatDate(run.startedAt) === formatDate(run.endedAt);
  const highlightedCount = run.steps.filter(isHighlighted).length;

  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer transition-colors ${expanded ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
        aria-expanded={expanded}
      >
        <td className="pl-4 pr-1 py-3 w-6">
          <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
        </td>
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="font-medium text-slate-900">{runTitle(run)}</div>
          {run.legacy && <div className="text-[11px] text-slate-400 mt-0.5">grouped from older history</div>}
        </td>
        <td className="px-3 py-3 whitespace-nowrap text-slate-700">{formatDate(run.startedAt)}</td>
        <td className="px-3 py-3 whitespace-nowrap text-slate-600 tabular-nums">
          {formatTime(run.startedAt)}&ndash;{sameDay ? formatTime(run.endedAt) : `${formatDate(run.endedAt)} ${formatTime(run.endedAt)}`}
        </td>
        <td className="px-3 py-3 whitespace-nowrap text-right text-slate-600 tabular-nums">{formatSpan(run.endedAt - run.startedAt)}</td>
        <td className="px-3 py-3 whitespace-nowrap text-right text-slate-700 tabular-nums">
          {run.steps.length} {run.steps.length === 1 ? 'step' : 'steps'}
          {highlightedCount > 0 && highlightedCount < run.steps.length && (
            <div className="text-[11px] text-blue-600">{highlightedCount} matching</div>
          )}
        </td>
        <td className="px-3 py-3"><OutcomeCounts run={run} /></td>
        <td className="px-3 py-3 whitespace-nowrap text-right font-medium text-slate-900 tabular-nums">
          {run.records > 0 ? num(run.records) : '-'}
        </td>
        <td className="px-3 py-3 pr-4">
          <StatusBadge status={run.status} />
          {run.status === 'running' && (
            <div className="text-[11px] text-blue-600 mt-1 whitespace-nowrap">{run.steps.length - run.counts.running} steps done</div>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={9} className="px-4 pb-4 pt-0 bg-slate-50">
            <div className="ml-6 border border-slate-200 rounded-lg overflow-x-auto bg-white animate-[fadeIn_150ms_ease-out]">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium w-8">#</th>
                    <th className="px-3 py-2 text-left font-medium">Step</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Started</th>
                    <th className="px-3 py-2 text-right font-medium">Duration</th>
                    <th className="px-3 py-2 text-right font-medium">Received</th>
                    <th className="px-3 py-2 text-right font-medium">Saved</th>
                    <th className="px-3 py-2 text-left font-medium">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {run.steps.map((step, i) => {
                    const hl = isHighlighted(step);
                    const tone = step.outcome === 'err' ? 'text-red-600' : step.outcome === 'warn' ? 'text-yellow-800' : 'text-slate-500';
                    return (
                      <tr key={step.log.id} className={hl ? 'bg-blue-50/70 shadow-[inset_3px_0_0_0_#3b82f6]' : ''}>
                        <td className="px-3 py-2 text-slate-400 tabular-nums">{i + 1}</td>
                        <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">{step.label}</td>
                        <td className="px-3 py-2"><StatusBadge status={step.log.status} /></td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap tabular-nums">{formatTime(new Date(step.log.started_at).getTime(), true)}</td>
                        <td className="px-3 py-2 text-right text-slate-600 whitespace-nowrap tabular-nums">
                          <span className="inline-flex items-center gap-1"><Timer className="w-3 h-3 text-slate-400" />{formatStepDuration(step.log.started_at, step.log.completed_at)}</span>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-600 tabular-nums">{step.received != null ? num(step.received) : '-'}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-medium ${step.received != null && step.saved < step.received ? 'text-orange-700' : 'text-slate-900'}`}>
                          {step.saved > 0 ? num(step.saved) : '-'}
                        </td>
                        <td className="px-3 py-2 max-w-md">
                          {step.log.error_message ? (
                            <span className={`${tone} block truncate`} title={step.log.error_message}>{step.log.error_message}</span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
