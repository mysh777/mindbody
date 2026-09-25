import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  Download,
  Activity,
  CheckCircle2,
  XCircle,
  MinusCircle,
  AlertTriangle,
  RefreshCw,
  Info,
  Sparkles,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import * as XLSX from 'xlsx';
import { getSessionTypeMedianPrices } from '../utils/sessionTypeMedianPrice';
import type { MedianEntry } from '../utils/sessionTypeMedianPrice';
import { toLocalISO } from '../utils/datePresets';

type PeriodPreset = '3m' | '6m' | '12m' | 'custom';

interface MonthRow {
  month: string;
  total: number;
  fullChain: number;
  fullChainPct: number;
  dropIn: number;
  dropInPct: number;
  unresolvable: number;
  unresolvablePct: number;
}

interface UnresolvableBreakdown {
  zeroServicesClients: number;
  partialGapClients: number;
  zeroServicesVisits: number;
  partialGapVisits: number;
}

interface EstimateCoverage {
  estimatedVisits: number;
  remainingNoData: number;
  insufficientTypes: { session_type_id: string; name: string; visits: number; sampleSize: number }[];
}

interface Summary {
  total: number;
  fullChain: number;
  dropIn: number;
  unresolvable: number;
}

function formatMonth(m: string) {
  const [y, mo] = m.split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[parseInt(mo, 10) - 1]} ${y}`;
}

function pct(n: number, d: number) {
  if (d === 0) return 0;
  return Math.round((n / d) * 1000) / 10;
}

function getDateRange(preset: PeriodPreset, customStart: string, customEnd: string): { start: string; end: string } {
  if (preset === 'custom') {
    return { start: customStart, end: customEnd };
  }
  const months = preset === '3m' ? 3 : preset === '6m' ? 6 : 12;
  const now = new Date();
  const end = toLocalISO(now);
  const startDate = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const start = toLocalISO(startDate);
  return { start, end };
}

export function DataLinkageHealthTab() {
  const [preset, setPreset] = useState<PeriodPreset>('3m');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [monthlyData, setMonthlyData] = useState<MonthRow[]>([]);
  const [unresolvableBreakdown, setUnresolvableBreakdown] = useState<UnresolvableBreakdown>({
    zeroServicesClients: 0, partialGapClients: 0, zeroServicesVisits: 0, partialGapVisits: 0,
  });
  const [estimateCoverage, setEstimateCoverage] = useState<EstimateCoverage>({
    estimatedVisits: 0, remainingNoData: 0, insufficientTypes: [],
  });

  const summary = useMemo<Summary>(() => {
    const s: Summary = { total: 0, fullChain: 0, dropIn: 0, unresolvable: 0 };
    for (const row of monthlyData) {
      s.total += row.total;
      s.fullChain += row.fullChain;
      s.dropIn += row.dropIn;
      s.unresolvable += row.unresolvable;
    }
    return s;
  }, [monthlyData]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange(preset, customStart, customEnd);
      const pageSize = 1000;

      let allAppts: { client_service_id: string | null; start_datetime: string; client_id: string | null; session_type_id: string | null }[] = [];
      let offset = 0;
      while (true) {
        const { data: batch } = await supabase
          .from('appointments')
          .select('client_service_id, start_datetime, client_id, session_type_id')
          .gte('start_datetime', start)
          .lte('start_datetime', end)
          .range(offset, offset + pageSize - 1);
        if (!batch || batch.length === 0) break;
        allAppts = allAppts.concat(batch);
        if (batch.length < pageSize) break;
        offset += pageSize;
      }

      const csIds = new Set<string>();
      for (const a of allAppts) {
        if (a.client_service_id) csIds.add(a.client_service_id);
      }

      const csIdArr = [...csIds];
      const csMap = new Map<string, { exists: boolean; hasPricing: boolean; pricingOptionId: string | null }>();

      for (let i = 0; i < csIdArr.length; i += pageSize) {
        const chunk = csIdArr.slice(i, i + pageSize);
        const { data: csRows } = await supabase
          .from('client_services')
          .select('mindbody_id, pricing_option_id')
          .in('mindbody_id', chunk);
        if (csRows) {
          for (const r of csRows) {
            csMap.set(r.mindbody_id, { exists: true, hasPricing: !!r.pricing_option_id, pricingOptionId: r.pricing_option_id });
          }
        }
      }

      // Load pricing options for resolved visits to compute per-visit effective price
      const pricingOptionIds = new Set<string>();
      for (const cs of csMap.values()) {
        if (cs.pricingOptionId) pricingOptionIds.add(cs.pricingOptionId);
      }
      const poIdArr = [...pricingOptionIds];
      const poMap = new Map<string, { price: number; sessionCount: number }>();
      for (let i = 0; i < poIdArr.length; i += pageSize) {
        const chunk = poIdArr.slice(i, i + pageSize);
        const { data: poRows } = await supabase
          .from('pricing_options')
          .select('id, price, session_count')
          .in('id', chunk);
        if (poRows) {
          for (const po of poRows) {
            poMap.set(po.id, { price: Number(po.price) || 0, sessionCount: po.session_count || 1 });
          }
        }
      }

      // Load session type names
      const { data: stData } = await supabase.from('session_types').select('id, name, mindbody_id');
      const stNameByMbId = new Map<string, string>();
      if (stData) {
        for (const st of stData) {
          if (st.mindbody_id) stNameByMbId.set(st.mindbody_id, st.name);
        }
      }

      type Category = 'fullChain' | 'dropIn' | 'unresolvable';
      interface ClassifiedAppt {
        category: Category;
        month: string;
        client_id: string | null;
        client_service_id: string | null;
        session_type_id: string | null;
        effectivePrice: number | null;
      }

      const classified: ClassifiedAppt[] = allAppts.map(a => {
        const month = a.start_datetime.slice(0, 7);
        if (!a.client_service_id) {
          return { category: 'dropIn' as Category, month, client_id: a.client_id, client_service_id: null, session_type_id: a.session_type_id, effectivePrice: null };
        }
        const cs = csMap.get(a.client_service_id);
        if (cs?.exists && cs.hasPricing && cs.pricingOptionId) {
          const po = poMap.get(cs.pricingOptionId);
          const price = po ? (po.sessionCount > 0 ? po.price / po.sessionCount : po.price) : null;
          return { category: 'fullChain' as Category, month, client_id: a.client_id, client_service_id: a.client_service_id, session_type_id: a.session_type_id, effectivePrice: price };
        }
        return { category: 'unresolvable' as Category, month, client_id: a.client_id, client_service_id: a.client_service_id, session_type_id: a.session_type_id, effectivePrice: null };
      });

      // Compute session_type median map from resolved visits
      const resolvedForMedian = classified
        .filter(c => c.category === 'fullChain' && c.session_type_id && c.effectivePrice !== null)
        .map(c => ({ session_type_id: c.session_type_id!, effective_price: c.effectivePrice! }));

      const stMedianMap = getSessionTypeMedianPrices(resolvedForMedian);

      // Monthly breakdown (unchanged)
      const monthMap = new Map<string, { total: number; fullChain: number; dropIn: number; unresolvable: number }>();
      for (const c of classified) {
        let m = monthMap.get(c.month);
        if (!m) { m = { total: 0, fullChain: 0, dropIn: 0, unresolvable: 0 }; monthMap.set(c.month, m); }
        m.total++;
        m[c.category]++;
      }

      const months = [...monthMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, d]) => ({
          month, total: d.total,
          fullChain: d.fullChain, fullChainPct: pct(d.fullChain, d.total),
          dropIn: d.dropIn, dropInPct: pct(d.dropIn, d.total),
          unresolvable: d.unresolvable, unresolvablePct: pct(d.unresolvable, d.total),
        }));
      setMonthlyData(months);

      // Unresolvable breakdown
      const unresolvableAppts = classified.filter(c => c.category === 'unresolvable');
      const unresolvableClientIds = new Set(unresolvableAppts.map(a => a.client_id).filter(Boolean) as string[]);
      const clientIdArr = [...unresolvableClientIds];
      const clientsWithAnyServices = new Set<string>();

      for (let i = 0; i < clientIdArr.length; i += pageSize) {
        const chunk = clientIdArr.slice(i, i + pageSize);
        const { data: csRows } = await supabase
          .from('client_services')
          .select('client_id')
          .in('client_id', chunk);
        if (csRows) {
          for (const r of csRows) {
            if (r.client_id) clientsWithAnyServices.add(r.client_id);
          }
        }
      }

      const zeroSet = new Set<string>();
      const partialSet = new Set<string>();
      for (const cid of unresolvableClientIds) {
        if (clientsWithAnyServices.has(cid)) partialSet.add(cid);
        else zeroSet.add(cid);
      }

      const zeroVisits = unresolvableAppts.filter(a => a.client_id && zeroSet.has(a.client_id)).length;
      const partialVisits = unresolvableAppts.filter(a => a.client_id && partialSet.has(a.client_id)).length;
      const unknownVisits = unresolvableAppts.length - zeroVisits - partialVisits;

      setUnresolvableBreakdown({
        zeroServicesClients: zeroSet.size, partialGapClients: partialSet.size,
        zeroServicesVisits: zeroVisits + unknownVisits, partialGapVisits: partialVisits,
      });

      // Estimate coverage: how many unresolvable visits COULD get an estimate
      let estimatedVisits = 0;
      let remainingNoData = 0;
      const insufficientMap = new Map<string, number>();

      for (const a of unresolvableAppts) {
        if (a.session_type_id) {
          const entry = stMedianMap.get(a.session_type_id);
          if (entry?.sufficient) {
            estimatedVisits++;
          } else {
            remainingNoData++;
            insufficientMap.set(a.session_type_id, (insufficientMap.get(a.session_type_id) || 0) + 1);
          }
        } else {
          remainingNoData++;
        }
      }

      const insufficientTypes = [...insufficientMap.entries()]
        .map(([stId, visits]) => ({
          session_type_id: stId,
          name: stNameByMbId.get(stId) || stId,
          visits,
          sampleSize: stMedianMap.get(stId)?.sampleSize || 0,
        }))
        .sort((a, b) => b.visits - a.visits);

      setEstimateCoverage({ estimatedVisits, remainingNoData, insufficientTypes });

    } catch (err) {
      console.error('DataLinkageHealth load error:', err);
    } finally {
      setLoading(false);
    }
  }, [preset, customStart, customEnd]);

  useEffect(() => {
    if (preset !== 'custom' || (customStart && customEnd)) {
      loadData();
    }
  }, [loadData, preset, customStart, customEnd]);

  const handleExport = () => {
    const summarySheet = [
      { Metric: 'Total Visits', Value: summary.total, Percent: '100%' },
      { Metric: 'Full Chain (visit -> service -> pricing)', Value: summary.fullChain, Percent: `${pct(summary.fullChain, summary.total)}%` },
      { Metric: 'Drop-in (no service linked)', Value: summary.dropIn, Percent: `${pct(summary.dropIn, summary.total)}%` },
      { Metric: 'Permanently Unresolvable', Value: summary.unresolvable, Percent: `${pct(summary.unresolvable, summary.total)}%` },
      {},
      { Metric: 'Unresolvable Breakdown', Value: '', Percent: '' },
      { Metric: 'Clients with zero services in API', Value: unresolvableBreakdown.zeroServicesClients, Percent: `${unresolvableBreakdown.zeroServicesVisits} visits` },
      { Metric: 'Clients with partial gaps', Value: unresolvableBreakdown.partialGapClients, Percent: `${unresolvableBreakdown.partialGapVisits} visits` },
      {},
      { Metric: 'Session-Type Estimate Coverage', Value: '', Percent: '' },
      { Metric: 'Unresolvable visits that received an estimate', Value: estimateCoverage.estimatedVisits, Percent: `${pct(estimateCoverage.estimatedVisits, summary.unresolvable)}%` },
      { Metric: 'Still no data (insufficient sample)', Value: estimateCoverage.remainingNoData, Percent: `${pct(estimateCoverage.remainingNoData, summary.unresolvable)}%` },
      { Metric: 'Total coverage with estimates', Value: summary.fullChain + estimateCoverage.estimatedVisits, Percent: `${pct(summary.fullChain + estimateCoverage.estimatedVisits, summary.total)}%` },
    ];

    const monthlySheet = monthlyData.map(r => ({
      Month: formatMonth(r.month), 'Total Visits': r.total,
      'Full Chain': r.fullChain, 'Full Chain %': `${r.fullChainPct}%`,
      'Drop-in': r.dropIn, 'Drop-in %': `${r.dropInPct}%`,
      'Unresolvable': r.unresolvable, 'Unresolvable %': `${r.unresolvablePct}%`,
    }));

    const insufficientSheet = estimateCoverage.insufficientTypes.map(t => ({
      'Session Type': t.name,
      'Unresolvable Visits': t.visits,
      'Resolved Sample Size': t.sampleSize,
      'Status': t.sampleSize === 0 ? 'No resolved data' : `Insufficient (need 10+, have ${t.sampleSize})`,
    }));

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(summarySheet);
    ws1['!cols'] = [{ wch: 45 }, { wch: 15 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary');
    const ws2 = XLSX.utils.json_to_sheet(monthlySheet);
    ws2['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Monthly');
    if (insufficientSheet.length > 0) {
      const ws3 = XLSX.utils.json_to_sheet(insufficientSheet);
      ws3['!cols'] = [{ wch: 40 }, { wch: 18 }, { wch: 20 }, { wch: 35 }];
      XLSX.utils.book_append_sheet(wb, ws3, 'Insufficient Types');
    }
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    const dataUri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
    try {
      const link = document.createElement('a');
      link.href = dataUri;
      link.download = `linkage_health_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      window.open(dataUri, '_blank');
    }
  };

  const chartData = useMemo(() =>
    monthlyData.map(r => ({
      name: formatMonth(r.month),
      'Full Chain %': r.fullChainPct,
      'Drop-in %': r.dropInPct,
      'Unresolvable %': r.unresolvablePct,
    })),
  [monthlyData]);

  const presetButtons: { value: PeriodPreset; label: string }[] = [
    { value: '3m', label: '3 months' },
    { value: '6m', label: '6 months' },
    { value: '12m', label: '12 months' },
    { value: 'custom', label: 'Custom' },
  ];

  const totalWithEstimates = summary.fullChain + estimateCoverage.estimatedVisits;

  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-teal-50 rounded-lg">
                <Activity className="w-6 h-6 text-teal-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Visit Linkage Health</h2>
                <p className="text-slate-500 text-sm mt-0.5">Coverage of the visit &rarr; service &rarr; pricing chain</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={loadData} disabled={loading}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button onClick={handleExport} disabled={loading || monthlyData.length === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50">
              <Download className="w-4 h-4" /> Export Excel
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          {presetButtons.map(p => (
            <button key={p.value} onClick={() => setPreset(p.value)}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                preset === p.value ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>{p.label}</button>
          ))}
          {preset === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg" />
              <span className="text-slate-400">&ndash;</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg" />
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center gap-3 text-slate-500">
            <RefreshCw className="w-5 h-5 animate-spin" /> Loading linkage data...
          </div>
        </div>
      ) : (
        <div className="p-6 space-y-6">
          {/* Block 1: Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard icon={<Activity className="w-5 h-5 text-slate-600" />} iconBg="bg-slate-100"
              label="Total Visits" value={summary.total.toLocaleString()} sub="in selected period" />
            <SummaryCard icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />} iconBg="bg-emerald-50"
              label="Full Chain" value={summary.fullChain.toLocaleString()} accent="text-emerald-700"
              sub={`${pct(summary.fullChain, summary.total)}% — margin can be calculated`} />
            <SummaryCard icon={<MinusCircle className="w-5 h-5 text-sky-600" />} iconBg="bg-sky-50"
              label="Drop-in (no service)" value={summary.dropIn.toLocaleString()} accent="text-sky-700"
              sub={`${pct(summary.dropIn, summary.total)}% — legitimate, not an error`} />
            <SummaryCard icon={<XCircle className="w-5 h-5 text-red-500" />} iconBg="bg-red-50"
              label="Permanently Unresolvable" value={summary.unresolvable.toLocaleString()} accent="text-red-600"
              sub={`${pct(summary.unresolvable, summary.total)}% — data unavailable in Mindbody`} />
          </div>

          {/* Block 2: Unresolvable breakdown */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h3 className="font-semibold text-slate-800">Unresolvable Visits Breakdown</h3>
              <span className="text-sm text-slate-400 ml-1">({summary.unresolvable.toLocaleString()} visits)</span>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-red-50 rounded-lg p-5 border border-red-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-red-800">API returns zero services</span>
                    <span className="text-lg font-bold text-red-700">{unresolvableBreakdown.zeroServicesClients}</span>
                  </div>
                  <p className="text-xs text-red-600 mb-3">clients whose services are fully deleted on Mindbody side</p>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 bg-red-200 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500 rounded-full transition-all"
                        style={{ width: `${pct(unresolvableBreakdown.zeroServicesVisits, summary.unresolvable)}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-red-700 whitespace-nowrap">
                      {unresolvableBreakdown.zeroServicesVisits.toLocaleString()} visits
                    </span>
                  </div>
                </div>
                <div className="bg-amber-50 rounded-lg p-5 border border-amber-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-amber-800">Partial gaps</span>
                    <span className="text-lg font-bold text-amber-700">{unresolvableBreakdown.partialGapClients}</span>
                  </div>
                  <p className="text-xs text-amber-600 mb-3">clients with some services visible, but specific ones missing</p>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 bg-amber-200 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full transition-all"
                        style={{ width: `${pct(unresolvableBreakdown.partialGapVisits, summary.unresolvable)}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-amber-700 whitespace-nowrap">
                      {unresolvableBreakdown.partialGapVisits.toLocaleString()} visits
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-5 bg-slate-50 rounded-lg p-4 border border-slate-200 flex gap-3">
                <Info className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-slate-600 leading-relaxed">
                  Mindbody does not retain fully used or expired service packages indefinitely.
                  Once a client's package is exhausted or expires, the API may stop returning it.
                  This is a limitation of the Mindbody platform, not of our sync process.
                </p>
              </div>
            </div>
          </div>

          {/* Block 5: Session-type estimate coverage */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" />
              <h3 className="font-semibold text-slate-800">Session-Type Estimate Coverage</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-violet-50 rounded-lg p-4 border border-violet-100 text-center">
                  <div className="text-2xl font-bold text-violet-700">{estimateCoverage.estimatedVisits.toLocaleString()}</div>
                  <div className="text-xs text-violet-600 mt-1">unresolvable visits received an estimate</div>
                  <div className="text-xs text-violet-500 mt-0.5">{pct(estimateCoverage.estimatedVisits, summary.unresolvable)}% of unresolvable</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 text-center">
                  <div className="text-2xl font-bold text-slate-700">{estimateCoverage.remainingNoData.toLocaleString()}</div>
                  <div className="text-xs text-slate-600 mt-1">still no data (insufficient sample)</div>
                  <div className="text-xs text-slate-500 mt-0.5">{pct(estimateCoverage.remainingNoData, summary.unresolvable)}% of unresolvable</div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-100 text-center">
                  <div className="text-2xl font-bold text-emerald-700">{pct(totalWithEstimates, summary.total)}%</div>
                  <div className="text-xs text-emerald-600 mt-1">total coverage with estimates</div>
                  <div className="text-xs text-emerald-500 mt-0.5">{totalWithEstimates.toLocaleString()} of {summary.total.toLocaleString()} visits</div>
                </div>
              </div>

              {estimateCoverage.insufficientTypes.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Service types without sufficient resolved data for estimation</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-y border-slate-200">
                        <tr>
                          <th className="px-4 py-2 text-left font-semibold text-slate-600">Service Type</th>
                          <th className="px-4 py-2 text-right font-semibold text-slate-600">Unresolvable Visits</th>
                          <th className="px-4 py-2 text-right font-semibold text-slate-600">Resolved Sample</th>
                          <th className="px-4 py-2 text-left font-semibold text-slate-600">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {estimateCoverage.insufficientTypes.map(t => (
                          <tr key={t.session_type_id} className="hover:bg-slate-50">
                            <td className="px-4 py-2 text-slate-800">{t.name}</td>
                            <td className="px-4 py-2 text-right text-slate-700">{t.visits}</td>
                            <td className="px-4 py-2 text-right text-slate-700">{t.sampleSize}</td>
                            <td className="px-4 py-2">
                              {t.sampleSize === 0 ? (
                                <span className="text-xs text-red-600 font-medium">No resolved data</span>
                              ) : (
                                <span className="text-xs text-amber-600 font-medium">Insufficient (need 10+, have {t.sampleSize})</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Block 3: Monthly chart + table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Monthly Trend</h3>
              <p className="text-sm text-slate-500 mt-0.5">After the sync fix, newer months should show improving coverage</p>
            </div>
            {chartData.length > 1 && (
              <div className="px-6 pt-4 pb-2">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} />
                      <YAxis tick={{ fontSize: 12, fill: '#64748B' }} unit="%" domain={[0, 100]} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13 }}
                        formatter={(value: number) => `${value}%`} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Full Chain %" fill="#10B981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Drop-in %" fill="#0EA5E9" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Unresolvable %" fill="#EF4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-y border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold text-slate-600">Month</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Total</th>
                    <th className="px-4 py-3 text-right font-semibold text-emerald-700">Full Chain</th>
                    <th className="px-4 py-3 text-right font-semibold text-emerald-700">%</th>
                    <th className="px-4 py-3 text-right font-semibold text-sky-700">Drop-in</th>
                    <th className="px-4 py-3 text-right font-semibold text-sky-700">%</th>
                    <th className="px-4 py-3 text-right font-semibold text-red-600">Unresolvable</th>
                    <th className="px-4 py-3 text-right font-semibold text-red-600">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthlyData.map(r => (
                    <tr key={r.month} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-slate-800">{formatMonth(r.month)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{r.total.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-emerald-700 font-medium">{r.fullChain.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-emerald-600">{r.fullChainPct}%</td>
                      <td className="px-4 py-3 text-right text-sky-700">{r.dropIn.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-sky-600">{r.dropInPct}%</td>
                      <td className="px-4 py-3 text-right text-red-600">{r.unresolvable.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-red-500">{r.unresolvablePct}%</td>
                    </tr>
                  ))}
                </tbody>
                {monthlyData.length > 0 && (
                  <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold">
                    <tr>
                      <td className="px-6 py-3 text-slate-800">Total</td>
                      <td className="px-4 py-3 text-right text-slate-800">{summary.total.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-emerald-700">{summary.fullChain.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-emerald-600">{pct(summary.fullChain, summary.total)}%</td>
                      <td className="px-4 py-3 text-right text-sky-700">{summary.dropIn.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-sky-600">{pct(summary.dropIn, summary.total)}%</td>
                      <td className="px-4 py-3 text-right text-red-600">{summary.unresolvable.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-red-500">{pct(summary.unresolvable, summary.total)}%</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Block 4: Diagnostic conclusion */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Diagnostic Conclusion</h3>
            </div>
            <div className="p-6">
              <div className="bg-slate-50 rounded-lg p-5 border border-slate-200 space-y-3 text-sm text-slate-700 leading-relaxed">
                <p>
                  With exact data only, <strong>{pct(summary.fullChain, summary.total)}%</strong> of visits have a full pricing chain.
                  With session-type median estimates, coverage rises to <strong>{pct(totalWithEstimates, summary.total)}%</strong> ({totalWithEstimates.toLocaleString()} visits).
                  The remaining <strong>{estimateCoverage.remainingNoData.toLocaleString()}</strong> visits ({pct(estimateCoverage.remainingNoData, summary.total)}%) have
                  insufficient data for any estimate.
                </p>
                <p>
                  Estimated values are marked with a <span className="text-violet-600 font-medium">~</span> prefix and violet color throughout all profitability reports,
                  and are never mixed silently with exact figures.
                </p>
                <p className="text-slate-500 italic">
                  This page is diagnostic only. Estimated values are included in profitability reports
                  as a separate, clearly labeled layer.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, iconBg, label, value, sub, accent }: {
  icon: React.ReactNode; iconBg: string; label: string; value: string; sub: string; accent?: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${iconBg}`}>{icon}</div>
        <span className="text-sm font-medium text-slate-500">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${accent || 'text-slate-900'}`}>{value}</div>
      <p className="text-xs text-slate-500 leading-snug">{sub}</p>
    </div>
  );
}
