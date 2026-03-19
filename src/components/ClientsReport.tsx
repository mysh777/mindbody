import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { ChevronDown, ChevronRight, Search, Calendar, ArrowUpDown, Download, User, Package, ShoppingCart } from 'lucide-react';
import { exportToExcel } from '../utils/exportExcel';

interface ClientService {
  id: string;
  mindbody_id: string;
  name: string;
  count: number;
  remaining: number;
  active_date: string;
  expiration_date: string;
  program_name: string;
}

interface SaleItem {
  id: string;
  sale_id: string;
  item_name: string;
  quantity: number;
  total_amount: number;
  sale_datetime: string;
  pricing_option_name?: string;
}

interface ClientRow {
  id: string;
  mindbody_id: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile_phone: string;
  home_phone: string;
  creation_date: string;
  total_purchases: number;
}

type SortField = 'name' | 'total';
type SortDirection = 'asc' | 'desc';

export function ClientsReport() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortField, setSortField] = useState<SortField>('total');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [clientDetails, setClientDetails] = useState<{
    services: ClientService[];
    purchases: SaleItem[];
  } | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    setStartDate(firstDay.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadClients = useCallback(async () => {
    if (!startDate || !endDate) return;

    setLoading(true);
    try {
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('client_id, total')
        .gte('sale_datetime', `${startDate}T00:00:00`)
        .lte('sale_datetime', `${endDate}T23:59:59`)
        .not('client_id', 'is', null);

      if (salesError) throw salesError;

      const clientTotals = new Map<string, number>();
      (salesData || []).forEach(sale => {
        const current = clientTotals.get(sale.client_id) || 0;
        clientTotals.set(sale.client_id, current + (Number(sale.total) || 0));
      });

      const clientIds = Array.from(clientTotals.keys());
      if (clientIds.length === 0) {
        setClients([]);
        setLoading(false);
        return;
      }

      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select('id, mindbody_id, first_name, last_name, email, mobile_phone, home_phone, creation_date')
        .in('id', clientIds);

      if (clientsError) throw clientsError;

      const clientsWithTotals: ClientRow[] = (clientsData || []).map(client => ({
        ...client,
        total_purchases: clientTotals.get(client.id) || 0,
      }));

      setClients(clientsWithTotals);
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const loadClientDetails = useCallback(async (clientId: string) => {
    setDetailsLoading(true);
    try {
      const servicesRes = await supabase
        .from('client_services')
        .select('id, mindbody_id, name, count, remaining, active_date, expiration_date, program_name')
        .eq('client_id', clientId)
        .order('active_date', { ascending: false });

      const { data: clientSales } = await supabase
        .from('sales')
        .select('id, sale_datetime')
        .eq('client_id', clientId)
        .gte('sale_datetime', `${startDate}T00:00:00`)
        .lte('sale_datetime', `${endDate}T23:59:59`)
        .order('sale_datetime', { ascending: false });

      const saleIds = (clientSales || []).map(s => s.id);
      const saleDateMap = new Map((clientSales || []).map(s => [s.id, s.sale_datetime]));

      let itemsData: any[] = [];
      if (saleIds.length > 0) {
        const { data } = await supabase
          .from('sale_items')
          .select('id, sale_id, item_name, description, quantity, total_amount, unit_price')
          .in('sale_id', saleIds);
        itemsData = data || [];
      }

      const services: ClientService[] = (servicesRes.data || []).map((s: any) => ({
        id: s.id,
        mindbody_id: s.mindbody_id,
        name: s.name,
        count: s.count,
        remaining: s.remaining,
        active_date: s.active_date,
        expiration_date: s.expiration_date,
        program_name: s.program_name,
      }));

      const purchases: SaleItem[] = itemsData.map((item: any) => ({
        id: item.id,
        sale_id: item.sale_id,
        item_name: item.item_name || item.description || '-',
        quantity: item.quantity,
        total_amount: Number(item.total_amount) || 0,
        sale_datetime: saleDateMap.get(item.sale_id) || null,
      }));

      purchases.sort((a, b) => {
        if (!a.sale_datetime || !b.sale_datetime) return 0;
        return new Date(b.sale_datetime).getTime() - new Date(a.sale_datetime).getTime();
      });

      setClientDetails({ services, purchases });
    } catch (error) {
      console.error('Error loading client details:', error);
    } finally {
      setDetailsLoading(false);
    }
  }, [startDate, endDate]);

  const handleToggleExpand = (clientId: string) => {
    if (expandedClientId === clientId) {
      setExpandedClientId(null);
      setClientDetails(null);
    } else {
      setExpandedClientId(clientId);
      loadClientDetails(clientId);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'total' ? 'desc' : 'asc');
    }
  };

  const filteredAndSortedClients = useMemo(() => {
    let result = [...clients];

    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase();
      result = result.filter(client =>
        client.first_name?.toLowerCase().includes(searchLower) ||
        client.last_name?.toLowerCase().includes(searchLower) ||
        client.email?.toLowerCase().includes(searchLower) ||
        client.mobile_phone?.includes(debouncedSearch) ||
        client.home_phone?.includes(debouncedSearch) ||
        client.mindbody_id?.includes(debouncedSearch)
      );
    }

    result.sort((a, b) => {
      if (sortField === 'name') {
        const nameA = `${a.last_name || ''} ${a.first_name || ''}`.toLowerCase();
        const nameB = `${b.last_name || ''} ${b.first_name || ''}`.toLowerCase();
        return sortDirection === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      } else {
        return sortDirection === 'asc'
          ? a.total_purchases - b.total_purchases
          : b.total_purchases - a.total_purchases;
      }
    });

    return result;
  }, [clients, debouncedSearch, sortField, sortDirection]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}.${month}.${year}`;
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const totalRevenue = useMemo(() => {
    return filteredAndSortedClients.reduce((sum, c) => sum + c.total_purchases, 0);
  }, [filteredAndSortedClients]);

  const handleExport = () => {
    const exportData = filteredAndSortedClients.map(c => ({
      'Client ID': c.mindbody_id,
      'First Name': c.first_name,
      'Last Name': c.last_name,
      'Email': c.email,
      'Mobile Phone': c.mobile_phone,
      'Total Purchases': c.total_purchases,
    }));
    exportToExcel(exportData, `clients_report_${startDate}_${endDate}`);
  };

  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Clients Report</h2>
            <p className="text-slate-600 mt-1">
              Client activity and purchases for selected period
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={filteredAndSortedClients.length === 0}
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
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-slate-700 mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name, email, phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="w-40">
              <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
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
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
            <div className="text-sm text-slate-600">
              Found <span className="font-semibold">{filteredAndSortedClients.length}</span> clients
            </div>
            <div className="text-sm font-semibold text-emerald-600">
              Total: {formatCurrency(totalRevenue)}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-600">
            Loading clients...
          </div>
        ) : filteredAndSortedClients.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-600">
            <User className="w-12 h-12 mx-auto mb-4 text-slate-400" />
            <p className="text-lg font-medium">No clients found</p>
            <p className="text-sm mt-2">Try adjusting the date range or search criteria</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-[auto_1fr_1fr_1fr_120px] gap-4 px-4 py-3 bg-slate-50 border-b border-slate-200 font-medium text-sm text-slate-700">
              <div className="w-8"></div>
              <button
                onClick={() => handleSort('name')}
                className="flex items-center gap-1 hover:text-slate-900"
              >
                Client
                <ArrowUpDown className="w-4 h-4" />
              </button>
              <div>Email</div>
              <div>Phone</div>
              <button
                onClick={() => handleSort('total')}
                className="flex items-center gap-1 justify-end hover:text-slate-900"
              >
                Purchases
                <ArrowUpDown className="w-4 h-4" />
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {filteredAndSortedClients.map(client => (
                <div key={client.id}>
                  <div
                    className="grid grid-cols-[auto_1fr_1fr_1fr_120px] gap-4 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors items-center"
                    onClick={() => handleToggleExpand(client.id)}
                  >
                    <div className="w-8">
                      {expandedClientId === client.id ? (
                        <ChevronDown className="w-5 h-5 text-slate-500" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-slate-500" />
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">
                        {client.first_name} {client.last_name}
                      </div>
                      <div className="text-xs text-slate-500">ID: {client.mindbody_id}</div>
                    </div>
                    <div className="text-slate-600 truncate">{client.email || '-'}</div>
                    <div className="text-slate-600">{client.mobile_phone || client.home_phone || '-'}</div>
                    <div className="text-right font-semibold text-emerald-600">
                      {formatCurrency(client.total_purchases)}
                    </div>
                  </div>

                  {expandedClientId === client.id && (
                    <div className="bg-slate-50 border-t border-slate-200 p-4">
                      {detailsLoading ? (
                        <div className="text-center py-8 text-slate-500">Loading details...</div>
                      ) : clientDetails ? (
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <h4 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                              <Package className="w-4 h-4" />
                              Pricing Options (Remaining Sessions)
                            </h4>
                            {clientDetails.services.length === 0 ? (
                              <div className="text-sm text-slate-500 py-4 text-center bg-white rounded-lg border border-slate-200">
                                No active pricing options
                              </div>
                            ) : (
                              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                {clientDetails.services.map(service => (
                                  <div
                                    key={service.id}
                                    className={`p-3 rounded-lg border ${
                                      service.remaining > 0
                                        ? 'bg-emerald-50 border-emerald-200'
                                        : 'bg-slate-100 border-slate-200'
                                    }`}
                                  >
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <div className="font-medium text-slate-900">{service.name}</div>
                                        <div className="text-xs text-slate-500">{service.program_name}</div>
                                      </div>
                                      <div className={`text-lg font-bold ${
                                        service.remaining > 0 ? 'text-emerald-600' : 'text-slate-400'
                                      }`}>
                                        {service.remaining}/{service.count}
                                      </div>
                                    </div>
                                    <div className="mt-2 text-xs text-slate-500 flex gap-3">
                                      <span>Active: {formatDate(service.active_date)}</span>
                                      <span>Expires: {formatDate(service.expiration_date)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div>
                            <h4 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                              <ShoppingCart className="w-4 h-4" />
                              Purchases (Period)
                            </h4>
                            {clientDetails.purchases.length === 0 ? (
                              <div className="text-sm text-slate-500 py-4 text-center bg-white rounded-lg border border-slate-200">
                                No purchases in selected period
                              </div>
                            ) : (
                              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                {clientDetails.purchases.map(item => (
                                  <div
                                    key={item.id}
                                    className="p-3 rounded-lg border bg-white border-slate-200"
                                  >
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <div className="font-medium text-slate-900">{item.item_name}</div>
                                        <div className="text-xs text-slate-500">
                                          {formatDate(item.sale_datetime)} | Qty: {item.quantity}
                                        </div>
                                      </div>
                                      <div className="text-emerald-600 font-semibold">
                                        {formatCurrency(item.total_amount)}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
