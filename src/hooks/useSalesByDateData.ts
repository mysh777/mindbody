import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAllPages } from '../lib/fetchAllPages';
import { fetchByIds } from '../lib/fetchByIds';
import type { DateRange } from '../utils/salesFilters';
import { errorMessage } from '../utils/errorMessage';

// Pure calculation + all shared types/helpers live in the shared module so the
// server edge function can import them without pulling in React or supabase-js.
import {
  computeSalesFromData,
  normalizeName,
  NON_CASH_PAYMENT_TYPES,
  isPaymentOnAccount,
  isGiftCard,
  type SaleRecord,
  type RawItem,
  type RawPayment,
  type SaleDateTariffRow,
  type ClientTariffDetail,
  type ClientTariffEntry,
  type SalesByDateResult,
  type DepositClientData,
  type PoByMbId,
  type PoByNameNorm,
  type PoByCatId,
} from '../utils/salesCalculation';

// Re-export everything external callers import from this module.
export {
  NON_CASH_PAYMENT_TYPES,
  isPaymentOnAccount,
  isGiftCard,
  type SaleDateTariffRow,
  type ClientTariffDetail,
  type ClientTariffEntry,
  type SalesByDateResult,
  type DepositClientData,
};

interface UseSalesByDateDataProps {
  dateRange: DateRange;
  selectedLocation: string;
}

// Preloaded period sales/items/payments from the get_period_sales_data RPC.
export interface PeriodSalesData {
  sales: SaleRecord[];
  saleItems: RawItem[];
  payments: RawPayment[];
}

export async function loadPeriodSalesData(start: string, end: string): Promise<PeriodSalesData> {
  const { data, error } = await supabase.rpc('get_period_sales_data', { p_start: start, p_end: end });
  if (error) throw new Error(`Failed to load period sales data: ${error.message}`);
  const d = (data || [{}])[0] || {};
  return {
    sales: (d.sales || []) as SaleRecord[],
    saleItems: (d.sale_items || []) as RawItem[],
    payments: (d.payments || []) as RawPayment[],
  };
}

export async function loadDepositClientData(): Promise<DepositClientData> {
  const { data, error } = await supabase.rpc('get_deposit_client_transactions');
  if (error) throw new Error(`Failed to load deposit client data: ${error.message}`);
  const d = (data || [{}])[0] || {};
  return {
    sales: (d.sales || []) as SaleRecord[],
    saleItems: (d.sale_items || []) as RawItem[],
    payments: (d.payments || []) as RawPayment[],
  };
}

export async function computeSalesByDateData(
  dateRange: DateRange,
  selectedLocation: string,
  preloadedDepositData?: DepositClientData,
): Promise<SalesByDateResult> {
  try {
    // --- pricing options lookup ---
    const poByMbId: PoByMbId = new Map();
    const poByNameNorm: PoByNameNorm = new Map(); // normalized name → revenue_category
    const poByCatId: PoByCatId = new Map(); // CategoryId string → revenue_category

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
    // Use the bulk RPC when available (single call vs dozens of paginated requests).
    let periodSales: SaleRecord[];
    let periodItems: RawItem[];
    let periodPayments: RawPayment[];
    try {
      const pd = await loadPeriodSalesData(dateRange.start, dateRange.end);
      periodSales = pd.sales;
      periodItems = pd.saleItems;
      periodPayments = pd.payments;
    } catch {
      // Fallback to paginated REST calls
      periodSales = await fetchAllPages<SaleRecord>((from, to) =>
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
      [periodItems, periodPayments] = await Promise.all([
        fetchByIds<RawItem>(
          'sale_items', 'sale_id', saleIds,
          'sale_id, item_id, total_amount, is_service, description, returned, category_id',
        ),
        fetchByIds<RawPayment>(
          'payments', 'sale_id', saleIds,
          'sale_id, type, amount',
        ),
      ]);
    }

    // --- deposit-client data ---
    // The pure calculation cannot fetch per-client history, so when the caller did
    // not pre-supply deposit data we load it here via the single RPC.
    const depositData = preloadedDepositData ?? (await loadDepositClientData());

    return computeSalesFromData(
      dateRange,
      selectedLocation,
      periodSales,
      periodItems,
      periodPayments,
      poByMbId,
      poByNameNorm,
      poByCatId,
      depositData,
    );
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
