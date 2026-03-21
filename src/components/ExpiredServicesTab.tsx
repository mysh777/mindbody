import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, AlertTriangle, ArrowUpDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../utils/salesFilters';

interface ExpiredService {
  id: string;
  client_id: string;
  clientName: string;
  name: string;
  count: number;
  remaining: number;
  expiration_date: string;
  payment_date: string | null;
  poPrice: number;
  poSessionCount: number;
  unusedValue: number;
}

interface ExpiredServicesTabProps {
  onNavigate?: (tableName: string, id: string) => void;
}

type SortField = 'clientName' | 'name' | 'remaining' | 'unusedValue' | 'expiration_date';

export function ExpiredServicesTab({ onNavigate }: ExpiredServicesTabProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ExpiredService[]>([]);
  const [sortBy, setSortBy] = useState<SortField>('unusedValue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: csData } = await supabase
        .from('client_services')
        .select('id, client_id, name, count, remaining, expiration_date, payment_date, pricing_option_id')
        .lt('expiration_date', new Date().toISOString())
        .gt('remaining', 0)
        .order('expiration_date', { ascending: false });

      if (!csData || csData.length === 0) {
        setData([]);
        return;
      }

      const clientIds = [...new Set(csData.map(cs => cs.client_id))];
      const clientMap: Record<string, string> = {};
      for (let i = 0; i < clientIds.length; i += 500) {
        const batch = clientIds.slice(i, i + 500);
        const { data: clients } = await supabase
          .from('clients')
          .select('id, first_name, last_name')
          .in('id', batch);
        (clients || []).forEach(c => {
          clientMap[c.id] = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.id;
        });
      }

      const poIds = [...new Set(csData.map(cs => cs.pricing_option_id).filter(Boolean))];
      const poMap: Record<string, { price: number; sessionCount: number }> = {};
      if (poIds.length > 0) {
        for (let i = 0; i < poIds.length; i += 500) {
          const batch = poIds.slice(i, i + 500);
          const { data: pos } = await supabase
            .from('pricing_options')
            .select('id, price, session_count')
            .in('id', batch);
          (pos || []).forEach(po => {
            poMap[po.id] = {
              price: Number(po.price) || 0,
              sessionCount: po.session_count || 1,
            };
          });
        }
      }

      const processed: ExpiredService[] = csData.map(cs => {
        const po = cs.pricing_option_id ? poMap[cs.pricing_option_id] : null;
        const poPrice = po?.price || 0;
        const poSessionCount = po?.sessionCount || cs.count || 1;
        const perSession = poSessionCount > 0 ? poPrice / poSessionCount : 0;
        const unusedValue = perSession * (cs.remaining || 0);

        return {
          id: cs.id,
          client_id: cs.client_id,
          clientName: clientMap[cs.client_id] || cs.client_id,
          name: cs.name || 'Unknown',
          count: cs.count || 0,
          remaining: cs.remaining || 0,
          expiration_date: cs.expiration_date,
          payment_date: cs.payment_date,
          poPrice,
          poSessionCount,
          unusedValue,
        };
      });

      setData(processed);
    } catch (error) {
      console.error('Error loading expired services:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const mul = sortDir === 'desc' ? -1 : 1;
      if (sortBy === 'clientName' || sortBy === 'name' || sortBy === 'expiration_date') {
        return mul * ((a[sortBy] || '').localeCompare(b[sortBy] || ''));
      }
      return mul * ((a[sortBy] as number) - (b[sortBy] as number));
    });
  }, [data, sortBy, sortDir]);

  const totals = useMemo(() => ({
    totalRemaining: data.reduce((sum, d) => sum + d.remaining, 0),
    totalUnusedValue: data.reduce((sum, d) => sum + d.unusedValue, 0),
  }), [data]);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  const SortHeader = ({ field, label, align = 'right' }: { field: SortField; label: string; align?: string }) => (
    <th
      className={`px-4 py-3 font-semibold text-slate-600 cursor-pointer hover:text-slate-900 transition-colors ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => toggleSort(field)}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}
        <ArrowUpDown className={`w-3 h-3 ${sortBy === field ? 'text-blue-600' : 'text-slate-400'}`} />
      </div>
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <span>
          Expired services with remaining sessions represent prepaid revenue that will never be delivered.
          Total undelivered value: <strong>{formatCurrency(totals.totalUnusedValue)}</strong> across {data.length} service packages ({totals.totalRemaining} sessions).
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-sm text-slate-500">Expired Packages</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{data.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-sm text-slate-500">Unused Sessions</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{totals.totalRemaining}</div>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-5">
          <div className="text-sm text-emerald-600">Unredeemed Value</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{formatCurrency(totals.totalUnusedValue)}</div>
          <div className="text-xs text-emerald-500 mt-1">pure profit (service never delivered)</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Expired Service Packages with Remaining Sessions</h3>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32 text-slate-500">Loading...</div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-500">No expired services with remaining sessions found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <SortHeader field="clientName" label="Client" align="left" />
                  <SortHeader field="name" label="Service Package" align="left" />
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Total</th>
                  <SortHeader field="remaining" label="Remaining" />
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Package Price</th>
                  <SortHeader field="unusedValue" label="Unused Value" />
                  <SortHeader field="expiration_date" label="Expired" align="right" />
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onNavigate?.('clients', row.client_id)}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {row.clientName}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.name}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{row.count}</td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-600">{row.remaining}</td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {row.poPrice > 0 ? formatCurrency(row.poPrice) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                      {row.unusedValue > 0 ? formatCurrency(row.unusedValue) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">
                      {new Date(row.expiration_date).toLocaleDateString('de-DE')}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">
                      {row.payment_date ? new Date(row.payment_date).toLocaleDateString('de-DE') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                <tr className="font-bold">
                  <td className="px-4 py-3 text-slate-900">Total</td>
                  <td></td>
                  <td></td>
                  <td className="px-4 py-3 text-right text-amber-600">{totals.totalRemaining}</td>
                  <td></td>
                  <td className="px-4 py-3 text-right text-emerald-600">{formatCurrency(totals.totalUnusedValue)}</td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
