import { useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Trash2, UserPlus } from 'lucide-react';
import type { ClientIndex } from '../../utils/campaignMatch';
import { clientsToMembers, createList } from '../../utils/campaignLists';
import { ClientLabel, ClientPicker } from './ClientPicker';
import { SaveListForm } from './SaveListForm';

interface ManualBuilderProps {
  index: ClientIndex | null;
  onCancel: () => void;
  onSaved: (listId: string) => void;
}

export function ManualBuilder({ index, onCancel, onSaved }: ManualBuilderProps) {
  const [ids, setIds] = useState<string[]>([]);
  const chosen = useMemo(() => new Set(ids), [ids]);

  return (
    <div className="space-y-5">
      <button onClick={onCancel} className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1.5">
        <ArrowLeft className="w-4 h-4" />Back to lists
      </button>
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2"><UserPlus className="w-5 h-5 text-teal-600" />Add clients</h3>
          <p className="text-sm text-slate-500 mt-1">Search by name, phone or email and click a client to add them.</p>
        </div>
        {index ? <ClientPicker index={index} excludeIds={chosen} autoFocus onPick={c => setIds(prev => [...prev, c.id])} />
          : <div className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading clients</div>}
        {ids.length > 0 && index && (
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
            {ids.map(id => (
              <div key={id} className="px-3 py-2 flex items-center justify-between gap-3">
                <ClientLabel client={index.clients.get(id)} id={id} />
                <button onClick={() => setIds(prev => prev.filter(x => x !== id))} className="text-slate-400 hover:text-rose-600 transition-colors" aria-label="Remove">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <SaveListForm
        disabled={ids.length === 0}
        hint={ids.length === 0 ? 'Add at least one client.' : `${ids.length} clients`}
        onSave={fields => createList({ ...fields, source: 'manual' }, clientsToMembers(ids))}
        onSaved={onSaved}
      />
    </div>
  );
}
