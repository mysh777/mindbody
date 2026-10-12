import { normalizeText, type ClientIndex, type MatchMethod, type MatchStatus } from './campaignMatch';

export type MemberFilter = 'attention' | 'matched' | 'all';
export type MemberSortKey = 'name' | 'leadAt' | 'status' | 'client' | 'candidates';
export type SortDir = 'asc' | 'desc';

export interface MemberView {
  query: string;
  sortKey: MemberSortKey | null;
  sortDir: SortDir;
  filter: MemberFilter | null;
}

export interface MemberRowLike {
  key: string;
  name: string;
  phone: string;
  email: string;
  leadAt: string | null;
  status: MatchStatus;
  method: MatchMethod;
  clientId: string | null;
  candidateIds: string[];
}

const SORT_KEYS: MemberSortKey[] = ['name', 'leadAt', 'status', 'client', 'candidates'];
const FILTERS: MemberFilter[] = ['attention', 'matched', 'all'];

export function parseMemberView(params: Record<string, string>): MemberView {
  const sortKey = SORT_KEYS.includes(params.sort as MemberSortKey) ? params.sort as MemberSortKey : null;
  return {
    query: params.q ?? '',
    sortKey,
    sortDir: params.dir === 'desc' ? 'desc' : 'asc',
    filter: FILTERS.includes(params.show as MemberFilter) ? params.show as MemberFilter : null,
  };
}

export function memberViewParams(v: MemberView): Record<string, string> {
  const p: Record<string, string> = {};
  if (v.query) p.q = v.query;
  if (v.sortKey) { p.sort = v.sortKey; p.dir = v.sortDir; }
  if (v.filter) p.show = v.filter;
  return p;
}

export const needsDecision = (r: Pick<MemberRowLike, 'status'>) => r.status === 'ambiguous' || r.status === 'not_found';

const MATCHED_LABELS: Record<MatchMethod, string> = {
  mindbody_id: 'Matched by Mindbody ID',
  email: 'Matched by email',
  phone: 'Matched by phone',
  name: 'Matched by full name',
  manual: 'Matched, picked manually',
  none: 'Matched',
};

export function memberStatusLabel(r: MemberRowLike): string {
  if (r.status === 'matched') return MATCHED_LABELS[r.method];
  if (r.status === 'skipped') return 'Skipped, not a client';
  if (r.status === 'not_found') return 'Not found, check';
  if (r.method === 'name' && !r.name.trim().includes(' ')) return 'First name only, check';
  return `${r.candidateIds.length} possible clients, check`;
}

// Strips 00 / 371 country prefixes so "+371 29866562" and "29866562" compare equal.
function localDigits(s: string): string {
  let d = s.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('371') && d.length > 8) d = d.slice(3);
  return d;
}

export function matchesQuery(r: MemberRowLike, query: string, index: ClientIndex): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const client = r.clientId ? index.clients.get(r.clientId) : undefined;
  const phones = [r.phone, ...(client?.phones ?? [])];
  if (/^[\d\s+()-]+$/.test(query.trim())) {
    const raw = query.replace(/\D/g, '');
    const local = localDigits(query);
    if (raw.length >= 3) {
      if (phones.some(p => localDigits(p).includes(local) || p.replace(/\D/g, '').includes(raw))) return true;
      if (r.clientId?.includes(raw)) return true;
    }
  }
  const hay = normalizeText([
    r.name, r.phone, r.email, client?.name, r.clientId, ...(client?.phones ?? []), client?.email, memberStatusLabel(r),
  ].filter(Boolean).join(' | '));
  return q.split(' ').every(word => hay.includes(word));
}

const textKey = (s: string) => normalizeText(s);

function compareValues(a: string | number | null, b: string | number | null, dir: SortDir): number {
  const emptyA = a === null || a === '';
  const emptyB = b === null || b === '';
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
  const c = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'en');
  return dir === 'asc' ? c : -c;
}

function sortValue(r: MemberRowLike, key: MemberSortKey, index: ClientIndex): string | number | null {
  switch (key) {
    case 'name': return textKey(r.name);
    case 'leadAt': return r.leadAt;
    case 'status': return textKey(memberStatusLabel(r));
    case 'client': return r.clientId ? textKey(index.clients.get(r.clientId)?.name ?? r.clientId) : null;
    case 'candidates': return r.candidateIds.length;
  }
}

export function defaultOrder(a: MemberRowLike, b: MemberRowLike): number {
  const group = Number(needsDecision(b)) - Number(needsDecision(a));
  return group || compareValues(a.leadAt, b.leadAt, 'asc');
}

// `frozen` holds each row as it was when the view was last arranged, so a decision does not move the row; status sorting uses live rows.
export function arrangeMembers<R extends MemberRowLike>(rows: R[], view: MemberView, index: ClientIndex, frozen: (r: R) => R): R[] {
  const filter = view.filter ?? 'all';
  const kept = rows.map((r, i) => ({ r, f: frozen(r), i })).filter(({ f }) =>
    (filter === 'all' || (filter === 'matched' ? f.status === 'matched' : needsDecision(f))) && matchesQuery(f, view.query, index));
  const key = view.sortKey;
  kept.sort((a, b) => {
    if (key) {
      const sa = key === 'status' ? a.r : a.f;
      const sb = key === 'status' ? b.r : b.f;
      const c = compareValues(sortValue(sa, key, index), sortValue(sb, key, index), view.sortDir);
      if (c) return c;
    }
    return defaultOrder(a.f, b.f) || a.i - b.i;
  });
  return kept.map(k => k.r);
}

export function nextSort(view: MemberView, key: MemberSortKey): Pick<MemberView, 'sortKey' | 'sortDir'> {
  if (view.sortKey !== key) return { sortKey: key, sortDir: 'asc' };
  if (view.sortDir === 'asc') return { sortKey: key, sortDir: 'desc' };
  return { sortKey: null, sortDir: 'asc' };
}
