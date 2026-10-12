import { exportMultiSheetExcel } from './exportExcel';
import { STATUS_LABELS, type CampaignResult } from './campaignResults';

interface ExportContext {
  listName: string;
  periodLabel: string;
  locationLabel: string;
  campaignCost: number | null;
}

const ratio = (a: number, b: number) => (b ? Math.round((a / b) * 100) / 100 : '');

export function exportCampaign(result: CampaignResult, ctx: ExportContext) {
  const t = result.totals;
  const totals: { Metric: string; Value: string | number }[] = [
    { Metric: 'List', Value: ctx.listName },
    { Metric: 'Period', Value: ctx.periodLabel },
    { Metric: 'Location', Value: ctx.locationLabel },
    ...(result.hasStatus ? (Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]).map(s => ({ Metric: `Status: ${STATUS_LABELS[s]}`, Value: result.statusCounts[s] })) : []),
    ...result.funnel.map(f => ({ Metric: `Funnel: ${f.label}`, Value: f.count })),
    { Metric: 'Money paid, EUR', Value: t.moneyPaid },
    { Metric: '  services and products', Value: t.moneyServicesProducts },
    { Metric: '  gift cards', Value: t.moneyGiftCards },
    { Metric: '  account top-ups', Value: t.moneyDeposits },
    { Metric: 'Sales by service, EUR', Value: t.salesByService },
    { Metric: 'Revenue earned, EUR', Value: t.revenueEarned },
    { Metric: 'Visits', Value: t.visits },
    { Metric: 'Clients with visits', Value: t.clientsWithVisits },
    { Metric: 'New clients (first paid visit in period)', Value: t.newClients },
    { Metric: 'Returned (2+ visits)', Value: t.returned },
    { Metric: 'With an active package now', Value: t.withActivePackage },
    { Metric: 'Obligations now, EUR', Value: t.obligations },
    { Metric: 'Money paid per client, EUR', Value: t.moneyPerClient },
    { Metric: 'Visits per client', Value: t.visitsPerClient },
  ];
  if (ctx.campaignCost !== null) {
    const leads = result.funnel[0].count;
    const newClients = result.hasStatus ? result.statusCounts.new : t.newClients;
    const paying = result.clients.filter(c => c.moneyPaid > 0).length;
    totals.push(
      { Metric: 'Campaign cost, EUR', Value: ctx.campaignCost },
      { Metric: 'Cost per lead, EUR', Value: ratio(ctx.campaignCost, leads) },
      { Metric: 'Cost per new client, EUR', Value: ratio(ctx.campaignCost, newClients) },
      { Metric: 'Cost per paying client, EUR', Value: ratio(ctx.campaignCost, paying) },
      { Metric: 'Return (money paid by new clients / cost)', Value: ratio(t.moneyPaidByNewLeads, ctx.campaignCost) },
    );
  }
  if (result.comparison) {
    totals.push(
      { Metric: 'All clients with visits: clients', Value: result.comparison.clientsWithVisits },
      { Metric: 'All clients with visits: money paid per client, EUR', Value: result.comparison.moneyPerClient },
      { Metric: 'All clients with visits: visits per client', Value: result.comparison.visitsPerClient },
    );
  }

  const clients = result.clients.map(c => ({
    Client: c.name,
    'Client ID': c.clientId,
    Phone: c.phone,
    'Lead date': c.leadDate ?? '',
    Status: c.status ? STATUS_LABELS[c.status] : '',
    'First visit': c.firstVisitEver ?? '',
    'New in period': c.newInPeriod ? 'yes' : 'no',
    'Period from': c.periodStart,
    'Period to': c.periodEnd,
    Visits: c.visits,
    'Money paid, EUR': c.moneyPaid,
    'Sales by service, EUR': c.salesByService,
    'Revenue earned, EUR': c.revenueEarned,
    'Last visit': c.lastVisit ?? '',
    'Active packages': c.activePackages,
    'Package visits left': c.packageVisitsLeft,
    'Obligations now, EUR': c.obligations,
  }));

  const services = result.salesByTariff.map(s => ({ Service: s.tariff, Sales: s.qty, 'Amount, EUR': s.revenue }));
  const safeName = ctx.listName.replace(/[^\w\- ]+/g, '').trim() || 'campaign';
  exportMultiSheetExcel([
    { name: 'Totals', data: totals },
    { name: 'Clients', data: clients },
    { name: 'Sales by service', data: services },
  ], safeName);
}
