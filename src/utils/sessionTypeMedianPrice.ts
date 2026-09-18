const MIN_SAMPLE_SIZE = 10;

export interface MedianEntry {
  median: number;
  sampleSize: number;
  sufficient: boolean;
}

export interface ResolvedVisitInput {
  session_type_id: string;
  effective_price: number;
}

export function getSessionTypeMedianPrices(
  resolvedVisits: ResolvedVisitInput[],
): Map<string, MedianEntry> {
  const groups = new Map<string, number[]>();

  for (const v of resolvedVisits) {
    let arr = groups.get(v.session_type_id);
    if (!arr) {
      arr = [];
      groups.set(v.session_type_id, arr);
    }
    arr.push(v.effective_price);
  }

  const result = new Map<string, MedianEntry>();

  for (const [stId, prices] of groups) {
    const sufficient = prices.length >= MIN_SAMPLE_SIZE;
    const sorted = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

    result.set(stId, { median, sampleSize: prices.length, sufficient });
  }

  return result;
}
