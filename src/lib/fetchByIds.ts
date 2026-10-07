import { supabase } from './supabase';
import { fetchAllPages } from './fetchAllPages';

// Long .in() lists overflow the request URL, so ids go out in small chunks.
export const ID_CHUNK_SIZE = 100;
const PARALLEL_REQUESTS = 6;

export function chunkIds<T>(ids: T[], size = ID_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

// Runs fn over items with limited parallelism; results keep the input order.
export async function mapLimited<T, R>(items: T[], fn: (item: T) => Promise<R>, limit = PARALLEL_REQUESTS): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function fetchByIds<T>(
  table: string,
  column: string,
  ids: (string | number)[],
  select: string,
  configure: (q: any) => any = q => q,
  orderColumn = 'id',
): Promise<T[]> {
  const unique = [...new Set(ids.filter(id => id != null && id !== ''))];
  const batches = await mapLimited(chunkIds(unique), batch => fetchAllPages<T>((from, to) =>
    configure(supabase.from(table).select(select).in(column, batch)).order(orderColumn).range(from, to)));
  return batches.flat();
}
