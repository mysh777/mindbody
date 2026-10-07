import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from 'recharts';
import { formatApptDate } from '../utils/formatDateTime';
import { exportMultiSheetExcel } from '../utils/exportExcel';
import type { SegmentData, SegmentKey, SegmentResult, SegmentSettings } from '../utils/clientSegments';

export const SEGMENTS: { key: SegmentKey; label: string; hint: string; scenario: string | null; accent: string }[] = [
  { key: 'loyal', label: 'Loyal', hint: 'Visits in many months or an active package', scenario: 'exclude from new-client ads', accent: 'bg-emerald-500' },
  { key: 'oneoff', label: 'One-off', hint: 'Few visits, no return, no booking', scenario: 'win back', accent: 'bg-rose-500' },
  { key: 'tooEarly', label: 'Too early', hint: 'Like One-off, but last visit is recent', scenario: null, accent: 'bg-amber-500' },
  { key: 'irregular', label: 'Irregular', hint: 'Everyone else', scenario: null, accent: 'bg-sky-500' },
];

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)} %` : '-');

interface ReportProps {
  result: SegmentResult;
  data: SegmentData;
  settings: SegmentSettings;
  locationLabel: string;
}

function periodLabel(result: SegmentResult) {
  return `${monthLabel(result.months[0])} – ${monthLabel(result.months[result.months.length - 1])}`;
}

function clientRow(data: SegmentData, clientId: string, visits: number, lastVisit: string | null) {
  const c = data.clients.get(clientId);
  return {
    'Client': c ? `${c.firstName} ${c.lastName}`.trim() : `Client ${clientId}`,
    'Phone': c?.phone ?? '',
    'Email': c?.email ?? '',
    'Visits': visits,
    'Last visit': lastVisit ? formatApptDate(lastVisit) : '',
    'Active package': c?.activePackage ?? '',
  };
}

export function exportAllSegments({ result, data, settings, locationLabel }: ReportProps) {
  const summary: Record<string, string | number>[] = [
    { Item: 'Period', Value: periodLabel(result) },
    { Item: 'Location', Value: locationLabel },
    { Item: 'Clients with paid visits', Value: result.totalClients },
    ...SEGMENTS.map(s => ({ Item: s.label, Value: result.segments[s.key].length })),
    { Item: 'New clients in period', Value: result.newInPeriod },
    { Item: 'New clients who did not return (One-off)', Value: result.oneoffNew },
    { Item: 'Free visits excluded', Value: result.freeVisitsExcluded },
    { Item: 'Shared cards excluded', Value: result.excludedCards },
  ];
  const funnel = result.cohorts.map(c => ({
    'Month': monthLabel(c.month),
    'New': c.newCount,
    'Returned': c.returned,
    'Returned %': pct(c.returned, c.newCount),
    'Regular': c.regular,
    'Regular %': pct(c.regular, c.newCount),
    'Window not complete': [c.returnedPartial && 'Returned', c.regularPartial && 'Regular'].filter(Boolean).join(', '),
    '2nd visit ever': c.returnedEver,
  }));
  const segmentSheets = SEGMENTS.map(s => ({
    name: s.label,
    data: result.segments[s.key].map(r => clientRow(data, r.clientId, r.visitsInPeriod, r.lastVisit)),
  }));
  exportMultiSheetExcel(
    [{ name: 'Summary', data: summary }, { name: 'New-client funnel', data: funnel }, ...segmentSheets],
    `client_segments_${result.months[result.months.length - 1]}_${settings.periodMonths}m`,
  );
}

export function ClientSegmentsPrint({ result, data, settings, locationLabel }: ReportProps) {
  const chartData = result.cohorts.map(c => ({ month: monthLabel(c.month), New: c.newCount, Returned: c.returned, Regular: c.regular }));
  return (
    <div className="print-report hidden">
      <h1>Client Segments</h1>
      <div className="pr-sub">
        Period: {periodLabel(result)} ({settings.periodMonths} months)
        {' | '}Location: {locationLabel}
        {' | '}Generated: {new Date().toLocaleDateString('en-GB')}
      </div>

      <h2>Segments</h2>
      <table>
        <thead><tr><th>Segment</th><th>Clients</th><th>Share</th><th>Rule</th></tr></thead>
        <tbody>
          {SEGMENTS.map(s => (
            <tr key={s.key}>
              <td>{s.label}</td>
              <td style={{ textAlign: 'right' }}>{result.segments[s.key].length}</td>
              <td style={{ textAlign: 'right' }}>{pct(result.segments[s.key].length, result.totalClients)}</td>
              <td>{s.hint}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td>Total</td><td style={{ textAlign: 'right' }}>{result.totalClients}</td><td /><td /></tr></tfoot>
      </table>
      <p className="pr-sub">
        Of One-off, new clients: {result.oneoffNew} ({pct(result.oneoffNew, result.newInPeriod)} of new clients did not return).
        Free visits excluded: {result.freeVisitsExcluded}. Shared cards excluded: {result.excludedCards}.
      </p>

      <h2>New clients by month</h2>
      <p className="pr-sub">
        First paid visit ever. Excluded as returning Mindbody clients from before 2025: {result.excludedByMindbodyHistory}.
        Free visit only, no paid visit: {result.freeOnlyInPeriod}.
      </p>
      <BarChart width={960} height={240} data={chartData} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={32} />
        <Bar dataKey="New" fill="#0d9488" isAnimationActive={false}><LabelList dataKey="New" position="top" fontSize={10} /></Bar>
        <Bar dataKey="Returned" fill="#38bdf8" isAnimationActive={false} />
        <Bar dataKey="Regular" fill="#f59e0b" isAnimationActive={false} />
      </BarChart>
      <div className="pr-sub">Teal: new · Blue: returned · Amber: regular</div>

      <h2>New-client funnel</h2>
      <p className="pr-sub">
        Returned: 2nd paid visit within {settings.secondVisitWindowDays} days. Regular: {settings.regularMinVisits}+ paid visits within {settings.regularWindowDays} days of the first.
      </p>
      <table>
        <thead><tr><th>Month</th><th>New</th><th>Returned</th><th>Regular</th><th>Window not complete</th><th>2nd visit ever</th></tr></thead>
        <tbody>
          {result.cohorts.map(c => (
            <tr key={c.month}>
              <td>{monthLabel(c.month)}</td>
              <td style={{ textAlign: 'right' }}>{c.newCount}</td>
              <td style={{ textAlign: 'right' }}>{c.returned} ({pct(c.returned, c.newCount)})</td>
              <td style={{ textAlign: 'right' }}>{c.regular} ({pct(c.regular, c.newCount)})</td>
              <td>{[c.returnedPartial && 'Returned', c.regularPartial && 'Regular'].filter(Boolean).join(', ') || '-'}</td>
              <td style={{ textAlign: 'right' }}>{c.returnedEver}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {SEGMENTS.map(s => {
        const rows = result.segments[s.key];
        return (
          <div key={s.key} className="pr-staff-section">
            <h2>{s.label} ({rows.length} clients)</h2>
            <table className="pr-visit-table">
              <thead><tr><th>Client</th><th>Phone</th><th>Email</th><th>Visits</th><th>Last visit</th><th>Active package</th></tr></thead>
              <tbody>
                {rows.map(r => {
                  const row = clientRow(data, r.clientId, r.visitsInPeriod, r.lastVisit);
                  return (
                    <tr key={r.clientId}>
                      <td>{row.Client}</td>
                      <td>{row.Phone}</td>
                      <td>{row.Email}</td>
                      <td style={{ textAlign: 'right' }}>{row.Visits}</td>
                      <td>{row['Last visit']}</td>
                      <td>{row['Active package']}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
