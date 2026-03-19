import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Filter, ChevronLeft, ChevronRight, Download, X, FileJson, Wallet, Calendar, User, Package, Clock } from 'lucide-react';
import { exportToExcel } from '../utils/exportExcel';

interface ClientService {
  id: string;
  mindbody_id: string;
  client_id: string | null;
  product_id: string | null;
  name: string | null;
  payment_date: string | null;
  active_date: string | null;
  expiration_date: string | null;
  count: number | null;
  remaining: number | null;
  current: boolean;
  program_id: string | null;
  program_name: string | null;
  status: string | null;
  activation_type: string | null;
  raw_data: any;
  synced_at: string | null;
  client?: {
    id: string;
    first_name: string;
    last_name: string;
  };
  pricing_option?: {
    id: string;
    name: string;
    price: number | null;
  };
}

type FilterPreset = 'all' | 'active' | 'inactive' | 'expiring_soon';

export function ClientServicesView() {
  const [services, setServices] = useState<ClientService[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);
  const [searchText, setSearchText] = useState('');
  const [filterPreset, setFilterPreset] = useState<FilterPreset>('all');
  const [selectedService, setSelectedService] = useState<ClientService | null>(null);

  const page = currentPage - 1;
  const totalPages = Math.ceil(totalCount / pageSize);

  const loadServices = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('client_services')
        .select(`
          id, mindbody_id, client_id, product_id, name, payment_date, active_date, expiration_date,
          count, remaining, current, program_id, program_name, status, activation_type, raw_data, synced_at,
          pricing_option_id
        `, { count: 'exact' })
        .order('synced_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (searchText) {
        query = query.or(`name.ilike.%${searchText}%,mindbody_id.ilike.%${searchText}%,program_name.ilike.%${searchText}%`);
      }

      if (filterPreset === 'active') {
        query = query.eq('status', 'Active');
      } else if (filterPreset === 'inactive') {
        query = query.eq('status', 'Inactive');
      } else if (filterPreset === 'expiring_soon') {
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        query = query.lte('expiration_date', thirtyDaysFromNow.toISOString()).gte('expiration_date', new Date().toISOString());
      }

      const { data, count } = await query;

      const clientIds = [...new Set((data || []).map((s: any) => s.client_id).filter(Boolean))];
      const pricingOptionIds = [...new Set((data || []).map((s: any) => s.pricing_option_id).filter(Boolean))];

      let clientsMap: Record<string, { first_name: string; last_name: string }> = {};
      if (clientIds.length > 0) {
        const { data: clientsData } = await supabase
          .from('clients')
          .select('id, first_name, last_name')
          .in('id', clientIds);

        (clientsData || []).forEach((c: any) => {
          clientsMap[c.id] = { first_name: c.first_name, last_name: c.last_name };
        });
      }

      let pricingMap: Record<string, { name: string; price: number | null }> = {};
      if (pricingOptionIds.length > 0) {
        const { data: pricingData } = await supabase
          .from('pricing_options')
          .select('id, name, price')
          .in('id', pricingOptionIds);

        (pricingData || []).forEach((p: any) => {
          pricingMap[p.id] = { name: p.name, price: p.price };
        });
      }

      const enrichedServices = (data || []).map((s: any) => ({
        ...s,
        client: s.client_id ? clientsMap[s.client_id] : null,
        pricing_option: s.pricing_option_id ? pricingMap[s.pricing_option_id] : null,
      }));

      setServices(enrichedServices);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error loading client services:', error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchText, filterPreset]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handleExport = async () => {
    const { data } = await supabase
      .from('client_services')
      .select('*')
      .order('synced_at', { ascending: false })
      .limit(10000);

    if (data) {
      const exportData = data.map((s: any) => ({
        'Client Service ID': s.mindbody_id,
        'Name': s.name,
        'Client ID': s.client_id,
        'Program': s.program_name,
        'Status': s.status,
        'Count': s.count,
        'Remaining': s.remaining,
        'Payment Date': s.payment_date ? new Date(s.payment_date).toLocaleDateString('de-DE') : '',
        'Active Date': s.active_date ? new Date(s.active_date).toLocaleDateString('de-DE') : '',
        'Expiration Date': s.expiration_date ? new Date(s.expiration_date).toLocaleDateString('de-DE') : '',
        'Current': s.current ? 'Yes' : 'No',
      }));
      exportToExcel(exportData, 'client_services');
    }
  };

  const STATUS_COLORS: Record<string, string> = {
    'Active': 'bg-green-100 text-green-800',
    'Inactive': 'bg-slate-100 text-slate-700',
    'Unknown': 'bg-yellow-100 text-yellow-800',
  };

  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <Wallet className="w-7 h-7 text-pink-600" />
              Client Services
            </h2>
            <p className="text-slate-600 mt-1">Service packages and entitlements owned by clients</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">{totalCount.toLocaleString()} total records</span>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium text-slate-700">Filters:</span>
              </div>

              <input
                type="text"
                placeholder="Search by name, ID, or program..."
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-64 focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              />

              <select
                value={filterPreset}
                onChange={(e) => {
                  setFilterPreset(e.target.value as FilterPreset);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              >
                <option value="all">All Status</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive</option>
                <option value="expiring_soon">Expiring Soon (30 days)</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-pink-600 border-t-transparent rounded-full mx-auto"></div>
              <p className="text-slate-500 mt-4">Loading client services...</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Service ID</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Name</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Client</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Program</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Pricing Option</th>
                      <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">Price</th>
                      <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">Count</th>
                      <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">Remaining</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Expiration</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {services.map((service) => (
                      <tr
                        key={service.id}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => setSelectedService(service)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono text-slate-600">{service.mindbody_id}</span>
                            <FileJson className="w-3.5 h-3.5 text-slate-400" />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-900">{service.name || '-'}</span>
                        </td>
                        <td className="px-4 py-3">
                          {service.client ? (
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-slate-400" />
                              <span className="text-slate-700">{service.client.first_name} {service.client.last_name}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 font-mono text-xs">{service.client_id || '-'}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-700">{service.program_name || '-'}</span>
                        </td>
                        <td className="px-4 py-3">
                          {service.pricing_option ? (
                            <div className="flex items-center gap-2">
                              <Package className="w-4 h-4 text-slate-400" />
                              <span className="text-slate-700 text-sm">{service.pricing_option.name}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {service.pricing_option?.price ? (
                            <span className="font-medium text-slate-900">{Number(service.pricing_option.price).toFixed(2)}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-slate-700">{service.count ?? '-'}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {service.remaining !== null ? (
                            <span className={`font-medium ${service.remaining === 0 ? 'text-red-600' : service.remaining <= 2 ? 'text-orange-600' : 'text-slate-900'}`}>
                              {service.remaining}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {service.expiration_date ? (
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-slate-400" />
                              <span className={`text-sm ${new Date(service.expiration_date) < new Date() ? 'text-red-600' : 'text-slate-700'}`}>
                                {new Date(service.expiration_date).toLocaleDateString('de-DE')}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[service.status || 'Unknown'] || 'bg-slate-100 text-slate-700'}`}>
                            {service.status || 'Unknown'}
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

      {selectedService && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <FileJson className="w-5 h-5 text-pink-600" />
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Client Service #{selectedService.mindbody_id}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {selectedService.name} - {selectedService.client?.first_name} {selectedService.client?.last_name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedService(null)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-slate-900">
              <pre className="text-xs text-green-400 whitespace-pre-wrap break-words font-mono">
                {JSON.stringify(selectedService.raw_data, null, 2)}
              </pre>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-slate-200">
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(JSON.stringify(selectedService.raw_data, null, 2));
                  } catch (e) {
                    console.error('Copy failed:', e);
                  }
                }}
                className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors text-sm"
              >
                Copy JSON
              </button>
              <button
                onClick={() => setSelectedService(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
