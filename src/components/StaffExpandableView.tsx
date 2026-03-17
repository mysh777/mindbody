import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ChevronDown, ChevronRight, UserCog, Calendar, Package, Users, Clock, Filter } from 'lucide-react';

interface StaffServiceStat {
  session_type_id: string;
  session_type_name: string;
  client_service_name: string;
  client_count: number;
  appointment_count: number;
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
  services_provided: StaffServiceStat[];
}

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

export function StaffExpandableView() {
  const [staff, setStaff] = useState<StaffWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [dateRange, setDateRange] = useState({
    start: firstDayOfMonth.toISOString().split('T')[0],
    end: today.toISOString().split('T')[0],
  });

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
        services_provided: [],
      }));

      const { data: appointmentCounts } = await supabase
        .from('appointments')
        .select('staff_id, client_id')
        .gte('start_datetime', dateRange.start)
        .lte('start_datetime', dateRange.end + 'T23:59:59')
        .eq('status', 'Completed');

      const statsMap: Record<string, { appointments: number; clients: Set<string> }> = {};

      (appointmentCounts || []).forEach((a: any) => {
        if (!a.staff_id) return;
        if (!statsMap[a.staff_id]) {
          statsMap[a.staff_id] = { appointments: 0, clients: new Set() };
        }
        statsMap[a.staff_id].appointments++;
        if (a.client_id) {
          statsMap[a.staff_id].clients.add(a.client_id);
        }
      });

      const staffWithStats = staffWithEmptyStats.map(s => ({
        ...s,
        total_appointments: statsMap[s.id]?.appointments || 0,
        unique_clients: statsMap[s.id]?.clients.size || 0,
      }));

      staffWithStats.sort((a, b) => b.total_appointments - a.total_appointments);

      setStaff(staffWithStats);
    } catch (error) {
      console.error('Error loading staff:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

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
          serviceClientMap[stId] = {
            session_type_name: stName,
            client_service_names: new Set(),
            clients: {},
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

      const services_provided: StaffServiceStat[] = Object.entries(serviceClientMap).map(([stId, data]) => ({
        session_type_id: stId,
        session_type_name: data.session_type_name,
        client_service_name: [...data.client_service_names].join(', '),
        client_count: Object.keys(data.clients).length,
        appointment_count: Object.values(data.clients).reduce((sum, c) => sum + c.count, 0),
        clients: Object.entries(data.clients).map(([cId, c]) => ({
          client_id: cId,
          client_name: c.name,
          appointments: c.count,
        })),
      }));

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
    loadStaff();
  }, [loadStaff]);

  const filteredStaff = staff.filter(s => {
    const matchesSearch = search === '' ||
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      s.email?.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const handleDateChange = (field: 'start' | 'end', value: string) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
    setStaff(prev => prev.map(s => ({ ...s, services_provided: [] })));
    setExpandedId(null);
  };

  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Staff Services Report</h2>
            <p className="text-slate-600 mt-1">
              View pricing options usage by staff member
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
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

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" />
              <span className="text-sm text-slate-600">Period:</span>
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
        ) : filteredStaff.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-600">
            <UserCog className="w-12 h-12 mx-auto mb-4 text-slate-400" />
            <p className="text-lg font-medium">No staff found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredStaff.map(s => (
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
    </div>
  );
}
