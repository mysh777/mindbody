import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, Clock, Loader2, MapPin, Printer, RefreshCw } from 'lucide-react';
import { OwnerOverviewCards, type CardLink, type OverviewCard } from './OwnerOverviewCards';
import { OwnerOverviewCharts } from './OwnerOverviewCharts';
import { OwnerMoneyBreakdown } from './OwnerMoneyBreakdown';
import { OwnerStaffLoad } from './OwnerStaffLoad';
import { OwnerHeatmap } from './OwnerHeatmap';
import { handlePrint } from '../utils/printReport';
import { toLocalISO } from '../utils/datePresets';
import { loadStudioObligations, type ObligationsSummary } from '../utils/obligations';
import { OVERVIEW_LOCATIONS, SERIES_START_MONTH, loadOverviewSeries, monthsBetween, requestOverviewRecompute, seriesKey, type MonthMetrics, type OverviewSeries } from '../utils/ownerOverview';
import { loadMonthDetail, type MonthDetail } from '../utils/ownerMonthDetail';
import { formatEur, formatPct, lastDayOfMonth, monthFull, monthShort, percentChange, shiftMonth } from '../utils/ownerFormat';

const HINTS = {
  grossMargin: 'Sales minus staff pay for treatments. Excludes rent, salaries, advertising and taxes — not net profit.',
  moneyReceived: 'All real money: cash, cards, transfers; including gift cards and account top-ups.',
  salesByService: 'Service sales by payment date, as in the Mindbody Sales by Service report.',
  revenueEarned: 'Revenue for delivered visits: package price / number of visits.',
  avgPerVisit: 'Revenue earned / visits.',
  newClients: 'First visit to the studio (or to the selected location) — as in Client Segments.',
};

interface OwnerOverviewProps {
  urlParams?: Record<string, string>;
  onParamsChange?: (params: Record<string, string>) => void;
  onOpenReport: (link: CardLink) => void;
}

const MONTH_RE = /^\d{4}-\d{2}$/;

function changeWord(pct: number | null): string {
  if (pct === null) return '';
  if (Math.abs(pct) < 0.5) return 'flat';
  return `${pct > 0 ? '+' : '−'}${formatPct(Math.abs(pct), 0)}`;
}

function buildSummary(m: MonthMetrics, prev: MonthMetrics | undefined, ly: MonthMetrics | undefined, month: string, series: OverviewSeries, location: string): string[] {
  const lyMonth = shiftMonth(month, -12);
  const out: string[] = [];
  const vsPrev = changeWord(percentChange(m.salesByService, prev?.salesByService));
  const vsLy = changeWord(percentChange(m.salesByService, ly?.salesByService));
  const parts = [vsPrev && `${vsPrev} vs ${monthShort(shiftMonth(month, -1))}`, vsLy && `${vsLy} vs ${monthShort(lyMonth)}`].filter(Boolean);
  out.push(`In ${monthFull(month)}, service sales were ${formatEur(m.salesByService)}${parts.length ? ` (${parts.join(', ')})` : ''}; money received was ${formatEur(m.moneyReceived)}.`);
  out.push(`${m.visits} visits delivered for ${formatEur(m.revenueEarned)}; after staff pay, ${formatEur(m.grossMargin)} remains — ${formatPct(m.marginPercent, 0)} of revenue earned${ly ? ` (a year ago: ${formatPct(ly.marginPercent, 0)})` : ''}.`);

  const now = series.categories[seriesKey(month, location)] || {};
  const before = series.categories[seriesKey(lyMonth, location)] || {};
  const deltas = [...new Set([...Object.keys(now), ...Object.keys(before)])].map(name => ({ name, d: (now[name] || 0) - (before[name] || 0) }));
  const up = deltas.filter(x => x.d > 0).sort((a, b) => b.d - a.d)[0];
  const down = deltas.filter(x => x.d < 0).sort((a, b) => a.d - b.d)[0];
  if (ly && (up || down)) {
    const bits = [up && `"${up.name}" grew the most (+${formatEur(up.d, 0)})`, down && `"${down.name}" fell the most (${formatEur(down.d, 0)})`].filter(Boolean);
    out.push(`Compared with ${monthShort(lyMonth)}, ${bits.join(', while ')}.`);
  }
  out.push(`New clients: ${m.newClients}${ly ? ` (a year ago: ${ly.newClients})` : ''}.`);
  return out;
}

function formatDataAsOf(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return toLocalISO(d) === toLocalISO(new Date()) ? time : `${time}, ${toLocalISO(d)}`;
}

export function OwnerOverview({ urlParams, onParamsChange, onOpenReport }: OwnerOverviewProps) {
  const today = toLocalISO(new Date());
  const currentMonth = today.slice(0, 7);
  const defaultMonth = shiftMonth(currentMonth, -1);
  const [month, setMonth] = useState(urlParams?.month && MONTH_RE.test(urlParams.month) && urlParams.month <= currentMonth && urlParams.month >= SERIES_START_MONTH ? urlParams.month : defaultMonth);
  const [location, setLocation] = useState(OVERVIEW_LOCATIONS.some(l => l.id === urlParams?.loc) ? urlParams!.loc : 'all');

  const [series, setSeries] = useState<OverviewSeries | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);
  const [detail, setDetail] = useState<MonthDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [obligations, setObligations] = useState<ObligationsSummary | null>(null);
  const [obligationsError, setObligationsError] = useState(false);
  const [moneyOpen, setMoneyOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadSeries = useCallback(() => {
    setSeriesError(null);
    return loadOverviewSeries()
      .then(setSeries)
      .catch(err => setSeriesError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    loadSeries();
    loadStudioObligations().then(setObligations).catch(() => setObligationsError(true));
  }, [loadSeries]);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setDetailError(null);
    loadMonthDetail(month, location)
      .then(d => { if (!cancelled) setDetail(d); })
      .catch(err => { if (!cancelled) setDetailError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [month, location]);

  useEffect(() => {
    onParamsChange?.({ month, loc: location });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, location]);

  const recompute = async () => {
    setRecomputing(true);
    setSeriesError(null);
    try {
      await requestOverviewRecompute({ fromMonth: month, toMonth: month });
      await loadSeries();
    } catch (err) {
      setSeriesError(err instanceof Error ? err.message : String(err));
    } finally {
      setRecomputing(false);
    }
  };

  const monthOptions = useMemo(() => monthsBetween(SERIES_START_MONTH, currentMonth).reverse(), [currentMonth]);
  const prevMonth = shiftMonth(month, -1);
  const lastYearMonth = shiftMonth(month, -12);
  const incomplete = month === currentMonth;
  const m = series?.metrics[seriesKey(month, location)];
  const prev = series?.metrics[seriesKey(prevMonth, location)];
  const ly = series?.metrics[seriesKey(lastYearMonth, location)];
  const locationLabel = OVERVIEW_LOCATIONS.find(l => l.id === location)!.label;

  const range = { from: `${month}-01`, to: lastDayOfMonth(month), location };
  const cards: OverviewCard[] = m ? [
    { id: 'sales', label: 'Sales by service', value: m.salesByService, format: 'eur', hint: HINTS.salesByService, prevMonth: prev?.salesByService, lastYear: ly?.salesByService, link: { section: 'margin-by-service', params: range } },
    { id: 'money', label: 'Money received', value: m.moneyReceived, format: 'eur', hint: HINTS.moneyReceived, prevMonth: prev?.moneyReceived, lastYear: ly?.moneyReceived, onToggle: () => setMoneyOpen(o => !o), expanded: moneyOpen },
    { id: 'revenue', label: 'Revenue earned', value: m.revenueEarned, format: 'eur', hint: HINTS.revenueEarned, prevMonth: prev?.revenueEarned, lastYear: ly?.revenueEarned, link: { section: 'margin-by-service', params: { ...range, basis: 'visit' } } },
    { id: 'cost', label: 'Staff cost', value: m.staffCost, format: 'eur', neutral: true, prevMonth: prev?.staffCost, lastYear: ly?.staffCost, link: { section: 'margin-by-staff', params: range } },
    { id: 'margin', label: 'Gross margin', value: m.grossMargin, format: 'eur', secondary: formatPct(m.marginPercent), hint: HINTS.grossMargin, prevMonth: prev?.grossMargin, lastYear: ly?.grossMargin, link: { section: 'margin-by-service', params: { ...range, basis: 'visit' } } },
    { id: 'visits', label: 'Visits', value: m.visits, format: 'count', prevMonth: prev?.visits, lastYear: ly?.visits, link: { section: 'margin-by-staff', params: range } },
    { id: 'avg', label: 'Average per visit', value: m.avgPerVisit, format: 'eur', hint: HINTS.avgPerVisit, prevMonth: prev?.avgPerVisit, lastYear: ly?.avgPerVisit, link: { section: 'margin-by-staff', params: range } },
    { id: 'new', label: 'New clients', value: m.newClients, format: 'count', hint: HINTS.newClients, prevMonth: prev?.newClients, lastYear: ly?.newClients, link: { section: 'client-segments', params: { end: month, loc: location } } },
    {
      id: 'obligations', label: 'Obligations', value: obligations?.total ?? 0, format: 'eur',
      note: obligationsError ? 'Could not load.' : obligations
        ? `As of today, all locations: ${obligations.remainingVisits} unused visits held by ${obligations.clients} clients.`
        : 'Loading…',
      link: { section: 'client-card', params: {} },
    },
  ] : [];

  const summary = m && series ? buildSummary(m, prev, ly, month, series, location) : [];

  return (
    <div ref={containerRef} className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <label className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg pl-3 pr-1 py-1 shadow-sm">
          <CalendarDays className="w-4 h-4 text-slate-400" />
          <select value={month} onChange={e => setMonth(e.target.value)} className="text-sm bg-transparent py-1.5 pr-2 text-slate-800 focus:outline-none">
            {monthOptions.map(o => <option key={o} value={o}>{monthFull(o)}{o === currentMonth ? ' — month in progress' : ''}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
          <MapPin className="w-4 h-4 text-slate-400 mx-2" />
          {OVERVIEW_LOCATIONS.map(l => (
            <button
              key={l.id}
              onClick={() => setLocation(l.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${location === l.id ? 'bg-sky-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {l.label}
            </button>
          ))}
        </div>
        {series?.computedAt && (
          <span className="flex items-center gap-1.5 text-xs text-slate-500" title="Totals are recalculated every night after the Mindbody sync">
            <Clock className="w-3.5 h-3.5" /> Data as of {formatDataAsOf(series.computedAt)}
          </span>
        )}
        <div className="flex gap-2 ml-auto">
          <button
            onClick={recompute}
            disabled={recomputing || !series}
            title={`Recalculate ${monthFull(month)} now`}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-700 rounded-lg shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${recomputing ? 'animate-spin' : ''}`} />
            {recomputing ? 'Recalculating…' : 'Recalculate'}
          </button>
          <button
            onClick={() => handlePrint(containerRef, { summary: true })}
            disabled={!m}
            title="Short version: key figures, charts, top 10 staff"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-700 rounded-lg shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print summary
          </button>
          <button
            onClick={() => handlePrint(containerRef)}
            disabled={!m}
            title="Everything on the page, including the full staff table"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-sky-700 text-white rounded-lg shadow-sm hover:bg-sky-800 disabled:opacity-50 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print / PDF (full)
          </button>
        </div>
      </div>

      {seriesError && (
        <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <p className="font-medium">Could not load the overview.</p>
            <p className="text-xs text-red-700 mt-0.5">{seriesError}</p>
          </div>
          <button onClick={() => loadSeries()} className="ml-auto text-sm font-medium text-red-700 hover:text-red-900">Retry</button>
        </div>
      )}

      {!series && !seriesError && (
        <div className="bg-white rounded-xl border border-slate-200 p-10 flex flex-col items-center text-center gap-3">
          <Loader2 className="w-6 h-6 text-sky-700 animate-spin" />
          <p className="text-sm text-slate-700 font-medium">Loading figures…</p>
        </div>
      )}

      {series && !m && !seriesError && (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <p className="text-sm text-slate-700 font-medium">No totals saved for {monthFull(month)} yet.</p>
          <p className="text-xs text-slate-500 mt-1">They are calculated every night after the sync. Press Recalculate to calculate them now.</p>
        </div>
      )}

      {series && m && (
        <div className="print-report owner-print space-y-6">
          <div className="hidden print:block">
            <h1 className="text-xl font-semibold">Studio Overview — {monthFull(month)}</h1>
            <p className="text-sm text-slate-500">Location: {locationLabel}. Generated {today}. Data as of {formatDataAsOf(series.computedAt)}.</p>
          </div>

          <div className={`rounded-xl border p-5 print:p-3 ${incomplete ? 'bg-amber-50/60 border-amber-200' : 'bg-white border-slate-200 shadow-sm'}`}>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h3 className="text-base font-semibold text-slate-900">{monthFull(month)} · {locationLabel}</h3>
              {incomplete && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">month in progress</span>}
            </div>
            <div className="space-y-1.5 print:space-y-0.5 text-sm text-slate-700 leading-relaxed">
              {summary.map(s => <p key={s}>{s}</p>)}
            </div>
          </div>

          <OwnerOverviewCards cards={cards} prevMonth={prevMonth} lastYearMonth={lastYearMonth} incomplete={incomplete} onOpen={onOpenReport} />
          <div className={`summary-hide ${moneyOpen ? '' : 'hidden print:block'}`}><OwnerMoneyBreakdown metrics={m} title={`${monthFull(month)} · ${locationLabel}`} onClose={() => setMoneyOpen(false)} /></div>

          <OwnerOverviewCharts series={series} month={month} location={location} currentMonth={currentMonth} />

          {detailError ? (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">Staff load could not be calculated: {detailError}</div>
          ) : !detail ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Calculating staff load…
            </div>
          ) : (
            <>
              <OwnerStaffLoad rows={detail.staff} lastYearMonth={lastYearMonth} monthVisits={m.visits} hasSchedule={detail.hasSchedule} />
              <OwnerHeatmap cells={detail.heat} daysCounted={detail.daysCounted} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
