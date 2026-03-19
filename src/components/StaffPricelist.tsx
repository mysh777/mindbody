import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { UserCog, Calendar, Download, ChevronDown } from 'lucide-react';
import { exportToExcel } from '../utils/exportExcel';

interface StaffMember {
  id: string;
  first_name: string;
  last_name: string;
}

interface AppointmentRow {
  id: string;
  start_datetime: string;
  status: string;
  client_name: string;
  service_name: string;
  session_type_id: string;
  client_service_name: string;
  duration_minutes: number;
  rate: number;
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
};

const formatTime = (dateStr: string | null) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  } catch {
    return '';
  }
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

export function StaffPricelist() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    setStartDate(firstDay.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('staff')
        .select('id, first_name, last_name')
        .order('first_name');
      setStaff(data || []);
    })();
  }, []);

  const loadAppointments = useCallback(async () => {
    if (!selectedStaffId || !startDate || !endDate) {
      setAppointments([]);
      return;
    }
    setLoading(true);
    try {
      const { data: appts } = await supabase
        .from('appointments')
        .select('id, start_datetime, status, client_id, session_type_id, client_service_id, duration_minutes')
        .eq('staff_id', selectedStaffId)
        .gte('start_datetime', `${startDate}T00:00:00`)
        .lte('start_datetime', `${endDate}T23:59:59`)
        .order('start_datetime', { ascending: true });

      if (!appts || appts.length === 0) {
        setAppointments([]);
        setLoading(false);
        return;
      }

      const clientIds = [...new Set(appts.map(a => a.client_id).filter(Boolean))];
      const sessionTypeIds = [...new Set(appts.map(a => a.session_type_id).filter(Boolean))];
      const serviceIds = [...new Set(appts.map(a => a.client_service_id).filter(Boolean))];

      const [clientsRes, sessionsRes, servicesRes, ratesRes, syncedRatesRes] = await Promise.all([
        clientIds.length > 0
          ? supabase.from('clients').select('id, first_name, last_name').in('id', clientIds)
          : { data: [] },
        sessionTypeIds.length > 0
          ? supabase.from('session_types').select('id, name').in('id', sessionTypeIds)
          : { data: [] },
        serviceIds.length > 0
          ? supabase.from('client_services').select('mindbody_id, name').in('mindbody_id', serviceIds)
          : { data: [] },
        supabase
          .from('staff_appointment_rates')
          .select('session_type_id, rate_per_appointment')
          .eq('staff_id', selectedStaffId)
          .is('effective_to', null),
        supabase
          .from('staff_session_types')
          .select('session_type_id, pay_rate')
          .eq('staff_id', selectedStaffId),
      ]);

      const clientMap = new Map(
        ((clientsRes as any).data || []).map((c: any) => [c.id, `${c.first_name || ''} ${c.last_name || ''}`.trim()])
      );
      const sessionMap = new Map(((sessionsRes as any).data || []).map((s: any) => [s.id, s.name]));
      const serviceMap = new Map(((servicesRes as any).data || []).map((s: any) => [s.mindbody_id, s.name]));

      const ratesBySession = new Map<string, number>();
      let defaultRate = 0;
      for (const r of ((syncedRatesRes as any)?.data || [])) {
        if (r.session_type_id && Number(r.pay_rate) > 0) {
          ratesBySession.set(r.session_type_id, Number(r.pay_rate));
        }
      }
      for (const r of ((ratesRes as any)?.data || [])) {
        if (r.session_type_id) {
          ratesBySession.set(r.session_type_id, Number(r.rate_per_appointment) || 0);
        } else {
          defaultRate = Number(r.rate_per_appointment) || 0;
        }
      }

      const rows: AppointmentRow[] = appts.map(a => ({
        id: a.id,
        start_datetime: a.start_datetime,
        status: a.status || '-',
        client_name: clientMap.get(a.client_id) || a.client_id || '-',
        service_name: String(sessionMap.get(a.session_type_id) || '-'),
        session_type_id: a.session_type_id,
        client_service_name: String(serviceMap.get(a.client_service_id) || '-'),
        duration_minutes: a.duration_minutes || 0,
        rate: ratesBySession.get(a.session_type_id) ?? defaultRate,
      }));

      setAppointments(rows);
    } catch (error) {
      console.error('Error loading appointments:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedStaffId, startDate, endDate]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const totals = useMemo(() => {
    const totalRate = appointments.reduce((s, a) => s + a.rate, 0);
    const totalMinutes = appointments.reduce((s, a) => s + a.duration_minutes, 0);
    return { totalRate, totalMinutes, count: appointments.length };
  }, [appointments]);

  const selectedStaffName = useMemo(() => {
    const s = staff.find(s => s.id === selectedStaffId);
    return s ? `${s.first_name} ${s.last_name}` : '';
  }, [staff, selectedStaffId]);

  const handleExport = () => {
    const rows = appointments.map(a => ({
      'Date': formatDate(a.start_datetime),
      'Time': formatTime(a.start_datetime),
      'Client': a.client_name,
      'Service': a.service_name,
      'Pricing Option': a.client_service_name,
      'Duration (min)': a.duration_minutes,
      'Status': a.status,
      'Rate (EUR)': a.rate,
    }));
    rows.push({
      'Date': 'TOTAL',
      'Time': '',
      'Client': '',
      'Service': '',
      'Pricing Option': '',
      'Duration (min)': totals.totalMinutes,
      'Status': `${totals.count} appointments`,
      'Rate (EUR)': totals.totalRate,
    });
    exportToExcel(rows, `staff_pricelist_${selectedStaffName}_${startDate}_${endDate}`);
  };

  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <UserCog className="w-7 h-7 text-blue-600" />
              Staff Appointment Pricelist
            </h2>
            <p className="text-slate-600 mt-1">View appointments and costs per staff member</p>
          </div>
          <button
            onClick={handleExport}
            disabled={appointments.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="w-64">
              <label className="block text-sm font-medium text-slate-700 mb-1">Staff Member</label>
              <div className="relative">
                <select
                  value={selectedStaffId}
                  onChange={e => setSelectedStaffId(e.target.value)}
                  className="w-full appearance-none border border-slate-300 rounded-lg px-3 py-2 pr-8 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">-- Select Staff --</option>
                  {staff.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div className="w-40">
              <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="w-40">
              <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {selectedStaffId && appointments.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-200 flex items-center gap-6">
              <div className="text-sm text-slate-600">
                <span className="font-semibold">{totals.count}</span> appointments
              </div>
              <div className="text-sm text-slate-600">
                <span className="font-semibold">{Math.floor(totals.totalMinutes / 60)}h {totals.totalMinutes % 60}m</span> total time
              </div>
              <div className="text-sm font-semibold text-blue-600">
                Total Cost: {formatCurrency(totals.totalRate)}
              </div>
            </div>
          )}
        </div>

        {!selectedStaffId ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
            <UserCog className="w-12 h-12 mx-auto mb-4 text-slate-400" />
            <p className="text-lg font-medium">Select a staff member</p>
            <p className="text-sm mt-2">Choose a staff member to view their appointment pricelist</p>
          </div>
        ) : loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
            Loading appointments...
          </div>
        ) : appointments.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-slate-400" />
            <p className="text-lg font-medium">No appointments found</p>
            <p className="text-sm mt-2">Try adjusting the date range</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-medium text-slate-600">Date</th>
                    <th className="text-left px-3 py-2.5 font-medium text-slate-600">Time</th>
                    <th className="text-left px-3 py-2.5 font-medium text-slate-600">Client</th>
                    <th className="text-left px-3 py-2.5 font-medium text-slate-600">Service</th>
                    <th className="text-left px-3 py-2.5 font-medium text-slate-600">Pricing Option</th>
                    <th className="text-right px-3 py-2.5 font-medium text-slate-600">Duration</th>
                    <th className="text-center px-3 py-2.5 font-medium text-slate-600">Status</th>
                    <th className="text-right px-3 py-2.5 font-medium text-slate-600">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {appointments.map(a => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{formatDate(a.start_datetime)}</td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{formatTime(a.start_datetime)}</td>
                      <td className="px-3 py-2 text-slate-900 font-medium">{a.client_name}</td>
                      <td className="px-3 py-2 text-slate-700">{a.service_name}</td>
                      <td className="px-3 py-2 text-slate-500 text-xs max-w-[200px] truncate">{a.client_service_name}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{a.duration_minutes} min</td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                            a.status === 'Completed'
                              ? 'bg-green-100 text-green-700'
                              : a.status === 'Confirmed' || a.status === 'Booked'
                                ? 'bg-blue-100 text-blue-700'
                                : a.status === 'Cancelled' || a.status === 'NoShow'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-blue-600 whitespace-nowrap">
                        {a.rate > 0 ? formatCurrency(a.rate) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                  <tr>
                    <td colSpan={5} className="px-3 py-2.5 font-semibold text-slate-800">
                      Total ({totals.count} appointments)
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-700">
                      {Math.floor(totals.totalMinutes / 60)}h {totals.totalMinutes % 60}m
                    </td>
                    <td />
                    <td className="px-3 py-2.5 text-right font-bold text-blue-600">
                      {formatCurrency(totals.totalRate)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
