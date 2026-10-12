import { useState } from 'react';
import { ArrowRight, Check, ListPlus, Loader2, X } from 'lucide-react';
import { clientsToMembers, createList } from '../../utils/campaignLists';

interface SaveAsListButtonProps {
  clientIds: string[];
  defaultName: string;
  onOpenList?: (listId: string) => void;
}

export function SaveAsListButton({ clientIds, defaultName, onOpenList }: SaveAsListButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) { setError('Give the list a name.'); return; }
    setSaving(true);
    setError(null);
    try {
      setSavedId(await createList({ name: name.trim(), note: '', campaign_cost: null, source: 'segment' }, clientsToMembers(clientIds)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the list.');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => { setOpen(false); setSavedId(null); setError(null); setName(defaultName); };

  return (
    <div className="relative">
      <button
        onClick={() => (open ? reset() : setOpen(true))}
        disabled={clientIds.length === 0}
        className="px-4 py-2 bg-white text-teal-700 border border-teal-600 rounded-lg text-sm font-medium hover:bg-teal-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
      >
        <ListPlus className="w-4 h-4" />
        Save as list
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900">{savedId ? 'List saved' : `Save ${clientIds.length} clients as a list`}</span>
            <button onClick={reset} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X className="w-4 h-4" /></button>
          </div>
          {savedId ? (
            <>
              <p className="text-sm text-slate-600 flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />"{name.trim()}" is now on the Campaigns page.</p>
              {onOpenList && (
                <button onClick={() => onOpenList(savedId)} className="w-full px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 flex items-center justify-center gap-2 transition-colors">
                  Open in Campaigns<ArrowRight className="w-4 h-4" />
                </button>
              )}
            </>
          ) : (
            <>
              <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              {error && <p className="text-xs text-rose-700">{error}</p>}
              <button onClick={save} disabled={saving} className="w-full px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}Save
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
