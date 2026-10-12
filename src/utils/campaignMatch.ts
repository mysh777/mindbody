import { fetchAllRows } from '../lib/fetchAllPages';
import { SYSTEM_CLIENT_ID } from './clientSegments';

export type MatchMethod = 'mindbody_id' | 'email' | 'phone' | 'name' | 'manual' | 'none';
export type MatchStatus = 'matched' | 'ambiguous' | 'not_found' | 'skipped';

// Lowercase, single spaces, diacritics dropped (ā→a, č→c, ē→e, ģ→g, ī→i, ķ→k, ļ→l, ņ→n, š→s, ū→u, ž→z).
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Last 8 digits after dropping 00 / +371 / 371; shorter numbers are not used for matching.
export function phoneKey(raw: string | null | undefined): string | null {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('371') && digits.length > 8) digits = digits.slice(3);
  return digits.length >= 8 ? digits.slice(-8) : null;
}

export interface IndexedClient {
  id: string;
  mindbodyId: string;
  name: string;
  email: string;
  phone: string;
  phones: string[];
  phoneKeys: string[];
  fullNorm: string;
  reversedNorm: string;
  firstNorm: string;
}

export type CandidateMatchField = 'both' | 'phone' | 'email' | 'name';

const FIELD_RANK: Record<CandidateMatchField, number> = { both: 0, phone: 1, email: 2, name: 3 };

export function rankCandidates(ids: string[], index: ClientIndex, phone: string, email: string) {
  const key = phoneKey(phone);
  const mail = email.trim().toLowerCase();
  const candidates = ids.map((id, i) => {
    const c = index.clients.get(id);
    const byPhone = !!c && !!key && c.phoneKeys.includes(key);
    const byEmail = !!c && !!mail && c.email === mail;
    const field: CandidateMatchField = byPhone && byEmail ? 'both' : byPhone ? 'phone' : byEmail ? 'email' : 'name';
    return { id, i, field };
  }).sort((a, b) => FIELD_RANK[a.field] - FIELD_RANK[b.field] || a.i - b.i);
  const phoneIds = candidates.filter(c => c.field === 'phone' || c.field === 'both').map(c => c.id);
  const emailIds = candidates.filter(c => c.field === 'email' || c.field === 'both').map(c => c.id);
  const sharedContacts = phoneIds.some(p => emailIds.some(e => e !== p));
  return { candidates, sharedContacts };
}

export interface ClientIndex {
  clients: Map<string, IndexedClient>;
  byMindbodyId: Map<string, IndexedClient[]>;
  byEmail: Map<string, IndexedClient[]>;
  byPhone: Map<string, IndexedClient[]>;
  byFullName: Map<string, IndexedClient[]>;
  byFirstName: Map<string, IndexedClient[]>;
}

interface ClientRow {
  id: string;
  mindbody_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  mobile_phone: string | null;
  home_phone: string | null;
  work_phone: string | null;
}

function push<K, V>(map: Map<K, V[]>, key: K | null | undefined, value: V) {
  if (!key) return;
  const list = map.get(key);
  if (!list) map.set(key, [value]);
  else if (!list.includes(value)) list.push(value);
}

export async function loadClientIndex(excludedIds: string[]): Promise<ClientIndex> {
  const rows = await fetchAllRows<ClientRow>('clients',
    'id, mindbody_id, first_name, last_name, email, mobile_phone, home_phone, work_phone:raw_data->>WorkPhone');
  const excluded = new Set([SYSTEM_CLIENT_ID, ...excludedIds]);
  const index: ClientIndex = {
    clients: new Map(), byMindbodyId: new Map(), byEmail: new Map(), byPhone: new Map(), byFullName: new Map(), byFirstName: new Map(),
  };
  for (const r of rows) {
    if (excluded.has(r.id)) continue;
    const first = (r.first_name || '').trim();
    const last = (r.last_name || '').trim();
    if (normalizeText(`${first} ${last}`).startsWith('privats klients')) continue;
    const phones = [r.mobile_phone, r.home_phone, r.work_phone];
    const c: IndexedClient = {
      id: r.id,
      mindbodyId: r.mindbody_id || '',
      name: `${first} ${last}`.trim() || `Client ${r.id}`,
      email: (r.email || '').trim().toLowerCase(),
      phone: phones.find(p => p && p.trim()) || '',
      phones: [...new Set(phones.map(p => (p || '').trim()).filter(Boolean))],
      phoneKeys: [...new Set(phones.map(phoneKey).filter((k): k is string => !!k))],
      fullNorm: normalizeText(`${first} ${last}`),
      reversedNorm: normalizeText(`${last} ${first}`),
      firstNorm: normalizeText(first).split(' ')[0] || '',
    };
    index.clients.set(c.id, c);
    push(index.byMindbodyId, c.id, c);
    push(index.byMindbodyId, c.mindbodyId, c);
    push(index.byEmail, c.email, c);
    c.phoneKeys.forEach(k => push(index.byPhone, k, c));
    push(index.byFullName, c.fullNorm, c);
    push(index.byFullName, c.reversedNorm, c);
    push(index.byFirstName, c.firstNorm, c);
  }
  return index;
}

export interface MatchInput {
  name: string;
  phone: string;
  email: string;
  mindbodyId: string;
}

export interface MatchResult {
  status: MatchStatus;
  method: MatchMethod;
  clientId: string | null;
  candidateIds: string[];
  firstNameOnly: boolean;
}

const MAX_CANDIDATES = 25;

function decide(found: IndexedClient[] | undefined, method: MatchMethod): MatchResult | null {
  if (!found || found.length === 0) return null;
  if (found.length === 1) return { status: 'matched', method, clientId: found[0].id, candidateIds: [], firstNameOnly: false };
  return { status: 'ambiguous', method, clientId: null, candidateIds: found.slice(0, MAX_CANDIDATES).map(c => c.id), firstNameOnly: false };
}

// Order: Mindbody ID, email, phone, full name. A first name alone is never matched automatically.
export function matchPerson(p: MatchInput, index: ClientIndex): MatchResult {
  const byId = p.mindbodyId ? decide(index.byMindbodyId.get(p.mindbodyId.trim()), 'mindbody_id') : null;
  if (byId) return byId;
  const byEmail = p.email ? decide(index.byEmail.get(p.email.trim().toLowerCase()), 'email') : null;
  if (byEmail) return byEmail;
  const key = phoneKey(p.phone);
  const byPhone = key ? decide(index.byPhone.get(key), 'phone') : null;
  if (byPhone) return byPhone;

  const name = normalizeText(p.name);
  if (name.includes(' ')) {
    const byName = decide(index.byFullName.get(name), 'name');
    if (byName) return byName;
  } else if (name) {
    const candidates = index.byFirstName.get(name) ?? [];
    if (candidates.length > 0) {
      return { status: 'ambiguous', method: 'name', clientId: null, candidateIds: candidates.slice(0, MAX_CANDIDATES).map(c => c.id), firstNameOnly: true };
    }
  }
  return { status: 'not_found', method: 'none', clientId: null, candidateIds: [], firstNameOnly: false };
}

export function searchClients(index: ClientIndex, query: string, limit = 20): IndexedClient[] {
  const q = normalizeText(query);
  if (q.length < 2) return [];
  const digits = query.replace(/\D/g, '');
  const out: IndexedClient[] = [];
  for (const c of index.clients.values()) {
    const hit = c.fullNorm.includes(q) || c.reversedNorm.includes(q) || (c.email && c.email.includes(q))
      || (digits.length >= 4 && c.phoneKeys.some(k => k.includes(digits.slice(-8)))) || c.id === query.trim();
    if (hit) out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}
