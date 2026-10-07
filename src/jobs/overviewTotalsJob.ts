import { supabase } from '../lib/supabase';
import { computeOverviewMonths } from '../utils/ownerOverview';
import { loadStudioObligations } from '../utils/obligations';
import { toLocalISO } from '../utils/packageStatus';
import { lastDayOfMonth, shiftMonth } from '../utils/ownerFormat';

export interface OverviewTotalsOptions {
  fromMonth?: string;
  toMonth?: string;
  obligationsAsOf?: string;
}

export interface OverviewTotalsResult {
  fromMonth: string;
  toMonth: string;
  rows: number;
  obligationsSnapshot: { asOf: string; total: number } | null;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function runOverviewTotals(opts: OverviewTotalsOptions = {}): Promise<OverviewTotalsResult> {
  const today = toLocalISO(new Date());
  const currentMonth = today.slice(0, 7);
  // Last 3 months are recomputed every night so back-dated Mindbody corrections reach the stored totals.
  const fromMonth = opts.fromMonth ?? shiftMonth(currentMonth, -2);
  const toMonth = opts.toMonth ?? currentMonth;
  if (!MONTH_RE.test(fromMonth) || !MONTH_RE.test(toMonth) || fromMonth > toMonth) {
    throw new Error('Invalid month range');
  }

  const rows = await computeOverviewMonths(fromMonth, toMonth);
  const computedAt = new Date().toISOString();
  const payload = rows.map(r => ({ ...r, computed_at: computedAt }));
  for (let i = 0; i < payload.length; i += 100) {
    const { error } = await supabase.from('overview_monthly_totals').upsert(payload.slice(i, i + 100), { onConflict: 'month,location' });
    if (error) throw new Error(`Saving totals failed: ${error.message}`);
  }

  let asOf = opts.obligationsAsOf ?? null;
  if (asOf && !DATE_RE.test(asOf)) throw new Error('Invalid obligations date');
  if (!asOf && today.endsWith('-01')) asOf = lastDayOfMonth(shiftMonth(currentMonth, -1));

  let obligationsSnapshot: OverviewTotalsResult['obligationsSnapshot'] = null;
  if (asOf) {
    const o = await loadStudioObligations(asOf);
    const { error } = await supabase.from('obligation_snapshots').upsert({
      as_of_date: asOf,
      total: Math.round(o.total * 100) / 100,
      paid_part: Math.round(o.paidPart * 100) / 100,
      catalog_part: Math.round(o.catalogPart * 100) / 100,
      remaining_visits: o.remainingVisits,
      clients: o.clients,
      active_packages: o.activePackages,
      computed_at: computedAt,
    }, { onConflict: 'as_of_date' });
    if (error) throw new Error(`Saving obligations failed: ${error.message}`);
    obligationsSnapshot = { asOf, total: o.total };
  }

  return { fromMonth, toMonth, rows: rows.length, obligationsSnapshot };
}
