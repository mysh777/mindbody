import { useState } from 'react';
import { Save, Loader2 } from 'lucide-react';

export interface ListFields {
  name: string;
  note: string;
  campaign_cost: number | null;
}

interface SaveListFormProps {
  defaultName?: string;
  hint?: string;
  disabled?: boolean;
  onSave: (fields: ListFields) => Promise<string>;
  onSaved: (listId: string) => void;
}

export const parseCost = (raw: string): number | null | 'invalid' => {
  const t = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 'invalid';
};

export const inputClass = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500';

export function SaveListForm({ defaultName = '', hint, disabled, onSave, onSaved }: SaveListFormProps) {
  const [name, setName] = useState(defaultName);
  const [note, setNote] = useState('');
  const [cost, setCost] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const parsedCost = parseCost(cost);
    if (!name.trim()) { setError('Give the list a name.'); return; }
    if (parsedCost === 'invalid') { setError('Campaign cost must be a number, 0 or more.'); return; }
    setSaving(true);
    setError(null);
    try {
      onSaved(await onSave({ name: name.trim(), note: note.trim(), campaign_cost: parsedCost }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the list.');
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <h3 className="text-base font-semibold text-slate-900">Save the list</h3>
      <div className="grid md:grid-cols-[2fr_1fr] gap-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Meta Ads - September 2026" className={`${inputClass} mt-1`} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Campaign cost, € <span className="text-slate-400 font-normal">(optional)</span></span>
          <input value={cost} onChange={e => setCost(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputClass} mt-1`} />
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Note <span className="text-slate-400 font-normal">(optional)</span></span>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={`${inputClass} mt-1 resize-y`} />
      </label>
      {error && <div className="text-sm text-rose-700">{error}</div>}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs text-slate-500">{hint}</span>
        <button onClick={submit} disabled={saving || disabled}
          className="px-5 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save list
        </button>
      </div>
    </div>
  );
}
