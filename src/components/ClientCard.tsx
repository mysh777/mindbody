import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  Search,
  Printer,
  ChevronDown,
  ChevronRight,
  User,
  Package,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
} from 'lucide-react';
import { CopyLinkButton } from './CopyLinkButton';
import { resolveServicePrices, type PriceSource } from '../utils/resolveServicePrices';
import { exportMultiSheetExcel } from '../utils/exportExcel';
import { isPackageActive, toLocalISO } from '../utils/packageStatus';

// ── Types ──────────────────────────────────────────────────────────────

interface ClientOption {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile_phone: string;
}

interface ClientService {
  id: string;
  mindbody_id: string;
  name: string;
  count: number;
  remaining: number;
  active_date: string;
  expiration_date: string | null;
  program_name: string;
  pricing_option_id: string | null;
  paid_price: number;
  price_source: PriceSource;
}

interface TimelineEvent {
  id: string;
  date: string;
  type: 'purchase' | 'visit';
  description: string;
  amount: number | null;
  staffName: string | null;
  serviceName: string | null;
  status: string | null;
  priceSource: PriceSource | null;
  revenuePerVisit: number | null;
  staffPay: number | null;
  clientServiceId: string | null;
}

interface BalanceSummary {
  totalPurchased: number;
  totalSpent: number;
  totalRemaining: number;
  recognizedRevenue: number;
  obligations: number;
  allCompletedVisits: number;
}

import { type DatePreset, getPresetDates } from '../utils/datePresets';
import { DateRangePicker } from './DateRangePicker';

type ViewMode = 'summary' | 'detail';

// ── Helpers ────────────────────────────────────────────────────────────

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
  } catch { return dateStr; }
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

function computeServiceBalance(svc: ClientService) {
  const used = svc.count - svc.remaining;
  const spent = svc.count > 0 ? (used / svc.count) * svc.paid_price : svc.paid_price;
  const remaining = svc.paid_price - spent;
  return { total: svc.paid_price, spent, remaining };
}



function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const diff = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diff;
}

function priceSourceLabel(src: PriceSource) {
  switch (src) {
    case 'actual': return 'Actual';
    case 'direct_sale_item': return 'Actual (sale)';
    case 'catalog_approximate': return 'Catalog';
    case 'session_type_estimate': return 'Estimate';
    case 'no_data': return 'No data';
  }
}

function priceSourceColor(src: PriceSource) {
  switch (src) {
    case 'actual': return 'bg-emerald-100 text-emerald-700';
    case 'direct_sale_item': return 'bg-emerald-100 text-emerald-700';
    case 'catalog_approximate': return 'bg-amber-100 text-amber-700';
    case 'session_type_estimate': return 'bg-blue-100 text-blue-700';
    case 'no_data': return 'bg-slate-100 text-slate-500';
  }
}

// ── Component ──────────────────────────────────────────────────────────

interface ClientCardProps {
  urlParams?: Record<string, string>;
  onParamsChange?: (params: Record<string, string>) => void;
}

export function ClientCard({ urlParams, onParamsChange }: ClientCardProps) {
  const initialClientId = urlParams?.client || null;
  const hasUrlDates = !!(urlParams?.from && urlParams?.to);
  // Client search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ClientOption[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dates & view
  const [datePreset, setDatePreset] = useState<DatePreset>(hasUrlDates ? 'custom' : 'ytd');
  const [startDate, setStartDate] = useState(() => hasUrlDates ? urlParams!.from : getPresetDates('ytd').start);
  const [endDate, setEndDate] = useState(() => hasUrlDates ? urlParams!.to : getPresetDates('ytd').end);
  const [viewMode, setViewMode] = useState<ViewMode>((urlParams?.view === 'detail' ? 'detail' : 'summary') as ViewMode);

  // Data
  const [services, setServices] = useState<ClientService[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [balance, setBalance] = useState<BalanceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);
  const [showExpiredPackages, setShowExpiredPackages] = useState(false);
  const [pendingAutoGenerate, setPendingAutoGenerate] = useState(false);

  // Print ref
  const printRef = useRef<HTMLDivElement>(null);

  // Studio overview (loaded once on mount)
  const [studioOverview, setStudioOverview] = useState<{
    clients: number; obligationsEur: number; remainingVisits: number;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: csData } = await supabase
          .from('client_services')
          .select('client_id, count, remaining, pricing_option_id, expiration_date')
          .gt('remaining', 0);
        if (!csData) return;
        const overviewToday = toLocalISO(new Date());
        const active = csData.filter(cs => isPackageActive({ current: true, remaining: cs.remaining, expiration_date: cs.expiration_date }, overviewToday));
        const poIds = [...new Set(active.map(cs => cs.pricing_option_id).filter(Boolean))] as string[];
        const poMap = new Map<string, number>();
        if (poIds.length > 0) {
          const { data: poData } = await supabase
            .from('pricing_options').select('id, price').in('id', poIds);
          for (const po of (poData || [])) poMap.set(po.id, Number(po.price) || 0);
        }
        const clients = new Set(active.map(cs => cs.client_id));
        let totalObl = 0, totalRem = 0;
        for (const cs of active) {
          totalRem += cs.remaining;
          if (cs.pricing_option_id && cs.count > 0) {
            totalObl += (cs.remaining / cs.count) * (poMap.get(cs.pricing_option_id) || 0);
          }
        }
        setStudioOverview({
          clients: clients.size,
          obligationsEur: Math.round(totalObl * 100) / 100,
          remainingVisits: totalRem,
        });
      } catch (err) {
        console.error('Error loading studio overview:', err);
      }
    })();
  }, []);

  // ── Client search ──

  const searchClients = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    const terms = q.trim().split(/\s+/).filter(t => t.length >= 1);
    let query = supabase
      .from('clients')
      .select('id, first_name, last_name, email, mobile_phone');
    if (terms.length === 1) {
      query = query.or(`first_name.ilike.%${terms[0]}%,last_name.ilike.%${terms[0]}%,email.ilike.%${terms[0]}%,mobile_phone.ilike.%${terms[0]}%`);
    } else {
      for (const term of terms) {
        query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
      }
    }
    const { data } = await query.limit(20);
    setSearchResults(data || []);
  }, []);

  const handleSearchInput = (val: string) => {
    setSearchQuery(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      searchClients(val);
      setShowDropdown(true);
    }, 300);
  };

  const selectClient = (client: ClientOption) => {
    setSelectedClient(client);
    setSearchQuery(`${client.first_name} ${client.last_name}`);
    setShowDropdown(false);
    setGenerated(false);
  };

  // ── Date presets ──

  const applyPreset = (preset: DatePreset, range: { start: string; end: string }) => {
    setDatePreset(preset);
    setStartDate(range.start);
    setEndDate(range.end);
    setGenerated(false);
  };

  // ── Generate report ──

  const generate = useCallback(async () => {
    if (!selectedClient) return;
    setLoading(true);
    setGenerated(false);
    try {
      const clientId = selectedClient.id;

      // 1. Client services (ALL, not filtered by date — for balances)
      const { data: svcData } = await supabase
        .from('client_services')
        .select('id, mindbody_id, name, count, remaining, active_date, expiration_date, program_name, pricing_option_id')
        .eq('client_id', clientId)
        .order('active_date', { ascending: false });

      // 2. Pricing options for those services
      const poIds = (svcData || []).map((s: any) => s.pricing_option_id).filter(Boolean);
      let poData: any[] = [];
      if (poIds.length > 0) {
        const { data } = await supabase.from('pricing_options').select('id, mindbody_id, price').in('id', poIds);
        poData = data || [];
      }

      // 3. ALL sales for this client (for price resolution + timeline)
      const { data: salesData } = await supabase
        .from('sales')
        .select('id, sale_datetime')
        .eq('client_id', clientId)
        .order('sale_datetime', { ascending: false });

      // 4. Sale items (batched)
      const allSaleIds = (salesData || []).map(s => s.id);
      let allItems: any[] = [];
      for (let i = 0; i < allSaleIds.length; i += 200) {
        const batch = allSaleIds.slice(i, i + 200);
        const { data } = await supabase
          .from('sale_items')
          .select('id, sale_id, item_id, item_name, description, quantity, total_amount, unit_price, payment_ref_id')
          .in('sale_id', batch);
        if (data) allItems = allItems.concat(data);
      }

      // 5. Appointments with joins
      const { data: apptData } = await supabase
        .from('appointments')
        .select('id, staff_id, session_type_id, client_service_id, start_datetime, end_datetime, status, duration_minutes')
        .eq('client_id', clientId)
        .order('start_datetime', { ascending: false });

      // 6. Staff names + rates
      const staffIds = [...new Set((apptData || []).map(a => a.staff_id).filter(Boolean))];
      let staffMap = new Map<string, string>();
      const staffRates = new Map<string, Map<string, number>>();

      if (staffIds.length > 0) {
        const { data: staffData } = await supabase
          .from('staff')
          .select('id, first_name, last_name')
          .in('id', staffIds);
        for (const s of (staffData || [])) {
          staffMap.set(s.id, `${s.first_name} ${s.last_name}`);
        }

        const { data: syncedRates } = await supabase
          .from('staff_session_types')
          .select('staff_id, session_type_id, pay_rate')
          .in('staff_id', staffIds);
        for (const r of (syncedRates || [])) {
          if (Number(r.pay_rate) > 0) {
            if (!staffRates.has(r.staff_id)) staffRates.set(r.staff_id, new Map());
            staffRates.get(r.staff_id)!.set(r.session_type_id, Number(r.pay_rate));
          }
        }

        const { data: overrides } = await supabase
          .from('staff_appointment_rates')
          .select('staff_id, session_type_id, rate_per_appointment')
          .in('staff_id', staffIds)
          .is('effective_to', null);
        for (const r of (overrides || [])) {
          if (!staffRates.has(r.staff_id)) staffRates.set(r.staff_id, new Map());
          staffRates.get(r.staff_id)!.set(r.session_type_id || '_default', Number(r.rate_per_appointment) || 0);
        }
      }

      // 7. Session type names
      const stIds = [...new Set((apptData || []).map(a => a.session_type_id).filter(Boolean))];
      let stMap = new Map<string, string>();
      if (stIds.length > 0) {
        const { data: stData } = await supabase
          .from('session_types')
          .select('id, name')
          .in('id', stIds);
        for (const st of (stData || [])) stMap.set(st.id, st.name);
      }

      // 8. Resolve prices
      const resolvedPrices = resolveServicePrices(
        (svcData || []).map((s: any) => ({
          id: s.id,
          mindbody_id: s.mindbody_id,
          pricing_option_id: s.pricing_option_id,
          payment_date: null,
          active_date: s.active_date,
        })),
        poData,
        allItems,
        salesData || [],
      );

      // Build services with prices
      const resolvedServices: ClientService[] = (svcData || []).map((s: any) => {
        const rp = resolvedPrices.get(s.id) || { price: 0, source: 'no_data' as const };
        return {
          id: s.id,
          mindbody_id: s.mindbody_id,
          name: s.name,
          count: s.count,
          remaining: s.remaining,
          active_date: s.active_date,
          expiration_date: s.expiration_date,
          program_name: s.program_name,
          pricing_option_id: s.pricing_option_id,
          paid_price: rp.price,
          price_source: rp.source,
        };
      });

      // Build per-visit revenue map: client_service mindbody_id -> revenue_per_visit
      const poById = new Map(poData.map((p: any) => [p.id, p]));
      const revenuePerVisitMap = new Map<string, { rpv: number; source: PriceSource }>();
      for (const svc of resolvedServices) {
        const sessionCount = svc.count > 0 ? svc.count : 1;
        revenuePerVisitMap.set(svc.mindbody_id, {
          rpv: svc.paid_price / sessionCount,
          source: svc.price_source,
        });
      }

      // Priority 0: direct sale_item fallback for orphaned visits
      // (client_service_id exists on appointment but no client_services row)
      const directSaleItemMap = new Map<string, number>();
      for (const si of allItems) {
        if (si.payment_ref_id != null && si.total_amount != null && Number(si.total_amount) > 0) {
          directSaleItemMap.set(String(si.payment_ref_id), Number(si.total_amount));
        }
      }
      const resolvedMindbodyIds = new Set(resolvedServices.map(s => s.mindbody_id));
      for (const appt of (apptData || [])) {
        const csId = appt.client_service_id;
        if (csId && !resolvedMindbodyIds.has(csId) && !revenuePerVisitMap.has(csId)) {
          const directAmt = directSaleItemMap.get(csId);
          if (directAmt !== undefined) {
            revenuePerVisitMap.set(csId, { rpv: directAmt, source: 'direct_sale_item' });
          }
        }
      }

      // Build timeline (filtered by date range)
      const periodStart = `${startDate}T00:00:00`;
      const periodEnd = `${endDate}T23:59:59`;

      const events: TimelineEvent[] = [];

      // Purchase events
      const saleDateMap = new Map((salesData || []).map(s => [s.id, s.sale_datetime]));
      for (const item of allItems) {
        const saleDate = saleDateMap.get(item.sale_id);
        if (!saleDate || saleDate < periodStart || saleDate > periodEnd) continue;
        events.push({
          id: `purchase-${item.id}`,
          date: saleDate,
          type: 'purchase',
          description: item.item_name || item.description || '-',
          amount: Number(item.total_amount) || 0,
          staffName: null,
          serviceName: null,
          status: null,
          priceSource: null,
          revenuePerVisit: null,
          staffPay: null,
          clientServiceId: null,
        });
      }

      // Visit events
      for (const appt of (apptData || [])) {
        if (appt.start_datetime < periodStart || appt.start_datetime > periodEnd) continue;
        const csId = appt.client_service_id;
        const rpvEntry = csId ? revenuePerVisitMap.get(csId) : null;

        let pay: number | null = null;
        if (appt.staff_id && staffRates.has(appt.staff_id)) {
          const rates = staffRates.get(appt.staff_id)!;
          pay = rates.get(appt.session_type_id) ?? rates.get('_default') ?? null;
        }

        events.push({
          id: `visit-${appt.id}`,
          date: appt.start_datetime,
          type: 'visit',
          description: stMap.get(appt.session_type_id) || 'Unknown session',
          amount: null,
          staffName: staffMap.get(appt.staff_id) || null,
          serviceName: csId
            ? (resolvedServices.find(s => s.mindbody_id === csId)?.name || null)
            : null,
          status: appt.status,
          priceSource: rpvEntry?.source || null,
          revenuePerVisit: rpvEntry?.rpv || null,
          staffPay: pay,
          clientServiceId: csId || null,
        });
      }

      events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Compute balances (ALL time, not filtered)
      const genToday = toLocalISO(new Date());
      let totalPurchased = 0;
      let totalSpent = 0;
      let totalRemaining = 0;
      for (const svc of resolvedServices) {
        const b = computeServiceBalance(svc);
        totalPurchased += b.total;
        totalSpent += b.spent;
        if (isPackageActive({ current: true, remaining: svc.remaining, expiration_date: svc.expiration_date }, genToday)) {
          totalRemaining += b.remaining;
        }
      }

      // Recognized revenue = sum of per-visit revenue for completed visits (all time)
      let recognizedRevenue = 0;
      for (const appt of (apptData || [])) {
        if (appt.status !== 'Completed') continue;
        const rpvEntry = appt.client_service_id ? revenuePerVisitMap.get(appt.client_service_id) : null;
        if (rpvEntry) recognizedRevenue += rpvEntry.rpv;
      }

      const allCompletedVisits = (apptData || []).filter((a: any) => a.status === 'Completed').length;

      setServices(resolvedServices);
      setTimeline(events);
      setBalance({
        totalPurchased,
        totalSpent,
        totalRemaining,
        recognizedRevenue,
        obligations: totalRemaining,
        allCompletedVisits,
      });
      setGenerated(true);
      onParamsChange?.({ client: clientId, from: startDate, to: endDate, view: viewMode });
    } catch (err) {
      console.error('Error generating client card:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedClient, startDate, endDate]);

  // ── Auto-load client from URL ──

  useEffect(() => {
    if (!initialClientId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, first_name, last_name, email, mobile_phone')
        .eq('id', initialClientId)
        .maybeSingle();
      if (!cancelled && data) {
        setSelectedClient(data);
        setSearchQuery(`${data.first_name} ${data.last_name}`);
        setShowDropdown(false);
        setPendingAutoGenerate(true);
      }
    })();
    return () => { cancelled = true; };
  }, [initialClientId]);

  useEffect(() => {
    if (pendingAutoGenerate && selectedClient) {
      setPendingAutoGenerate(false);
      generate();
    }
  }, [pendingAutoGenerate, selectedClient, generate]);

  // ── Active / expired services ──

  const today = useMemo(() => toLocalISO(new Date()), []);

  const activeServices = useMemo(() =>
    services.filter(s => isPackageActive({ current: true, remaining: s.remaining, expiration_date: s.expiration_date }, today)), [services, today]);

  const expiredOrUsedServices = useMemo(() =>
    services.filter(s => !isPackageActive({ current: true, remaining: s.remaining, expiration_date: s.expiration_date }, today)), [services, today]);

  const completedVisitsInPeriod = useMemo(() =>
    timeline.filter(e => e.type === 'visit' && e.status === 'Completed'), [timeline]);

  const expiringSoonServices = useMemo(() => {
    // Group active services by name
    const groups = new Map<string, { remaining: number; firstDays: number | null; names: string[] }>();
    for (const svc of activeServices) {
      const key = svc.name;
      const days = svc.expiration_date
        ? Math.ceil((new Date(svc.expiration_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;
      const existing = groups.get(key);
      if (existing) {
        existing.remaining += svc.remaining;
        if (days !== null && (existing.firstDays === null || days < existing.firstDays)) existing.firstDays = days;
      } else {
        groups.set(key, { remaining: svc.remaining, firstDays: days, names: [svc.name] });
      }
    }
    const result: { name: string; remaining: number; daysLeft: number | null }[] = [];
    for (const [name, g] of groups) {
      if (g.remaining <= 2 || (g.firstDays !== null && g.firstDays >= 0 && g.firstDays < 14)) {
        result.push({ name, remaining: g.remaining, daysLeft: g.firstDays });
      }
    }
    return result;
  }, [activeServices]);

  // Group active services by name + expiration_date for display
  const activeGroups = useMemo(() => {
    const map = new Map<string, { name: string; expDate: string | null; services: typeof activeServices }>();
    for (const svc of activeServices) {
      const expKey = svc.expiration_date ? svc.expiration_date.slice(0, 10) : '__none__';
      const key = `${svc.name}||${expKey}`;
      const existing = map.get(key);
      if (existing) {
        existing.services.push(svc);
      } else {
        map.set(key, { name: svc.name, expDate: svc.expiration_date, services: [svc] });
      }
    }
    return [...map.values()];
  }, [activeServices]);

  const purchasesInPeriod = useMemo(() =>
    timeline.filter(e => e.type === 'purchase'), [timeline]);

  // ── Export ──

  const handleExportExcel = () => {
    if (!generated || !selectedClient || !balance) return;

    const summaryRows: Record<string, string | number>[] = [
      { Metric: 'Total Purchased', Value: `${balance.totalPurchased.toFixed(2)} EUR` },
      { Metric: 'Spent', Value: `${balance.totalSpent.toFixed(2)} EUR` },
      { Metric: 'Remaining', Value: `${balance.totalRemaining.toFixed(2)} EUR` },
      { Metric: 'Obligations', Value: `${balance.obligations.toFixed(2)} EUR` },
      { Metric: 'Recognized Revenue', Value: `${balance.recognizedRevenue.toFixed(2)} EUR` },
      { Metric: '', Value: '' },
      { Metric: 'Active Packages', Value: '' },
    ];
    for (const svc of activeServices) {
      const d = daysUntil(svc.expiration_date);
      summaryRows.push({
        Metric: svc.name,
        'Used': svc.count - svc.remaining,
        'Total': svc.count,
        'Remaining': svc.remaining,
        'Days Left': d !== null && d >= 0 ? d : '-',
        'Expires': svc.expiration_date ? formatDate(svc.expiration_date) : '-',
        'Paid Price': svc.paid_price.toFixed(2),
      });
    }

    const timelineRows = timeline.map(evt => ({
      Date: formatDate(evt.date),
      Type: evt.type === 'purchase' ? 'Purchase' : 'Visit',
      Description: evt.description,
      Package: evt.serviceName || '',
      Staff: evt.staffName || '',
      Amount: evt.amount != null ? evt.amount.toFixed(2) : '',
      'Rev/Visit': evt.revenuePerVisit != null ? evt.revenuePerVisit.toFixed(2) : '',
      'Staff Pay': evt.staffPay != null ? evt.staffPay.toFixed(2) : '',
      'Price Source': evt.priceSource ? priceSourceLabel(evt.priceSource) : '',
    }));

    const fname = `client_${selectedClient.first_name}_${selectedClient.last_name}`;
    exportMultiSheetExcel(
      [
        { name: 'Summary', data: summaryRows },
        { name: 'Timeline', data: timelineRows },
      ],
      fname,
    );
  };

  const handlePrint = () => {
    window.print();
  };

  // ── Date preset buttons ──



  // ── Render ──

  return (
    <div className="w-full bg-slate-50 min-h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6 print:shadow-none">
        <h2 className="text-2xl font-bold text-slate-900">Client Card</h2>
        <p className="text-slate-600 mt-1">
          Detailed client profile with purchases, visits, and financial balances
        </p>
      </div>

      <div className="p-6 print:p-2" ref={printRef}>
        {/* Studio Overview — always visible */}
        {studioOverview && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6 print:shadow-none print:border-0">
            <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-500" />
              Studio Overview — Total Obligations
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-lg p-4 border border-amber-200/50">
                <div className="text-xs font-medium text-amber-600 uppercase tracking-wider mb-1">Active Clients</div>
                <div className="text-2xl font-bold text-amber-900">{studioOverview.clients}</div>
                <div className="text-xs text-amber-600/70 mt-1">with remaining visits</div>
              </div>
              <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-lg p-4 border border-amber-200/50">
                <div className="text-xs font-medium text-amber-600 uppercase tracking-wider mb-1">Total Obligations</div>
                <div className="text-2xl font-bold text-amber-900">{formatCurrency(studioOverview.obligationsEur)}</div>
                <div className="text-xs text-amber-600/70 mt-1">catalog price estimate</div>
              </div>
              <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-lg p-4 border border-amber-200/50">
                <div className="text-xs font-medium text-amber-600 uppercase tracking-wider mb-1">Remaining Visits</div>
                <div className="text-2xl font-bold text-amber-900">{studioOverview.remainingVisits}</div>
                <div className="text-xs text-amber-600/70 mt-1">across all clients</div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-3">Based on catalog prices. Actual may differ due to discounts.</p>
          </div>
        )}

        {/* Configuration Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6 print:shadow-none print:border-0">
          <h3 className="text-lg font-semibold text-slate-900 mb-5">Report Configuration</h3>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-5">
            {/* Client Search */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-2">Client</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => handleSearchInput(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  placeholder="Search by name, email, or phone..."
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-sm"
                />
              </div>
              {showDropdown && searchResults.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-white rounded-lg shadow-lg border border-slate-200 max-h-64 overflow-auto">
                  {searchResults.map(c => (
                    <button
                      key={c.id}
                      onClick={() => selectClient(c)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-3 transition-colors border-b border-slate-100 last:border-0"
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium text-sm shrink-0">
                        {c.first_name[0]}{c.last_name[0]}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 text-sm">
                          {c.first_name} {c.last_name}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {c.email || c.mobile_phone || '-'}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* View Mode */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">View Mode</label>
              <div className="flex rounded-lg border border-slate-300 overflow-hidden">
                <button
                  onClick={() => setViewMode('summary')}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                    viewMode === 'summary'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Summary
                </button>
                <button
                  onClick={() => setViewMode('detail')}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors border-l border-slate-300 ${
                    viewMode === 'detail'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Detail
                </button>
              </div>
            </div>
          </div>

          {/* Date Controls */}
          <div className="mb-5">
            <DateRangePicker
              startDate={startDate} endDate={endDate}
              activePreset={datePreset}
              onStartChange={setStartDate}
              onEndChange={setEndDate}
              onPreset={applyPreset}
              label="Period (for timeline only — balances are always all-time)"
              compact
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 print:hidden">
            <button
              onClick={generate}
              disabled={!selectedClient || loading}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Generate
            </button>
            {generated && (
              <>
                <button
                  onClick={handleExportExcel}
                  className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Excel
                </button>
                <button
                  onClick={handlePrint}
                  className="px-4 py-2.5 bg-slate-600 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  Print / PDF
                </button>
                {selectedClient && (
                  <CopyLinkButton section="client-card" params={{
                    client: selectedClient.id,
                    from: startDate, to: endDate,
                    view: viewMode,
                  }} />
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Report Output ── */}
        {generated && balance && selectedClient && (
          <div className="space-y-6">
            {/* Client Header */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 print:shadow-none print:border-0">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-md">
                  {selectedClient.first_name[0]}{selectedClient.last_name[0]}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {selectedClient.first_name} {selectedClient.last_name}
                  </h3>
                  <div className="flex items-center gap-4 text-sm text-slate-500 mt-0.5">
                    {selectedClient.email && <span>{selectedClient.email}</span>}
                    {selectedClient.mobile_phone && <span>{selectedClient.mobile_phone}</span>}
                  </div>
                </div>
              </div>

              {/* Balance Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg p-4 border border-blue-200/50">
                  <div className="text-xs font-medium text-blue-600 uppercase tracking-wider mb-1">Total Purchased</div>
                  <div className="text-xl font-bold text-blue-900">{formatCurrency(balance.totalPurchased)}</div>
                  <div className="text-xs text-blue-600/70 mt-1">{services.length} packages total</div>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-lg p-4 border border-emerald-200/50">
                  <div className="text-xs font-medium text-emerald-600 uppercase tracking-wider mb-1">Recognized Revenue</div>
                  <div className="text-xl font-bold text-emerald-900">{formatCurrency(balance.recognizedRevenue)}</div>
                  <div className="text-xs text-emerald-600/70 mt-1">{balance.allCompletedVisits} completed visits (all time)</div>
                </div>
                <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-lg p-4 border border-amber-200/50">
                  <div className="text-xs font-medium text-amber-600 uppercase tracking-wider mb-1">Obligations</div>
                  <div className="text-xl font-bold text-amber-900">{formatCurrency(balance.obligations)}</div>
                  <div className="text-xs text-amber-600/70 mt-1">{activeServices.length} active packages</div>
                </div>
                <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-lg p-4 border border-slate-200/50">
                  <div className="text-xs font-medium text-slate-600 uppercase tracking-wider mb-1">Period Purchases</div>
                  <div className="text-xl font-bold text-slate-900">
                    {formatCurrency(purchasesInPeriod.reduce((s, e) => s + (e.amount || 0), 0))}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{purchasesInPeriod.length} items in period</div>
                </div>
              </div>
            </div>

            {/* Expiring Soon Warning */}
            {expiringSoonServices.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                <h4 className="text-sm font-semibold text-amber-800 flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4" />
                  Expiring Soon
                </h4>
                <ul className="space-y-1.5">
                  {expiringSoonServices.map(g => {
                    const lowVisits = g.remaining <= 2;
                    const fewDays = g.daysLeft !== null && g.daysLeft >= 0 && g.daysLeft < 14;
                    return (
                      <li key={g.name} className="text-sm text-amber-900 flex items-start gap-2">
                        <span className="text-amber-500 mt-0.5">{"\u2022"}</span>
                        <span>
                          <span className="font-medium">{g.name}</span>
                          {lowVisits && <span> {"\u2014"} {g.remaining} visit{g.remaining !== 1 ? 's' : ''} left</span>}
                          {fewDays && <span>{lowVisits ? ', ' : ' \u2014 '}expires in {g.daysLeft}d</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Active Packages */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 print:shadow-none print:border-0">
              <div className="px-6 py-4 border-b border-slate-200">
                <h4 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-500" />
                  Active Packages ({activeServices.length})
                </h4>
              </div>
              {activeGroups.length === 0 ? (
                <div className="px-6 py-8 text-sm text-slate-500 text-center">No active packages</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {activeGroups.map(group => {
                    const svcs = group.services;
                    const isSingle = svcs.length === 1;
                    const totalCount = svcs.reduce((s, v) => s + v.count, 0);
                    const totalRemaining = svcs.reduce((s, v) => s + v.remaining, 0);
                    const totalUsed = totalCount - totalRemaining;
                    const totalPaid = svcs.reduce((s, v) => s + v.paid_price, 0);
                    const totalRemainingValue = svcs.reduce((s, v) => s + computeServiceBalance(v).remaining, 0);
                    const days = daysUntil(group.expDate);
                    const pct = totalCount > 0 ? (totalUsed / totalCount) * 100 : 100;
                    const isExpiring = days !== null && days >= 0 && days <= 14;
                    const groupKey = `${group.name}||${group.expDate || ''}`;
                    const expanded = expandedServiceId === groupKey;

                    return (
                      <div key={groupKey} className="px-6 py-4">
                        <div
                          className="flex items-start gap-3 cursor-pointer group"
                          onClick={() => setExpandedServiceId(expanded ? null : groupKey)}
                        >
                          {expanded ? <ChevronDown className="w-4 h-4 text-slate-400 mt-1 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 mt-1 shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-slate-900 text-sm">
                                {group.name}{!isSingle && ` \u00d7 ${svcs.length}`}
                              </span>
                              {days !== null && days >= 0 && (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-0.5 ${
                                  days <= 14 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  <Clock className="w-3 h-3" /> {days}d left
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-2 text-xs text-slate-500 flex-wrap">
                              <span>{totalUsed} of {totalCount} used</span>
                              {days !== null && days >= 0 && (
                                <><span className="text-slate-300">{"\u00b7"}</span><span>{days}d left</span></>
                              )}
                              {group.expDate && days !== null && days < 0 && (
                                <><span className="text-slate-300">{"\u00b7"}</span><span className="text-red-500">expired {formatDate(group.expDate)}</span></>
                              )}
                            </div>
                            <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full transition-all ${isExpiring ? 'bg-orange-400' : 'bg-blue-500'}`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-semibold text-slate-900">{formatCurrency(totalRemainingValue)}</div>
                            <div className="text-xs text-slate-500">of {formatCurrency(totalPaid)}</div>
                          </div>
                        </div>

                        {expanded && (
                          <div className="mt-3 ml-7 border-l-2 border-blue-100 pl-4 space-y-2">
                            {svcs.map(svc => {
                              const b = computeServiceBalance(svc);
                              const linkedVisits = viewMode === 'detail'
                                ? timeline.filter(e => e.type === 'visit' && e.clientServiceId === svc.mindbody_id)
                                : [];
                              return (
                                <div key={svc.id}>
                                  <div className="flex items-center justify-between text-xs py-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-slate-700 font-medium">{svc.count - svc.remaining}/{svc.count} used</span>
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${priceSourceColor(svc.price_source)}`}>
                                        {priceSourceLabel(svc.price_source)}
                                      </span>
                                      <span className="text-slate-400">{formatDate(svc.active_date)}</span>
                                    </div>
                                    <span className="text-slate-600 font-medium">{formatCurrency(b.remaining)} of {formatCurrency(b.total)}</span>
                                  </div>
                                  {viewMode === 'detail' && linkedVisits.length > 0 && (
                                    <div className="ml-4 border-l border-slate-200 pl-3 mb-1">
                                      {linkedVisits.map(v => (
                                        <div key={v.id} className="flex items-center gap-3 py-1 text-xs">
                                          <span className="text-slate-400 w-20">{formatDate(v.date)}</span>
                                          <span className={`w-16 text-center px-1.5 py-0.5 rounded ${
                                            v.status === 'Completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-500'
                                          }`}>{v.status}</span>
                                          <span className="text-slate-700 flex-1">{v.description}</span>
                                          <span className="text-slate-500">{v.staffName || '-'}</span>
                                          {v.revenuePerVisit != null && (
                                            <span className="text-emerald-600 font-medium w-20 text-right">{formatCurrency(v.revenuePerVisit)}</span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Expired / Used Packages (collapsed by default) */}
            {expiredOrUsedServices.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 print:shadow-none print:border-0">
                <button
                  onClick={() => setShowExpiredPackages(v => !v)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <h4 className="text-base font-semibold text-slate-500 flex items-center gap-2">
                    {showExpiredPackages ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <CheckCircle2 className="w-4 h-4 text-slate-400" />
                    Expired / used packages ({expiredOrUsedServices.length})
                  </h4>
                </button>
                {showExpiredPackages && (
                  <div className="divide-y divide-slate-100 border-t border-slate-200">
                    {expiredOrUsedServices.map(svc => {
                      const b = computeServiceBalance(svc);
                      const days = daysUntil(svc.expiration_date);
                      const isExpired = days !== null && days < 0;
                      return (
                        <div key={svc.id} className="px-6 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm text-slate-600 truncate">{svc.name}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${priceSourceColor(svc.price_source)}`}>
                              {priceSourceLabel(svc.price_source)}
                            </span>
                            {isExpired && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
                                Expired {formatDate(svc.expiration_date)}
                              </span>
                            )}
                            {svc.remaining <= 0 && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
                                Fully used
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-500 shrink-0">
                            <span>{svc.count - svc.remaining}/{svc.count} used</span>
                            <span className="font-medium text-slate-700">{formatCurrency(b.total)}</span>
                            <span className="text-slate-400">{formatDate(svc.active_date)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Timeline (Detail Mode) */}
            {viewMode === 'detail' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 print:shadow-none print:border-0">
                <div className="px-6 py-4 border-b border-slate-200">
                  <h4 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-500" />
                    Timeline ({formatDate(startDate)} - {formatDate(endDate)})
                    <span className="text-sm font-normal text-slate-500 ml-1">{timeline.length} events</span>
                  </h4>
                </div>
                {timeline.length === 0 ? (
                  <div className="px-6 py-8 text-sm text-slate-500 text-center">No events in this period</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-2.5 text-left font-medium text-slate-600">Date</th>
                          <th className="px-4 py-2.5 text-left font-medium text-slate-600">Type</th>
                          <th className="px-4 py-2.5 text-left font-medium text-slate-600">Description</th>
                          <th className="px-4 py-2.5 text-left font-medium text-slate-600">Package</th>
                          <th className="px-4 py-2.5 text-left font-medium text-slate-600">Staff</th>
                          <th className="px-4 py-2.5 text-right font-medium text-slate-600">Amount</th>
                          <th className="px-4 py-2.5 text-right font-medium text-slate-600">Rev/Visit</th>
                          <th className="px-4 py-2.5 text-right font-medium text-slate-600">Staff Pay</th>
                          <th className="px-4 py-2.5 text-center font-medium text-slate-600">Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {timeline.map(evt => (
                          <tr key={evt.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{formatDate(evt.date)}</td>
                            <td className="px-4 py-2.5">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                evt.type === 'purchase'
                                  ? 'bg-blue-50 text-blue-700'
                                  : evt.status === 'Completed'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-slate-50 text-slate-600'
                              }`}>
                                {evt.type === 'purchase' ? 'Purchase' : evt.status || 'Visit'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-slate-900 max-w-[200px] truncate">{evt.description}</td>
                            <td className="px-4 py-2.5 text-slate-500 text-xs max-w-[180px] truncate">{evt.serviceName || '-'}</td>
                            <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{evt.staffName || '-'}</td>
                            <td className="px-4 py-2.5 text-right text-slate-900 font-medium whitespace-nowrap">
                              {evt.amount != null ? formatCurrency(evt.amount) : '-'}
                            </td>
                            <td className="px-4 py-2.5 text-right text-emerald-600 whitespace-nowrap">
                              {evt.revenuePerVisit != null ? formatCurrency(evt.revenuePerVisit) : '-'}
                            </td>
                            <td className="px-4 py-2.5 text-right text-orange-600 whitespace-nowrap">
                              {evt.staffPay != null ? formatCurrency(evt.staffPay) : '-'}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {evt.priceSource ? (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${priceSourceColor(evt.priceSource)}`}>
                                  {priceSourceLabel(evt.priceSource)}
                                </span>
                              ) : '-'}
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
        )}

        {/* Empty state */}
        {!generated && !loading && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center print:hidden">
            <User className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-600 mb-2">Select a client and generate report</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Search for a client above, choose the time period for the activity timeline, then click Generate to view the full client card.
            </p>
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-slate-600">Loading client data...</p>
          </div>
        )}
      </div>
      {/* Print-only structured report (hidden on screen, visible when printing) */}
      {generated && selectedClient && balance && (
        <div className="print-report hidden print:block">
          <h1>Client Report</h1>
          <div className="pr-sub">
            Client: <strong>{selectedClient.first_name} {selectedClient.last_name}</strong>
            {' | '}Generated: {new Date().toLocaleDateString('en-GB')}
            {' | '}Period: {datePreset === 'alltime' ? 'All Time' : `${formatDate(startDate)} \u2014 ${formatDate(endDate)}`}
          </div>

          <h2>Summary</h2>
          <dl className="pr-grid">
            <dt>Total Purchased</dt><dd>{balance.totalPurchased.toFixed(2)} EUR</dd>
            <dt>Spent</dt><dd>{balance.totalSpent.toFixed(2)} EUR</dd>
            <dt>Remaining</dt><dd>{balance.totalRemaining.toFixed(2)} EUR</dd>
            <dt>Obligations</dt><dd>{balance.obligations.toFixed(2)} EUR</dd>
            <dt>Recognized Revenue</dt><dd>{balance.recognizedRevenue.toFixed(2)} EUR</dd>
          </dl>

          <h2>Active Packages ({activeServices.length})</h2>
          <table>
            <thead><tr><th>Package</th><th>Remaining</th><th>Total</th><th>Days Left</th><th>Paid Price</th></tr></thead>
            <tbody>
              {activeServices.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#999' }}>No active packages</td></tr>
              ) : activeServices.map(svc => (
                <tr key={svc.id}>
                  <td>{svc.name}</td>
                  <td style={{ textAlign: 'center' }}>{svc.remaining}</td>
                  <td style={{ textAlign: 'center' }}>{svc.count}</td>
                  <td style={{ textAlign: 'center' }}>{daysUntil(svc.expiration_date) ?? '-'}</td>
                  <td style={{ textAlign: 'right' }}>{svc.paid_price.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Timeline ({timeline.length} events)</h2>
          <table>
            <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Package</th><th>Staff</th><th>Amount</th><th>Rev/Visit</th><th>Source</th></tr></thead>
            <tbody>
              {timeline.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#999' }}>No events in period</td></tr>
              ) : timeline.map(evt => (
                <tr key={evt.id}>
                  <td>{formatDate(evt.date)}</td>
                  <td>{evt.type === 'purchase' ? 'Purchase' : 'Visit'}</td>
                  <td>{evt.description}</td>
                  <td>{evt.serviceName || ''}</td>
                  <td>{evt.staffName || ''}</td>
                  <td style={{ textAlign: 'right' }}>{evt.amount != null ? evt.amount.toFixed(2) : ''}</td>
                  <td style={{ textAlign: 'right' }}>{evt.revenuePerVisit != null ? evt.revenuePerVisit.toFixed(2) : ''}</td>
                  <td>{evt.priceSource ? priceSourceLabel(evt.priceSource) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
