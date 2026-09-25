export type PriceSource = 'actual' | 'direct_sale_item' | 'catalog_approximate' | 'session_type_estimate' | 'no_data';

export interface ResolvedPrice {
  price: number;
  source: PriceSource;
}

interface ServiceInput {
  id: string;
  mindbody_id?: string | null;
  pricing_option_id: string | null;
  payment_date: string | null;
  active_date: string | null;
  session_type_id?: string | null;
}

interface PricingOptionInput {
  id: string;
  mindbody_id: string;
  price: number | null;
}

interface SaleItemInput {
  item_id: string;
  sale_id: string;
  total_amount: number | null;
  payment_ref_id?: string | number | null;
}

interface SaleDateInput {
  id: string;
  sale_datetime: string | null;
}

export function resolveServicePrices(
  services: ServiceInput[],
  pricingOptions: PricingOptionInput[],
  saleItems: SaleItemInput[],
  sales: SaleDateInput[],
  sessionTypeMedians?: Map<string, { median: number; sufficient: boolean }>,
): Map<string, ResolvedPrice> {
  const result = new Map<string, ResolvedPrice>();

  const poById = new Map<string, PricingOptionInput>();
  for (const po of pricingOptions) {
    poById.set(po.id, po);
  }

  const saleDateById = new Map<string, number>();
  for (const s of sales) {
    if (s.sale_datetime) saleDateById.set(s.id, new Date(s.sale_datetime).getTime());
  }

  const itemsByMindbodyId = new Map<string, { total_amount: number; saleTime: number }[]>();
  for (const si of saleItems) {
    if (!si.item_id || si.total_amount == null) continue;
    const saleTime = saleDateById.get(si.sale_id);
    if (saleTime === undefined) continue;
    let arr = itemsByMindbodyId.get(si.item_id);
    if (!arr) {
      arr = [];
      itemsByMindbodyId.set(si.item_id, arr);
    }
    arr.push({ total_amount: Number(si.total_amount), saleTime });
  }

  // Direct lookup: payment_ref_id -> sale_item amount
  const amountByPaymentRef = new Map<string, number>();
  for (const si of saleItems) {
    if (si.payment_ref_id != null && si.total_amount != null) {
      amountByPaymentRef.set(String(si.payment_ref_id), Number(si.total_amount));
    }
  }

  for (const svc of services) {
    if (!svc.pricing_option_id) {
      const estimate = trySessionTypeEstimate(svc.session_type_id, sessionTypeMedians);
      if (estimate) {
        result.set(svc.id, estimate);
      } else {
        result.set(svc.id, { price: 0, source: 'no_data' });
      }
      continue;
    }

    const po = poById.get(svc.pricing_option_id);
    if (!po) {
      const estimate = trySessionTypeEstimate(svc.session_type_id, sessionTypeMedians);
      if (estimate) {
        result.set(svc.id, estimate);
      } else {
        result.set(svc.id, { price: 0, source: 'no_data' });
      }
      continue;
    }

    // Priority 1: direct match via payment_ref_id = client_services.mindbody_id
    if (svc.mindbody_id) {
      const directAmount = amountByPaymentRef.get(svc.mindbody_id);
      if (directAmount !== undefined) {
        result.set(svc.id, { price: directAmount, source: 'actual' });
        continue;
      }
    }

    // Priority 2: heuristic — closest sale_item by date for same pricing option
    const candidates = itemsByMindbodyId.get(po.mindbody_id);
    if (candidates && candidates.length > 0) {
      const refDate = svc.payment_date || svc.active_date;
      const refTime = refDate ? new Date(refDate).getTime() : null;

      let best = candidates[0];
      if (refTime !== null) {
        let bestDiff = Math.abs(best.saleTime - refTime);
        for (let i = 1; i < candidates.length; i++) {
          const diff = Math.abs(candidates[i].saleTime - refTime);
          if (diff < bestDiff) {
            bestDiff = diff;
            best = candidates[i];
          }
        }
      }
      result.set(svc.id, { price: best.total_amount, source: 'actual' });
    } else if (po.price != null) {
      result.set(svc.id, { price: Number(po.price), source: 'catalog_approximate' });
    } else {
      const estimate = trySessionTypeEstimate(svc.session_type_id, sessionTypeMedians);
      if (estimate) {
        result.set(svc.id, estimate);
      } else {
        result.set(svc.id, { price: 0, source: 'no_data' });
      }
    }
  }

  return result;
}

function trySessionTypeEstimate(
  sessionTypeId: string | null | undefined,
  medians?: Map<string, { median: number; sufficient: boolean }>,
): ResolvedPrice | null {
  if (!sessionTypeId || !medians) return null;
  const entry = medians.get(sessionTypeId);
  if (!entry || !entry.sufficient) return null;
  return { price: entry.median, source: 'session_type_estimate' };
}
