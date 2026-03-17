import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ChevronDown, ChevronRight, UserCog, Calendar, Package, Users, Filter, Building2, DollarSign, Download } from 'lucide-react';
import { exportToExcel } from '../utils/exportExcel';

interface StaffServiceStat {
  session_type_id: string;
  session_type_name: string;
  client_service_name: string;
  client_count: number;
  appointment_count: number;
  price: number;
  total_revenue: number;
  clients: {
    client_id: string;
    client_name: string;
    appointments: number;
  }[];
}

interface StaffWithStats {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  total_appointments: number;
  unique_clients: number;
  total_revenue: number;
  services_provided: StaffServiceStat[];
}

interface LocationGroup {
  location_id: string;
  location_name: string;
  staff: StaffWithStats[];
  total_appointments: number;
  total_clients: number;
  total_revenue: number;
}

type FilterPreset = 'today' | 'this_week' | 'this_month' | 'last_month' | 'this_year' | 'custom';

interface StaffRowProps {
  staff: StaffWithStats;
  expanded: boolean;
  onToggle: () => void;
  onLoadDetails: (staffId: string) => void;
  loading: boolean;
  dateRange: { start: string; end: string };
}

function StaffRow({ staff, expanded, onToggle, onLoadDetails, loading, dateRange }: StaffRowProps) {
  const handleToggle = () => {
    if (!expanded && staff.services_provided.length === 0) {
      onLoadDetails(staff.id);
    }
    onToggle();
  };

  return (
    <div className="border border-slate-200 rounded-lg bg-white mb-2 overflow-hidden">
      <div
        className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={handleToggle}
      >
        <div className="flex-shrink-0">
          {expanded ? (
            <ChevronDown className="w-5 h-5 text-slate-500" />
          ) : (
            <ChevronRight className="w-5 h-5 text-slate-500" />
          )}
        </div>

        <div className="flex-shrink-0 w-10 h-10 bg-sky-100 rounded-full flex items-center justify-center">
          <UserCog className="w-5 h-5 text-sky-600" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 truncate">
            {staff.first_name} {staff.last_name}
          </h3>
          <p className="text-sm text-slate-500 truncate">{staff.email || 'No email'}</p>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div className="text-center">
            <div className="font-semibold text-blue-600">{staff.total_appointments}</div>
            <div className="text-xs text-slate-500">Appointments</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-emerald-600">{staff.unique_clients}</div>
            <div className="text-xs text-slate-500">Clients</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-amber-600">{staff.services_provided.length}</div>
            <div className="text-xs text-slate-500">Services</div>
          </div>
          <div className="text-center min-w-[80px]">
            <div className="font-semibold text-green-600">{staff.total_revenue > 0 ? `€${staff.total_revenue.toFixed(0)}` : '-'}</div>
            <div className="text-xs text-slate-500">Revenue</div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-200 bg-slate-50 p-4">
          {loading ? (
            <div className="text-center py-8 text-slate-500">Loading staff data...</div>
          ) : staff.services_provided.length === 0 ? (
            <div className="text-center py-4 text-slate-500">
              <Calendar className="w-8 h-8 mx-auto mb-2 text-slate-400" />
              <p>No appointments with pricing options in selected period</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-slate-600 mb-3">
                Period: {new Date(dateRange.start).toLocaleDateString('lv-LV')} - {new Date(dateRange.end).toLocaleDateString('lv-LV')}
              </div>

              {staff.services_provided.map((service, idx) => (
                <ServiceStatCard key={idx} stat={service} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ServiceStatCardProps {
  stat: StaffServiceStat;
}

function ServiceStatCard({ stat }: ServiceStatCardProps) {
  const [showClients, setShowClients] = useState(false);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <Package className="w-5 h-5 mt-0.5 text-sky-600" />
          <div>
            <h5 className="font-medium text-slate-900">{stat.session_type_name}</h5>
            {stat.client_service_name && (
              <p className="text-xs text-slate-500">via: {stat.client_service_name}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="text-center">
            <div className="font-semibold text-blue-600">{stat.appointment_count}</div>
            <div className="text-xs text-slate-500">visits</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-emerald-600">{stat.client_count}</div>
            <div className="text-xs text-slate-500">clients</div>
          </div>
          {stat.price > 0 && (
            <div className="text-center">
              <div className="font-semibold text-amber-600">€{stat.price}</div>
              <div className="text-xs text-slate-500">price</div>
            </div>
          )}
          {stat.total_revenue > 0 && (
            <div className="text-center min-w-[70px]">
              <div className="font-semibold text-green-600">€{stat.total_revenue.toFixed(0)}</div>
              <div className="text-xs text-slate-500">revenue</div>
            </div>
          )}
        </div>
      </div>

      {stat.clients.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          <button
            onClick={() => setShowClients(!showClients)}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            {showClients ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Show {stat.clients.length} client{stat.clients.length !== 1 ? 's' : ''}
          </button>

          {showClients && (
            <div className="mt-2 space-y-1">
              {stat.clients.map((client, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs text-slate-600 pl-4 py-1">
                  <div className="flex items-center gap-2">
                    <Users className="w-3 h-3 text-slate-400" />
                    <span>{client.client_name}</span>
                  </div>
                  <span className="text-slate-500">{client.appointments} appointment{client.appointments !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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

export function StaffExpandableView() {
  const [staff, setStaff] = useState<StaffWithStats[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [staffLocations, setStaffLocations] = useState<Record<string, string>>({});
  const [pricingOptions, setPricingOptions] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(new Set(['all']));

  const [filterPreset, setFilterPreset] = useState<FilterPreset>('this_month');
  const [dateRange, setDateRange] = useState(getFilterPresetDates('this_month'));
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const months = getMonthsForTimeline();

  const loadLocations = useCallback(async () => {
    const { data } = await supabase
      .from('locations')
      .select('id, name')
      .order('name');
    setLocations(data || []);
  }, []);

  const loadPricingOptions = useCallback(async () => {
    const { data } = await supabase
      .from('pricing_options')
      .select('id, mindbody_id, price, program_id');

    const priceMap: Record<string, number> = {};
    (data || []).forEach((po: any) => {
      if (po.price) {
        priceMap[po.id] = po.price;
        priceMap[po.mindbody_id] = po.price;
        if (po.program_id) {
          if (!priceMap[`program_${po.program_id}`]) {
            priceMap[`program_${po.program_id}`] = po.price;
          }
        }
      }
    });

    const { data: links } = await supabase
      .from('pricing_option_session_types')
      .select('pricing_option_id, session_type_id');

    (links || []).forEach((link: any) => {
      const price = priceMap[link.pricing_option_id];
      if (price && !priceMap[`session_${link.session_type_id}`]) {
        priceMap[`session_${link.session_type_id}`] = price;
      }
    });

    setPricingOptions(priceMap);
  }, []);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      const { data: staffData } = await supabase
        .from('staff')
        .select('id, first_name, last_name, email')
        .order('last_name');

      const staffWithEmptyStats = (staffData || []).map(s => ({
        ...s,
        total_appointments: 0,
        unique_clients: 0,
        total_revenue: 0,
        services_provided: [],
      }));

      const { data: appointmentCounts } = await supabase
        .from('appointments')
        .select('staff_id, client_id, location_id, session_type_id')
        .gte('start_datetime', dateRange.start)
        .lte('start_datetime', dateRange.end + 'T23:59:59')
        .eq('status', 'Completed');

      const statsMap: Record<string, { appointments: number; clients: Set<string>; location: string | null; revenue: number }> = {};
      const staffLocationMap: Record<string, string> = {};

      (appointmentCounts || []).forEach((a: any) => {
        if (!a.staff_id) return;
        if (!statsMap[a.staff_id]) {
          statsMap[a.staff_id] = { appointments: 0, clients: new Set(), location: null, revenue: 0 };
        }
        statsMap[a.staff_id].appointments++;
        if (a.client_id) {
          statsMap[a.staff_id].clients.add(a.client_id);
        }
        if (a.location_id) {
          statsMap[a.staff_id].location = a.location_id;
          staffLocationMap[a.staff_id] = a.location_id;
        }
        if (a.session_type_id) {
          const price = pricingOptions[`session_${a.session_type_id}`] || 0;
          statsMap[a.staff_id].revenue += price;
        }
      });

      setStaffLocations(staffLocationMap);

      const staffWithStats = staffWithEmptyStats.map(s => ({
        ...s,
        total_appointments: statsMap[s.id]?.appointments || 0,
        unique_clients: statsMap[s.id]?.clients.size || 0,
        total_revenue: statsMap[s.id]?.revenue || 0,
      }));

      staffWithStats.sort((a, b) => b.total_appointments - a.total_appointments);

      setStaff(staffWithStats);
    } catch (error) {
      console.error('Error loading staff:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange, pricingOptions]);

  const loadStaffDetails = async (staffId: string) => {
    setLoadingDetails(staffId);
    try {
      const { data: appointments } = await supabase
        .from('appointments')
        .select(`
          id,
          client_id,
          client_service_id,
          session_type_id,
          status,
          client:client_id (first_name, last_name),
          session_type:session_type_id (name)
        `)
        .eq('staff_id', staffId)
        .eq('status', 'Completed')
        .not('client_service_id', 'is', null)
        .gte('start_datetime', dateRange.start)
        .lte('start_datetime', dateRange.end + 'T23:59:59');

      const serviceClientMap: Record<string, {
        session_type_name: string;
        client_service_names: Set<string>;
        clients: Record<string, { name: string; count: number }>;
        price: number;
      }> = {};

      const clientServiceIds = [...new Set((appointments || []).map((a: any) => a.client_service_id).filter(Boolean))];

      let clientServicesMap: Record<string, string> = {};
      if (clientServiceIds.length > 0) {
        const { data: clientServices } = await supabase
          .from('client_services')
          .select('mindbody_id, name')
          .in('mindbody_id', clientServiceIds);

        (clientServices || []).forEach((cs: any) => {
          clientServicesMap[cs.mindbody_id] = cs.name;
        });
      }

      (appointments || []).forEach((a: any) => {
        const stId = a.session_type_id || 'unknown';
        const stName = a.session_type?.name || 'Unknown Service';

        if (!serviceClientMap[stId]) {
          const price = pricingOptions[`session_${stId}`] || 0;
          serviceClientMap[stId] = {
            session_type_name: stName,
            client_service_names: new Set(),
            clients: {},
            price,
          };
        }

        if (a.client_service_id && clientServicesMap[a.client_service_id]) {
          serviceClientMap[stId].client_service_names.add(clientServicesMap[a.client_service_id]);
        }

        const clientId = a.client_id || 'unknown';
        const clientName = a.client
          ? `${a.client.first_name || ''} ${a.client.last_name || ''}`.trim()
          : 'Unknown Client';

        if (!serviceClientMap[stId].clients[clientId]) {
          serviceClientMap[stId].clients[clientId] = { name: clientName, count: 0 };
        }
        serviceClientMap[stId].clients[clientId].count++;
      });

      const services_provided: StaffServiceStat[] = Object.entries(serviceClientMap).map(([stId, data]) => {
        const appointmentCount = Object.values(data.clients).reduce((sum, c) => sum + c.count, 0);
        return {
          session_type_id: stId,
          session_type_name: data.session_type_name,
          client_service_name: [...data.client_service_names].join(', '),
          client_count: Object.keys(data.clients).length,
          appointment_count: appointmentCount,
          price: data.price,
          total_revenue: data.price * appointmentCount,
          clients: Object.entries(data.clients).map(([cId, c]) => ({
            client_id: cId,
            client_name: c.name,
            appointments: c.count,
          })),
        };
      });

      services_provided.sort((a, b) => b.appointment_count - a.appointment_count);

      setStaff(prev =>
        prev.map(s =>
          s.id === staffId
            ? { ...s, services_provided }
            : s
        )
      );
    } catch (error) {
      console.error('Error loading staff details:', error);
    } finally {
      setLoadingDetails(null);
    }
  };

  useEffect(() => {
    loadLocations();
    loadPricingOptions();
  }, [loadLocations, loadPricingOptions]);

  useEffect(() => {
    if (Object.keys(pricingOptions).length > 0) {
      loadStaff();
    }
  }, [loadStaff, pricingOptions]);

  const handlePresetChange = (preset: FilterPreset) => {
    setFilterPreset(preset);
    setSelectedMonth(null);
    if (preset !== 'custom') {
      setDateRange(getFilterPresetDates(preset));
      setStaff(prev => prev.map(s => ({ ...s, services_provided: [] })));
      setExpandedId(null);
    }
  };

  const handleMonthSelect = (month: { start: string; end: string; label: string }) => {
    setSelectedMonth(month.label);
    setFilterPreset('custom');
    setDateRange({ start: month.start, end: month.end });
    setStaff(prev => prev.map(s => ({ ...s, services_provided: [] })));
    setExpandedId(null);
  };

  const handleDateChange = (field: 'start' | 'end', value: string) => {
    setFilterPreset('custom');
    setSelectedMonth(null);
    setDateRange(prev => ({ ...prev, [field]: value }));
    setStaff(prev => prev.map(s => ({ ...s, services_provided: [] })));
    setExpandedId(null);
  };

  const filteredStaff = staff.filter(s => {
    const matchesSearch = search === '' ||
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      s.email?.toLowerCase().includes(search.toLowerCase());

    const matchesLocation = selectedLocation === 'all' ||
      staffLocations[s.id] === selectedLocation;

    return matchesSearch && matchesLocation;
  });

  const groupedByLocation: LocationGroup[] = (() => {
    const groups: Record<string, LocationGroup> = {};

    filteredStaff.forEach(s => {
      const locId = staffLocations[s.id] || 'unknown';
      const location = locations.find(l => l.id === locId);
      const locName = location?.name || 'Unknown Location';

      if (!groups[locId]) {
        groups[locId] = {
          location_id: locId,
          location_name: locName,
          staff: [],
          total_appointments: 0,
          total_clients: 0,
          total_revenue: 0,
        };
      }

      groups[locId].staff.push(s);
      groups[locId].total_appointments += s.total_appointments;
      groups[locId].total_clients += s.unique_clients;
      groups[locId].total_revenue += s.total_revenue;
    });

    return Object.values(groups).sort((a, b) => b.total_appointments - a.total_appointments);
  })();

  const toggleLocationExpand = (locId: string) => {
    setExpandedLocations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(locId)) {
        newSet.delete(locId);
      } else {
        newSet.add(locId);
      }
      return newSet;
    });
  };

  const totals = {
    appointments: filteredStaff.reduce((sum, s) => sum + s.total_appointments, 0),
    clients: filteredStaff.reduce((sum, s) => sum + s.unique_clients, 0),
    revenue: filteredStaff.reduce((sum, s) => sum + s.total_revenue, 0),
  };

  const handleExport = async () => {
    const { data: appointments } = await supabase
      .from('appointments')
      .select(`
        id,
        start_datetime,
        status,
        staff_id,
        client_id,
        location_id,
        session_type_id,
        client_service_id,
        staff:staff_id (first_name, last_name),
        client:client_id (first_name, last_name),
        location:location_id (name),
        session_type:session_type_id (name)
      `)
      .eq('status', 'Completed')
      .gte('start_datetime', dateRange.start)
      .lte('start_datetime', dateRange.end + 'T23:59:59')
      .order('start_datetime', { ascending: true });

    if (!appointments || appointments.length === 0) {
      alert('No appointments found for selected period');
      return;
    }

    const clientServiceIds = [...new Set(appointments.map((a: any) => a.client_service_id).filter(Boolean))];
    let clientServicesMap: Record<string, { name: string; pricing_option_name: string }> = {};

    if (clientServiceIds.length > 0) {
      const { data: clientServices } = await supabase
        .from('client_services')
        .select('mindbody_id, name')
        .in('mindbody_id', clientServiceIds);

      (clientServices || []).forEach((cs: any) => {
        clientServicesMap[cs.mindbody_id] = { name: cs.name, pricing_option_name: cs.name };
      });
    }

    const staffFilter = filteredStaff.map(s => s.id);
    const filteredAppointments = appointments.filter((a: any) => staffFilter.includes(a.staff_id));

    const exportData = filteredAppointments.map((a: any) => ({
      date: new Date(a.start_datetime).toLocaleDateString('lv-LV'),
      time: new Date(a.start_datetime).toLocaleTimeString('lv-LV', { hour: '2-digit', minute: '2-digit' }),
      staff: a.staff ? `${a.staff.first_name || ''} ${a.staff.last_name || ''}`.trim() : 'Unknown',
      location: a.location?.name || 'Unknown',
      client: a.client ? `${a.client.first_name || ''} ${a.client.last_name || ''}`.trim() : 'Unknown',
      service: a.session_type?.name || 'Unknown',
      pricing_option: clientServicesMap[a.client_service_id]?.name || '-',
      price: pricingOptions[`session_${a.session_type_id}`] || 0,
    }));

    exportToExcel(exportData, 'staff_services_report');
  };

  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Staff Services Report</h2>
            <p className="text-slate-600 mt-1">
              View pricing options usage by staff member, grouped by location
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={filteredStaff.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="text-sm text-slate-600">Total Appointments</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">{totals.appointments}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="text-sm text-slate-600">Unique Clients</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{totals.clients}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="text-sm text-slate-600">Locations</div>
            <div className="text-2xl font-bold text-amber-600 mt-1">{groupedByLocation.length}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="text-sm text-slate-600">Est. Revenue</div>
            <div className="text-2xl font-bold text-green-600 mt-1">€{totals.revenue.toLocaleString()}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => handlePresetChange('today')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filterPreset === 'today' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => handlePresetChange('this_week')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filterPreset === 'this_week' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => handlePresetChange('this_month')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filterPreset === 'this_month' && !selectedMonth ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => handlePresetChange('last_month')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filterPreset === 'last_month' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Last Month
            </button>
            <button
              onClick={() => handlePresetChange('this_year')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filterPreset === 'this_year' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              This Year
            </button>
          </div>

          <div className="flex gap-1 overflow-x-auto pb-2">
            {months.map((month) => (
              <button
                key={month.label}
                onClick={() => handleMonthSelect(month)}
                className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedMonth === month.label ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {month.label}
              </button>
            ))}
          </div>

          <div className="flex gap-4 items-center flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Search staff by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="all">All Locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" />
              <span className="text-sm text-slate-600">Custom:</span>
            </div>

            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => handleDateChange('start', e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
            />

            <span className="text-slate-400">to</span>

            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => handleDateChange('end', e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
            />

            <button
              onClick={loadStaff}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              Apply
            </button>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-600">
            Loading staff...
          </div>
        ) : groupedByLocation.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-600">
            <UserCog className="w-12 h-12 mx-auto mb-4 text-slate-400" />
            <p className="text-lg font-medium">No staff found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedByLocation.map((group) => (
              <div key={group.location_id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div
                  className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => toggleLocationExpand(group.location_id)}
                >
                  <div className="flex items-center gap-3">
                    {expandedLocations.has(group.location_id) ? (
                      <ChevronDown className="w-5 h-5 text-slate-500" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-slate-500" />
                    )}
                    <Building2 className="w-5 h-5 text-amber-600" />
                    <div>
                      <h3 className="font-semibold text-slate-900">{group.location_name}</h3>
                      <p className="text-sm text-slate-500">{group.staff.length} staff member{group.staff.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <div className="font-semibold text-blue-600">{group.total_appointments}</div>
                      <div className="text-xs text-slate-500">Appointments</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-emerald-600">{group.total_clients}</div>
                      <div className="text-xs text-slate-500">Clients</div>
                    </div>
                    <div className="text-center min-w-[100px]">
                      <div className="font-semibold text-green-600 flex items-center gap-1 justify-center">
                        <DollarSign className="w-4 h-4" />
                        {group.total_revenue.toLocaleString()}
                      </div>
                      <div className="text-xs text-slate-500">Revenue</div>
                    </div>
                  </div>
                </div>

                {expandedLocations.has(group.location_id) && (
                  <div className="p-4">
                    {group.staff.map(s => (
                      <StaffRow
                        key={s.id}
                        staff={s}
                        expanded={expandedId === s.id}
                        onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
                        onLoadDetails={loadStaffDetails}
                        loading={loadingDetails === s.id}
                        dateRange={dateRange}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
