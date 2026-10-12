import { supabase } from '../lib/supabase';
import { fetchAllPages } from '../lib/fetchAllPages';
import type { MatchMethod, MatchStatus } from './campaignMatch';

export type ListSource = 'upload' | 'manual' | 'segment';

export interface ClientList {
  id: string;
  name: string;
  note: string;
  campaign_cost: number | null;
  source: ListSource;
  created_at: string;
  updated_at: string;
}

export interface ClientListSummary extends ClientList {
  people: number;
}

export interface ListMember {
  id: string;
  list_id: string;
  client_id: string | null;
  lead_at: string | null;
  input_name: string;
  input_phone: string;
  input_email: string;
  input_mindbody_id: string;
  match_method: MatchMethod;
  match_status: MatchStatus;
  candidate_ids: string[];
  rows_merged: number;
  position: number;
}

export type NewMember = Omit<ListMember, 'id' | 'list_id'>;

const LIST_COLUMNS = 'id, name, note, campaign_cost, source, created_at, updated_at';
const MEMBER_COLUMNS = 'id, list_id, client_id, lead_at, input_name, input_phone, input_email, input_mindbody_id, match_method, match_status, candidate_ids, rows_merged, position';
const INSERT_CHUNK = 500;

const toNumber = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

function toList(row: any): ClientList {
  return { ...row, campaign_cost: toNumber(row.campaign_cost) };
}

export async function loadLists(): Promise<ClientListSummary[]> {
  const { data, error } = await supabase
    .from('client_lists')
    .select(`${LIST_COLUMNS}, client_list_members(count)`)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => ({ ...toList(r), people: r.client_list_members?.[0]?.count ?? 0 }));
}

export async function loadList(id: string): Promise<{ list: ClientList; members: ListMember[] } | null> {
  const { data, error } = await supabase.from('client_lists').select(LIST_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const members = await fetchAllPages<ListMember>((from, to) => supabase
    .from('client_list_members').select(MEMBER_COLUMNS).eq('list_id', id)
    .order('position').order('id').range(from, to));
  return { list: toList(data), members };
}

export async function addMembers(listId: string, members: NewMember[]): Promise<ListMember[]> {
  const saved: ListMember[] = [];
  for (let i = 0; i < members.length; i += INSERT_CHUNK) {
    const { data, error } = await supabase
      .from('client_list_members')
      .insert(members.slice(i, i + INSERT_CHUNK).map(m => ({ ...m, list_id: listId })))
      .select(MEMBER_COLUMNS);
    if (error) throw new Error(error.message);
    saved.push(...((data || []) as ListMember[]));
  }
  return saved;
}

export async function createList(
  fields: { name: string; note: string; campaign_cost: number | null; source: ListSource },
  members: NewMember[],
): Promise<string> {
  const { data, error } = await supabase.from('client_lists').insert(fields).select('id').single();
  if (error) throw new Error(error.message);
  try {
    await addMembers(data.id, members);
  } catch (e) {
    await supabase.from('client_lists').delete().eq('id', data.id);
    throw e;
  }
  return data.id;
}

export async function updateList(id: string, patch: Partial<Pick<ClientList, 'name' | 'note' | 'campaign_cost'>>): Promise<void> {
  const { error } = await supabase.from('client_lists').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteList(id: string): Promise<void> {
  const { error } = await supabase.from('client_lists').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function updateMember(id: string, patch: Partial<Pick<ListMember, 'client_id' | 'match_method' | 'match_status'>>): Promise<void> {
  const { error } = await supabase.from('client_list_members').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteMember(id: string): Promise<void> {
  const { error } = await supabase.from('client_list_members').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export function clientsToMembers(clientIds: string[]): NewMember[] {
  return [...new Set(clientIds)].map((clientId, i) => ({
    client_id: clientId,
    lead_at: null,
    input_name: '',
    input_phone: '',
    input_email: '',
    input_mindbody_id: '',
    match_method: 'manual',
    match_status: 'matched',
    candidate_ids: [],
    rows_merged: 1,
    position: i + 1,
  }));
}
