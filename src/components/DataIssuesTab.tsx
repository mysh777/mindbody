import { useState, useMemo } from 'react';
import { AlertTriangle, Database, Link2Off } from 'lucide-react';
import type { AppointmentRow } from '../hooks/useSalesMarginData';

interface DataIssuesTabProps {
  loading: boolean;
  appointments: AppointmentRow[];
  onNavigate?: (tableName: string, id: string) => void;
}

type IssueFilter = 'all' | 'cs_not_synced' | 'no_pricing_option';

export function DataIssuesTab({ loading, appointments, onNavigate }: DataIssuesTabProps) {
  const [filter, setFilter] = useState<IssueFilter>('all');

  const issueAppts = useMemo(() => {
    return appointments.filter(a => !a.hasRevenueData && a.noDataReason !== 'ok');
  }, [appointments]);

  const csNotSynced = useMemo(() => {
    return issueAppts.filter(a => a.noDataReason === 'cs_not_synced');
  }, [issueAppts]);

  const noPricingOption = useMemo(() => {
    return issueAppts.filter(a => a.noDataReason === 'no_pricing_option');
  }, [issueAppts]);

  const displayed = useMemo(() => {
    if (filter === 'cs_not_synced') return csNotSynced;
    if (filter === 'no_pricing_option') return noPricingOption;
    return issueAppts;
  }, [filter, issueAppts, csNotSynced, noPricingOption]);

  const uniqueClientServiceIds = useMemo(() => {
    const ids = new Set(displayed.map(a => a.client_service_id).filter(Boolean));
    return [...ids];
  }, [displayed]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-500">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'all' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          All Issues ({issueAppts.length})
        </button>
        <button
          onClick={() => setFilter('cs_not_synced')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'cs_not_synced' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          Client Service Not Synced ({csNotSynced.length})
        </button>
        <button
          onClick={() => setFilter('no_pricing_option')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'no_pricing_option' ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Link2Off className="w-3.5 h-3.5" />
          No Pricing Option ({noPricingOption.length})
        </button>
      </div>

      {filter === 'cs_not_synced' && csNotSynced.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          <div className="flex items-center gap-2 font-semibold mb-2">
            <Database className="w-4 h-4" />
            Client Service IDs not found in client_services table
          </div>
          <p className="text-red-600 text-xs mb-2">
            These client_service_id values are referenced from appointments but do not exist in the client_services table.
            They need to be synced from MindBody.
          </p>
        </div>
      )}

      {filter === 'no_pricing_option' && noPricingOption.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-sm text-orange-800">
          <div className="flex items-center gap-2 font-semibold mb-2">
            <Link2Off className="w-4 h-4" />
            Client Services with no pricing_option_id linked
          </div>
          <p className="text-orange-600 text-xs mb-2">
            These client services exist in the database but have no pricing option associated. Revenue cannot be calculated.
          </p>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="text-sm text-slate-600 mb-2">
          {uniqueClientServiceIds.length} unique client_service_id values across {displayed.length} appointments
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
          {uniqueClientServiceIds.map(id => (
            <span key={id} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-mono">
              {id}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Appt ID</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Client</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Staff</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Service</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">client_service_id</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Issue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayed.slice(0, 200).map(a => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{a.id}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {new Date(a.start_datetime).toLocaleDateString('de-DE')}
                  </td>
                  <td className="px-4 py-2">
                    {a.client_id ? (
                      <button
                        onClick={() => onNavigate?.('clients', a.client_id!)}
                        className="text-blue-600 hover:underline"
                      >
                        {a.clientName}
                      </button>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-700">{a.staffName}</td>
                  <td className="px-4 py-2 text-slate-700">{a.sessionTypeName}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{a.client_service_id || '-'}</td>
                  <td className="px-4 py-2">
                    {a.noDataReason === 'cs_not_synced' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                        <Database className="w-3 h-3" />
                        not synced
                      </span>
                    )}
                    {a.noDataReason === 'no_pricing_option' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">
                        <Link2Off className="w-3 h-3" />
                        no pricing option
                      </span>
                    )}
                    {a.noDataReason === 'no_client_service' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">
                        <AlertTriangle className="w-3 h-3" />
                        no service linked
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {displayed.length > 200 && (
            <div className="px-4 py-3 text-center text-sm text-slate-500 bg-slate-50 border-t border-slate-200">
              Showing 200 of {displayed.length} issues
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
