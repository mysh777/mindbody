import { fetchByIds } from '../lib/fetchByIds';
import type { DateRange } from './salesFilters';
import { computeMarginVisitsByMonth, computeMoneyReceived, computeMoneyReceivedBySale, type PricedVisit } from '../hooks/useSalesMarginData';
import { computeSalesByDateData } from '../hooks/useSalesByDateData';
import { loadSegmentData, newClientCheck, type SegmentData } from './clientSegments';
import { loadStudioObligations } from './obligations';
import type { ListMember } from './campaignLists';

export type PeriodMode = 'sinceLead' | 'fixed';
export type LeadStatus = 'new' | 'existing' | 'noVisits' | 'notFound';

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New client',
  existing: 'Existing client',
  noVisits: 'Found, no visits yet',
  notFound: 'Not found',
};

export interface ClientResult {
  clientId: string;
  name: string;
  phone: string;
  leadDate: string | null;
  periodStart: string;
  periodEnd: string;
  status: LeadStatus | null;
  firstVisitEver: string | null;
  newInPeriod: boolean;
  visits: number;
  visitDays: number;
  moneyPaid: number;
  moneyGiftCards: number;
  moneyDeposits: number;
  salesByService: number;
  revenueEarned: number;
  lastVisit: string | null;
  activePackages: number;
  packageVisitsLeft: number;
  obligations: number;
}

export interface FunnelStep {
  label: string;
  count: number;
}

export interface CampaignTotals {
  moneyPaid: number;
  moneyServicesProducts: number;
  moneyGiftCards: number;
  moneyDeposits: number;
  salesByService: number;
  revenueEarned: number;
  visits: number;
  clientsWithVisits: number;
  newClients: number;
  returned: number;
  withActivePackage: number;
  obligations: number;
  moneyPerClient: number;
  visitsPerClient: number;
  moneyPaidByNewLeads: number;
}

export interface Comparison {
  range: DateRange;
  clientsWithVisits: number;
  moneyPerClient: number;
  visitsPerClient: number;
}

export interface CampaignResult {
  clients: ClientResult[];
  statusCounts: Record<LeadStatus, number>;
  hasStatus: boolean;
  funnel: FunnelStep[];
  totals: CampaignTotals;
  salesByTariff: { tariff: string; revenue: number; qty: number }[];
  comparison: Comparison | null;
  overallRange: DateRange;
  unresolvedMembers: number;
}

export interface CampaignQuery {
  members: ListMember[];
  mode: PeriodMode;
  range: DateRange;
  location: string;
  today: string;
  withComparison: boolean;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const inRange = (d: string, start: string, end: string) => d >= start && d <= end;

interface Period { start: string; end: string; leadDate: string | null }

function clientPeriods(members: ListMember[], q: CampaignQuery): Map<string, Period> {
  const leadByClient = new Map<string, string | null>();
  for (const m of members) {
    if (!m.client_id) continue;
    const lead = m.lead_at ? m.lead_at.slice(0, 10) : null;
    const prev = leadByClient.get(m.client_id);
    if (!leadByClient.has(m.client_id) || (lead && (!prev || lead < prev))) leadByClient.set(m.client_id, lead);
  }
  const earliestLead = [...leadByClient.values()].filter((d): d is string => !!d).sort()[0] ?? q.range.start;
  const out = new Map<string, Period>();
  for (const [clientId, lead] of leadByClient) {
    out.set(clientId, q.mode === 'sinceLead'
      ? { start: lead ?? earliestLead, end: q.today, leadDate: lead }
      : { start: q.range.start, end: q.range.end, leadDate: lead });
  }
  return out;
}

function leadStatus(data: SegmentData, clientId: string, lead: string, fad: string | null): LeadStatus {
  const ours = [...(data.visitsByClient.get(clientId) ?? []), ...(data.freeVisitsByClient.get(clientId) ?? [])].map(v => v.date);
  const firstEver = [fad, ...ours].filter((d): d is string => !!d).sort()[0] ?? null;
  if (firstEver && firstEver < lead) return 'existing';
  return ours.some(d => d >= lead) ? 'new' : 'noVisits';
}

export async function computeCampaign(q: CampaignQuery): Promise<CampaignResult> {
  const periods = clientPeriods(q.members, q);
  const ids = [...periods.keys()];
  const starts = [...periods.values()].map(p => p.start);
  const overallRange: DateRange = {
    start: starts.length ? starts.sort()[0] : q.range.start,
    end: q.mode === 'sinceLead' ? q.today : q.range.end,
  };
  const atLocation = (loc: string | null) => q.location === 'all' || loc === q.location;

  const [segData, visitsByMonth, salesByDate, obligations, clientRows, clientSales, allMoney] = await Promise.all([
    loadSegmentData(),
    computeMarginVisitsByMonth(overallRange),
    computeSalesByDateData(overallRange, q.location),
    loadStudioObligations(q.today),
    fetchByIds<{ id: string; first_name: string | null; last_name: string | null; mobile_phone: string | null; home_phone: string | null; fad: string | null }>(
      'clients', 'id', ids, 'id, first_name, last_name, mobile_phone, home_phone, fad:raw_data->>FirstAppointmentDate'),
    fetchByIds<{ id: string; total: number | null; client_id: string; location_id: string | null; sale_datetime: string }>(
      'sales', 'client_id', ids, 'id, total, client_id, location_id, sale_datetime',
      qb => qb.gte('sale_datetime', overallRange.start).lte('sale_datetime', overallRange.end + 'T23:59:59')),
    q.withComparison ? computeMoneyReceived(overallRange, q.location) : Promise.resolve(null),
  ]);

  const relevantSales = clientSales.filter(s => {
    const p = periods.get(s.client_id);
    return !!p && atLocation(s.location_id) && inRange(s.sale_datetime.slice(0, 10), p.start, p.end);
  });
  const moneyBySale = await computeMoneyReceivedBySale(relevantSales);

  const allVisits: PricedVisit[] = [];
  for (const [key, list] of visitsByMonth) if (key.endsWith('|all')) allVisits.push(...list);
  const visitsInScope = allVisits.filter(v => atLocation(v.location_id));
  const visitsByClient = new Map<string, PricedVisit[]>();
  for (const v of visitsInScope) {
    const p = v.client_id ? periods.get(v.client_id) : undefined;
    if (!p || !inRange(v.start_datetime.slice(0, 10), p.start, p.end)) continue;
    visitsByClient.set(v.client_id!, [...(visitsByClient.get(v.client_id!) ?? []), v]);
  }

  const salesByClient = new Map<string, number>();
  const tariffTotals = new Map<string, { revenue: number; qty: number }>();
  for (const [key, entry] of salesByDate.clientTariffBreakdown) {
    const sep = key.indexOf('|');
    const clientId = key.slice(0, sep);
    const p = periods.get(clientId);
    if (!p) continue;
    const tariff = key.slice(sep + 1);
    const details = entry.details.filter(d => inRange(d.saleDate.slice(0, 10), p.start, p.end));
    const amount = details.reduce((s, d) => s + d.amount, 0);
    if (details.length === 0) continue;
    salesByClient.set(clientId, (salesByClient.get(clientId) ?? 0) + amount);
    const t = tariffTotals.get(tariff) ?? { revenue: 0, qty: 0 };
    t.revenue += amount;
    t.qty += details.length;
    tariffTotals.set(tariff, t);
  }

  const infoById = new Map(clientRows.map(c => [c.id, c]));
  const clients: ClientResult[] = ids.map(clientId => {
    const p = periods.get(clientId)!;
    const info = infoById.get(clientId);
    const fad = info?.fad ? String(info.fad).slice(0, 10) : null;
    const visits = visitsByClient.get(clientId) ?? [];
    const days = new Set(visits.map(v => v.start_datetime.slice(0, 10)));
    const money = relevantSales.filter(s => s.client_id === clientId).map(s => moneyBySale.get(s.id)).filter(Boolean);
    const { check, firstVisit } = newClientCheck(segData, clientId);
    const ours = [...(segData.visitsByClient.get(clientId) ?? []), ...(segData.freeVisitsByClient.get(clientId) ?? [])].map(v => v.date).sort();
    const obligation = obligations.byClient.get(clientId);
    return {
      clientId,
      name: info ? `${info.first_name || ''} ${info.last_name || ''}`.trim() || `Client ${clientId}` : `Client ${clientId}`,
      phone: info?.mobile_phone || info?.home_phone || '',
      leadDate: p.leadDate,
      periodStart: p.start,
      periodEnd: p.end,
      status: p.leadDate ? leadStatus(segData, clientId, p.leadDate, fad) : null,
      firstVisitEver: [fad, ours[0]].filter((d): d is string => !!d).sort()[0] ?? null,
      newInPeriod: check === 'new' && !!firstVisit && inRange(firstVisit.date, p.start, p.end) && atLocation(firstVisit.locationId),
      visits: visits.length,
      visitDays: days.size,
      moneyPaid: round2(money.reduce((s, m) => s + m!.cashIn, 0)),
      moneyGiftCards: round2(money.reduce((s, m) => s + m!.cashInGiftCards, 0)),
      moneyDeposits: round2(money.reduce((s, m) => s + m!.cashInDeposits, 0)),
      salesByService: round2(salesByClient.get(clientId) ?? 0),
      revenueEarned: round2(visits.reduce((s, v) => s + (v.revenue ?? 0), 0)),
      lastVisit: ours[ours.length - 1] ?? null,
      activePackages: obligation?.packages ?? 0,
      packageVisitsLeft: obligation?.visits ?? 0,
      obligations: round2(obligation?.value ?? 0),
    };
  });

  const resolvedMembers = q.members.filter(m => m.client_id);
  const unresolvedMembers = q.members.filter(m => !m.client_id && m.match_status === 'ambiguous').length;
  const hasStatus = q.members.some(m => m.lead_at);
  const statusCounts: Record<LeadStatus, number> = { new: 0, existing: 0, noVisits: 0, notFound: 0 };
  if (hasStatus) {
    for (const c of clients) if (c.status) statusCounts[c.status]++;
    statusCounts.notFound = q.members.length - resolvedMembers.length;
  }

  const sum = (f: (c: ClientResult) => number) => round2(clients.reduce((s, c) => s + f(c), 0));
  const withVisits = clients.filter(c => c.visits > 0);
  const isNewLead = (c: ClientResult) => (hasStatus ? c.status === 'new' : c.newInPeriod);
  const moneyPaid = sum(c => c.moneyPaid);
  const totals: CampaignTotals = {
    moneyPaid,
    moneyGiftCards: sum(c => c.moneyGiftCards),
    moneyDeposits: sum(c => c.moneyDeposits),
    moneyServicesProducts: round2(moneyPaid - sum(c => c.moneyGiftCards) - sum(c => c.moneyDeposits)),
    salesByService: sum(c => c.salesByService),
    revenueEarned: sum(c => c.revenueEarned),
    visits: sum(c => c.visits),
    clientsWithVisits: withVisits.length,
    newClients: clients.filter(c => c.newInPeriod).length,
    returned: clients.filter(c => c.visitDays >= 2).length,
    withActivePackage: clients.filter(c => c.activePackages > 0).length,
    obligations: sum(c => c.obligations),
    moneyPerClient: withVisits.length ? round2(moneyPaid / withVisits.length) : 0,
    visitsPerClient: withVisits.length ? round2(sum(c => c.visits) / withVisits.length) : 0,
    moneyPaidByNewLeads: sum(c => (isNewLead(c) ? c.moneyPaid : 0)),
  };

  const leads = q.members.reduce((s, m) => s + m.rows_merged, 0);
  const funnel: FunnelStep[] = [
    { label: 'Leads', count: leads },
    { label: 'Unique people', count: q.members.length },
    { label: 'Found in Mindbody', count: clients.length },
    { label: 'Came for a visit', count: withVisits.length },
    { label: 'Paid', count: clients.filter(c => c.moneyPaid > 0).length },
    { label: 'Came 2+ times', count: totals.returned },
    { label: 'Has an active package', count: totals.withActivePackage },
  ];

  let comparison: Comparison | null = null;
  if (allMoney) {
    const scopeVisits = visitsInScope.filter(v => v.client_id && inRange(v.start_datetime.slice(0, 10), overallRange.start, overallRange.end));
    const allClients = new Set(scopeVisits.map(v => v.client_id));
    comparison = {
      range: overallRange,
      clientsWithVisits: allClients.size,
      moneyPerClient: allClients.size ? round2(allMoney.cashIn / allClients.size) : 0,
      visitsPerClient: allClients.size ? round2(scopeVisits.length / allClients.size) : 0,
    };
  }

  return {
    clients,
    statusCounts,
    hasStatus,
    funnel,
    totals,
    salesByTariff: [...tariffTotals.entries()].map(([tariff, t]) => ({ tariff, revenue: round2(t.revenue), qty: t.qty }))
      .sort((a, b) => b.revenue - a.revenue),
    comparison,
    overallRange,
    unresolvedMembers,
  };
}
