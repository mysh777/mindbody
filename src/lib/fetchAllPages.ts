import { supabase } from './supabase';

const PAGE_SIZE = 1000;
const MAX_TIMEOUT_RETRIES = 2;

const isTimeoutError = (message: string) => /statement timeout|57014/i.test(message);

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

// Database timeouts are transient when several pages load at once, so a timed-out page is retried with backoff.
async function fetchPage<T>(build: (from: number, to: number) => PromiseLike<PageResult<T>>, from: number) {
  let result = await build(from, from + PAGE_SIZE - 1);
  for (let attempt = 1; attempt <= MAX_TIMEOUT_RETRIES && result.error && isTimeoutError(result.error.message); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    result = await build(from, from + PAGE_SIZE - 1);
  }
  return result;
}

// Supabase caps every response at 1000 rows; the builder must apply a stable order so pages never overlap.
export async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(build, from);
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
