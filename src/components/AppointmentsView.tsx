import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useReportFilters } from '../lib/reportFiltersContext';
import { Calendar, Filter, Building2, UserCog, Clock, Tag, Users, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { exportToExcel } from '../utils/exportExcel';

interface Appointment {
  id: string;
  start_datetime: string;
  end_datetime: string;
  status: string;
  duration_minutes: number;
  notes: string | null;
  first_appointment: boolean;
  client?: {
    id: string;
    first_name: string;
    last_name: string;
  };
  staff?: {
    id: string;
    first_name: string;
    last_name: string;
  };
  location?: {
    id: string;
    name: string;
  };
  session_type?: {
    id: string;
    name: string;
  };
  client_service?: {
    id: string;
    name: string;
    program_name: string | null;
  } | null;
}

type FilterPreset = 'today' | 'this_week' | 'this_month' | 'last_month' | 'this_year' | 'custom';

function getFilterPresetDates(preset: FilterPreset): { start: string; end: string } {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  switch (preset) {
    case 'today':
      return { start: todayStr, end: todayStr };
    case 'this_week': {
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      return { start: monday.toISOString().split('T')[0], end: todayStr };
    }
    case 'this_month': {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: firstDay.toISOString().split('T')[0], end: todayStr };
    }
    case 'last_month': {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: firstDay.toISOString().split('T')[0], end: lastDay.toISOString().split('T')[0] };
    }
    case 'this_year': {
      const firstDay = new Date(today.getFullYear(), 0, 1);
      return { start: firstDay.toISOString().split('T')[0], end: todayStr };
    }
    default:
      return { start: todayStr, end: todayStr };
  }
}

function getMonthsForTimeline(): { label: string; start: string; end: string }[] {
  const months: { label: string; start: string; end: string }[] = [];
  const today = new Date();

  for (let i = 11; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    months.push({
      label: date.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
      start: date.toISOString().split('T')[0],
      end: lastDay.toISOString().split('T')[0],
    });
  }

  return months;
}

const STATUS_COLORS: Record<string, string> = {
  'Completed': 'bg-green-100 text-green-800',
  'Confirmed': 'bg-blue-100 text-blue-800',
  'Booked': 'bg-sky-100 text-sky-800',
  'Cancelled': 'bg-red-100 text-red-800',
  'Late Cancel': 'bg-orange-100 text-orange-800',
  'No Show': 'bg-amber-100 text-amber-800',
};

export function AppointmentsView() {
  const { filters, setAppointmentsFilters } = useReportFilters();
  const {
    filterPreset,
    dateRange,
    selectedMonth,
    selectedLocation,
    selectedStaff,
    selectedStatus,
    currentPage,
  } = filters.appointments;

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize] = useState(50);

  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [staffList, setStaffList] = useState<{ id: string; first_name: string; last_name: string }[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);

  const page = currentPage - 1;

  const months = getMonthsForTimeline();

  const loadFiltersData = useCallback(async () => {
    const [locRes, staffRes, statusRes] = await Promise.all([
      supabase.from('locations').select('id, name').order('name'),
      supabase.from('staff').select('id, first_name, last_name').order('last_name'),
      supabase.from('appointments').select('status'),
    ]);

    setLocations(locRes.data || []);
    setStaffList(staffRes.data || []);

    const uniqueStatuses = [...new Set((statusRes.data || []).map((a: any) => a.status).filter(Boolean))];
    setStatuses(uniqueStatuses.sort());
  }, []);

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('appointments')
        .select(`
          id, start_datetime, end_datetime, status, duration_minutes, notes, first_appointment, client_service_id,
          client:clients(id, first_name, last_name),
          staff:staff(id, first_name, last_name),
          location:locations(id, name),
          session_type:session_types(id, name)
        `, { count: 'exact' })
        .gte('start_datetime', dateRange.start)
        .lte('start_datetime', dateRange.end + 'T23:59:59')
        .order('start_datetime', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (selectedLocation !== 'all') {
        query = query.eq('location_id', selectedLocation);
      }
      if (selectedStaff !== 'all') {
        query = query.eq('staff_id', selectedStaff);
      }
      if (selectedStatus !== 'all') {
        query = query.eq('status', selectedStatus);
      }

      const { data, count } = await query;

      const clientServiceIds = [...new Set((data || []).map((a: any) => a.client_service_id).filter(Boolean))];

      let clientServicesMap: Record<string, { name: string; program_name: string | null }> = {};
      if (clientServiceIds.length > 0) {
        const { data: servicesData } = await supabase
          .from('client_services')
          .select('mindbody_id, name, program_name')
          .in('mindbody_id', clientServiceIds);

        (servicesData || []).forEach((s: any) => {
          clientServicesMap[s.mindbody_id] = { name: s.name, program_name: s.program_name };
        });
      }

      const appointmentsWithServices = (data || []).map((a: any) => ({
        ...a,
        client_service: a.client_service_id ? clientServicesMap[a.client_service_id] || null : null,
      }));

      setAppointments(appointmentsWithServices);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error loading appointments:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange, page, pageSize, selectedLocation, selectedStaff, selectedStatus]);

  useEffect(() => {
    loadFiltersData();
  }, [loadFiltersData]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const handlePresetChange = (preset: FilterPreset) => {
    if (preset !== 'custom') {
      setAppointmentsFilters({
        filterPreset: preset,
        selectedMonth: null,
        dateRange: getFilterPresetDates(preset),
        currentPage: 1,
      });
    } else {
      setAppointmentsFilters({ filterPreset: preset, selectedMonth: null });
    }
  };

  const handleMonthSelect = (month: { start: string; end: string }) => {
    setAppointmentsFilters({
      filterPreset: 'custom',
      selectedMonth: month.start,
      dateRange: month,
      currentPage: 1,
    });
  };

  const handleLocationChange = (value: string) => {
    setAppointmentsFilters({ selectedLocation: value, currentPage: 1 });
  };

  const handleStaffChange = (value: string) => {
    setAppointmentsFilters({ selectedStaff: value, currentPage: 1 });
  };

  const handleStatusChange = (value: string) => {
    setAppointmentsFilters({ selectedStatus: value, currentPage: 1 });
  };

  const handlePageChange = (newPage: number) => {
    setAppointmentsFilters({ currentPage: newPage });
  };

  const handleExport = async () => {
    let query = supabase
      .from('appointments')
      .select(`
        id, start_datetime, end_datetime, status, duration_minutes, notes, first_appointment, client_service_id,
        client:clients(id, first_name, last_name),
        staff:staff(id, first_name, last_name),
        location:locations(id, name),
        session_type:session_types(id, name)
      `)
      .gte('start_datetime', dateRange.start)
      .lte('start_datetime', dateRange.end + 'T23:59:59')
      .order('start_datetime', { ascending: false });

    if (selectedLocation !== 'all') {
      query = query.eq('location_id', selectedLocation);
    }
    if (selectedStaff !== 'all') {
      query = query.eq('staff_id', selectedStaff);
    }
    if (selectedStatus !== 'all') {
      query = query.eq('status', selectedStatus);
    }

    const { data } = await query;

    const clientServiceIds = [...new Set((data || []).map((a: any) => a.client_service_id).filter(Boolean))];
    let clientServicesMap: Record<string, { name: string; program_name: string | null }> = {};
    if (clientServiceIds.length > 0) {
      const { data: servicesData } = await supabase
        .from('client_services')
        .select('mindbody_id, name, program_name')
        .in('mindbody_id', clientServiceIds);

      (servicesData || []).forEach((s: any) => {
        clientServicesMap[s.mindbody_id] = { name: s.name, program_name: s.program_name };
      });
    }

    const exportData = (data || []).map((a: any) => {
      const clientService = a.client_service_id ? clientServicesMap[a.client_service_id] : null;
      return {
        Date: new Date(a.start_datetime).toLocaleDateString('lv-LV'),
        Time: new Date(a.start_datetime).toLocaleTimeString('lv-LV', { hour: '2-digit', minute: '2-digit' }),
        Client: a.client ? `${a.client.first_name} ${a.client.last_name}` : '',
        Staff: a.staff ? `${a.staff.first_name} ${a.staff.last_name}` : '',
        Service: a.session_type?.name || '',
        'Pricing Option': clientService?.name || '',
        Program: clientService?.program_name || '',
        Location: a.location?.name || '',
        Duration: a.duration_minutes || 0,
        Status: a.status || '',
        'First Appointment': a.first_appointment ? 'Yes' : 'No',
        Notes: a.notes || '',
      };
    });

    exportToExcel(exportData, `appointments_${dateRange.start}_${dateRange.end}`);
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <Calendar className="w-7 h-7 text-red-600" />
              Appointments
            </h2>
            <p className="text-slate-600 mt-1">View and filter all appointments</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-2xl font-bold text-slate-900">{totalCount.toLocaleString()}</div>
              <div className="text-sm text-slate-500">Total appointments</div>
            </div>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-slate-500" />
            <span className="font-semibold text-slate-700">Filters</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            {(['today', 'this_week', 'this_month', 'last_month', 'this_year'] as FilterPreset[]).map((preset) => (
              <button
                key={preset}
                onClick={() => handlePresetChange(preset)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filterPreset === preset && !selectedMonth
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {preset.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
            {months.map((month) => (
              <button
                key={month.start}
                onClick={() => handleMonthSelect(month)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedMonth === month.start
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {month.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">From</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => {
                  setAppointmentsFilters({
                    dateRange: { ...dateRange, start: e.target.value },
                    filterPreset: 'custom',
                    selectedMonth: null,
                    currentPage: 1,
                  });
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">To</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => {
                  setAppointmentsFilters({
                    dateRange: { ...dateRange, end: e.target.value },
                    filterPreset: 'custom',
                    selectedMonth: null,
                    currentPage: 1,
                  });
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <Building2 className="w-4 h-4 inline mr-1" />
                Location
              </label>
              <select
                value={selectedLocation}
                onChange={(e) => handleLocationChange(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="all">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <UserCog className="w-4 h-4 inline mr-1" />
                Staff
              </label>
              <select
                value={selectedStaff}
                onChange={(e) => handleStaffChange(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="all">All Staff</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <Tag className="w-4 h-4 inline mr-1" />
                Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="all">All Statuses</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-slate-500">Loading appointments...</p>
            </div>
          ) : appointments.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No appointments found for selected filters</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Date & Time</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Client</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Staff</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Service</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Pricing Option</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Location</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Duration</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {appointments.map((appt) => (
                      <tr key={appt.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">
                            {new Date(appt.start_datetime).toLocaleDateString('lv-LV')}
                          </div>
                          <div className="text-sm text-slate-500">
                            {new Date(appt.start_datetime).toLocaleTimeString('lv-LV', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <Users className="w-4 h-4 text-orange-600" />
                            </div>
                            <div>
                              <div className="font-medium text-slate-900">
                                {appt.client ? `${appt.client.first_name} ${appt.client.last_name}` : '-'}
                              </div>
                              {appt.first_appointment && (
                                <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">First Visit</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-sky-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <UserCog className="w-4 h-4 text-sky-600" />
                            </div>
                            <span className="text-slate-700">
                              {appt.staff ? `${appt.staff.first_name} ${appt.staff.last_name}` : '-'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-700">{appt.session_type?.name || '-'}</span>
                        </td>
                        <td className="px-4 py-3">
                          {appt.client_service ? (
                            <div>
                              <div className="text-slate-700 text-sm">{appt.client_service.name}</div>
                              {appt.client_service.program_name && (
                                <div className="text-xs text-slate-500">{appt.client_service.program_name}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-slate-400" />
                            <span className="text-slate-700">{appt.location?.name || '-'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-slate-600">
                            <Clock className="w-4 h-4" />
                            <span>{appt.duration_minutes || 0} min</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[appt.status] || 'bg-slate-100 text-slate-700'}`}>
                            {appt.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
                <div className="text-sm text-slate-600">
                  Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, totalCount)} of {totalCount.toLocaleString()}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-slate-600">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage >= totalPages}
                    className="p-2 rounded-lg border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
