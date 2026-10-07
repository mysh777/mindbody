import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Users, RefreshCw, Settings, Save, ArrowRight, Info, Printer, FileSpreadsheet } from 'lucide-react';
import { CopyLinkButton } from './CopyLinkButton';
import { LocationFilter } from './LocationFilter';
import { SegmentClientList, type ListEntry } from './SegmentClientList';
import {
  loadSegmentData, loadSegmentSettings, saveSegmentSettings, computeSegments,
  DEFAULT_SEGMENT_SETTINGS, type SegmentData, type SegmentSettings, type SettingsSource,
} from '../utils/clientSegments';
import { PagePurpose } from './PageHeader';
import { ClientSegmentsPrint, exportAllSegments, SEGMENTS, monthLabel, pct } from './ClientSegmentsReport';
import { handlePrint } from '../utils/printReport';

interface ClientSegmentsProps {
  onViewClient?: (clientId: string) => void;
  urlParams?: Record<string, string>;
  onParamsChange?: (params: Record<string, string>) => void;
}

const STAGES = {
  new: { label: 'New', scenario: null },
  returned: { label: 'Returned', scenario: null },
  regular: { label: 'Regular', scenario: null },
  notReturned: { label: 'New → not returned', scenario: 'second visit' },
} as const;
type StageKey = keyof typeof STAGES;

const SETTING_FIELDS: { key: Exclude<keyof SegmentSettings, 'loyalIfActivePackage' | 'excludedClientIds'>; label: string }[] = [
  { key: 'periodMonths', label: 'Period, months' },
  { key: 'loyalMinActiveMonths', label: 'Loyal: min active months' },
  { key: 'oneoffMaxVisits', label: 'One-off: max visits' },
  { key: 'oneoffMinDaysSinceLast', label: 'One-off: min days since last visit' },
  { key: 'secondVisitWindowDays', label: 'Returned: 2nd visit within, days' },
  { key: 'regularWindowDays', label: 'Regular: window, days' },
  { key: 'regularMinVisits', label: 'Regular: min visits in window' },
];

function previousMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function ClientSegments({ onViewClient, urlParams, onParamsChange }: ClientSegmentsProps) {
  const [endMonth, setEndMonth] = useState(urlParams?.end && /^\d{4}-\d{2}$/.test(urlParams.end) ? urlParams.end : previousMonth());
  const [location, setLocation] = useState(urlParams?.loc || 'all');
  const [list, setList] = useState(urlParams?.list || '');
  const [data, setData] = useState<SegmentData | null>(null);
  const [settings, setSettings] = useState<SegmentSettings>(DEFAULT_SEGMENT_SETTINGS);
  const [draft, setDraft] = useState<SegmentSettings>(DEFAULT_SEGMENT_SETTINGS);
  const [settingsSource, setSettingsSource] = useState<SettingsSource | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const autoRefreshRef = useRef(!!urlParams?.end);
  const containerRef = useRef<HTMLDivElement>(null);
  const [locationName, setLocationName] = useState('');

  const params = useMemo(() => ({ end: endMonth, loc: location, ...(list ? { list } : {}) }), [endMonth, location, list]);

  const updateParams = (next: { end?: string; loc?: string; list?: string }) => {
    const merged = { end: endMonth, loc: location, list, ...next };
    if (next.end !== undefined) setEndMonth(next.end);
    if (next.loc !== undefined) setLocation(next.loc);
    if (next.list !== undefined) setList(next.list);
    onParamsChange?.({ end: merged.end, loc: merged.loc, ...(merged.list ? { list: merged.list } : {}) });
  };

  const readSettings = useCallback(async () => {
    setSettingsError(null);
    try {
      const s = await loadSegmentSettings();
      setSettings(s.settings);
      setDraft(s.settings);
      setSettingsSource(s.source);
      return true;
    } catch (err) {
      setSettingsSource(null);
      setSettingsError(err instanceof Error ? err.message : 'Could not read segment settings');
      return false;
    }
  }, []);

  useEffect(() => {
    readSettings();
  }, [readSettings]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [loaded] = await Promise.all([loadSegmentData(), readSettings()]);
      setData(loaded);
      setLoadedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [readSettings]);

  useEffect(() => {
    if (autoRefreshRef.current) {
      autoRefreshRef.current = false;
      refresh();
    }
  }, [refresh]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      await saveSegmentSettings(draft);
      setSettings(draft);
      setSettingsSource('saved');
      setSaveMessage('Saved');
    } catch (err) {
      setSaveMessage(err instanceof Error ? `Not saved: ${err.message}` : 'Not saved');
    } finally {
      setSaving(false);
    }
  };

  const settingsReady = settingsSource !== null;
  const usingDefaults = settingsSource === 'noTable' || settingsSource === 'noRow';
  const result = useMemo(
    () => (data && settingsReady ? computeSegments(data, settings, endMonth, location) : null),
    [data, settingsReady, settings, endMonth, location],
  );

  const activeList = useMemo(() => {
    if (!result || !data || !list) return null;
    const segment = SEGMENTS.find(s => s.key === list);
    if (segment) {
      return {
        title: `${segment.label} · ${monthLabel(result.months[0])} – ${monthLabel(result.months[result.months.length - 1])}`,
        scenario: segment.scenario,
        entries: result.segments[segment.key] as ListEntry[],
      };
    }
    const [stage, month] = list.split(':') as [StageKey, string | undefined];
    if (!STAGES[stage]) return null;
    const cohorts = result.cohorts.filter(c => !month || month === 'all' || c.month === month);
    const ids = cohorts.flatMap(c => {
      if (stage === 'new') return c.newIds;
      if (stage === 'returned') return c.returnedIds;
      if (stage === 'regular') return c.regularIds;
      const returned = new Set(c.returnedIds);
      return c.newIds.filter(id => !returned.has(id));
    });
    const entries: ListEntry[] = ids.map(id => {
      const visits = data.visitsByClient.get(id) ?? [];
      return { clientId: id, visitsInPeriod: new Set(visits.map(v => v.date)).size, lastVisit: visits.length ? visits[visits.length - 1].date : null };
    });
    return {
      title: `${STAGES[stage].label} · ${month && month !== 'all' ? monthLabel(month) : 'all cohorts'}`,
      scenario: STAGES[stage].scenario,
      entries,
    };
  }, [result, data, list]);

  const totals = useMemo(() => {
    if (!result) return null;
    return result.cohorts.reduce((t, c) => ({ newCount: t.newCount + c.newCount, returned: t.returned + c.returned, regular: t.regular + c.regular }), { newCount: 0, returned: 0, regular: 0 });
  }, [result]);

  const locationLabel = location === 'all' ? 'All locations' : locationName || `Location ${location}`;

  const openList = (key: string) => updateParams({ list: list === key ? '' : key });

  return (
    <div className="w-full bg-slate-50 min-h-full" ref={containerRef}>
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Users className="w-6 h-6 text-teal-600" />
          Client Segments
        </h2>
        <PagePurpose section="client-segments" />
      </div>

      <div className="p-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                Period ends
                <input
                  type="month"
                  value={endMonth}
                  onChange={e => e.target.value && updateParams({ end: e.target.value })}
                  className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </label>
              <LocationFilter value={location} onChange={(id, name) => { setLocationName(name); updateParams({ loc: id }); }} />
              {result && (
                <span className="text-sm text-slate-500">
                  {monthLabel(result.months[0])} – {monthLabel(result.months[result.months.length - 1])} · {settings.periodMonths} months
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <CopyLinkButton section="client-segments" params={params} />
              {result && data && !loading && (
                <>
                  <button
                    onClick={() => exportAllSegments({ result, data, settings, locationLabel })}
                    className="px-4 py-2 bg-white text-emerald-700 border border-emerald-600 rounded-lg text-sm font-medium hover:bg-emerald-50 transition-colors flex items-center gap-2"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Excel (all)
                  </button>
                  <button
                    onClick={() => handlePrint(containerRef)}
                    className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    Print / PDF
                  </button>
                </>
              )}
              <button
                onClick={() => setShowSettings(s => !s)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${showSettings ? 'bg-teal-50 text-teal-700 border border-teal-300' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'}`}
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>
              <button
                onClick={refresh}
                disabled={loading}
                className="px-5 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Refresh
              </button>
              {loadedAt && !loading && <span className="text-xs text-slate-400">Loaded at {loadedAt}</span>}
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0" />
            Clients who visit both studios are counted in each, so Center + Alfa can be more than All
          </p>
        </div>

        {showSettings && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Segment settings</h3>
              <div className="flex items-center gap-3">
                {saveMessage && <span className={`text-xs ${saveMessage === 'Saved' ? 'text-emerald-600' : 'text-rose-600'}`}>{saveMessage}</span>}
                <button
                  onClick={handleSave}
                  disabled={saving || !settingsReady || settingsSource === 'noTable'}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </button>
              </div>
            </div>
            {settingsSource === 'noTable' && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                Settings storage is not set up yet. Changes apply until the page is reloaded.
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {SETTING_FIELDS.map(f => (
                <label key={f.key} className="flex flex-col gap-1 text-xs text-slate-600">
                  {f.label}
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={draft[f.key]}
                    onChange={e => setDraft(d => ({ ...d, [f.key]: Math.max(1, parseInt(e.target.value) || 1) }))}
                    className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm"
                  />
                </label>
              ))}
              <label className="flex items-center gap-2 text-xs text-slate-600 self-end pb-2">
                <input
                  type="checkbox"
                  checked={draft.loyalIfActivePackage}
                  onChange={e => setDraft(d => ({ ...d, loyalIfActivePackage: e.target.checked }))}
                  className="rounded border-slate-300 text-teal-600"
                />
                Active package makes a client Loyal
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600 sm:col-span-2 lg:col-span-4">
                Excluded shared cards (client IDs, comma separated)
                <input
                  key={settings.excludedClientIds.join(',')}
                  type="text"
                  defaultValue={draft.excludedClientIds.join(', ')}
                  onChange={e => {
                    const ids = [...new Set(e.target.value.split(/[\s,;]+/).filter(Boolean))];
                    setDraft(d => ({ ...d, excludedClientIds: ids }));
                  }}
                  placeholder="e.g. 100001729"
                  className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-mono"
                />
                <span className="text-slate-400">Shared or service cards used by many different people. They are left out of segments and the new-client funnel.</span>
              </label>
            </div>
            <button
              onClick={() => setSettings(draft)}
              className="mt-4 text-xs font-medium text-teal-700 hover:text-teal-800"
            >
              Apply without saving
            </button>
          </div>
        )}

        {settingsError && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700 flex items-center justify-between gap-4">
            <span>{settingsError}. Segments are not calculated until the settings can be read.</span>
            <button onClick={readSettings} className="shrink-0 text-xs font-medium text-rose-700 underline hover:text-rose-800">Try again</button>
          </div>
        )}

        {usingDefaults && (
          <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 flex items-center gap-2">
            <Info className="w-4 h-4 shrink-0" />
            Using default settings{settingsSource === 'noRow' ? ' (nothing saved yet)' : ' (settings storage is not set up)'}
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">Could not load data: {error}</div>
        )}

        {!result && !loading && !error && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-600 mb-2">Click Refresh to load</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">Splits every client with a paid visit in the period into one segment and tracks how new clients come back.</p>
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <div className="w-8 h-8 border-[3px] border-teal-100 border-t-teal-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-slate-600">Analyzing paid visits...</p>
          </div>
        )}

        {result && data && !loading && totals && (
          <>
            <ClientSegmentsPrint result={result} data={data} settings={settings} locationLabel={locationLabel} />
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-3">
              {SEGMENTS.map(s => {
                const count = result.segments[s.key].length;
                const active = list === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => openList(s.key)}
                    className={`relative overflow-hidden text-left bg-white rounded-xl border shadow-sm p-5 pl-6 transition-all hover:shadow-md hover:-translate-y-0.5 ${active ? 'border-teal-500 ring-2 ring-teal-500/30' : 'border-slate-200'}`}
                  >
                    <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${s.accent}`} />
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{s.label}</div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-slate-900">{count}</span>
                      <span className="text-sm text-slate-500">{pct(count, result.totalClients)}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{s.hint}</div>
                    {s.key === 'oneoff' && (
                      <div className="mt-2 text-xs font-medium text-rose-700">
                        of them new: {result.oneoffNew} ({pct(result.oneoffNew, result.newInPeriod)} of new clients did not return)
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mb-6 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              Total {result.totalClients} clients with paid visits. Free visits excluded: {result.freeVisitsExcluded}. Shared cards excluded: {result.excludedCards}. Cancelled visits that Mindbody no longer returns are ignored.
            </p>

            {activeList && (
              <SegmentClientList
                title={activeList.title}
                scenario={activeList.scenario}
                entries={activeList.entries}
                clients={data.clients}
                exportName={list.replace(':', '_')}
                onClose={() => updateParams({ list: '' })}
                onViewClient={onViewClient}
              />
            )}

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 mb-6">
              <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="text-sm font-semibold text-slate-900">New clients by month</h3>
                <p className="text-xs text-slate-500 mt-1 mb-1">
                  First paid visit ever. Excluded as returning Mindbody clients from before 2025: {result.excludedByMindbodyHistory}
                </p>
                <p className="text-xs text-slate-500 mb-4">
                  Free visit only, no paid visit: <span className="font-medium text-slate-700">{result.freeOnlyInPeriod}</span>
                </p>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={result.cohorts.map(c => ({ month: monthLabel(c.month), New: c.newCount }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={32} />
                      <Tooltip cursor={{ fill: '#f1f5f9' }} />
                      <Bar dataKey="New" fill="#0d9488" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <table className="w-full text-sm mt-4">
                  <tbody className="divide-y divide-slate-100">
                    {result.cohorts.map(c => (
                      <tr key={c.month} className="hover:bg-slate-50 cursor-pointer" onClick={() => openList(`new:${c.month}`)}>
                        <td className="py-1.5 text-slate-600">{monthLabel(c.month)}</td>
                        <td className="py-1.5 text-right font-medium text-slate-900">{c.newCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="xl:col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">New-client funnel</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Returned: 2nd paid visit within {settings.secondVisitWindowDays} days. Regular: {settings.regularMinVisits}+ paid visits within {settings.regularWindowDays} days of the first.
                    </p>
                  </div>
                  <button
                    onClick={() => openList('notReturned:all')}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors"
                  >
                    New → not returned
                  </button>
                </div>
                <div className="flex items-center gap-3 mb-5 text-lg font-semibold text-slate-900 flex-wrap">
                  <button onClick={() => openList('new:all')} className="hover:text-teal-700 transition-colors">{totals.newCount}</button>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                  <button onClick={() => openList('returned:all')} className="hover:text-teal-700 transition-colors">{totals.returned}</button>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                  <button onClick={() => openList('regular:all')} className="hover:text-teal-700 transition-colors">{totals.regular}</button>
                  <span className="text-xs font-normal text-slate-500">new → returned → regular, all cohorts</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-slate-500 uppercase tracking-wide">
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 font-medium">Month</th>
                        <th className="text-right py-2 font-medium">New</th>
                        <th className="text-right py-2 font-medium">Returned (%)</th>
                        <th className="text-right py-2 font-medium">Regular (%)</th>
                        <th className="text-left py-2 pl-4 font-medium">partial?</th>
                        <th className="text-right py-2 font-medium">2nd visit ever</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.cohorts.map(c => (
                        <tr key={c.month} className="hover:bg-slate-50">
                          <td className="py-2 text-slate-700">{monthLabel(c.month)}</td>
                          <td className="py-2 text-right"><button onClick={() => openList(`new:${c.month}`)} className="font-medium text-slate-900 hover:text-teal-700">{c.newCount}</button></td>
                          <td className="py-2 text-right">
                            <button onClick={() => openList(`returned:${c.month}`)} className="text-slate-900 hover:text-teal-700">{c.returned}</button>
                            <span className="text-slate-500 ml-1">({pct(c.returned, c.newCount)})</span>
                          </td>
                          <td className="py-2 text-right">
                            <button onClick={() => openList(`regular:${c.month}`)} className="text-slate-900 hover:text-teal-700">{c.regular}</button>
                            <span className="text-slate-500 ml-1">({pct(c.regular, c.newCount)})</span>
                          </td>
                          <td className="py-2 pl-4 text-xs">
                            {c.returnedPartial || c.regularPartial ? (
                              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 whitespace-nowrap">
                                partial: window not complete ({[c.returnedPartial && 'Returned', c.regularPartial && 'Regular'].filter(Boolean).join(', ')})
                              </span>
                            ) : <span className="text-slate-400">-</span>}
                          </td>
                          <td className="py-2 text-right text-slate-600">{c.returnedEver}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {result.cohorts.map(c => (
                    <button
                      key={c.month}
                      onClick={() => openList(`notReturned:${c.month}`)}
                      title="Show new clients from this month who did not return"
                      className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 text-slate-600 hover:border-rose-300 hover:text-rose-700 transition-colors"
                    >
                      {monthLabel(c.month)}: {c.newCount} → {c.returned} → {c.regular}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
