import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAllPages } from '../lib/fetchAllPages';
import { fetchByIds, mapLimited } from '../lib/fetchByIds';
import { DateRange } from '../utils/salesFilters';
import { errorMessage } from '../utils/errorMessage';

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
}

export interface ClientTariffEntry {
  revenue: number;
  qty: number;
  details: ClientTariffDetail[];
}

interface UseSalesByDateDataProps {
  dateRange: DateRange;
  selectedLocation: string;
}

interface SaleRecord {
  id: string;
  client_id: string | null;
  location_id: string | null;
  sale_date: string | null;
}

interface RawItem {
  sale_id: string;
  item_id: string | null;
  total_amount: number | null;
  is_service: boolean | null;
  description: string | null;
  returned: boolean | null;
  category_id: number | null;
}

interface RawPayment {
  sale_id: string;
  type: string | null;
  amount: number | null;
}

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

// ---------- FIFO types ----------
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

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface SalesByDateResult {
  rows: SaleDateTariffRow[];
  totalReturned: number;
  unallocatedAmount: number;
  clientTariffBreakdown: Map<string, ClientTariffEntry>;
  // Keyed "YYYY-MM|locationId": sale date for direct sales, deposit date and location for FIFO.
  byMonth: Map<string, Map<string, { category: string; revenue: number }>>;
}

export async function computeSalesByDateData(
  dateRange: DateRange,
  selectedLocation: string,
): Promise<SalesByDateResult> {
  try {
      // --- pricing options lookup ---
      const poByMbId = new Map<string, { name: string; category: string }>();
      const poByNameNorm = new Map<string, string>(); // normalized name → revenue_category
      const poByCatId = new Map<string, string>(); // CategoryId string → revenue_category

      const poAll = await fetchAllPages<{
        mindbody_id: number | null;
        name: string;
        revenue_category: string;
      }>(
        (from, to) => supabase.from('pricing_options').select('mindbody_id, name, revenue_category').order('id').range(from, to),
      );
      for (const po of poAll) {
        const cat = po.revenue_category || '';
        if (po.mindbody_id != null)
          poByMbId.set(String(po.mindbody_id), { name: po.name || '', category: cat });
        if (po.name) {
          const norm = normalizeName(po.name);
          if (!poByNameNorm.has(norm) && cat) poByNameNorm.set(norm, cat);
        }
      }

      // --- sales in period ---
      const periodSales = await fetchAllPages<SaleRecord>((from, to) =>
        (selectedLocation !== 'all'
          ? supabase.from('sales').select('id, client_id, location_id, sale_date')
              .gte('sale_date', dateRange.start).lte('sale_date', dateRange.end)
              .eq('location_id', selectedLocation)
          : supabase.from('sales').select('id, client_id, location_id, sale_date')
              .gte('sale_date', dateRange.start).lte('sale_date', dateRange.end)
        ).order('id').range(from, to),
      );

      if (periodSales.length === 0) {
        return { rows: [], totalReturned: 0, unallocatedAmount: 0, clientTariffBreakdown: new Map(), byMonth: new Map() };
      }

      const saleIds = periodSales.map(s => s.id);
      const salesById = new Map(periodSales.map(s => [s.id, s]));

      // --- items + payments for period sales ---
      const [periodItems, periodPayments] = await Promise.all([
        fetchByIds<RawItem>(
          'sale_items', 'sale_id', saleIds,
          'sale_id, item_id, total_amount, is_service, description, returned, category_id',
        ),
        fetchByIds<RawPayment>(
          'payments', 'sale_id', saleIds,
          'sale_id, type, amount',
        ),
      ]);
      const payBySale = groupBySaleId(periodPayments);

      // Build category_id → revenue_category mapping from catalogued sale_items
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
      const histories = await mapLimited(poaClientList, async clientId => {
        // Full sale history for this client
        const clientSales = await fetchAllPages<SaleRecord>((from, to) =>
          supabase.from('sales').select('id, client_id, location_id, sale_date')
            .eq('client_id', clientId)
            .order('sale_date', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
        );
        const cSaleIds = clientSales.map(s => s.id);
        const [cItems, cPayments] = await Promise.all([
          fetchByIds<RawItem>(
            'sale_items', 'sale_id', cSaleIds,
            'sale_id, item_id, total_amount, is_service, description, returned, category_id',
          ),
          fetchByIds<RawPayment>(
            'payments', 'sale_id', cSaleIds,
            'sale_id, type, amount',
          ),
        ]);
        return { clientSales, cItems, cPayments };
      }, 4);

      for (const [clientIndex, clientId] of poaClientList.entries()) {
        const { clientSales, cItems, cPayments } = histories[clientIndex];
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
            ct.details.push({ saleId: m2.credit.saleId, saleDate: cd2, amount: m2.amount, rule: 'fifo' });
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
    } catch (error) {
      throw error;
    }
  }

export function useSalesByDateData({ dateRange, selectedLocation }: UseSalesByDateDataProps) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<SaleDateTariffRow[]>([]);
  const [totalReturned, setTotalReturned] = useState(0);
  const [unallocatedAmount, setUnallocatedAmount] = useState(0);
  const [clientTariffBreakdown, setClientTariffBreakdown] = useState<Map<string, ClientTariffEntry>>(new Map());

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await computeSalesByDateData(dateRange, selectedLocation);
      setRows(result.rows);
      setTotalReturned(result.totalReturned);
      setUnallocatedAmount(result.unallocatedAmount);
      setClientTariffBreakdown(result.clientTariffBreakdown);
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedLocation]);

  useEffect(() => { loadData(); }, [loadData]);

  return { loading, loadError, rows, totalReturned, unallocatedAmount, clientTariffBreakdown, reload: loadData };
}
