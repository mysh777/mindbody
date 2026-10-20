import { supabase } from '../lib/supabase';

export const FREE_CALLS_PER_CYCLE = 5000;
export const PRICE_PER_CALL = 0.002;
// Mindbody bills from the 12th to the 11th of the next month.
const CYCLE_START_DAY = 12;
const DAY_MS = 86_400_000;

export interface CallStat {
  day: string;
  step: string;
  run_type: string | null;
  calls: number;
}

export interface UsageSummary {
  today: number;
  cycleStart: Date;
  cycleEnd: Date;
  cycleSoFar: number;
  dailyAverage: number;
  projected: number;
  stats: CallStat[];
}

export function cycleCost(totalCalls: number): number {
  return totalCalls > FREE_CALLS_PER_CYCLE ? totalCalls * PRICE_PER_CALL : 0;
}

export const formatUsd = (n: number) => `$${n.toFixed(2)}`;

function billingCycle(now: Date) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const startMonth = now.getUTCDate() >= CYCLE_START_DAY ? m : m - 1;
  const start = new Date(Date.UTC(y, startMonth, CYCLE_START_DAY));
  const end = new Date(Date.UTC(y, startMonth + 1, CYCLE_START_DAY));
  return { start, end };
}

export async function loadUsage(now = new Date()): Promise<UsageSummary> {
  const { data, error } = await supabase.rpc('mindbody_call_stats', { p_days: 62 });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) throw new Error('Unexpected usage response');

  const stats: CallStat[] = data.map((r: CallStat) => ({ ...r, calls: Number(r.calls) || 0 }));
  const { start, end } = billingCycle(now);
  const todayKey = now.toISOString().slice(0, 10);
  const startKey = start.toISOString().slice(0, 10);

  const today = stats.filter(s => s.day === todayKey).reduce((sum, s) => sum + s.calls, 0);
  const cycleSoFar = stats.filter(s => s.day >= startKey).reduce((sum, s) => sum + s.calls, 0);

  const weekAgoKey = new Date(now.getTime() - 7 * DAY_MS).toISOString().slice(0, 10);
  const lastWeek = stats.filter(s => s.day >= weekAgoKey && s.day < todayKey).reduce((sum, s) => sum + s.calls, 0);
  const elapsedDays = Math.max(1, Math.min(7, Math.floor((now.getTime() - start.getTime()) / DAY_MS)));
  const dailyAverage = lastWeek / 7 || cycleSoFar / elapsedDays;
  const daysLeft = Math.max(0, (end.getTime() - now.getTime()) / DAY_MS);

  return {
    today,
    cycleStart: start,
    cycleEnd: new Date(end.getTime() - DAY_MS),
    cycleSoFar,
    dailyAverage,
    projected: Math.round(cycleSoFar + dailyAverage * daysLeft),
    stats,
  };
}

// Approximate billed calls for one manual run, based on measured runs (31 staff, ~880 active clients, 142 services).
const STEP_CALLS: Record<string, number> = {
  sites: 1,
  locations: 1,
  staff: 1,
  programs: 1,
  services: 2,
  staff_services: 32,
  pricing_options: 2,
  build_pricing_links: 143,
  retail_products: 1,
  clients: 33,
  staff_schedule: 8,
  resources: 1,
};

export function estimateCalls(syncType: string, month?: number, scope?: string): number {
  const wholeYear = !(month && month > 0);
  switch (syncType) {
    case 'appointments': return scope ? 3 : wholeYear ? 70 : 33;
    case 'refresh-today': return 2;
    case 'sales': return scope ? 2 : wholeYear ? 20 : 3;
    case 'client_services': return scope ? 30 : wholeYear ? 880 : 200;
    case 'clients': return scope ? 2 : STEP_CALLS.clients;
    case 'build_pricing_links': return scope ? 3 : STEP_CALLS.build_pricing_links;
    case 'all': return 1300;
    default: return STEP_CALLS[syncType] ?? 5;
  }
}
