import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Pencil, Trash2, X, Save } from 'lucide-react';
import { deleteList, loadList, updateList, type ClientList, type ListMember } from '../../utils/campaignLists';
import type { ClientIndex } from '../../utils/campaignMatch';
import { formatEur } from '../../utils/ownerFormat';
import { ResultsPanel } from './ResultsPanel';
import { MembersPanel } from './MembersPanel';
import { inputClass, parseCost } from './SaveListForm';
import { SOURCE_LABELS } from './ListsOverview';
import { CopyLinkButton } from '../CopyLinkButton';
import { memberViewParams, parseMemberView, type MemberView } from '../../utils/memberView';

interface ListDetailProps {
  listId: string;
  index: ClientIndex | null;
  onBack: () => void;
  onDeleted: () => void;
  onViewClient?: (clientId: string) => void;
  urlParams: Record<string, string>;
  onParamsChange: (params: Record<string, string>) => void;
}

type Tab = 'results' | 'members';

export function ListDetail({ listId, index, onBack, onDeleted, onViewClient, urlParams, onParamsChange }: ListDetailProps) {
  const [list, setList] = useState<ClientList | null>(null);
  const [members, setMembers] = useState<ListMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTabState] = useState<Tab>(urlParams.tab === 'members' ? 'members' : 'results');
  const [memberView, setMemberViewState] = useState<MemberView>(() => parseMemberView(urlParams));
  const [editing, setEditing] = useState(false);
  const linkParams = { list: listId, ...(tab === 'members' ? { tab } : {}), ...memberViewParams(memberView) };
  const publish = (t: Tab, v: MemberView) => onParamsChange({ list: listId, ...(t === 'members' ? { tab: t } : {}), ...memberViewParams(v) });
  const setTab = (t: Tab) => { setTabState(t); publish(t, memberView); };
  const setMemberView = (v: MemberView) => { setMemberViewState(v); publish(tab, v); };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadList(listId)
      .then(res => {
        if (cancelled) return;
        if (!res) { setError('This list no longer exists.'); return; }
        setList(res.list);
        setMembers(res.members);
      })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [listId]);

  const remove = async () => {
    if (!list || !window.confirm(`Delete the list "${list.name}"? This cannot be undone.`)) return;
    try {
      await deleteList(list.id);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the list.');
    }
  };

  const back = (
    <button onClick={onBack} className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1.5 print:hidden">
      <ArrowLeft className="w-4 h-4" />All lists
    </button>
  );

  if (loading) return <div className="space-y-5">{back}<div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-teal-600" /></div></div>;
  if (!list) return <div className="space-y-5">{back}<div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">{error}</div></div>;

  const pending = members.filter(m => m.match_status === 'ambiguous' || m.match_status === 'not_found').length;

  return (
    <div className="space-y-5">
      {back}
      <div className="bg-white border border-slate-200 rounded-xl p-5 print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xl font-bold text-slate-900">{list.name}</h3>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{SOURCE_LABELS[list.source]}</span>
            </div>
            {list.note && <p className="text-sm text-slate-600 mt-1 whitespace-pre-line">{list.note}</p>}
            <div className="text-sm text-slate-500 mt-2 flex flex-wrap gap-x-5 gap-y-1">
              <span>{members.length} people</span>
              <span>Campaign cost: {list.campaign_cost === null ? 'not set' : formatEur(list.campaign_cost)}</span>
              <span>Created {new Date(list.created_at).toLocaleDateString('en-GB')}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <CopyLinkButton section="campaigns" params={linkParams} />
            <button onClick={() => setEditing(true)} className="px-3 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 transition-colors">
              <Pencil className="w-4 h-4" />Edit
            </button>
            <button onClick={remove} className="px-3 py-2 text-sm font-medium text-rose-700 border border-rose-200 rounded-lg hover:bg-rose-50 flex items-center gap-1.5 transition-colors">
              <Trash2 className="w-4 h-4" />Delete
            </button>
          </div>
        </div>
        <div className="flex gap-6 mt-5 border-b border-slate-200 -mb-5 -mx-5 px-5">
          {([['results', 'Results'], ['members', 'Members']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`pb-3 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${tab === id ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {label}
              {id === 'members' && pending > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">{pending} to check</span>}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      {tab === 'results'
        ? <ResultsPanel list={list} members={members} onViewClient={onViewClient} />
        : <MembersPanel listId={list.id} members={members} index={index} onChange={setMembers}
            listName={list.name} view={memberView} onViewChange={setMemberView} />}

      {editing && <EditListDialog list={list} onClose={() => setEditing(false)} onSaved={l => { setList(l); setEditing(false); }} />}
    </div>
  );
}

function EditListDialog({ list, onClose, onSaved }: { list: ClientList; onClose: () => void; onSaved: (l: ClientList) => void }) {
  const [name, setName] = useState(list.name);
  const [note, setNote] = useState(list.note);
  const [cost, setCost] = useState(list.campaign_cost === null ? '' : String(list.campaign_cost));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const parsed = parseCost(cost);
    if (!name.trim()) { setError('The name cannot be empty.'); return; }
    if (parsed === 'invalid') { setError('Campaign cost must be a number, 0 or more.'); return; }
    setSaving(true);
    try {
      const patch = { name: name.trim(), note: note.trim(), campaign_cost: parsed };
      await updateList(list.id, patch);
      onSaved({ ...list, ...patch });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Edit list</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <label className="block"><span className="text-sm font-medium text-slate-700">Name</span>
          <input value={name} onChange={e => setName(e.target.value)} className={`${inputClass} mt-1`} /></label>
        <label className="block"><span className="text-sm font-medium text-slate-700">Campaign cost, €</span>
          <input value={cost} onChange={e => setCost(e.target.value)} inputMode="decimal" placeholder="Not set" className={`${inputClass} mt-1`} /></label>
        <label className="block"><span className="text-sm font-medium text-slate-700">Note</span>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} className={`${inputClass} mt-1 resize-y`} /></label>
        {error && <div className="text-sm text-rose-700">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save
          </button>
        </div>
      </div>
    </div>
  );
}
