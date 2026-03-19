import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Save, Plus, Trash2, UserCog, AlertCircle, RefreshCw, Download } from 'lucide-react';

interface StaffMember {
  id: string;
  first_name: string;
  last_name: string;
}

interface SessionType {
  id: string;
  name: string;
  category_name: string;
}

interface SyncedRate {
  id: string;
  staff_id: string;
  staff_name: string;
  session_type_id: string;
  session_type_name: string;
  pay_rate: number;
  time_length: number | null;
  synced_at: string;
}

interface OverrideRow {
  id?: string;
  staff_id: string;
  session_type_id: string;
  rate_per_appointment: number;
  isNew?: boolean;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

export function StaffRatesManager() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [sessionTypes, setSessionTypes] = useState<SessionType[]>([]);
  const [syncedRates, setSyncedRates] = useState<SyncedRate[]>([]);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [staffFilter, setStaffFilter] = useState<string>('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [staffRes, sessionRes, syncedRes, overridesRes] = await Promise.all([
        supabase.from('staff').select('id, first_name, last_name').order('first_name'),
        supabase.from('session_types').select('id, name, category_name').order('name'),
        supabase
          .from('staff_session_types')
          .select('id, staff_id, session_type_id, pay_rate, time_length, synced_at')
          .order('staff_id'),
        supabase
          .from('staff_appointment_rates')
          .select('id, staff_id, session_type_id, rate_per_appointment')
          .is('effective_to', null)
          .order('staff_id'),
      ]);

      const staffList = staffRes.data || [];
      const sessionList = sessionRes.data || [];
      setStaff(staffList);
      setSessionTypes(sessionList);

      const staffMap = new Map(staffList.map(s => [s.id, `${s.first_name} ${s.last_name}`]));
      const sessionMap = new Map(sessionList.map(s => [s.id, s.name]));

      setSyncedRates(
        (syncedRes.data || []).map(r => ({
          id: r.id,
          staff_id: r.staff_id,
          staff_name: staffMap.get(r.staff_id) || r.staff_id,
          session_type_id: r.session_type_id,
          session_type_name: sessionMap.get(r.session_type_id) || r.session_type_id,
          pay_rate: Number(r.pay_rate) || 0,
          time_length: r.time_length,
          synced_at: r.synced_at,
        }))
      );

      setOverrides(
        (overridesRes.data || []).map(r => ({
          id: r.id,
          staff_id: r.staff_id,
          session_type_id: r.session_type_id || '',
          rate_per_appointment: Number(r.rate_per_appointment) || 0,
        }))
      );
    } catch (error) {
      console.error('Error loading rates data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSyncStaffRates = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/mindbody-sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ syncType: 'staff_services' }),
      });

      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || `Sync failed: ${response.status}`);
      }

      setMessage({ type: 'success', text: `Synced ${result.results?.staff_session_types || 0} staff-service rates from Mindbody` });
      await loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: `Sync error: ${error.message}` });
    } finally {
      setSyncing(false);
    }
  };

  const addOverride = () => {
    setOverrides(prev => [
      ...prev,
      { staff_id: staff[0]?.id || '', session_type_id: '', rate_per_appointment: 0, isNew: true },
    ]);
  };

  const removeOverride = async (index: number) => {
    const row = overrides[index];
    if (row.id) {
      const { error } = await supabase.from('staff_appointment_rates').delete().eq('id', row.id);
      if (error) {
        setMessage({ type: 'error', text: `Failed to delete: ${error.message}` });
        return;
      }
    }
    setOverrides(prev => prev.filter((_, i) => i !== index));
  };

  const updateOverride = (index: number, field: keyof OverrideRow, value: string | number) => {
    setOverrides(prev => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const handleSaveOverrides = async () => {
    setSaving(true);
    setMessage(null);
    try {
      for (const rate of overrides) {
        if (!rate.staff_id) continue;
        const data = {
          staff_id: rate.staff_id,
          session_type_id: rate.session_type_id || null,
          rate_per_appointment: rate.rate_per_appointment,
          rate_type: 'fixed',
          effective_from: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
        };
        if (rate.id && !rate.isNew) {
          const { error } = await supabase.from('staff_appointment_rates').update(data).eq('id', rate.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('staff_appointment_rates').insert(data);
          if (error) throw error;
        }
      }
      setMessage({ type: 'success', text: 'Override rates saved' });
      await loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error saving: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const filteredSyncedRates = staffFilter
    ? syncedRates.filter(r => r.staff_id === staffFilter)
    : syncedRates;

  const ratesWithPayRate = filteredSyncedRates.filter(r => r.pay_rate > 0);
  const ratesWithoutPayRate = filteredSyncedRates.filter(r => r.pay_rate === 0);

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Loading staff rates...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <UserCog className="w-5 h-5 text-blue-600" />
          Staff Pay Rates
        </h3>
        <button
          onClick={handleSyncStaffRates}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
        >
          <Download className={`w-4 h-4 ${syncing ? 'animate-bounce' : ''}`} />
          {syncing ? 'Syncing from Mindbody...' : 'Sync Pay Rates from API'}
        </button>
      </div>

      {message && (
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          <AlertCircle className="w-4 h-4" />
          {message.text}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-slate-700 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-teal-600" />
            Synced from Mindbody API
            <span className="text-xs font-normal text-slate-500 ml-1">
              ({syncedRates.length} total, {syncedRates.filter(r => r.pay_rate > 0).length} with pay rate)
            </span>
          </h4>
          <div className="w-56">
            <select
              value={staffFilter}
              onChange={e => setStaffFilter(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Staff</option>
              {staff.map(s => (
                <option key={s.id} value={s.id}>
                  {s.first_name} {s.last_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {syncedRates.length === 0 ? (
          <div className="bg-slate-50 rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-500">
            No synced rates yet. Click "Sync Pay Rates from API" to fetch staff session types with pay rates from Mindbody.
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-600">Staff</th>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-600">Service / Session Type</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600 w-28">Duration</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600 w-32">Pay Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ratesWithPayRate.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-900 font-medium">{r.staff_name}</td>
                    <td className="px-3 py-2 text-slate-700">{r.session_type_name}</td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {r.time_length ? `${r.time_length} min` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-600">
                      {formatCurrency(r.pay_rate)}
                    </td>
                  </tr>
                ))}
                {ratesWithoutPayRate.length > 0 && (
                  <tr className="bg-slate-50">
                    <td colSpan={4} className="px-3 py-2 text-xs text-slate-500 italic">
                      + {ratesWithoutPayRate.length} services with no pay rate configured in Mindbody
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 pt-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-slate-700 flex items-center gap-2">
            Manual Rate Overrides
            <span className="text-xs font-normal text-slate-500 ml-1">
              (overrides synced rates when set)
            </span>
          </h4>
          <div className="flex items-center gap-2">
            <button
              onClick={addOverride}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Override
            </button>
            <button
              onClick={handleSaveOverrides}
              disabled={saving || overrides.length === 0}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600">Staff Member</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600">Service / Session Type</th>
                <th className="text-right px-3 py-2.5 font-medium text-slate-600 w-36">Rate per Appt (EUR)</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {overrides.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500 text-xs">
                    No manual overrides. Synced rates from API are used by default.
                  </td>
                </tr>
              ) : (
                overrides.map((rate, index) => (
                  <tr key={rate.id || `new-${index}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <select
                        value={rate.staff_id}
                        onChange={e => updateOverride(index, 'staff_id', e.target.value)}
                        className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- Select Staff --</option>
                        {staff.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.first_name} {s.last_name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={rate.session_type_id}
                        onChange={e => updateOverride(index, 'session_type_id', e.target.value)}
                        className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">All Services (default)</option>
                        {sessionTypes.map(st => (
                          <option key={st.id} value={st.id}>
                            {st.name}
                            {st.category_name ? ` (${st.category_name})` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={rate.rate_per_appointment}
                        onChange={e =>
                          updateOverride(index, 'rate_per_appointment', parseFloat(e.target.value) || 0)
                        }
                        className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm text-right focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => removeOverride(index)}
                        className="text-red-500 hover:text-red-700 transition-colors p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-500 mt-2">
          Manual overrides take priority over API-synced rates. Use them when Mindbody doesn't have the correct pay rate configured.
        </p>
      </div>
    </div>
  );
}
