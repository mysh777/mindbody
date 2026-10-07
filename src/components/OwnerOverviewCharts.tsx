import { useMemo, useState, type ReactNode } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { OVERVIEW_LOCATIONS, seriesKey, type MonthMetrics, type OverviewSeries } from '../utils/ownerOverview';
import { MONTH_SHORT, formatEur, formatNumber, formatPct, monthShort, shiftMonth } from '../utils/ownerFormat';

const PRIMARY = '#0369a1';
const PRIOR = '#cbd5e1';
const TEAL = '#0f766e';
const AMBER = '#d97706';
const EMERALD = '#059669';

type SalesMetric = 'salesByService' | 'moneyReceived' | 'revenueEarned';
const SALES_METRICS: { id: SalesMetric; label: string }[] = [
  { id: 'salesByService', label: 'Sales by service' },
  { id: 'moneyReceived', label: 'Money received' },
  { id: 'revenueEarned', label: 'Revenue earned' },
];

interface ChartsProps {
  series: OverviewSeries;
  month: string;
  location: string;
  currentMonth: string;
}

const euroTick = (v: number) => (Math.abs(v) >= 1000 ? `${formatNumber(v / 1000)}k` : formatNumber(v));
const eurFormatter = (v: unknown) => formatEur(Number(v));
const unfinished = (m: string, current: string) => (m === current ? ' (month in progress)' : '');

function Panel({ title, subtitle, actions, children, wide, printClass = '' }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode; wide?: boolean; printClass?: string }) {
  return (
    <section className={`bg-white rounded-xl border border-slate-200 shadow-sm p-5 print:p-3 break-inside-avoid ${wide ? 'lg:col-span-2 print:col-span-2' : ''} ${printClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4 print:mb-1">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function MetricSwitch({ value, onChange }: { value: SalesMetric; onChange: (m: SalesMetric) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-1 print:hidden">
      {SALES_METRICS.map(m => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${value === m.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function ChangeList({ title, rows, positive }: { title: string; rows: { name: string; delta: number }[]; positive: boolean }) {
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <div>
      <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2 print:mb-0 print:text-[10px] ${positive ? 'text-emerald-700' : 'text-red-700'}`}>
        <Icon className="w-4 h-4" />{title}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No changes</p>
      ) : (
        <ol className="space-y-1.5 print:space-y-0">
          {rows.map(r => (
            <li key={r.name} className="flex items-baseline justify-between gap-3 text-sm print:text-[11px]">
              <span className="text-slate-700 truncate" title={r.name}>{r.name}</span>
              <span className={`tabular-nums font-medium whitespace-nowrap ${positive ? 'text-emerald-600' : 'text-red-600'}`}>
                {r.delta > 0 ? '+' : ''}{formatEur(r.delta)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function topChanges(current: Record<string, number> = {}, previous: Record<string, number> = {}) {
  const names = new Set([...Object.keys(current), ...Object.keys(previous)]);
  const deltas = [...names].map(name => ({ name, delta: (current[name] || 0) - (previous[name] || 0) }));
  return {
    up: deltas.filter(d => d.delta > 0.005).sort((a, b) => b.delta - a.delta).slice(0, 5),
    down: deltas.filter(d => d.delta < -0.005).sort((a, b) => a.delta - b.delta).slice(0, 5),
  };
}

export function OwnerOverviewCharts({ series, month, location, currentMonth }: ChartsProps) {
  const [metric, setMetric] = useState<SalesMetric>('salesByService');
  const metricLabel = SALES_METRICS.find(m => m.id === metric)!.label;
  const year = month.slice(0, 4);
  const priorYear = String(Number(year) - 1);
  const get = (m: string, loc = location): MonthMetrics | undefined => series.metrics[seriesKey(m, loc)];

  const yearData = useMemo(() => MONTH_SHORT.map((label, i) => {
    const mm = String(i + 1).padStart(2, '0');
    const cur = `${year}-${mm}`;
    return {
      label,
      month: cur,
      current: get(cur)?.[metric],
      prior: get(`${priorYear}-${mm}`)?.[metric],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [series, year, priorYear, metric, location]);

  const last12 = useMemo(() => Array.from({ length: 12 }, (_, i) => shiftMonth(month, i - 11)), [month]);

  const rolling = last12.map(m => {
    const x = get(m);
    return {
      month: m,
      label: monthShort(m),
      grossMargin: x?.grossMargin,
      marginPercent: x ? Math.round(x.marginPercent * 10) / 10 : undefined,
      visits: x?.visits,
      newClients: x?.newClients,
      center: get(m, '1')?.[metric],
      alfa: get(m, '3')?.[metric],
    };
  });

  const lastYearMonth = shiftMonth(month, -12);
  const catNow = series.categories[seriesKey(month, location)] || {};
  const catPrev = series.categories[seriesKey(lastYearMonth, location)] || {};
  const categoryData = [...new Set([...Object.keys(catNow), ...Object.keys(catPrev)])]
    .map(name => ({ name, current: catNow[name] || 0, prior: catPrev[name] || 0 }))
    .sort((a, b) => b.current - a.current);

  const categoryChanges = topChanges(catNow, catPrev);
  const tariffChanges = topChanges(series.tariffs[seriesKey(month, location)], series.tariffs[seriesKey(lastYearMonth, location)]);

  const fade = (m: string) => (m === currentMonth ? 0.35 : 1);
  const tooltipLabel = (_: unknown, payload: readonly { payload?: { month?: string; label?: string } }[]) => {
    const p = payload?.[0]?.payload;
    return p?.month ? `${p.label}${unfinished(p.month, currentMonth)}` : '';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 print:grid-cols-3 gap-4 print:gap-2">
      <Panel
        wide
        title={`${metricLabel} by month: ${year} vs ${priorYear}`}
        subtitle={currentMonth.startsWith(year) ? 'Faded bar — month in progress' : undefined}
        actions={<MetricSwitch value={metric} onChange={setMetric} />}
      >
        <div className="h-72 print:h-auto">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={yearData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={euroTick} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={48} />
              <Tooltip formatter={eurFormatter} labelFormatter={(l, p) => {
                const m = (p?.[0]?.payload as { month?: string })?.month;
                return m ? `${l} ${year}${unfinished(m, currentMonth)}` : String(l);
              }} />
              <Legend />
              <Bar dataKey="prior" name={priorYear} fill={PRIOR} radius={[4, 4, 0, 0]} />
              <Bar dataKey="current" name={year} fill={PRIMARY} radius={[4, 4, 0, 0]}>
                {yearData.map(d => <Cell key={d.month} fillOpacity={fade(d.month)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Gross margin, last 12 months" subtitle="Bars — €, line — % of Revenue earned">
        <div className="h-64 print:h-auto">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rolling}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} interval={1} />
              <YAxis yAxisId="eur" tickFormatter={euroTick} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={44} />
              <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                labelFormatter={tooltipLabel}
                formatter={(v, name) => (name === 'Gross margin %' ? formatPct(Number(v)) : formatEur(Number(v)))}
              />
              <Legend />
              <Bar yAxisId="eur" dataKey="grossMargin" name="Gross margin €" fill={TEAL} radius={[4, 4, 0, 0]}>
                {rolling.map(d => <Cell key={d.month} fillOpacity={fade(d.month)} />)}
              </Bar>
              <Line yAxisId="pct" dataKey="marginPercent" name="Gross margin %" stroke={AMBER} strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Visits and new clients" subtitle="Completed visits; new clients as in Client Segments">
        <div className="h-64 print:h-auto">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rolling}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} interval={1} />
              <YAxis yAxisId="v" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={40} />
              <YAxis yAxisId="n" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={32} />
              <Tooltip labelFormatter={tooltipLabel} formatter={v => formatNumber(Number(v))} />
              <Legend />
              <Bar yAxisId="v" dataKey="visits" name="Visits" fill={PRIMARY} radius={[4, 4, 0, 0]}>
                {rolling.map(d => <Cell key={d.month} fillOpacity={fade(d.month)} />)}
              </Bar>
              <Line yAxisId="n" dataKey="newClients" name="New clients" stroke={EMERALD} strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title={`Categories: ${monthShort(month)} vs ${monthShort(lastYearMonth)}`} subtitle="Sales by service by category">
        {categoryData.length === 0 ? (
          <p className="text-sm text-slate-400 py-10 text-center">No sales in these months</p>
        ) : (
          <div className="print:!h-auto" style={{ height: Math.max(220, categoryData.length * 34) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical" barGap={2} margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tickFormatter={euroTick} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: '#334155' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={eurFormatter} />
                <Legend />
                <Bar dataKey="prior" name={monthShort(lastYearMonth)} fill={PRIOR} radius={[0, 4, 4, 0]} />
                <Bar dataKey="current" name={monthShort(month)} fill={PRIMARY} fillOpacity={fade(month)} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel printClass="summary-hide" title={`Center and Alfa, last 12 months: ${metricLabel}`} subtitle="Use the switch above to change the metric">
        <div className="h-64 print:h-auto">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rolling}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} interval={1} />
              <YAxis tickFormatter={euroTick} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={44} />
              <Tooltip labelFormatter={tooltipLabel} formatter={eurFormatter} />
              <Legend />
              <Line dataKey="center" name={OVERVIEW_LOCATIONS[1].label} stroke={PRIMARY} strokeWidth={2} dot={{ r: 3 }} />
              <Line dataKey="alfa" name={OVERVIEW_LOCATIONS[2].label} stroke={TEAL} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel wide printClass="print:!col-span-1" title={`What grew and what fell: ${monthShort(month)} vs ${monthShort(lastYearMonth)}`} subtitle="Change in Sales by service, top 5">
        <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-1 gap-6 print:gap-2">
          <div className="space-y-5 print:space-y-1">
            <h4 className="text-sm font-semibold text-slate-800">Categories</h4>
            <ChangeList title="Growth" rows={categoryChanges.up} positive />
            <ChangeList title="Decline" rows={categoryChanges.down} positive={false} />
          </div>
          <div className="space-y-5 print:space-y-1">
            <h4 className="text-sm font-semibold text-slate-800">Pricing options</h4>
            <ChangeList title="Growth" rows={tariffChanges.up} positive />
            <ChangeList title="Decline" rows={tariffChanges.down} positive={false} />
          </div>
        </div>
      </Panel>
    </div>
  );
}
