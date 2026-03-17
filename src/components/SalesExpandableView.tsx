import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Download, RefreshCw, ChevronDown, ChevronRight, CreditCard, Package } from 'lucide-react';
import { exportToExcel } from '../utils/exportExcel';

interface SalesExpandableViewProps {
  onNavigate?: (tableName: string, id: string) => void;
}

interface Sale {
  id: string;
  mindbody_id: string;
  client_id: string | null;
  sale_datetime: string | null;
  location_id: string | null;
  sales_rep_id: string | null;
  recipient_client_id: string | null;
  total: number | null;
  payment_amount: number | null;
  raw_data: any;
}

interface SaleItem {
  id: string;
  sale_id: string;
  sale_detail_id: string;
  item_id: string;
  description: string | null;
  item_name: string | null;
  quantity: number;
  unit_price: number;
  total_amount: number;
  discount_amount: number;
  tax_amount: number;
  is_service: boolean;
  payment_ref_id: string | null;
  recipient_client_id: string | null;
}

interface Payment {
  id: string;
  mindbody_id: string;
  sale_id: string;
  type: string | null;
  method: number | null;
  amount: number;
  notes: string | null;
  transaction_id: string | null;
}

interface RelatedDataCache {
  clients: Record<string, string>;
  staff: Record<string, string>;
  locations: Record<string, string>;
}

const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  } catch {
    return dateString;
  }
};

const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

const getPaymentMethodName = (method: number | null): string => {
  const methods: Record<number, string> = {
    0: 'Cash',
    1: 'Check',
    2: 'Credit Card',
    3: 'Gift Card',
    4: 'Account',
    5: 'Comp',
    6: 'Custom Payment',
    7: 'Direct Debit',
    8: 'Finance',
  };
  return method !== null ? (methods[method] || `Method ${method}`) : '-';
};

export function SalesExpandableView({ onNavigate }: SalesExpandableViewProps) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(100);
  const [expandedSales, setExpandedSales] = useState<Set<string>>(new Set());
  const [saleItems, setSaleItems] = useState<Record<string, SaleItem[]>>({});
  const [payments, setPayments] = useState<Record<string, Payment[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());
  const [relatedCache, setRelatedCache] = useState<RelatedDataCache>({
    clients: {},
    staff: {},
    locations: {},
  });

  const loadRelatedData = useCallback(async () => {
    const cache: RelatedDataCache = {
      clients: {},
      staff: {},
      locations: {},
    };

    const [clientsRes, staffRes, locationsRes] = await Promise.all([
      supabase.from('clients').select('id, first_name, last_name'),
      supabase.from('staff').select('id, first_name, last_name'),
      supabase.from('locations').select('id, name'),
    ]);

    if (clientsRes.data) {
      clientsRes.data.forEach((c: any) => {
        cache.clients[c.id] = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.id;
      });
    }
    if (staffRes.data) {
      staffRes.data.forEach((s: any) => {
        cache.staff[s.id] = `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.id;
      });
    }
    if (locationsRes.data) {
      locationsRes.data.forEach((l: any) => {
        cache.locations[l.id] = l.name || l.id;
      });
    }

    setRelatedCache(cache);
  }, []);

  const loadSales = async () => {
    setLoading(true);
    try {
      const { count } = await supabase
        .from('sales')
        .select('*', { count: 'exact', head: true });

      setTotalCount(count || 0);

      const { data, error } = await supabase
        .from('sales')
        .select('id, mindbody_id, client_id, sale_datetime, location_id, sales_rep_id, recipient_client_id, total, payment_amount, raw_data')
        .order('sale_datetime', { ascending: false })
        .limit(limit);

      if (error) throw error;
      setSales(data || []);
    } catch (error) {
      console.error('Error loading sales:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSaleDetails = async (saleId: string) => {
    if (saleItems[saleId] && payments[saleId]) return;

    setLoadingDetails(prev => new Set(prev).add(saleId));

    try {
      const [itemsRes, paymentsRes] = await Promise.all([
        supabase.from('sale_items').select('*').eq('sale_id', saleId),
        supabase.from('payments').select('*').eq('sale_id', saleId),
      ]);

      if (itemsRes.data) {
        setSaleItems(prev => ({ ...prev, [saleId]: itemsRes.data || [] }));
      }
      if (paymentsRes.data) {
        setPayments(prev => ({ ...prev, [saleId]: paymentsRes.data || [] }));
      }
    } catch (error) {
      console.error('Error loading sale details:', error);
    } finally {
      setLoadingDetails(prev => {
        const newSet = new Set(prev);
        newSet.delete(saleId);
        return newSet;
      });
    }
  };

  const toggleExpand = (saleId: string) => {
    const newExpanded = new Set(expandedSales);
    if (newExpanded.has(saleId)) {
      newExpanded.delete(saleId);
    } else {
      newExpanded.add(saleId);
      loadSaleDetails(saleId);
    }
    setExpandedSales(newExpanded);
  };

  const expandAll = () => {
    const allIds = new Set(filteredSales.map(s => s.id));
    setExpandedSales(allIds);
    filteredSales.forEach(s => loadSaleDetails(s.id));
  };

  const collapseAll = () => {
    setExpandedSales(new Set());
  };

  useEffect(() => {
    loadSales();
    loadRelatedData();
  }, [limit, loadRelatedData]);

  const filteredSales = sales.filter(sale => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      sale.id.toLowerCase().includes(searchLower) ||
      sale.mindbody_id.toLowerCase().includes(searchLower) ||
      (sale.client_id && relatedCache.clients[sale.client_id]?.toLowerCase().includes(searchLower)) ||
      (sale.location_id && relatedCache.locations[sale.location_id]?.toLowerCase().includes(searchLower))
    );
  });

  const handleExport = () => {
    const exportData: any[] = [];

    filteredSales.forEach(sale => {
      const items = saleItems[sale.id] || [];
      const paymentsList = payments[sale.id] || [];

      if (items.length === 0 && paymentsList.length === 0) {
        exportData.push({
          sale_id: sale.id,
          sale_date: sale.sale_datetime,
          client: sale.client_id ? relatedCache.clients[sale.client_id] : '',
          location: sale.location_id ? relatedCache.locations[sale.location_id] : '',
          total: sale.total,
          payment_amount: sale.payment_amount,
        });
      } else {
        items.forEach(item => {
          exportData.push({
            sale_id: sale.id,
            sale_date: sale.sale_datetime,
            client: sale.client_id ? relatedCache.clients[sale.client_id] : '',
            location: sale.location_id ? relatedCache.locations[sale.location_id] : '',
            item_type: item.is_service ? 'Service' : 'Product',
            item_description: item.description || item.item_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            discount: item.discount_amount,
            tax: item.tax_amount,
            item_total: item.total_amount,
            sale_total: sale.total,
          });
        });
      }
    });

    exportToExcel(exportData, 'sales_with_items_export');
  };

  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Sales</h2>
            <p className="text-slate-600 mt-1">
              {loading ? 'Loading...' : `Showing ${filteredSales.length} of ${sales.length} loaded records (${totalCount} total)`}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={expandAll}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Collapse All
            </button>
            <button
              onClick={loadSales}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleExport}
              disabled={filteredSales.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by ID, client, location..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={50}>50 rows</option>
              <option value={100}>100 rows</option>
              <option value={200}>200 rows</option>
              <option value={500}>500 rows</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-600">
            Loading...
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-600">
            No sales found
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSales.map(sale => {
              const isExpanded = expandedSales.has(sale.id);
              const isLoadingDetails = loadingDetails.has(sale.id);
              const items = saleItems[sale.id] || [];
              const paymentsList = payments[sale.id] || [];

              return (
                <div key={sale.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => toggleExpand(sale.id)}
                  >
                    <div className="text-slate-400">
                      {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    </div>

                    <div className="flex-1 grid grid-cols-6 gap-4 items-center">
                      <div>
                        <div className="text-xs text-slate-500">Sale ID</div>
                        <div className="font-mono text-sm font-medium text-slate-900">{sale.mindbody_id}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Date</div>
                        <div className="text-sm text-slate-700">{formatDate(sale.sale_datetime)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Client</div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (sale.client_id && onNavigate) onNavigate('clients', sale.client_id);
                          }}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          {sale.client_id ? relatedCache.clients[sale.client_id] || sale.client_id : '-'}
                        </button>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Location</div>
                        <div className="text-sm text-slate-700">
                          {sale.location_id ? relatedCache.locations[sale.location_id] || sale.location_id : '-'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Total</div>
                        <div className="text-sm font-semibold text-slate-900">{formatCurrency(sale.total)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Paid</div>
                        <div className="text-sm font-semibold text-green-600">{formatCurrency(sale.payment_amount)}</div>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-200 bg-slate-50 p-4">
                      {isLoadingDetails ? (
                        <div className="text-center text-slate-500 py-4">Loading details...</div>
                      ) : (
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <Package className="w-4 h-4 text-slate-500" />
                              <h4 className="font-semibold text-slate-700">Items ({items.length})</h4>
                            </div>
                            {items.length === 0 ? (
                              <div className="text-sm text-slate-500 italic">No items</div>
                            ) : (
                              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead className="bg-slate-100">
                                    <tr>
                                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Description</th>
                                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Qty</th>
                                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Price</th>
                                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Discount</th>
                                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Tax</th>
                                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {items.map(item => (
                                      <tr key={item.id} className="hover:bg-slate-50">
                                        <td className="px-3 py-2 text-slate-700">
                                          <div className="flex items-center gap-2">
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${item.is_service ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                              {item.is_service ? 'SVC' : 'PRD'}
                                            </span>
                                            {item.description || item.item_name || '-'}
                                          </div>
                                          {item.recipient_client_id && item.recipient_client_id !== sale.client_id && (
                                            <div className="text-[10px] text-slate-500 mt-0.5">
                                              Recipient: {relatedCache.clients[item.recipient_client_id] || item.recipient_client_id}
                                            </div>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-700">{item.quantity}</td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-700">{formatCurrency(item.unit_price)}</td>
                                        <td className="px-3 py-2 text-right font-mono text-red-600">
                                          {item.discount_amount > 0 ? `-${formatCurrency(item.discount_amount)}` : '-'}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-500">{formatCurrency(item.tax_amount)}</td>
                                        <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900">{formatCurrency(item.total_amount)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <CreditCard className="w-4 h-4 text-slate-500" />
                              <h4 className="font-semibold text-slate-700">Payments ({paymentsList.length})</h4>
                            </div>
                            {paymentsList.length === 0 ? (
                              <div className="text-sm text-slate-500 italic">No payments</div>
                            ) : (
                              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead className="bg-slate-100">
                                    <tr>
                                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Type</th>
                                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Method</th>
                                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Amount</th>
                                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Transaction ID</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {paymentsList.map(payment => (
                                      <tr key={payment.id} className="hover:bg-slate-50">
                                        <td className="px-3 py-2 text-slate-700">{payment.type || '-'}</td>
                                        <td className="px-3 py-2 text-slate-700">{getPaymentMethodName(payment.method)}</td>
                                        <td className="px-3 py-2 text-right font-mono font-semibold text-green-600">{formatCurrency(payment.amount)}</td>
                                        <td className="px-3 py-2 font-mono text-slate-500">{payment.transaction_id || '-'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
