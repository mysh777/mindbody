import { supabase } from './supabase';

const PAGE_SIZE = 1000;

// Supabase caps every response at 1000 rows; the builder must apply a stable order so pages never overlap.
export async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

type FilterBuilder = ReturnType<ReturnType<typeof supabase.from>['select']>;

// Loads every row of a reference table page by page, ordered by id; `filter` narrows the rows before paging.
export function fetchAllRows<T>(
  table: string,
  columns: string,
  filter: (q: FilterBuilder) => FilterBuilder = q => q,
): Promise<T[]> {
  return fetchAllPages<T>((from, to) =>
    filter(supabase.from(table).select(columns)).order('id').range(from, to) as unknown as PromiseLike<{ data: T[] | null; error: { message: string } | null }>);
}
