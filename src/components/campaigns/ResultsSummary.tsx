import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { formatEur, formatNumber, formatPct } from '../../utils/ownerFormat';
import { STATUS_LABELS, type CampaignResult, type LeadStatus } from '../../utils/campaignResults';
import { formatLead } from './MatchReview';

interface ResultsSummaryProps {
  result: CampaignResult;
  campaignCost: number | null;
}

const STATUS_STYLE: Record<LeadStatus, { bar: string; text: string; hint: string }> = {
  new: { bar: 'bg-emerald-500', text: 'text-emerald-700', hint: 'First visit ever on or after the lead date' },
  existing: { bar: 'bg-sky-500', text: 'text-sky-700', hint: 'Already a client before the lead' },
  booked: { bar: 'bg-cyan-500', text: 'text-cyan-700', hint: 'In Mindbody, no visit yet, has a future booking' },
  noVisits: { bar: 'bg-amber-400', text: 'text-amber-700', hint: 'In Mindbody, no visit after the lead and nothing booked' },
  notFound: { bar: 'bg-rose-400', text: 'text-rose-700', hint: 'No matching client (incl. skipped)' },
};

const share = (a: number, b: number) => (b ? formatPct((a / b) * 100, 0) : '-');

export function ResultsSummary({ result, campaignCost }: ResultsSummaryProps) {
  const t = result.totals;
  const people = result.funnel[1].count;
  const leads = result.funnel[0].count;
  const paying = result.clients.filter(c => c.moneyPaid > 0).length;
  const newClients = result.hasStatus ? result.statusCounts.new : t.newClients;

  return (
    <div className="space-y-5">
      {result.hasStatus && (
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {(Object.keys(STATUS_LABELS) as LeadStatus[]).map(s => (
            <div key={s} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className={`text-sm font-medium ${STATUS_STYLE[s].text}`}>{STATUS_LABELS[s]}</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-slate-900">{result.statusCounts[s]}</span>
                <span className="text-sm text-slate-500">{share(result.statusCounts[s], people)}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                <div className={`h-full ${STATUS_STYLE[s].bar} rounded-full transition-all duration-700`} style={{ width: `${people ? (result.statusCounts[s] / people) * 100 : 0}%` }} />
              </div>
              <div className="text-xs text-slate-500 mt-2 leading-snug">{STATUS_STYLE[s].hint}</div>
            </div>
          ))}
        </section>
      )}
      {result.unresolvedMembers > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          {result.unresolvedMembers} people still need a decision (several possible clients). They are counted as not found until you pick a client on the Members tab.
        </div>
      )}

      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-5">
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-base font-semibold text-slate-900">Campaign funnel</h3>
          <div className="mt-4 space-y-2.5">
            {result.funnel.map((step, i) => {
              const base = result.funnel.slice(0, i).filter(s => !s.branch).pop();
              const prev = base ? base.count : step.count;
              return (
                <div key={step.label} className={step.branch ? 'pl-4 border-l-2 border-cyan-200' : ''}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className={step.branch ? 'text-cyan-800' : 'text-slate-700'}>{step.label}</span>
                    <span className="tabular-nums">
                      <b className="text-slate-900">{formatNumber(step.count)}</b>
                      <span className="text-slate-400 ml-2 inline-block w-24 text-right">{i === 0 ? '' : `${share(step.count, prev)} of ${step.branch ? 'found' : 'prev.'}`}</span>
                    </span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${step.branch ? 'from-cyan-500 to-cyan-400' : 'from-teal-500 to-teal-400'} rounded-full transition-all duration-700`}
                      style={{ width: `${leads ? Math.max((step.count / leads) * 100, step.count ? 1 : 0) : 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-base font-semibold text-slate-900">Campaign cost</h3>
          {campaignCost === null ? (
            <p className="text-sm text-slate-500 mt-3 leading-relaxed">Add the campaign cost with "Edit" at the top to see cost per lead, per new client, per paying client and the return.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 mt-4">
              <Metric label="Campaign cost" value={formatEur(campaignCost)} />
              <Metric label="Cost per lead" value={leads ? formatEur(campaignCost / leads) : '-'} />
              <Metric label="Cost per new client" value={newClients ? formatEur(campaignCost / newClients) : '-'} sub={`${newClients} new`} />
              <Metric label="Cost per paying client" value={paying ? formatEur(campaignCost / paying) : '-'} sub={`${paying} paying`} />
              <div className="col-span-2 rounded-lg bg-teal-50 border border-teal-200 px-4 py-3">
                <div className="text-xs font-medium text-teal-800">Return = money paid by new clients / cost</div>
                <div className="text-2xl font-bold text-teal-900 mt-0.5">{campaignCost ? `${(t.moneyPaidByNewLeads / campaignCost).toFixed(2)}x` : '-'}</div>
                <div className="text-xs text-teal-700">{formatEur(t.moneyPaidByNewLeads)} paid by new clients</div>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-base font-semibold text-slate-900">Totals for the list</h3>
        <div className="grid sm:grid-cols-3 gap-3 mt-4">
          <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4">
            <div className="text-sm font-medium text-teal-800">Money paid</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{formatEur(t.moneyPaid)}</div>
            <div className="text-xs text-slate-600 mt-2 space-y-0.5">
              <Row label="Services and products" value={formatEur(t.moneyServicesProducts)} />
              <Row label="Gift cards" value={formatEur(t.moneyGiftCards)} />
              <Row label="Account top-ups" value={formatEur(t.moneyDeposits)} />
            </div>
          </div>
          <Metric label="Sales by service" value={formatEur(t.salesByService)} sub="Same rule as Sales by service" large />
          <Metric label="Revenue earned" value={formatEur(t.revenueEarned)} sub="From visits, same rule as Margin by Staff" large />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mt-3">
          <Metric label="Visits" value={formatNumber(t.visits)} sub={`${formatNumber(t.procedures)} procedures`} />
          <Metric label="Clients with visits" value={formatNumber(t.clientsWithVisits)} />
          <Metric label="New clients" value={formatNumber(t.newClients)} sub="First paid visit in period" />
          <Metric label="Returned (2+ visits)" value={formatNumber(t.returned)} />
          <Metric label="Active package now" value={formatNumber(t.withActivePackage)} sub="clients" />
          <Metric label="Obligations now" value={formatEur(t.obligations)} />
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-base font-semibold text-slate-900">Per client average</h3>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <thead className="text-slate-500">
              <tr><th className="text-left font-medium py-2" /><th className="text-right font-medium py-2 px-3">Clients with visits</th>
                <th className="text-right font-medium py-2 px-3">Money paid per client</th><th className="text-right font-medium py-2 px-3">Visits per client</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="font-semibold text-slate-900">
                <td className="py-2">This list</td>
                <td className="text-right px-3 tabular-nums">{formatNumber(t.clientsWithVisits)}</td>
                <td className="text-right px-3 tabular-nums">{formatEur(t.moneyPerClient)}</td>
                <td className="text-right px-3 tabular-nums">{t.visitsPerClient.toFixed(1)}</td>
              </tr>
              {result.comparison && (
                <tr className="text-slate-600">
                  <td className="py-2">All clients with visits, {formatLead(result.comparison.range.start)} - {formatLead(result.comparison.range.end)}</td>
                  <td className="text-right px-3 tabular-nums">{formatNumber(result.comparison.clientsWithVisits)}</td>
                  <td className="text-right px-3 tabular-nums">{formatEur(result.comparison.moneyPerClient)}</td>
                  <td className="text-right px-3 tabular-nums">{result.comparison.visitsPerClient.toFixed(1)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <SalesByService rows={result.salesByTariff} />
    </div>
  );
}

function SalesByService({ rows }: { rows: CampaignResult['salesByTariff'] }) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5">
      <h3 className="text-base font-semibold text-slate-900">Sales by service</h3>
      <div className="mt-3 divide-y divide-slate-100">
        {rows.map((r, i) => (
          <div key={r.tariff} className={`${i >= 5 && !open ? 'hidden print:flex' : 'flex'} items-center justify-between py-2 text-sm gap-4`}>
            <span className="text-slate-700 truncate">{r.tariff}</span>
            <span className="tabular-nums whitespace-nowrap"><span className="text-slate-400 mr-3">{r.qty}x</span><b className="text-slate-900">{formatEur(r.revenue)}</b></span>
          </div>
        ))}
      </div>
      {rows.length > 5 && (
        <button onClick={() => setOpen(o => !o)} className="mt-2 text-sm text-teal-700 hover:text-teal-900 flex items-center gap-1 print:hidden">
          {open ? 'Show less' : `Show all ${rows.length}`}<ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}
    </section>
  );
}

function Metric({ label, value, sub, large }: { label: string; value: string; sub?: string; large?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="text-sm text-slate-600">{label}</div>
      <div className={`${large ? 'text-2xl' : 'text-xl'} font-bold text-slate-900 mt-1 tabular-nums`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-2"><span>{label}</span><span className="tabular-nums">{value}</span></div>;
}
