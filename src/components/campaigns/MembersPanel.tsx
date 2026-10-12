import { useEffect, useMemo, useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import type { ClientIndex } from '../../utils/campaignMatch';
import { addMembers, clientsToMembers, deleteMember, updateMember, type ListMember } from '../../utils/campaignLists';
import { loadCandidateStats, type CandidateStats } from '../../utils/campaignResults';
import { ClientPicker } from './ClientPicker';
import { MatchReview, type ReviewRow } from './MatchReview';

interface MembersPanelProps {
  listId: string;
  members: ListMember[];
  index: ClientIndex | null;
  onChange: (members: ListMember[]) => void;
}

export function MembersPanel({ listId, members, index, onChange }: MembersPanelProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const memberClientIds = useMemo(() => new Set(members.map(m => m.client_id).filter((id): id is string => !!id)), [members]);
  const [candidateStats, setCandidateStats] = useState<Map<string, CandidateStats> | null>(null);
  const [statsError, setStatsError] = useState(false);
  const candidateKey = useMemo(() => [...new Set(members.filter(m => m.match_status === 'ambiguous' || m.candidate_ids.length > 1).flatMap(m => m.candidate_ids))].sort().join(','), [members]);

  useEffect(() => {
    if (!candidateKey) return;
    let cancelled = false;
    setStatsError(false);
    loadCandidateStats(candidateKey.split(','))
      .then(stats => { if (!cancelled) setCandidateStats(stats); })
      .catch(() => { if (!cancelled) setStatsError(true); });
    return () => { cancelled = true; };
  }, [candidateKey]);

  const rows: ReviewRow[] = useMemo(() => members.map(m => {
    const client = m.client_id ? index?.clients.get(m.client_id) : undefined;
    return {
      key: m.id,
      name: m.input_name || client?.name || '',
      phone: m.input_phone || client?.phone || '',
      email: m.input_email || client?.email || '',
      leadAt: m.lead_at,
      rowsMerged: m.rows_merged,
      status: m.match_status,
      method: m.match_method,
      clientId: m.client_id,
      candidateIds: m.candidate_ids,
    };
  }), [members, index]);

  const run = async (key: string, action: () => Promise<ListMember[]>) => {
    setBusy(key);
    setError(null);
    try {
      onChange(await action());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the change.');
    } finally {
      setBusy(null);
    }
  };

  const resolve = (id: string, clientId: string | null) => run(id, async () => {
    const patch = clientId
      ? { client_id: clientId, match_status: 'matched' as const, match_method: 'manual' as const }
      : { client_id: null, match_status: 'skipped' as const, match_method: 'none' as const };
    await updateMember(id, patch);
    return members.map(m => (m.id === id ? { ...m, ...patch } : m));
  });

  const remove = (id: string) => run(id, async () => {
    await deleteMember(id);
    return members.filter(m => m.id !== id);
  });

  const add = (clientId: string) => run('add', async () => {
    const nextPosition = members.reduce((max, m) => Math.max(max, m.position), 0) + 1;
    const [member] = clientsToMembers([clientId]).map(m => ({ ...m, position: nextPosition }));
    const saved = await addMembers(listId, [member]);
    return [...members, ...saved];
  });

  if (!index) {
    return <div className="text-sm text-slate-500 flex items-center gap-2 py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" />Loading clients</div>;
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><UserPlus className="w-4 h-4 text-teal-600" />Add a client to this list</h3>
        <ClientPicker index={index} excludeIds={memberClientIds} onPick={c => add(c.id)} />
        {busy === 'add' && <div className="text-xs text-slate-500">Adding...</div>}
      </div>
      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {statsError && <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">Could not load visit and payment details for the possible clients.</div>}
      <MatchReview rows={rows} index={index} onResolve={resolve} onRemove={remove} busyKey={busy} candidateStats={candidateKey && !statsError ? candidateStats ?? 'loading' : undefined} />
    </div>
  );
}
