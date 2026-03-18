import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useReportFilters } from '../lib/reportFiltersContext';
import { ChevronDown, ChevronRight, Package, Calendar, User, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface ClientService {
  id: string;
  mindbody_id: string;
  name: string;
  count: number;
  remaining: number;
  active_date: string;
  expiration_date: string;
  program_name: string;
  status: string;
}

interface Appointment {
  id: string;
  start_datetime: string;
  status: string;
  staff_name: string;
  session_type_name: string;
  client_service_id: string;
}

interface ClientWithServices {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile_phone: string;
  services: ClientService[];
  appointments: Appointment[];
}

interface ClientRowProps {
  client: ClientWithServices;
  onLoadDetails: (clientId: string) => void;
  expanded: boolean;
  onToggle: () => void;
  loading: boolean;
}

function ClientRow({ client, onLoadDetails, expanded, onToggle, loading }: ClientRowProps) {
  const totalServices = client.services?.length || 0;
  const activeServices = client.services?.filter(s => s.remaining > 0).length || 0;
  const completedAppointments = client.appointments?.filter(a => a.status === 'Completed').length || 0;

  const handleToggle = () => {
    if (!expanded && totalServices === 0) {
      onLoadDetails(client.id);
    }
    onToggle();
  };

  const getServicesByStatus = () => {
    const services = client.services || [];
    const active = services.filter(s => s.remaining > 0);
    const used = services.filter(s => s.remaining === 0);
    return { active, used };
  };

  const { active: activeServicesList, used: usedServicesList } = getServicesByStatus();

  const getAppointmentsByService = (serviceId: string) => {
    return (client.appointments || []).filter(a => a.client_service_id === serviceId);
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

        <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
          <User className="w-5 h-5 text-blue-600" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 truncate">
            {client.first_name} {client.last_name}
          </h3>
          <p className="text-sm text-slate-500 truncate">{client.email || client.mobile_phone || 'No contact'}</p>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div className="text-center">
            <div className="font-semibold text-emerald-600">{activeServices}</div>
            <div className="text-xs text-slate-500">Active</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-slate-700">{totalServices}</div>
            <div className="text-xs text-slate-500">Packages</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-blue-600">{completedAppointments}</div>
            <div className="text-xs text-slate-500">Visits</div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-200 bg-slate-50 p-4">
          {loading ? (
            <div className="text-center py-8 text-slate-500">Loading client data...</div>
          ) : (
            <div className="space-y-4">
              {activeServicesList.length > 0 && (
                <div>
                  <h4 className="font-semibold text-emerald-700 mb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Active Packages ({activeServicesList.length})
                  </h4>
                  <div className="space-y-2">
                    {activeServicesList.map(service => (
                      <ServiceCard
                        key={service.id}
                        service={service}
                        appointments={getAppointmentsByService(service.mindbody_id)}
                        isActive={true}
                      />
                    ))}
                  </div>
                </div>
              )}

              {usedServicesList.length > 0 && (
                <div>
                  <h4 className="font-semibold text-slate-600 mb-2 flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    Used/Expired Packages ({usedServicesList.length})
                  </h4>
                  <div className="space-y-2">
                    {usedServicesList.map(service => (
                      <ServiceCard
                        key={service.id}
                        service={service}
                        appointments={getAppointmentsByService(service.mindbody_id)}
                        isActive={false}
                      />
                    ))}
                  </div>
                </div>
              )}

              {totalServices === 0 && (
                <div className="text-center py-4 text-slate-500">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                  <p>No pricing options found for this client</p>
                  <p className="text-xs mt-1">Run Client Services sync to load data</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ServiceCardProps {
  service: ClientService;
  appointments: Appointment[];
  isActive: boolean;
}

function ServiceCard({ service, appointments, isActive }: ServiceCardProps) {
  const [showAppointments, setShowAppointments] = useState(false);
  const usedCount = service.count - service.remaining;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('lv-LV');
    } catch {
      return dateStr;
    }
  };

  return (
    <div className={`rounded-lg border p-3 ${isActive ? 'bg-white border-emerald-200' : 'bg-slate-100 border-slate-200'}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <Package className={`w-5 h-5 mt-0.5 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
          <div>
            <h5 className="font-medium text-slate-900">{service.name}</h5>
            <p className="text-xs text-slate-500">{service.program_name}</p>
          </div>
        </div>

        <div className="text-right">
          <div className={`text-lg font-bold ${isActive ? 'text-emerald-600' : 'text-slate-500'}`}>
            {service.remaining}/{service.count}
          </div>
          <div className="text-xs text-slate-500">remaining</div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-slate-600">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>Active: {formatDate(service.active_date)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          <span>Expires: {formatDate(service.expiration_date)}</span>
        </div>
      </div>

      {appointments.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          <button
            onClick={() => setShowAppointments(!showAppointments)}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            {showAppointments ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {appointments.length} appointment{appointments.length !== 1 ? 's' : ''} used
          </button>

          {showAppointments && (
            <div className="mt-2 space-y-1">
              {appointments.map(appt => (
                <div key={appt.id} className="flex items-center gap-2 text-xs text-slate-600 pl-4">
                  <span className={`w-2 h-2 rounded-full ${appt.status === 'Completed' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span>{formatDate(appt.start_datetime)}</span>
                  <span className="text-slate-400">|</span>
                  <span>{appt.session_type_name || 'Service'}</span>
                  <span className="text-slate-400">|</span>
                  <span>{appt.staff_name || 'Staff'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {usedCount > 0 && appointments.length === 0 && (
        <div className="mt-2 text-xs text-slate-500">
          {usedCount} session{usedCount !== 1 ? 's' : ''} used (appointments not linked)
        </div>
      )}
    </div>
  );
}

export function ClientExpandableView() {
  const { filters, setClientReportFilters } = useReportFilters();
  const { search, expandedId } = filters.clientReport;

  const [clients, setClients] = useState<ClientWithServices[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);

  const [filterMode, setFilterMode] = useState<'all' | 'with_packages' | 'active_only'>('with_packages');
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSearchChange = (value: string) => {
    setClientReportFilters({ search: value });
  };

  const handleExpandedIdChange = (id: string | null) => {
    setClientReportFilters({ expandedId: id });
  };

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const { data: clientServices } = await supabase
        .from('client_services')
        .select('client_id');

      const clientIdsWithServices = [...new Set((clientServices || []).map(cs => cs.client_id))];

      let query = supabase
        .from('clients')
        .select('id, first_name, last_name, email, mobile_phone')
        .order('last_name');

      if (debouncedSearch) {
        query = query.or(`first_name.ilike.%${debouncedSearch}%,last_name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%`);
      }

      if (filterMode === 'with_packages' || filterMode === 'active_only') {
        if (clientIdsWithServices.length > 0) {
          if (!debouncedSearch) {
            query = query.in('id', clientIdsWithServices);
          }
        }
      }

      if (!debouncedSearch) {
        query = query.limit(200);
      } else {
        query = query.limit(100);
      }

      const { data: clientsData } = await query;

      let filteredData = clientsData || [];
      if ((filterMode === 'with_packages' || filterMode === 'active_only') && debouncedSearch) {
        filteredData = filteredData.filter(c => clientIdsWithServices.includes(c.id));
      }

      const clientsWithEmptyServices = filteredData.map(c => ({
        ...c,
        services: [],
        appointments: [],
      }));

      setClients(clientsWithEmptyServices);
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setLoading(false);
    }
  }, [filterMode, debouncedSearch]);

  const loadClientDetails = async (clientId: string) => {
    setLoadingDetails(clientId);
    try {
      const [servicesRes, appointmentsRes] = await Promise.all([
        supabase
          .from('client_services')
          .select('*')
          .eq('client_id', clientId)
          .order('active_date', { ascending: false }),
        supabase
          .from('appointments')
          .select(`
            id,
            start_datetime,
            status,
            client_service_id,
            staff:staff_id (first_name, last_name),
            session_type:session_type_id (name)
          `)
          .eq('client_id', clientId)
          .not('client_service_id', 'is', null)
          .order('start_datetime', { ascending: false }),
      ]);

      const services = servicesRes.data || [];
      const appointments = (appointmentsRes.data || []).map((a: any) => ({
        id: a.id,
        start_datetime: a.start_datetime,
        status: a.status,
        client_service_id: a.client_service_id,
        staff_name: a.staff ? `${a.staff.first_name || ''} ${a.staff.last_name || ''}`.trim() : null,
        session_type_name: a.session_type?.name || null,
      }));

      setClients(prev =>
        prev.map(c =>
          c.id === clientId
            ? { ...c, services, appointments }
            : c
        )
      );
    } catch (error) {
      console.error('Error loading client details:', error);
    } finally {
      setLoadingDetails(null);
    }
  };

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const filteredClients = filterMode === 'active_only'
    ? clients.filter(c => c.services.length === 0 || c.services.some(s => s.remaining > 0))
    : clients;

  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Client Services Overview</h2>
            <p className="text-slate-600 mt-1">
              View purchased packages and usage history per client
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search clients by name or email..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value as any)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="with_packages">Clients with Packages</option>
              <option value="active_only">Active Packages Only</option>
              <option value="all">All Clients</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-600">
            Loading clients...
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-600">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-slate-400" />
            <p className="text-lg font-medium">No clients found</p>
            <p className="text-sm mt-2">Try running Client Services sync first</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredClients.map(client => (
              <ClientRow
                key={client.id}
                client={client}
                expanded={expandedId === client.id}
                onToggle={() => handleExpandedIdChange(expandedId === client.id ? null : client.id)}
                onLoadDetails={loadClientDetails}
                loading={loadingDetails === client.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
