import { fetchAllRows } from './fetchAllPages';

const MAX_AGE_MS = 10 * 60 * 1000;

let cached: { at: number; names: Promise<Record<string, string>> } | null = null;

// Shared across pages so the whole client list is read once per 10 minutes, not once per page.
export function loadClientNames(): Promise<Record<string, string>> {
  if (cached && Date.now() - cached.at < MAX_AGE_MS) return cached.names;
  const names = fetchAllRows<{ id: string; first_name: string | null; last_name: string | null }>('clients', 'id, first_name, last_name')
    .then(rows => Object.fromEntries(rows.map(c => [c.id, `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.id])));
  const entry = { at: Date.now(), names };
  cached = entry;
  names.catch(() => { if (cached === entry) cached = null; });
  return names;
}
