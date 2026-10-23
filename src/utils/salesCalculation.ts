/**
 * Pure, fetch-free sales-by-date calculation shared between the browser hook
 * (`useSalesByDateData`) and the server-side reconciliation edge function.
 *
 * `computeSalesFromData` accepts preloaded raw data (sales, sale_items, payments,
 * pricing-option lookups, and optional preloaded deposit-client data) and runs the
 * full RULE 1+2 (direct rows) + RULE 3 (FIFO Payment on Account) calculation. It
 * performs NO network I/O — every row it consumes is passed in by the caller.
 */

import type { DateRange } from './salesFilters';

// ---------------------------------------------------------------------------
// Constants & helpers shared with useSalesByDateData.ts
// ---------------------------------------------------------------------------

export const NON_CASH_PAYMENT_TYPES = ['Prepaid Gift Card', 'Account', 'Comp/Guest', 'Other'];

const POA_ITEM_IDS = new Set(['-6', '10289']);
const GIFT_CARD_PATTERN = /D[AĀ]VANU KARTE/i;

export function isPaymentOnAccount(itemId: string | null, description: string | null): boolean {
  if (description === 'Payment on Account') return true;
  if (itemId && POA_ITEM_IDS.has(itemId)) return true;
  return false;
}

export function isGiftCard(description: string | null): boolean {
  return !!description && GIFT_CARD_PATTERN.test(description);
}

export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Raw record shapes (mirror the database columns selected by the loaders)
// ---------------------------------------------------------------------------

export interface SaleRecord {
  id: string;
  client_id: string | null;
  location_id: string | null;
  sale_date: string | null;
}

export interface RawItem {
  sale_id: string;
  item_id: string | null;
  total_amount: number | null;
  is_service: boolean | null;
  description: string | null;
  returned: boolean | null;
  category_id: number | null;
}

export interface RawPayment {
  sale_id: string;
  type: string | null;
  amount: number | null;
}

// ---------------------------------------------------------------------------
// Result / breakdown types
// ---------------------------------------------------------------------------

export interface SaleDateTariffRow {
  pricingOptionName: string;
  category: string;
  qtySold: number;
  revenue: number;
  returnedCount: number;
}

export interface ClientTariffDetail {
  saleId: string;
  saleDate: string;
  amount: number;
  rule: 'cash' | 'fifo';
  // For FIFO entries: the date the deposit was spent (debit date), not the deposit date.
  debitDate?: string;
}

export interface ClientTariffEntry {
  revenue: number;
  qty: number;
  details: ClientTariffDetail[];
}

export interface SalesByDateResult {
  rows: SaleDateTariffRow[];
  totalReturned: number;
  unallocatedAmount: number;
  clientTariffBreakdown: Map<string, ClientTariffEntry>;
  // Keyed "YYYY-MM|locationId": sale date for direct sales, deposit date and location for FIFO.
  byMonth: Map<string, Map<string, { category: string; revenue: number }>>;
}

// Preloaded sale/sale_items/payments for all deposit-holding clients.
// When provided to computeSalesFromData, the per-client data must already be
// present (the pure function cannot fetch missing clients).
export interface DepositClientData {
  sales: SaleRecord[];
  saleItems: RawItem[];
  payments: RawPayment[];
}

// ---------------------------------------------------------------------------
// Pricing-option lookup maps
// ---------------------------------------------------------------------------

/** mindbody_id (string) → { name, revenue_category } */
export type PoByMbId = Map<string, { name: string; category: string }>;
/** normalized pricing-option name → revenue_category */
export type PoByNameNorm = Map<string, string>;
/** CategoryId (string) → revenue_category */
export type PoByCatId = Map<string, string>;

// ---------------------------------------------------------------------------
// FIFO internal types
// ---------------------------------------------------------------------------

interface BalanceEvent {
  idx: number;
  saleId: string;
  saleDate: string;
  locationId: string;
  kind: 'debit' | 'cash_credit' | 'noncash_credit';
  amount: number;
  remaining: number;
  tariffName: string | null;
  tariffCategory: string | null;
  isService: boolean;
}

interface FifoMatch {
  credit: BalanceEvent;
  debit: BalanceEvent;
  amount: number;
}

// ---------------------------------------------------------------------------
// Small internal utilities
// ---------------------------------------------------------------------------

function paymentBreakdown(payments: RawPayment[]) {
  let paidAll = 0;
  let paidCash = 0;
  let paidAccount = 0;
  let hasCash = false;
  for (const p of payments) {
    const amt = Number(p.amount) || 0;
    paidAll += amt;
    const t = (p.type || '').trim();
    if (t === 'Account') {
      paidAccount += amt;
    } else if (!NON_CASH_PAYMENT_TYPES.includes(t)) {
      paidCash += amt;
      if (amt !== 0) hasCash = true;
    }
  }
  return { paidAll, paidCash, paidAccount, hasCash };
}

function groupBySaleId<T extends { sale_id: string }>(arr: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of arr) {
    if (!m.has(r.sale_id)) m.set(r.sale_id, []);
    m.get(r.sale_id)!.push(r);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Core pure calculation
// ---------------------------------------------------------------------------

/**
 * Compute sales-by-date tariff rows from preloaded data.
 *
 * @param dateRange          The reporting window (inclusive start/end "YYYY-MM-DD").
 * @param selectedLocation   A location_id or "all".
 * @param periodSales        Sales whose sale_date falls within dateRange (any location;
 *                           location filtering is applied here when selectedLocation !== "all").
 * @param periodItems        sale_items for those sales.
 * @param periodPayments     payments for those sales.
 * @param poByMbId           pricing_options keyed by mindbody_id (string).
 * @param poByNameNorm       pricing_options keyed by normalized name → category.
 * @param poByCatId          category_id (string) → revenue_category (may be pre-seeded;
 *                           this function augments it from catalogued sale_items).
 * @param preloadedDepositData  Optional preloaded transactions for every deposit-holding
 *                           client. When omitted, clients that posted a Payment on Account
 *                           within the period are NOT processed for FIFO (the pure function
 *                           cannot fetch their history).
 */
export function computeSalesFromData(
  dateRange: DateRange,
  selectedLocation: string,
  periodSales: SaleRecord[],
  periodItems: RawItem[],
  periodPayments: RawPayment[],
  poByMbId: PoByMbId,
  poByNameNorm: PoByNameNorm,
  poByCatId: PoByCatId,
  preloadedDepositData?: DepositClientData,
): SalesByDateResult {
  if (periodSales.length === 0) {
    return { rows: [], totalReturned: 0, unallocatedAmount: 0, clientTariffBreakdown: new Map(), byMonth: new Map() };
  }

  // Filter by location when the caller wants a single location.
  if (selectedLocation !== 'all') {
    periodSales = periodSales.filter(s => s.location_id === selectedLocation);
  }
  if (periodSales.length === 0) {
    return { rows: [], totalReturned: 0, unallocatedAmount: 0, clientTariffBreakdown: new Map(), byMonth: new Map() };
  }

  const salesById = new Map(periodSales.map(s => [s.id, s]));
  const saleIdSet = new Set(periodSales.map(s => s.id));
  periodItems = periodItems.filter(si => saleIdSet.has(si.sale_id));
  periodPayments = periodPayments.filter(p => saleIdSet.has(p.sale_id));
  const payBySale = groupBySaleId(periodPayments);

  // Build category_id → revenue_category mapping from catalogued sale_items.
  // (Mutates the caller's map so the server and browser share the augmentation.)
  for (const si of periodItems) {
    if (si.category_id == null) continue;
    const cidStr = String(si.category_id);
    if (poByCatId.has(cidStr)) continue;
    const itemIdStr = si.item_id != null ? String(si.item_id) : null;
    const po = itemIdStr ? poByMbId.get(itemIdStr) : null;
    if (po?.category) poByCatId.set(cidStr, po.category);
  }

  function resolveCategory(description: string | null, categoryId: number | null): string {
    if (description) {
      const match = poByNameNorm.get(normalizeName(description));
      if (match) return match;
    }
    if (categoryId != null) {
      const match = poByCatId.get(String(categoryId));
      if (match) return match;
    }
    return 'Other services';
  }

  // ========== RULE 1 + 2: direct rows ==========
  const tariffMap: Record<string, SaleDateTariffRow> = {};
  const ctBreakdown = new Map<string, ClientTariffEntry>();
  let returnedTotal = 0;
  const poaClients = new Set<string>();
  const byMonth: SalesByDateResult['byMonth'] = new Map();
  const addToMonth = (date: string, locationId: string, tariff: string, category: string, revenue: number) => {
    const month = `${date.slice(0, 7)}|${locationId}`;
    const tariffs = byMonth.get(month) ?? new Map<string, { category: string; revenue: number }>();
    const entry = tariffs.get(tariff) ?? { category, revenue: 0 };
    entry.revenue += revenue;
    tariffs.set(tariff, entry);
    byMonth.set(month, tariffs);
  };

  for (const si of periodItems) {
    const itemIdStr = si.item_id != null ? String(si.item_id) : null;

    // Detect "Payment on Account" → mark client for FIFO
    if (isPaymentOnAccount(itemIdStr, si.description)) {
      const sale = salesById.get(si.sale_id);
      if (sale?.client_id) poaClients.add(sale.client_id);
      continue;
    }

    // Skip gift cards
    if (isGiftCard(si.description)) continue;

    // Try catalogued lookup first
    const po = itemIdStr ? poByMbId.get(itemIdStr) : null;

    // If not in catalogue, only include if is_service
    if (!po && !si.is_service) continue;
    if (!po && !itemIdStr) continue;

    const tariffName = po ? po.name : (si.description || 'Unknown service');
    const tariffCategory = po ? po.category : resolveCategory(si.description, si.category_id);

    const bd = paymentBreakdown(payBySale.get(si.sale_id) || []);
    if (!bd.hasCash) continue;

    const totalAmt = Number(si.total_amount) || 0;
    const revenue = bd.paidAll !== 0 ? totalAmt * bd.paidCash / bd.paidAll : 0;
    const qty = totalAmt < 0 ? -1 : 1;

    if (si.returned) returnedTotal++;

    const key = tariffName;
    if (!tariffMap[key]) {
      tariffMap[key] = { pricingOptionName: tariffName, category: tariffCategory, qtySold: 0, revenue: 0, returnedCount: 0 };
    }
    tariffMap[key].qtySold += qty;
    tariffMap[key].revenue += revenue;
    if (si.returned) tariffMap[key].returnedCount++;

    const sale = salesById.get(si.sale_id);
    addToMonth(sale?.sale_date || '', sale?.location_id || '', tariffName, tariffCategory, revenue);
    if (sale?.client_id) {
      const ctKey = `${sale.client_id}|${tariffName}`;
      let ct = ctBreakdown.get(ctKey);
      if (!ct) { ct = { revenue: 0, qty: 0, details: [] }; ctBreakdown.set(ctKey, ct); }
      ct.revenue += revenue;
      ct.qty += qty;
      ct.details.push({ saleId: si.sale_id, saleDate: (sale.sale_date || '').slice(0, 10), amount: revenue, rule: 'cash' });
    }
  }

  // ========== RULE 3: Payment on Account FIFO ==========
  let totalUnallocated = 0;

  const poaClientList = [...poaClients];

  // Index the preloaded deposit-client data by client / sale for fast lookup.
  const depositSalesByClient = new Map<string, SaleRecord[]>();
  const depositItemsBySale = new Map<string, RawItem[]>();
  const depositPaymentsBySale = new Map<string, RawPayment[]>();
  if (preloadedDepositData) {
    for (const s of preloadedDepositData.sales) {
      if (!s.client_id) continue;
      if (!depositSalesByClient.has(s.client_id)) depositSalesByClient.set(s.client_id, []);
      depositSalesByClient.get(s.client_id)!.push(s);
    }
    for (const si of preloadedDepositData.saleItems) {
      if (!depositItemsBySale.has(si.sale_id)) depositItemsBySale.set(si.sale_id, []);
      depositItemsBySale.get(si.sale_id)!.push(si);
    }
    for (const p of preloadedDepositData.payments) {
      if (!depositPaymentsBySale.has(p.sale_id)) depositPaymentsBySale.set(p.sale_id, []);
      depositPaymentsBySale.get(p.sale_id)!.push(p);
    }
  }

  for (const clientId of poaClientList) {
    let clientSales: SaleRecord[];
    let cItems: RawItem[];
    let cPayments: RawPayment[];
    if (preloadedDepositData) {
      clientSales = (depositSalesByClient.get(clientId) || []).slice().sort((a, b) =>
        (a.sale_date || '').localeCompare(b.sale_date || '') || a.id.localeCompare(b.id));
      const cSaleIds = new Set(clientSales.map(s => s.id));
      cItems = preloadedDepositData.saleItems.filter(si => cSaleIds.has(si.sale_id));
      cPayments = preloadedDepositData.payments.filter(p => cSaleIds.has(p.sale_id));
    } else {
      // No deposit data provided for this client — the pure function cannot fetch,
      // so there is nothing to FIFO-match. Skip the client.
      continue;
    }
    const cPayBySale = groupBySaleId(cPayments);
    const cItemsBySale = groupBySaleId(cItems);

    // Build chronological balance events
    let eventIdx = 0;
    const events: BalanceEvent[] = [];

    for (const sale of clientSales) {
      const items = cItemsBySale.get(sale.id) || [];
      const bd = paymentBreakdown(cPayBySale.get(sale.id) || []);

      // Sum PoA items on this sale so Account is split among non-PoA items only
      let poaItemTotal = 0;
      for (const si of items) {
        const iid = si.item_id != null ? String(si.item_id) : null;
        if (isPaymentOnAccount(iid, si.description)) poaItemTotal += Number(si.total_amount) || 0;
      }
      const nonPoaTotal = bd.paidAll - poaItemTotal;

      for (const si of items) {
        const totalAmt = Number(si.total_amount) || 0;
        const itemIdStr = si.item_id != null ? String(si.item_id) : null;

        if (isPaymentOnAccount(itemIdStr, si.description)) {
          // Account payments on the same sale cover other items, not
          // the PoA deposit, so exclude them from the denominator.
          const poaDenom = bd.paidAll - bd.paidAccount;
          if (poaDenom !== 0) {
            const cashPortion = totalAmt * bd.paidCash / poaDenom;
            const nonCashPortion = totalAmt - cashPortion;
            if (Math.abs(cashPortion) > 0.001) {
              events.push({
                idx: eventIdx++, saleId: sale.id,
                saleDate: sale.sale_date || '', locationId: sale.location_id || '',
                kind: 'cash_credit', amount: Math.abs(cashPortion), remaining: Math.abs(cashPortion),
                tariffName: null, tariffCategory: null, isService: false,
              });
            }
            if (Math.abs(nonCashPortion) > 0.001) {
              events.push({
                idx: eventIdx++, saleId: sale.id,
                saleDate: sale.sale_date || '', locationId: sale.location_id || '',
                kind: 'noncash_credit', amount: Math.abs(nonCashPortion), remaining: Math.abs(nonCashPortion),
                tariffName: null, tariffCategory: null, isService: false,
              });
            }
          }
          continue;
        }

        if (isGiftCard(si.description)) continue;

        if (totalAmt < 0 && bd.paidAccount < 0) {
          const refundAmt = Math.abs(totalAmt * bd.paidAccount / bd.paidAll);
          if (refundAmt > 0.001) {
            events.push({
              idx: eventIdx++, saleId: sale.id,
              saleDate: sale.sale_date || '', locationId: sale.location_id || '',
              kind: 'noncash_credit', amount: refundAmt, remaining: refundAmt,
              tariffName: null, tariffCategory: null, isService: false,
            });
          }
          continue;
        }

        // Every Account-paid item draws from the balance (services AND products)
        if (bd.paidAccount !== 0 && bd.paidAll !== 0) {
          const denom = nonPoaTotal !== 0 ? nonPoaTotal : bd.paidAll;
          const accountPortion = Math.abs(totalAmt * bd.paidAccount / denom);
          if (accountPortion > 0.001) {
            const po = itemIdStr ? poByMbId.get(itemIdStr) : null;
            const tName = po ? (po.name || 'Unknown') : (si.description || 'Unknown');
            const tCat = po ? (po.category || '') : resolveCategory(si.description, si.category_id);
            events.push({
              idx: eventIdx++, saleId: sale.id,
              saleDate: sale.sale_date || '', locationId: sale.location_id || '',
              kind: 'debit', amount: accountPortion, remaining: accountPortion,
              tariffName: tName, tariffCategory: tCat,
              isService: !!po || !!si.is_service,
            });
          }
        }
      }
    }

    events.sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.saleId.localeCompare(b.saleId) || a.idx - b.idx);

    // FIFO matching
    const matches: FifoMatch[] = [];
    const unmatchedDebits: BalanceEvent[] = [];
    const unmatchedCredits: BalanceEvent[] = [];

    for (const ev of events) {
      if (ev.kind === 'debit') {
        for (let i = 0; i < unmatchedCredits.length && ev.remaining > 0.001; ) {
          const cr = unmatchedCredits[i];
          const m = Math.min(ev.remaining, cr.remaining);
          ev.remaining -= m; cr.remaining -= m;
          matches.push({ credit: cr, debit: ev, amount: m });
          if (cr.remaining < 0.001) unmatchedCredits.splice(i, 1); else i++;
        }
        if (ev.remaining > 0.001) unmatchedDebits.push(ev);
      } else {
        for (let i = 0; i < unmatchedDebits.length && ev.remaining > 0.001; ) {
          const db = unmatchedDebits[i];
          const m = Math.min(ev.remaining, db.remaining);
          ev.remaining -= m; db.remaining -= m;
          matches.push({ credit: ev, debit: db, amount: m });
          if (db.remaining < 0.001) unmatchedDebits.splice(i, 1); else i++;
        }
        if (ev.remaining > 0.001) unmatchedCredits.push(ev);
      }
    }

    // Aggregate FIFO matches
    const fifoAgg = new Map<string, { tariffName: string; tariffCategory: string; revenue: number; creditIdxes: Set<number> }>();

    for (const m of matches) {
      if (m.credit.kind !== 'cash_credit') continue;
      const cd = m.credit.saleDate.slice(0, 10);
      if (cd < dateRange.start || cd > dateRange.end) continue;
      if (selectedLocation !== 'all' && m.credit.locationId !== selectedLocation) continue;
      if (!m.debit.isService) continue;

      const tName = m.debit.tariffName || 'Unknown';
      let agg = fifoAgg.get(tName);
      if (!agg) {
        agg = { tariffName: tName, tariffCategory: m.debit.tariffCategory || '', revenue: 0, creditIdxes: new Set() };
        fifoAgg.set(tName, agg);
      }
      agg.revenue += m.amount;
      agg.creditIdxes.add(m.credit.idx);
      addToMonth(cd, m.credit.locationId, tName, m.debit.tariffCategory || '', m.amount);
    }

    for (const [tName, agg] of fifoAgg) {
      if (!tariffMap[tName]) {
        tariffMap[tName] = { pricingOptionName: tName, category: agg.tariffCategory, qtySold: 0, revenue: 0, returnedCount: 0 };
      }
      tariffMap[tName].revenue += agg.revenue;
      tariffMap[tName].qtySold += agg.creditIdxes.size;

      const ctKey = `${clientId}|${tName}`;
      let ct = ctBreakdown.get(ctKey);
      if (!ct) { ct = { revenue: 0, qty: 0, details: [] }; ctBreakdown.set(ctKey, ct); }
      ct.revenue += agg.revenue;
      ct.qty += agg.creditIdxes.size;
      for (const m2 of matches) {
        if (m2.credit.kind !== 'cash_credit') continue;
        if ((m2.debit.tariffName || 'Unknown') !== tName) continue;
        const cd2 = m2.credit.saleDate.slice(0, 10);
        if (cd2 < dateRange.start || cd2 > dateRange.end) continue;
        if (selectedLocation !== 'all' && m2.credit.locationId !== selectedLocation) continue;
        if (!m2.debit.isService) continue;
        ct.details.push({ saleId: m2.credit.saleId, saleDate: cd2, amount: m2.amount, rule: 'fifo', debitDate: m2.debit.saleDate.slice(0, 10) });
      }
    }

    // Unallocated: cash credits in period that still have remaining
    for (const ev of unmatchedCredits) {
      if (ev.kind !== 'cash_credit') continue;
      const cd = ev.saleDate.slice(0, 10);
      if (cd < dateRange.start || cd > dateRange.end) continue;
      if (selectedLocation !== 'all' && ev.locationId !== selectedLocation) continue;
      totalUnallocated += ev.remaining;
    }
  }

  // Unallocated is tracked as info only — NOT added to tariffMap

  const sortedRows = Object.values(tariffMap).sort((a, b) => b.revenue - a.revenue);
  return { rows: sortedRows, totalReturned: returnedTotal, unallocatedAmount: totalUnallocated, clientTariffBreakdown: ctBreakdown, byMonth };
}
