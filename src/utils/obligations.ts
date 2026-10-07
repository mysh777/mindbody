import { supabase } from '../lib/supabase';
import { fetchAllPages } from '../lib/fetchAllPages';
import { fetchByIds } from '../lib/fetchByIds';
import { isPackageActive, toLocalISO, PACKAGE_STATUS_COLUMNS, type PackageStatusInput } from './packageStatus';
import { resolveServicePrices, type PriceSource } from './resolveServicePrices';

export interface ObligationPackage extends PackageStatusInput {
  id: string;
  client_id?: string | null;
  count: number;
  paid_price: number;
  price_source: PriceSource;
}

export interface ObligationsSummary {
  total: number;
  paidPart: number;
  catalogPart: number;
  catalogPackages: number;
  noDataPackages: number;
  activePackages: number;
  remainingVisits: number;
  clients: number;
  byPackage: Map<string, number>;
  byClient: Map<string, ClientObligation>;
}

export interface ClientObligation {
  clientId: string;
  value: number;
  paidPart: number;
  visits: number;
  packages: number;
  nextExpiry: string | null;
}

export function packageObligation(pkg: Pick<ObligationPackage, 'count' | 'remaining' | 'paid_price'>): number {
  if (pkg.count <= 0) return 0;
  return pkg.paid_price * (pkg.remaining / pkg.count);
}

export function computeObligations(packages: ObligationPackage[], today = toLocalISO(new Date())): ObligationsSummary {
  const summary: ObligationsSummary = {
    total: 0, paidPart: 0, catalogPart: 0, catalogPackages: 0, noDataPackages: 0,
    activePackages: 0, remainingVisits: 0, clients: 0, byPackage: new Map(), byClient: new Map(),
  };
  for (const pkg of packages) {
    if (!isPackageActive(pkg, today)) continue;
    const value = packageObligation(pkg);
    summary.activePackages++;
    summary.remainingVisits += pkg.remaining;
    summary.total += value;
    summary.byPackage.set(pkg.id, value);
    const isPaid = pkg.price_source === 'actual' || pkg.price_source === 'direct_sale_item';
    if (pkg.client_id) {
      const c = summary.byClient.get(pkg.client_id)
        || { clientId: pkg.client_id, value: 0, paidPart: 0, visits: 0, packages: 0, nextExpiry: null };
      c.value += value;
      if (isPaid) c.paidPart += value;
      c.visits += pkg.remaining;
      c.packages++;
      const exp = pkg.expiration_date ? pkg.expiration_date.slice(0, 10) : null;
      if (exp && (!c.nextExpiry || exp < c.nextExpiry)) c.nextExpiry = exp;
      summary.byClient.set(pkg.client_id, c);
    }
    if (isPaid) {
      summary.paidPart += value;
    } else if (pkg.price_source === 'catalog_approximate') {
      summary.catalogPart += value;
      summary.catalogPackages++;
    } else {
      summary.noDataPackages++;
    }
  }
  summary.clients = summary.byClient.size;
  return summary;
}

// Prices are resolved per client, exactly as the client card does, so the studio total equals the sum of all cards.
export async function loadStudioObligations(asOf?: string): Promise<ObligationsSummary> {
  const today = asOf || toLocalISO(new Date());
  const csRows = await fetchAllPages<any>((from, to) => supabase
    .from('client_services')
    .select(`id, mindbody_id, client_id, count, remaining, pricing_option_id, active_date, expiration_date, ${PACKAGE_STATUS_COLUMNS}`)
    .gt('remaining', 0)
    .order('id')
    .range(from, to));
  const active = csRows.filter(cs => isPackageActive(cs, today));
  if (active.length === 0) return computeObligations([], today);

  const poIds = [...new Set(active.map(cs => cs.pricing_option_id).filter(Boolean))] as string[];
  const clientIds = [...new Set(active.map(cs => cs.client_id).filter(Boolean))] as string[];

  const pricingOptions = await fetchByIds<any>('pricing_options', 'id', poIds, 'id, mindbody_id, price');
  const sales = await fetchByIds<any>('sales', 'client_id', clientIds, 'id, client_id, sale_datetime');
  const saleItems = await fetchByIds<any>('sale_items', 'sale_id', sales.map(s => s.id), 'id, sale_id, item_id, total_amount, payment_ref_id');

  const salesByClient = new Map<string, any[]>();
  const clientBySale = new Map<string, string>();
  for (const s of sales) {
    clientBySale.set(s.id, s.client_id);
    const list = salesByClient.get(s.client_id) || [];
    list.push(s);
    salesByClient.set(s.client_id, list);
  }
  const itemsByClient = new Map<string, any[]>();
  for (const si of saleItems) {
    const cid = clientBySale.get(si.sale_id);
    if (!cid) continue;
    const list = itemsByClient.get(cid) || [];
    list.push(si);
    itemsByClient.set(cid, list);
  }
  const pkgsByClient = new Map<string, any[]>();
  for (const cs of active) {
    const list = pkgsByClient.get(cs.client_id) || [];
    list.push(cs);
    pkgsByClient.set(cs.client_id, list);
  }

  const packages: ObligationPackage[] = [];
  for (const [clientId, pkgs] of pkgsByClient) {
    const prices = resolveServicePrices(
      pkgs.map(cs => ({ id: cs.id, mindbody_id: cs.mindbody_id, pricing_option_id: cs.pricing_option_id, payment_date: null, active_date: cs.active_date })),
      pricingOptions,
      itemsByClient.get(clientId) || [],
      salesByClient.get(clientId) || [],
    );
    for (const cs of pkgs) {
      const rp = prices.get(cs.id) || { price: 0, source: 'no_data' as const };
      packages.push({
        id: cs.id, client_id: clientId, count: cs.count, remaining: cs.remaining,
        expiration_date: cs.expiration_date, current: cs.current, returned: cs.returned,
        paid_price: rp.price, price_source: rp.source,
      });
    }
  }
  return computeObligations(packages, today);
}
