import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Save, Plus, Trash2, UserCog, AlertCircle } from 'lucide-react';

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

interface RateRow {
  id?: string;
  staff_id: string;
  session_type_id: string;
  rate_per_appointment: number;
  isNew?: boolean;
}

export function StaffRatesManager() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [sessionTypes, setSessionTypes] = useState<SessionType[]>([]);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [staffRes, sessionRes, ratesRes] = await Promise.all([
        supabase.from('staff').select('id, first_name, last_name').order('first_name'),
        supabase.from('session_types').select('id, name, category_name').eq('active', true).order('name'),
        supabase
          .from('staff_appointment_rates')
          .select('id, staff_id, session_type_id, rate_per_appointment')
          .is('effective_to', null)
          .order('staff_id'),
      ]);

      setStaff(staffRes.data || []);
      setSessionTypes(sessionRes.data || []);
      setRates(
        (ratesRes.data || []).map(r => ({
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

  const addRow = () => {
    setRates(prev => [
      ...prev,
      {
        staff_id: staff[0]?.id || '',
        session_type_id: '',
        rate_per_appointment: 0,
        isNew: true,
      },
    ]);
  };

  const removeRow = async (index: number) => {
    const row = rates[index];
    if (row.id) {
      const { error } = await supabase.from('staff_appointment_rates').delete().eq('id', row.id);
      if (error) {
        setMessage({ type: 'error', text: `Failed to delete: ${error.message}` });
        return;
      }
    }
    setRates(prev => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof RateRow, value: string | number) => {
    setRates(prev =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      for (const rate of rates) {
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
          const { error } = await supabase
            .from('staff_appointment_rates')
            .update(data)
            .eq('id', rate.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('staff_appointment_rates').insert(data);
          if (error) throw error;
        }
      }
      setMessage({ type: 'success', text: 'Rates saved successfully' });
      await loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error saving: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Loading staff rates...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <UserCog className="w-5 h-5 text-blue-600" />
          Staff Appointment Rates
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={addRow}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Rate
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save All'}
          </button>
        </div>
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
            {rates.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                  No rates configured yet. Click "Add Rate" to create one.
                </td>
              </tr>
            ) : (
              rates.map((rate, index) => (
                <tr key={rate.id || `new-${index}`} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <select
                      value={rate.staff_id}
                      onChange={e => updateRow(index, 'staff_id', e.target.value)}
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
                      onChange={e => updateRow(index, 'session_type_id', e.target.value)}
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
                      onChange={e => updateRow(index, 'rate_per_appointment', parseFloat(e.target.value) || 0)}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm text-right focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => removeRow(index)}
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

      <p className="text-xs text-slate-500">
        Set the cost rate per appointment for each staff member. You can set a default rate (All Services) or
        override per specific service type. This data is used in Client Balance export to calculate profit.
      </p>
    </div>
  );
}
