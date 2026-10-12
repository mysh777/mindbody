import { useEffect, useState } from 'react';
import { ChevronRight, FileSpreadsheet, Loader2, Megaphone, PieChart, Upload, UserPlus, Users } from 'lucide-react';
import { loadLists, type ClientListSummary, type ListSource } from '../../utils/campaignLists';
import { formatEur } from '../../utils/ownerFormat';

export const SOURCE_LABELS: Record<ListSource, string> = {
  upload: 'Uploaded file',
  manual: 'Added manually',
  segment: 'From Client Segments',
};

const SOURCE_ICONS = { upload: FileSpreadsheet, manual: UserPlus, segment: PieChart };

interface ListsOverviewProps {
  onOpen: (listId: string) => void;
  onUpload: () => void;
  onManual: () => void;
}

export function ListsOverview({ onOpen, onUpload, onManual }: ListsOverviewProps) {
  const [lists, setLists] = useState<ClientListSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLists().then(setLists).catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-4">
        <ActionCard icon={Upload} title="Upload a list" text="Excel or CSV with lead dates, names, phones or emails. We match each row to a client." onClick={onUpload} />
        <ActionCard icon={UserPlus} title="Pick clients manually" text="Search clients by name, phone or email and build a list by hand." onClick={onManual} />
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">Could not load lists: {error}</div>}

      {!lists && !error && <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-teal-600" /></div>}

      {lists && lists.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl py-16 px-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto"><Megaphone className="w-7 h-7" /></div>
          <h3 className="text-base font-semibold text-slate-900 mt-4">No lists yet</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
            Upload the leads from an ad campaign, pick clients by hand, or use "Save as list" on any segment in Client Segments.
          </p>
        </div>
      )}

      {lists && lists.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
          {lists.map(l => {
            const Icon = SOURCE_ICONS[l.source];
            return (
              <button key={l.id} onClick={() => onOpen(l.id)} className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors group">
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 group-hover:bg-teal-50 group-hover:text-teal-700 transition-colors">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{l.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">
                    {[SOURCE_LABELS[l.source], new Date(l.created_at).toLocaleDateString('en-GB'), l.campaign_cost !== null && `Cost ${formatEur(l.campaign_cost)}`, l.note].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="text-sm text-slate-600 flex items-center gap-1.5 shrink-0"><Users className="w-4 h-4 text-slate-400" />{l.people}</div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-teal-600 group-hover:translate-x-0.5 transition-all" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActionCard({ icon: Icon, title, text, onClick }: { icon: typeof Upload; title: string; text: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left bg-white border border-slate-200 rounded-xl p-5 flex gap-4 hover:border-teal-400 hover:shadow-md transition-all group">
      <div className="w-11 h-11 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-base font-semibold text-slate-900">{title}</div>
        <div className="text-sm text-slate-500 mt-1 leading-relaxed">{text}</div>
      </div>
    </button>
  );
}
