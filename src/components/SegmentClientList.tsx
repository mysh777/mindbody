import { ChevronRight, Download, FileSpreadsheet, Mail, MessageSquare, Star, X } from 'lucide-react';
import { formatApptDate } from '../utils/formatDateTime';
import { exportToCsv, exportToExcel } from '../utils/exportExcel';
import { buildMetaRows, type SegmentClient } from '../utils/clientSegments';

export interface ListEntry {
  clientId: string;
  visitsInPeriod: number;
  lastVisit: string | null;
}

interface SegmentClientListProps {
  title: string;
  scenario: string | null;
  entries: ListEntry[];
  clients: Map<string, SegmentClient>;
  exportName: string;
  onClose: () => void;
  onViewClient?: (clientId: string) => void;
}

// Meta Ads audience export is switched off; set to true to bring back the button, ad captions and consent column.
export const SHOW_META_EXPORT = false;

const META_COLUMNS = ['email', 'phone', 'fn', 'ln', 'country'];

export function SegmentClientList({ title, scenario, entries, clients, exportName, onClose, onViewClient }: SegmentClientListProps) {
  const metaRows = SHOW_META_EXPORT ? buildMetaRows(entries.map(e => e.clientId), clients) : [];

  const handleExportExcel = () => {
    const rows = entries.flatMap(e => {
      const c = clients.get(e.clientId);
      if (!c) return [];
      return [{
        'Client': `${c.firstName} ${c.lastName}`.trim(),
        'Phone': c.phone,
        'Email': c.email,
        'Visits': e.visitsInPeriod,
        'Last visit': e.lastVisit ? formatApptDate(e.lastVisit) : '',
        'Active package': c.activePackage ?? '',
      }];
    });
    exportToExcel(rows, `client_segments_${exportName}`);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
      <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          {SHOW_META_EXPORT && scenario && <p className="text-xs text-teal-700 mt-1">Meta Ads: {scenario}</p>}
          <p className="text-sm text-slate-600 mt-1">
            {SHOW_META_EXPORT
              ? `${entries.length} clients in the list, ${metaRows.length} will be exported (with consent)`
              : `${entries.length} clients`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            disabled={entries.length === 0}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel
          </button>
          {SHOW_META_EXPORT && <button
            onClick={() => exportToCsv(metaRows as unknown as Record<string, unknown>[], META_COLUMNS, `meta_${exportName}`)}
            disabled={metaRows.length === 0}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export for Meta Ads
          </button>}
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" aria-label="Close list">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">No clients in this list</p>
      ) : (
        <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide sticky top-0">
              <tr>
                <th className="text-left px-5 py-2.5 font-medium">Client</th>
                <th className="text-left px-3 py-2.5 font-medium">Phone</th>
                <th className="text-left px-3 py-2.5 font-medium">Email</th>
                <th className="text-right px-3 py-2.5 font-medium">Visits</th>
                <th className="text-left px-3 py-2.5 font-medium">Last visit</th>
                <th className="text-left px-3 py-2.5 font-medium">Active package</th>
                {SHOW_META_EXPORT && <th className="text-left px-3 py-2.5 font-medium">Ad consent</th>}
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map(e => {
                const c = clients.get(e.clientId);
                if (!c) return null;
                return (
                  <tr key={e.clientId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-2.5 font-medium text-slate-900">{c.firstName} {c.lastName}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{c.phone || <span className="italic text-slate-400">-</span>}</td>
                    <td className="px-3 py-2.5 text-slate-600">{c.email || <span className="italic text-slate-400">-</span>}</td>
                    <td className="px-3 py-2.5 text-right text-slate-700">{e.visitsInPeriod}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{e.lastVisit ? formatApptDate(e.lastVisit) : '-'}</td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {c.activePackage ? (
                        <span className="inline-flex items-center gap-1 text-amber-700"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />{c.activePackage}</span>
                      ) : '-'}
                    </td>
                    {SHOW_META_EXPORT && <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span title="Marketing email" className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${c.promoEmail ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                          <Mail className="w-3 h-3" />{c.promoEmail ? 'yes' : 'no'}
                        </span>
                        <span title="Marketing SMS" className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${c.promoSms ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                          <MessageSquare className="w-3 h-3" />{c.promoSms ? 'yes' : 'no'}
                        </span>
                      </div>
                    </td>}
                    <td className="px-3 py-2.5 text-right">
                      {onViewClient && (
                        <button onClick={() => onViewClient(e.clientId)} className="px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors inline-flex items-center gap-1 whitespace-nowrap">
                          View Card <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
