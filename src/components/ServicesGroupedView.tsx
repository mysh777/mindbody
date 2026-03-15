import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Download, RefreshCw, ChevronRight, ChevronDown, DollarSign } from 'lucide-react';
import { exportToExcel } from '../utils/exportExcel';

interface Service {
  id: string;
  mindbody_id: string;
  name: string;
  program_id: string | null;
  default_duration_minutes: number | null;
  description: string | null;
  active: boolean;
  online_booking_enabled: boolean;
  raw_data: any;
  created_at: string;
  updated_at: string;
}

interface ServiceCategory {
  id: string;
  mindbody_id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface PricingOption {
  id: string;
  mindbody_id: string;
  name: string;
  service_type: string | null;
  service_category: string | null;
  price: number | null;
  online_price: number | null;
  duration: number | null;
  tax_included: boolean;
  tax_rate: number | null;
  sold_online: boolean;
  bookable_online: boolean;
  is_introductory: boolean;
  session_count: number | null;
  expiration_days: number | null;
  revenue_category: string | null;
  active: boolean;
  program_id: string | null;
  program_name: string | null;
}

interface PricingOptionService {
  pricing_option_id: string;
  service_id: string;
}

interface GroupedServices {
  category: ServiceCategory | null;
  services: Service[];
}

export function ServicesGroupedView() {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [pricingOptions, setPricingOptions] = useState<PricingOption[]>([]);
  const [pricingServiceLinks, setPricingServiceLinks] = useState<PricingOptionService[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterOnlineBooking, setFilterOnlineBooking] = useState<'all' | 'yes' | 'no'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'price-count'>('name');

  const loadData = async () => {
    setLoading(true);
    try {
      const [categoriesRes, servicesRes, pricingRes, linksRes] = await Promise.all([
        supabase.from('service_categories').select('*').order('name', { ascending: true }),
        supabase.from('services').select('*').order('name', { ascending: true }),
        supabase.from('pricing_options').select('*'),
        supabase.from('pricing_option_services').select('pricing_option_id, service_id'),
      ]);

      if (categoriesRes.error) throw categoriesRes.error;
      if (servicesRes.error) throw servicesRes.error;
      if (pricingRes.error) throw pricingRes.error;
      if (linksRes.error) throw linksRes.error;

      setCategories(categoriesRes.data || []);
      setServices(servicesRes.data || []);
      setPricingOptions(pricingRes.data || []);
      setPricingServiceLinks(linksRes.data || []);

      const allCategoryIds = new Set((categoriesRes.data || []).map(c => c.id));
      setExpandedCategories(allCategoryIds);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const toggleService = (serviceId: string) => {
    setExpandedServices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(serviceId)) {
        newSet.delete(serviceId);
      } else {
        newSet.add(serviceId);
      }
      return newSet;
    });
  };

  const collapseAll = () => {
    setExpandedCategories(new Set());
    setExpandedServices(new Set());
  };

  const expandAll = () => {
    const allCategoryIds = new Set([...categories.map(c => c.id), 'uncategorized']);
    setExpandedCategories(allCategoryIds);
    setExpandedServices(new Set());
  };

  const getPricingOptionsForService = (service: Service): PricingOption[] => {
    const linkedPricingIds = pricingServiceLinks
      .filter(link => link.service_id === service.id)
      .map(link => link.pricing_option_id);

    return pricingOptions.filter(po => linkedPricingIds.includes(po.id));
  };

  const groupedData: GroupedServices[] = [
    ...categories.map(category => ({
      category,
      services: services.filter(s => s.program_id === category.id),
    })),
    {
      category: null,
      services: services.filter(s => !s.program_id),
    },
  ].filter(group => group.services.length > 0);

  const filteredGroupedData = groupedData.map(group => ({
    ...group,
    services: group.services.filter(service => {
      const matchesSearch =
        search === '' ||
        service.name.toLowerCase().includes(search.toLowerCase()) ||
        (service.description && service.description.toLowerCase().includes(search.toLowerCase()));

      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'active' && service.active) ||
        (filterStatus === 'inactive' && !service.active);

      const matchesOnlineBooking =
        filterOnlineBooking === 'all' ||
        (filterOnlineBooking === 'yes' && service.online_booking_enabled) ||
        (filterOnlineBooking === 'no' && !service.online_booking_enabled);

      return matchesSearch && matchesStatus && matchesOnlineBooking;
    }).sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      } else {
        const aPricing = getPricingOptionsForService(a).length;
        const bPricing = getPricingOptionsForService(b).length;
        return bPricing - aPricing;
      }
    }),
  })).filter(group => group.services.length > 0);

  const totalServices = filteredGroupedData.reduce((sum, group) => sum + group.services.length, 0);
  const totalPricingOptions = filteredGroupedData.reduce(
    (sum, group) => sum + group.services.reduce((s, service) => s + getPricingOptionsForService(service).length, 0),
    0
  );
  const activeServices = filteredGroupedData.reduce(
    (sum, group) => sum + group.services.filter(s => s.active).length,
    0
  );
  const onlineBookableServices = filteredGroupedData.reduce(
    (sum, group) => sum + group.services.filter(s => s.online_booking_enabled).length,
    0
  );

  const handleExport = () => {
    const flatData = filteredGroupedData.flatMap(group =>
      group.services.flatMap(service => {
        const pricing = getPricingOptionsForService(service);
        if (pricing.length === 0) {
          return [{
            category_name: group.category?.name || 'Uncategorized',
            service_name: service.name,
            duration_minutes: service.default_duration_minutes,
            active: service.active,
            online_booking: service.online_booking_enabled,
            description: service.description,
            pricing_name: '-',
            price: '-',
            online_price: '-',
          }];
        }
        return pricing.map(po => ({
          category_name: group.category?.name || 'Uncategorized',
          service_name: service.name,
          duration_minutes: service.default_duration_minutes,
          active: service.active,
          online_booking: service.online_booking_enabled,
          description: service.description,
          pricing_name: po.name,
          price: po.price,
          online_price: po.online_price,
          session_count: po.session_count,
          expiration_days: po.expiration_days,
        }));
      })
    );
    exportToExcel(flatData, 'Services_with_Pricing');
  };

  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Services with Pricing</h2>
            <p className="text-slate-600 mt-1">
              {loading ? 'Loading...' : `${totalServices} services in ${filteredGroupedData.length} categories`}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleExport}
              disabled={totalServices === 0}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="text-sm text-slate-600">Total Services</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{totalServices}</div>
            <div className="text-xs text-slate-500 mt-1">
              {activeServices} active · {totalServices - activeServices} inactive
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="text-sm text-slate-600">Pricing Options</div>
            <div className="text-2xl font-bold text-green-600 mt-1">{totalPricingOptions}</div>
            <div className="text-xs text-slate-500 mt-1">
              {totalServices > 0 ? (totalPricingOptions / totalServices).toFixed(1) : 0} per service
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="text-sm text-slate-600">Categories</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">{filteredGroupedData.length}</div>
            <div className="text-xs text-slate-500 mt-1">{categories.length} total in database</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="text-sm text-slate-600">Online Booking</div>
            <div className="text-2xl font-bold text-purple-600 mt-1">{onlineBookableServices}</div>
            <div className="text-xs text-slate-500 mt-1">
              {totalServices > 0 ? Math.round((onlineBookableServices / totalServices) * 100) : 0}% of services
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
          <div className="flex gap-4 items-center flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Search services..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="all">All Status</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
              <select
                value={filterOnlineBooking}
                onChange={(e) => setFilterOnlineBooking(e.target.value as any)}
                className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="all">All Booking</option>
                <option value="yes">Online Only</option>
                <option value="no">Offline Only</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="name">Sort by Name</option>
                <option value="price-count">Sort by Price Count</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={expandAll}
              className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-700 font-medium"
            >
              Collapse All
            </button>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-600">
            Loading...
          </div>
        ) : filteredGroupedData.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-600">
            {services.length === 0 ? 'No services available. Try running a sync first.' : 'No services match your search'}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredGroupedData.map((group) => {
              const categoryId = group.category?.id || 'uncategorized';
              const isCategoryExpanded = expandedCategories.has(categoryId);

              return (
                <div key={categoryId} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <button
                    onClick={() => toggleCategory(categoryId)}
                    className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isCategoryExpanded ? (
                        <ChevronDown className="w-5 h-5 text-slate-600" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-slate-600" />
                      )}
                      <div className="text-left">
                        <h3 className="font-semibold text-slate-900 text-lg">
                          {group.category?.name || 'Uncategorized'}
                        </h3>
                        {group.category?.description && (
                          <p className="text-sm text-slate-600 mt-0.5">{group.category.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                        {group.services.length} {group.services.length === 1 ? 'service' : 'services'}
                      </span>
                      {group.category?.active !== undefined && !group.category.active && (
                        <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                          Inactive Category
                        </span>
                      )}
                    </div>
                  </button>

                  {isCategoryExpanded && (
                    <div className="border-t border-slate-200">
                      <div className="divide-y divide-slate-100">
                        {group.services.map((service) => {
                          const isServiceExpanded = expandedServices.has(service.id);
                          const servicePricing = getPricingOptionsForService(service);

                          return (
                            <div key={service.id} className="bg-slate-50">
                              <div className="flex items-center px-6 py-3 hover:bg-slate-100 transition-colors">
                                <button
                                  onClick={() => toggleService(service.id)}
                                  className="flex items-center gap-3 flex-1 text-left"
                                >
                                  {isServiceExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
                                  )}
                                  <span className="font-medium text-slate-900">{service.name}</span>
                                </button>

                                <div className="flex items-center gap-3">
                                  {service.default_duration_minutes && (
                                    <span className="text-xs text-slate-600">
                                      {service.default_duration_minutes} min
                                    </span>
                                  )}
                                  {servicePricing.length > 0 && (
                                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium flex items-center gap-1">
                                      <DollarSign className="w-3 h-3" />
                                      {servicePricing.length} {servicePricing.length === 1 ? 'price' : 'prices'}
                                    </span>
                                  )}
                                  {service.active ? (
                                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                                      Active
                                    </span>
                                  ) : (
                                    <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                                      Inactive
                                    </span>
                                  )}
                                  {service.online_booking_enabled && (
                                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                                      Online
                                    </span>
                                  )}
                                </div>
                              </div>

                              {isServiceExpanded && (
                                <div className="bg-white border-t border-slate-200">
                                  {servicePricing.length === 0 ? (
                                    <div className="px-12 py-6 text-center text-slate-500 text-sm">
                                      No pricing options available for this service
                                    </div>
                                  ) : (
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                          <tr>
                                            <th className="px-6 py-2 text-left font-semibold text-slate-700 text-xs">Pricing Option</th>
                                            <th className="px-6 py-2 text-right font-semibold text-slate-700 text-xs w-28">Price</th>
                                            <th className="px-6 py-2 text-right font-semibold text-slate-700 text-xs w-28">Online Price</th>
                                            <th className="px-6 py-2 text-center font-semibold text-slate-700 text-xs w-24">Duration</th>
                                            <th className="px-6 py-2 text-center font-semibold text-slate-700 text-xs w-24">Sessions</th>
                                            <th className="px-6 py-2 text-center font-semibold text-slate-700 text-xs w-28">Expiration</th>
                                            <th className="px-6 py-2 text-center font-semibold text-slate-700 text-xs w-24">Status</th>
                                            <th className="px-6 py-2 text-center font-semibold text-slate-700 text-xs w-28">Online</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {servicePricing.map((pricing) => (
                                            <tr key={pricing.id} className="hover:bg-slate-50 transition-colors">
                                              <td className="px-6 py-2.5 text-slate-900">
                                                {pricing.name}
                                                {pricing.is_introductory && (
                                                  <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                                                    Intro
                                                  </span>
                                                )}
                                              </td>
                                              <td className="px-6 py-2.5 text-right text-slate-900 font-mono font-medium">
                                                {pricing.price ? `€${pricing.price}` : '-'}
                                              </td>
                                              <td className="px-6 py-2.5 text-right text-slate-900 font-mono font-medium">
                                                {pricing.online_price ? `€${pricing.online_price}` : '-'}
                                              </td>
                                              <td className="px-6 py-2.5 text-center text-slate-700">
                                                {pricing.duration ? `${pricing.duration} min` : '-'}
                                              </td>
                                              <td className="px-6 py-2.5 text-center text-slate-700">
                                                {pricing.session_count || '-'}
                                              </td>
                                              <td className="px-6 py-2.5 text-center text-slate-700">
                                                {pricing.expiration_days ? `${pricing.expiration_days} days` : '-'}
                                              </td>
                                              <td className="px-6 py-2.5 text-center">
                                                {pricing.active ? (
                                                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                                                    Active
                                                  </span>
                                                ) : (
                                                  <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
                                                    Inactive
                                                  </span>
                                                )}
                                              </td>
                                              <td className="px-6 py-2.5 text-center">
                                                {pricing.bookable_online ? (
                                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                                                    Yes
                                                  </span>
                                                ) : (
                                                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                                                    No
                                                  </span>
                                                )}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
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
