import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useReportFilters } from '../lib/reportFiltersContext';
import {
  Calendar, Filter, Building2, Search, ChevronLeft, ChevronRight,
  Download, ArrowUpCircle, ArrowDownCircle, X, Loader2,
} from 'lucide-react';
import { exportToExcel } from '../utils/exportExcel';

type FilterPreset = 'today' | 'this_week' | 'this_month' | 'last_month' | 'this_year' | 'custom';

interface ActivityRow {
  id: string;
  date: string;
  type: 'purchase' | 'appointment';
  clientId: string;
  clientName: string;
  serviceName: string;
  pricingOption: string;
  amount: number;
  staffName: string;
  staffPay: number | null;
  locationId: string;
  locationName: string;
}

function getFilterPresetDates(preset: FilterPreset): { start: string; end: string } {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  switch (preset) {
    case 'today':
      return { start: todayStr, end: todayStr };
    case 'this_week': {
      const d = today.getDay();
      const mon = new Date(today);
      mon.setDate(today.getDate() - (d === 0 ? 6 : d - 1));
      return { start: mon.toISOString().split('T')[0], end: todayStr };
    }
    case 'this_month': {
      const f = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: f.toISOString().split('T')[0], end: todayStr };
    }
    case 'last_month': {
      const f = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const l = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: f.toISOString().split('T')[0], end: l.toISOString().split('T')[0] };
    }
    case 'this_year': {
      const f = new Date(today.getFullYear(), 0, 1);
      return { start: f.toISOString().split('T')[0], end: todayStr };
    }
    default:
      return { start: todayStr, end: todayStr };
  }
}

function getMonthsTimeline(): { label: string; start: string; end: string }[] {
  const months: { label: string; start: string; end: string }[] = [];
  const today = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    months.push({
      label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      start: d.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    });
  }
  return months;
}

const PAGE_SIZE = 50;

export function ClientActivityReport() {
  const { filters, setActivityReportFilters } = useReportFilters();
  const f = filters.activityReport;

  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const months = useMemo(() => getMonthsTimeline(), []);

  const dateRange = f.filterPreset === 'custom'
    ? f.dateRange
    : getFilterPresetDates(f.filterPreset as FilterPreset);

  const loadReferenceData = useCallback(async () => {
    const [locRes, cliRes] = await Promise.all([
      supabase.from('locations').select('id, name').order('name'),
      supabase.from('clients').select('id, first_name, last_name').order('last_name').limit(10000),
    ]);
    setLocations(locRes.data?.map(l => ({ id: l.id, name: l.name })) || []);
    setClients(cliRes.data?.map(c => ({ id: c.id, name: `${c.first_name} ${c.last_name}` })) || []);
  }, []);

  useEffect(() => { loadReferenceData(); }, [loadReferenceData]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const startISO = `${dateRange.start}T00:00:00`;
      const endISO = `${dateRange.end}T23:59:59`;
      const allRows: ActivityRow[] = [];

      let salesQuery = supabase
        .from('sales')
        .select('id, sale_datetime, client_id, location_id, sales_rep_id')
        .gte('sale_datetime', startISO)
        .lte('sale_datetime', endISO);

      if (f.selectedLocation !== 'all') {
        salesQuery = salesQuery.eq('location_id', f.selectedLocation);
      }
      if (f.selectedClient !== 'all') {
        salesQuery = salesQuery.eq('client_id', f.selectedClient);
      }

      const { data: salesData } = await salesQuery;
      const salesMap: Record<string, any> = {};
      const saleIds: string[] = [];
      const clientIdsNeeded = new Set<string>();
      const staffIdsNeeded = new Set<string>();
      const locationIdsNeeded = new Set<string>();

      for (const s of (salesData || []) as any[]) {
        salesMap[s.id] = s;
        saleIds.push(s.id);
        if (s.client_id) clientIdsNeeded.add(s.client_id);
        if (s.sales_rep_id) staffIdsNeeded.add(s.sales_rep_id);
        if (s.location_id) locationIdsNeeded.add(s.location_id);
      }

      let saleItemsList: any[] = [];
      if (saleIds.length > 0) {
        for (let i = 0; i < saleIds.length; i += 200) {
          const chunk = saleIds.slice(i, i + 200);
          const { data: items } = await supabase
            .from('sale_items')
            .select('id, sale_id, item_name, amount, total_amount, item_id, is_service')
            .in('sale_id', chunk);
          saleItemsList.push(...(items || []));
        }
      }

      const itemIds = [...new Set(saleItemsList.map(si => si.item_id).filter(Boolean))];
      const poMap: Record<string, { name: string; price: number; session_count: number }> = {};
      if (itemIds.length > 0) {
        for (let i = 0; i < itemIds.length; i += 200) {
          const { data: pos } = await supabase
            .from('pricing_options')
            .select('product_id, name, price, session_count')
            .in('product_id', itemIds.slice(i, i + 200));
          (pos || []).forEach((po: any) => {
            poMap[po.product_id] = { name: po.name, price: Number(po.price) || 0, session_count: po.session_count || 1 };
          });
        }
      }

      let apptQuery = supabase
        .from('appointments')
        .select(`
          id, start_datetime, duration_minutes, client_service_id, session_type_id,
          client_id, staff_id, location_id, status,
          client:clients(first_name, last_name),
          staff:staff(first_name, last_name),
          location:locations(name),
          session_type:session_types(name, default_duration_minutes)
        `)
        .gte('start_datetime', startISO)
        .lte('start_datetime', endISO);

      if (f.selectedLocation !== 'all') {
        apptQuery = apptQuery.eq('location_id', f.selectedLocation);
      }
      if (f.selectedClient !== 'all') {
        apptQuery = apptQuery.eq('client_id', f.selectedClient);
      }

      const { data: appointments } = await apptQuery;

      for (const a of (appointments || []) as any[]) {
        if (a.client_id) clientIdsNeeded.add(a.client_id);
        if (a.staff_id) staffIdsNeeded.add(a.staff_id);
        if (a.location_id) locationIdsNeeded.add(a.location_id);
      }

      const clientMap: Record<string, string> = {};
      const clientArr = [...clientIdsNeeded];
      if (clientArr.length > 0) {
        for (let i = 0; i < clientArr.length; i += 200) {
          const { data: cls } = await supabase
            .from('clients')
            .select('id, first_name, last_name')
            .in('id', clientArr.slice(i, i + 200));
          (cls || []).forEach((c: any) => { clientMap[c.id] = `${c.first_name} ${c.last_name}`; });
        }
      }

      const staffMap: Record<string, string> = {};
      const staffArr = [...staffIdsNeeded];
      if (staffArr.length > 0) {
        for (let i = 0; i < staffArr.length; i += 200) {
          const { data: sts } = await supabase
            .from('staff')
            .select('id, first_name, last_name')
            .in('id', staffArr.slice(i, i + 200));
          (sts || []).forEach((s: any) => { staffMap[s.id] = `${s.first_name} ${s.last_name}`; });
        }
      }

      const locMap: Record<string, string> = {};
      const locArr = [...locationIdsNeeded];
      if (locArr.length > 0) {
        const { data: locs } = await supabase
          .from('locations')
          .select('id, name')
          .in('id', locArr);
        (locs || []).forEach((l: any) => { locMap[l.id] = l.name; });
      }

      for (const si of saleItemsList) {
        const sale = salesMap[si.sale_id];
        if (!sale) continue;
        const po = si.item_id ? poMap[si.item_id] : null;
        allRows.push({
          id: `purchase_${si.id}`,
          date: sale.sale_datetime,
          type: 'purchase',
          clientId: sale.client_id || '',
          clientName: clientMap[sale.client_id] || sale.client_id || '-',
          serviceName: si.item_name || '-',
          pricingOption: po?.name || si.item_name || '-',
          amount: Number(si.total_amount || si.amount) || 0,
          staffName: sale.sales_rep_id ? (staffMap[sale.sales_rep_id] || '-') : '-',
          staffPay: null,
          locationId: sale.location_id || '',
          locationName: locMap[sale.location_id] || '-',
        });
      }

      const csIds = [...new Set((appointments || []).map((a: any) => a.client_service_id).filter(Boolean))];
      const csMap: Record<string, { name: string; product_id: string | null }> = {};
      if (csIds.length > 0) {
        for (let i = 0; i < csIds.length; i += 200) {
          const { data: css } = await supabase
            .from('client_services')
            .select('mindbody_id, name, product_id')
            .in('mindbody_id', csIds.slice(i, i + 200));
          (css || []).forEach((cs: any) => {
            csMap[cs.mindbody_id] = { name: cs.name, product_id: cs.product_id };
          });
        }
      }

      const csProdIds = [...new Set(Object.values(csMap).map(c => c.product_id).filter(Boolean))] as string[];
      const csPOMap: Record<string, { name: string; price: number; session_count: number }> = {};
      if (csProdIds.length > 0) {
        for (let i = 0; i < csProdIds.length; i += 200) {
          const { data: pos } = await supabase
            .from('pricing_options')
            .select('product_id, name, price, session_count')
            .in('product_id', csProdIds.slice(i, i + 200));
          (pos || []).forEach((po: any) => {
            csPOMap[po.product_id] = { name: po.name, price: Number(po.price) || 0, session_count: po.session_count || 1 };
          });
        }
      }

      const staffSessionPairs = [...new Set(
        (appointments || []).map((a: any) => `${a.staff_id}|${a.session_type_id}`).filter((s: string) => !s.includes('null'))
      )];
      const sstMap: Record<string, number> = {};
      if (staffSessionPairs.length > 0) {
        const sstStaffIds = [...new Set(staffSessionPairs.map(p => p.split('|')[0]))];
        const stIds = [...new Set(staffSessionPairs.map(p => p.split('|')[1]))];
        const { data: ssts } = await supabase
          .from('staff_session_types')
          .select('staff_id, session_type_id, pay_rate')
          .in('staff_id', sstStaffIds)
          .in('session_type_id', stIds);
        (ssts || []).forEach((sst: any) => {
          sstMap[`${sst.staff_id}|${sst.session_type_id}`] = Number(sst.pay_rate) || 0;
        });
      }

      for (const a of (appointments || []) as any[]) {
        const client = Array.isArray(a.client) ? a.client[0] : a.client;
        const staff = Array.isArray(a.staff) ? a.staff[0] : a.staff;
        const loc = Array.isArray(a.location) ? a.location[0] : a.location;
        const st = Array.isArray(a.session_type) ? a.session_type[0] : a.session_type;

        const cs = a.client_service_id ? csMap[a.client_service_id] : null;
        const csPO = cs?.product_id ? csPOMap[cs.product_id] : null;

        const perSession = csPO ? (csPO.price / (csPO.session_count || 1)) : 0;
        const staffPay = sstMap[`${a.staff_id}|${a.session_type_id}`] ?? null;

        allRows.push({
          id: `appt_${a.id}`,
          date: a.start_datetime,
          type: 'appointment',
          clientId: a.client_id || '',
          clientName: client ? `${client.first_name} ${client.last_name}` : (clientMap[a.client_id] || a.client_id || '-'),
          serviceName: st?.name || '-',
          pricingOption: csPO?.name || cs?.name || '-',
          amount: -perSession,
          staffName: staff ? `${staff.first_name} ${staff.last_name}` : (staffMap[a.staff_id] || '-'),
          staffPay,
          locationId: a.location_id || '',
          locationName: loc?.name || (locMap[a.location_id] || '-'),
        });
      }

      allRows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRows(allRows);
    } catch (err) {
      console.error('Error loading activity report:', err);
    } finally {
      setLoading(false);
    }
  }, [dateRange.start, dateRange.end, f.selectedLocation, f.selectedClient]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredRows = useMemo(() => {
    if (!f.search) return rows;
    const q = f.search.toLowerCase();
    return rows.filter(r =>
      r.clientName.toLowerCase().includes(q) ||
      r.serviceName.toLowerCase().includes(q) ||
      r.pricingOption.toLowerCase().includes(q) ||
      r.staffName.toLowerCase().includes(q)
    );
  }, [rows, f.search]);

  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE);
  const pagedRows = filteredRows.slice((f.currentPage - 1) * PAGE_SIZE, f.currentPage * PAGE_SIZE);

  const totals = useMemo(() => {
    const purchases = filteredRows.filter(r => r.type === 'purchase');
    const appts = filteredRows.filter(r => r.type === 'appointment');
    return {
      purchaseSum: purchases.reduce((s, r) => s + r.amount, 0),
      purchaseCount: purchases.length,
      apptSum: appts.reduce((s, r) => s + Math.abs(r.amount), 0),
      apptCount: appts.length,
      staffPaySum: appts.reduce((s, r) => s + (r.staffPay ?? 0), 0),
      net: purchases.reduce((s, r) => s + r.amount, 0) - appts.reduce((s, r) => s + Math.abs(r.amount), 0),
    };
  }, [filteredRows]);

  const handlePresetChange = (preset: FilterPreset) => {
    const dates = getFilterPresetDates(preset);
    setActivityReportFilters({ filterPreset: preset, dateRange: dates, currentPage: 1 });
  };

  const handleMonthClick = (start: string, end: string) => {
    setActivityReportFilters({ filterPreset: 'custom', dateRange: { start, end }, currentPage: 1 });
  };

  const handleExport = () => {
    const exportData = filteredRows.map(r => ({
      'Date': new Date(r.date).toLocaleDateString('en-GB'),
      'Type': r.type === 'purchase' ? 'Purchase (+)' : 'Appointment (-)',
      'Client': r.clientName,
      'Service': r.serviceName,
      'Pricing Option': r.pricingOption,
      'Amount': r.amount,
      'Staff': r.staffName,
      'Staff Pay': r.staffPay ?? '',
      'Location': r.locationName,
    }));
    exportToExcel(exportData, `client-activity-${dateRange.start}-${dateRange.end}`);
  };

  const presets: { key: FilterPreset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'this_week', label: 'This Week' },
    { key: 'this_month', label: 'This Month' },
    { key: 'last_month', label: 'Last Month' },
    { key: 'this_year', label: 'This Year' },
  ];

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Client Activity</h2>
            <p className="text-slate-500 mt-1 text-sm">
              Purchases and appointments in one view &middot; {filteredRows.length} records
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                showFilters ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
            </button>
            <button
              onClick={handleExport}
              disabled={filteredRows.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        <div className="flex gap-2 mt-4 flex-wrap">
          {presets.map(p => (
            <button
              key={p.key}
              onClick={() => handlePresetChange(p.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                f.filterPreset === p.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
          <div className="flex items-center gap-1 ml-2">
            <input
              type="date"
              value={dateRange.start}
              onChange={e => setActivityReportFilters({ filterPreset: 'custom', dateRange: { ...dateRange, start: e.target.value }, currentPage: 1 })}
              className="px-2 py-1.5 rounded-md border border-slate-300 text-xs"
            />
            <span className="text-slate-400 text-xs">to</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={e => setActivityReportFilters({ filterPreset: 'custom', dateRange: { ...dateRange, end: e.target.value }, currentPage: 1 })}
              className="px-2 py-1.5 rounded-md border border-slate-300 text-xs"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-3 overflow-x-auto pb-1 scrollbar-thin">
          {months.map(m => {
            const isActive = f.filterPreset === 'custom' && dateRange.start === m.start && dateRange.end === m.end;
            return (
              <button
                key={m.start}
                onClick={() => handleMonthClick(m.start, m.end)}
                className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {showFilters && (
        <div className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                <Building2 className="w-3.5 h-3.5 inline mr-1" />Location
              </label>
              <select
                value={f.selectedLocation}
                onChange={e => setActivityReportFilters({ selectedLocation: e.target.value, currentPage: 1 })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="all">All Locations</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                <Calendar className="w-3.5 h-3.5 inline mr-1" />Client
              </label>
              <select
                value={f.selectedClient}
                onChange={e => setActivityReportFilters({ selectedClient: e.target.value, currentPage: 1 })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="all">All Clients</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                <Search className="w-3.5 h-3.5 inline mr-1" />Search
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={f.search}
                  onChange={e => setActivityReportFilters({ search: e.target.value, currentPage: 1 })}
                  placeholder="Client, service, pricing, staff..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm pr-8"
                />
                {f.search && (
                  <button
                    onClick={() => setActivityReportFilters({ search: '', currentPage: 1 })}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpCircle className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-medium text-slate-500">Purchases</span>
            </div>
            <div className="text-xl font-bold text-emerald-700">+{fmt(totals.purchaseSum)}</div>
            <div className="text-xs text-slate-500 mt-0.5">{totals.purchaseCount} items</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <ArrowDownCircle className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-medium text-slate-500">Appointments used</span>
            </div>
            <div className="text-xl font-bold text-amber-700">-{fmt(totals.apptSum)}</div>
            <div className="text-xs text-slate-500 mt-0.5">{totals.apptCount} visits</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-4 h-4 text-blue-600 text-center font-bold text-xs leading-4">&euro;</span>
              <span className="text-xs font-medium text-slate-500">Staff Pay Total</span>
            </div>
            <div className="text-xl font-bold text-blue-700">{fmt(totals.staffPaySum)}</div>
            <div className="text-xs text-slate-500 mt-0.5">for {totals.apptCount} appointments</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-slate-500">Net Balance</span>
            </div>
            <div className={`text-xl font-bold ${totals.net >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {totals.net >= 0 ? '+' : ''}{fmt(totals.net)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">purchases - appointments</div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Date</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Type</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Client</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Service</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Pricing Option</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Amount</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Staff</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Staff Pay</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedRows.map(row => (
                      <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                          {new Date(row.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3">
                          {row.type === 'purchase' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                              <ArrowUpCircle className="w-3 h-3" /> Purchase
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                              <ArrowDownCircle className="w-3 h-3" /> Appointment
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-800 font-medium max-w-[180px] truncate" title={row.clientName}>
                          {row.clientName}
                        </td>
                        <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate" title={row.serviceName}>
                          {row.serviceName}
                        </td>
                        <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate" title={row.pricingOption}>
                          {row.pricingOption}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${
                          row.amount >= 0 ? 'text-emerald-700' : 'text-amber-700'
                        }`}>
                          {row.amount >= 0 ? '+' : ''}{fmt(row.amount)}
                        </td>
                        <td className="px-4 py-3 text-slate-700 max-w-[150px] truncate" title={row.staffName}>
                          {row.staffName}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                          {row.staffPay != null ? fmt(row.staffPay) : '-'}
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {row.locationName}
                        </td>
                      </tr>
                    ))}
                    {pagedRows.length === 0 && (
                      <tr>
                        <td colSpan={9} className="text-center py-16 text-slate-400">
                          No activity found for the selected period
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 px-2">
                <span className="text-sm text-slate-500">
                  Showing {(f.currentPage - 1) * PAGE_SIZE + 1}--{Math.min(f.currentPage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setActivityReportFilters({ currentPage: Math.max(1, f.currentPage - 1) })}
                    disabled={f.currentPage === 1}
                    className="p-2 rounded-lg bg-white border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let page: number;
                    if (totalPages <= 5) {
                      page = i + 1;
                    } else if (f.currentPage <= 3) {
                      page = i + 1;
                    } else if (f.currentPage >= totalPages - 2) {
                      page = totalPages - 4 + i;
                    } else {
                      page = f.currentPage - 2 + i;
                    }
                    return (
                      <button
                        key={page}
                        onClick={() => setActivityReportFilters({ currentPage: page })}
                        className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                          page === f.currentPage
                            ? 'bg-blue-600 text-white'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setActivityReportFilters({ currentPage: Math.min(totalPages, f.currentPage + 1) })}
                    disabled={f.currentPage === totalPages}
                    className="p-2 rounded-lg bg-white border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
