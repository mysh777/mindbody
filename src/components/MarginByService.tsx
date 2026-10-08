import React, { useState, useMemo, useEffect, useRef } from 'react';
import { handlePrint } from '../utils/printReport';
import { TrendingUp, ArrowUpDown, AlertTriangle, Sparkles, Loader2, Search, X, Download, Printer, ChevronDown, ChevronRight } from 'lucide-react';
import { CopyLinkButton } from './CopyLinkButton';
import { LoadErrorBanner } from './LoadErrorBanner';
import { useSalesMarginData } from '../hooks/useSalesMarginData';
import { useSalesByDateData } from '../hooks/useSalesByDateData';
import { formatCurrency } from '../utils/salesFilters';
import { exportToExcel } from '../utils/exportExcel';
import { formatApptDate, formatApptTime } from '../utils/formatDateTime';
import { fetchByIds } from '../lib/fetchByIds';
import { TariffSalesList, TariffVisitsList, type TariffSale } from './MarginByServiceDetails';

import type { ByServiceRow, AppointmentRow } from '../hooks/useSalesMarginData';

import { type DatePreset, getPresetDates } from '../utils/datePresets';
import { DateRangePicker } from './DateRangePicker';
import { LocationFilter } from './LocationFilter';
import { PagePurpose } from './PageHeader';

type RevenueBasis = 'sale_date' | 'visit_date';

type SortField = 'displayName' | 'qtySold' | 'visitsLinked' | 'visitsNoData' | 'revenue' | 'staffCost' | 'margin' | 'marginPercent';

const CATEGORY_ORDER = [
  'EMS',
  'Hair removal',
  'Ķermeņa procedūras',
  'Kriolipolize',
  'LIPOLYTIC',
  'LIPOACTION',
  'Machine',
  'Massage',
  'Konsultācijas',
  'Gift card Reservation',
  'Sauna',
  'Phytomer',
  'VelaShape',
];

interface MergedRow {
  key: string;
  displayName: string;
  category: string;
  qtySold: number;
  revenue: number;
  visits: number;
  visitsLinked: number;
  visitsNoData: number;
  visitsEstimated: number;
  staffCost: number;
  margin: number;
  marginPercent: number;
  isVisitOnly: boolean;
}

interface CategoryGroup {
  name: string;
  rows: MergedRow[];
  qtySold: number;
  revenue: number;
  visitsLinked: number;
  visitsNoData: number;
  staffCost: number;
  margin: number;
  marginPercent: number;
}

// --- visit-date-only row type (reuses ByServiceRow) ---
interface VisitRow extends ByServiceRow {
  visitsLinked: number;
  avgRevPerVisit: number;
  displayName: string;
}

interface VisitCategoryGroup {
  name: string;
  rows: VisitRow[];
  visitsLinked: number;
  visitsNoData: number;
  revenue: number;
  staffCost: number;
  margin: number;
  marginPercent: number;
}

interface MarginByServiceProps {
  urlParams?: Record<string, string>;
  onParamsChange?: (params: Record<string, string>) => void;
}

export function MarginByService({ urlParams, onParamsChange }: MarginByServiceProps) {
  const hasUrlDates = !!(urlParams?.from && urlParams?.to);
  const [datePreset, setDatePreset] = useState<DatePreset>(hasUrlDates ? 'custom' : 'last-month');
  const [generated, setGenerated] = useState(false);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState(() =>
    hasUrlDates ? { start: urlParams!.from, end: urlParams!.to } : getPresetDates('last-month')
  );
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [locationId, setLocationId] = useState(urlParams?.location || 'all');
  const [locationName, setLocationName] = useState('All locations');
  const [revenueBasis, setRevenueBasis] = useState<RevenueBasis>(
    urlParams?.basis === 'visit' ? 'visit_date' : 'sale_date'
  );
  const autoGenRef = useRef(hasUrlDates);
  const containerRef = useRef<HTMLDivElement>(null);

  const dummyRange = { start: '1900-01-01', end: '1900-01-02' };
  const [committedRange, setCommittedRange] = useState(
    hasUrlDates ? { start: urlParams!.from, end: urlParams!.to } : dummyRange
  );
  const [committedLoc, setCommittedLoc] = useState(urlParams?.location || 'all');

  const { loading: loadingVisits, loadError: visitsError, reload: reloadVisits, byService, appointments } = useSalesMarginData({
    dateRange: committedRange,
    selectedLocation: committedLoc,
    statusFilter: 'Completed',
  });

  const { loading: loadingSales, loadError: salesError, reload: reloadSales, rows: salesRows, totalReturned, unallocatedAmount, clientTariffBreakdown } = useSalesByDateData({
    dateRange: committedRange,
    selectedLocation: committedLoc,
  });
  const loadError = visitsError || salesError;
  const retryLoad = () => {
    if (visitsError) reloadVisits();
    if (salesError) reloadSales();
  };

  const [clientNames, setClientNames] = useState<Map<string, string>>(new Map());
  const [namesLoading, setNamesLoading] = useState(false);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const loading = loadingVisits || loadingSales || namesLoading;

  useEffect(() => {
    const ids = [...new Set([...clientTariffBreakdown.keys()].map(k => k.split('|')[0]))];
    if (ids.length === 0) { setClientNames(new Map()); return; }
    let cancelled = false;
    setNamesLoading(true);
    fetchByIds<{ id: string; first_name: string | null; last_name: string | null }>('clients', 'id', ids, 'id, first_name, last_name')
      .then(rows => {
        if (cancelled) return;
        setClientNames(new Map(rows.map(c => [c.id, `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.id])));
      })
      .catch(() => { if (!cancelled) setClientNames(new Map()); })
      .finally(() => { if (!cancelled) setNamesLoading(false); });
    return () => { cancelled = true; };
  }, [clientTariffBreakdown]);

  const salesByTariff = useMemo(() => {
    const map = new Map<string, TariffSale[]>();
    clientTariffBreakdown.forEach((entry, key) => {
      const sep = key.indexOf('|');
      const clientId = key.slice(0, sep);
      const tariff = key.slice(sep + 1);
      const list = map.get(tariff) || [];
      entry.details.forEach(d => list.push({
        saleId: d.saleId, saleDate: d.saleDate, amount: d.amount, rule: d.rule,
        clientName: clientNames.get(clientId) || `Client ${clientId}`,
      }));
      map.set(tariff, list);
    });
    map.forEach(list => list.sort((a, b) => a.saleDate.localeCompare(b.saleDate)));
    return map;
  }, [clientTariffBreakdown, clientNames]);

  const visitsByKey = useMemo(() => {
    const map = new Map<string, AppointmentRow[]>();
    appointments.forEach(a => {
      const key = a.pricingOptionName ? `po__${a.pricingOptionName}` : `st__${a.session_type_id || 'unknown'}`;
      const list = map.get(key) || [];
      list.push(a);
      map.set(key, list);
    });
    map.forEach(list => list.sort((a, b) => a.start_datetime.localeCompare(b.start_datetime)));
    return map;
  }, [appointments]);

  const toggleRow = (key: string) => setOpenRows(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const [sortBy, setSortBy] = useState<SortField>('margin');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');

  const applyPreset = (p: DatePreset, range: { start: string; end: string }) => {
    setDatePreset(p);
    setDateRange(range);
  };

  const handleGenerate = () => {
    setGenerated(true);
    setCommittedRange({ ...dateRange });
    setCommittedLoc(locationId);
    onParamsChange?.({
      from: dateRange.start, to: dateRange.end,
      location: locationId,
      basis: revenueBasis === 'visit_date' ? 'visit' : 'sale',
    });
  };

  useEffect(() => {
    if (autoGenRef.current) {
      autoGenRef.current = false;
      setGenerated(true);
    }
  }, []);

  useEffect(() => {
    if (generated && !loading && !loadError) {
      setLoadedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    }
  }, [generated, loading, loadError]);

  // =================== SALE DATE MODE ===================
  const mergedRows: MergedRow[] = useMemo(() => {
    if (!generated || revenueBasis !== 'sale_date') return [];

    type VisitBucket = { visits: number; visitsLinked: number; visitsNoData: number; visitsEstimated: number; staffCost: number; category: string };
    const emptyBucket = (): VisitBucket => ({ visits: 0, visitsLinked: 0, visitsNoData: 0, visitsEstimated: 0, staffCost: 0, category: '' });

    // Visits with a resolved pricing option → keyed by PO name
    const visitByPo: Record<string, VisitBucket> = {};
    // Visits without a pricing option → keyed by session type name, category = "Visits without tariff"
    const visitNoTariff: Record<string, VisitBucket> = {};

    byService.forEach(r => {
      if (r.pricingOptionName) {
        const name = r.pricingOptionName;
        if (!visitByPo[name]) visitByPo[name] = { ...emptyBucket(), category: r.categoryName };
        const b = visitByPo[name];
        b.visits += r.visits; b.visitsLinked += r.visits - r.visitsNoData;
        b.visitsNoData += r.visitsNoData; b.visitsEstimated += r.visitsEstimated;
        b.staffCost += r.staffCost;
        if (!b.category && r.categoryName) b.category = r.categoryName;
      } else {
        const name = r.sessionTypeName || 'Unknown session type';
        if (!visitNoTariff[name]) visitNoTariff[name] = { ...emptyBucket(), category: 'Visits without tariff' };
        const b = visitNoTariff[name];
        b.visits += r.visits; b.visitsLinked += r.visits - r.visitsNoData;
        b.visitsNoData += r.visitsNoData; b.visitsEstimated += r.visitsEstimated;
        b.staffCost += r.staffCost;
      }
    });

    const map: Record<string, MergedRow> = {};
    const used = new Set<string>();

    // Sales rows first — attach matching visits
    salesRows.forEach(sr => {
      const key = sr.pricingOptionName;
      const vd = visitByPo[key];
      used.add(key);
      map[key] = {
        key,
        displayName: key,
        category: sr.category || vd?.category || '',
        qtySold: sr.qtySold,
        revenue: sr.revenue,
        visits: vd?.visits || 0,
        visitsLinked: vd?.visitsLinked || 0,
        visitsNoData: vd?.visitsNoData || 0,
        visitsEstimated: vd?.visitsEstimated || 0,
        staffCost: vd?.staffCost || 0,
        margin: sr.revenue - (vd?.staffCost || 0),
        marginPercent: sr.revenue > 0 ? ((sr.revenue - (vd?.staffCost || 0)) / sr.revenue) * 100 : 0,
        isVisitOnly: false,
      };
    });

    // Visit-only rows with a known pricing option (tariff not sold in period)
    Object.entries(visitByPo).forEach(([name, vd]) => {
      if (!used.has(name)) {
        map[`po__${name}`] = {
          key: `po__${name}`,
          displayName: name,
          category: vd.category || '',
          qtySold: 0,
          revenue: 0,
          visits: vd.visits,
          visitsLinked: vd.visitsLinked,
          visitsNoData: vd.visitsNoData,
          visitsEstimated: vd.visitsEstimated,
          staffCost: vd.staffCost,
          margin: -vd.staffCost,
          marginPercent: 0,
          isVisitOnly: true,
        };
      }
    });

    // Visits without any tariff — "Visits without tariff" section
    Object.entries(visitNoTariff).forEach(([name, vd]) => {
      map[`notar__${name}`] = {
        key: `notar__${name}`,
        displayName: name,
        category: 'Visits without tariff',
        qtySold: 0,
        revenue: 0,
        visits: vd.visits,
        visitsLinked: vd.visitsLinked,
        visitsNoData: vd.visitsNoData,
        visitsEstimated: vd.visitsEstimated,
        staffCost: vd.staffCost,
        margin: -vd.staffCost,
        marginPercent: 0,
        isVisitOnly: true,
      };
    });

    return Object.values(map);
  }, [generated, revenueBasis, salesRows, byService]);

  // =================== VISIT DATE MODE ===================
  const visitRows: VisitRow[] = useMemo(() => {
    if (!generated || revenueBasis !== 'visit_date') return [];
    return byService.map(r => {
      const linked = r.visits - r.visitsNoData;
      return {
        ...r,
        visitsLinked: linked,
        avgRevPerVisit: linked > 0 ? r.revenue / linked : 0,
        displayName: r.pricingOptionName || r.sessionTypeName,
      };
    });
  }, [byService, generated, revenueBasis]);

  // =================== FILTERING + SORTING ===================
  const sortMerged = (arr: MergedRow[]) => {
    return [...arr].sort((a, b) => {
      const mul = sortDir === 'desc' ? -1 : 1;
      if (sortBy === 'displayName') return mul * a.displayName.localeCompare(b.displayName);
      return mul * ((a[sortBy] as number) - (b[sortBy] as number));
    });
  };

  const sortVisit = (arr: VisitRow[]) => {
    return [...arr].sort((a, b) => {
      const mul = sortDir === 'desc' ? -1 : 1;
      if (sortBy === 'displayName') return mul * a.displayName.localeCompare(b.displayName);
      const aVal = sortBy === 'qtySold' ? 0 : (a as any)[sortBy] ?? 0;
      const bVal = sortBy === 'qtySold' ? 0 : (b as any)[sortBy] ?? 0;
      return mul * (aVal - bVal);
    });
  };

  // --- sale_date categories ---
  const mergedFiltered = useMemo(() => {
    if (revenueBasis !== 'sale_date') return [];
    if (!search.trim()) return mergedRows;
    const terms = search.toLowerCase().split(/\s+/).filter(t => t.length >= 1);
    return mergedRows.filter(r => {
      const name = r.displayName.toLowerCase();
      const cat = r.category.toLowerCase();
      return terms.every(t => name.includes(t) || cat.includes(t));
    });
  }, [mergedRows, search, revenueBasis]);

  const mergedCategories: CategoryGroup[] = useMemo(() => {
    if (revenueBasis !== 'sale_date') return [];
    return buildCategories(mergedFiltered, sortMerged, sortBy, sortDir);
  }, [mergedFiltered, sortBy, sortDir, revenueBasis]);

  const mergedFlatSorted = useMemo(() => sortMerged(mergedFiltered), [mergedFiltered, sortBy, sortDir]);

  const mergedTotals = useMemo(() => {
    const t = mergedFiltered.reduce((acc, r) => ({
      qtySold: acc.qtySold + r.qtySold,
      revenue: acc.revenue + r.revenue,
      visitsLinked: acc.visitsLinked + r.visitsLinked,
      visitsNoData: acc.visitsNoData + r.visitsNoData,
      staffCost: acc.staffCost + r.staffCost,
      margin: acc.margin + r.margin,
    }), { qtySold: 0, revenue: 0, visitsLinked: 0, visitsNoData: 0, staffCost: 0, margin: 0 });
    return { ...t, marginPercent: t.revenue > 0 ? (t.margin / t.revenue) * 100 : 0 };
  }, [mergedFiltered]);

  // --- visit_date categories ---
  const visitFiltered = useMemo(() => {
    if (revenueBasis !== 'visit_date') return [];
    if (!search.trim()) return visitRows;
    const terms = search.toLowerCase().split(/\s+/).filter(t => t.length >= 1);
    return visitRows.filter(r => {
      const name = r.displayName.toLowerCase();
      const cat = r.categoryName.toLowerCase();
      return terms.every(t => name.includes(t) || cat.includes(t));
    });
  }, [visitRows, search, revenueBasis]);

  const visitCategories: VisitCategoryGroup[] = useMemo(() => {
    if (revenueBasis !== 'visit_date') return [];
    return buildVisitCategories(visitFiltered, sortVisit, sortBy, sortDir);
  }, [visitFiltered, sortBy, sortDir, revenueBasis]);

  const visitFlatSorted = useMemo(() => sortVisit(visitFiltered), [visitFiltered, sortBy, sortDir]);

  const visitTotals = useMemo(() => {
    const t = visitFiltered.reduce((acc, r) => ({
      visitsLinked: acc.visitsLinked + r.visitsLinked,
      visitsNoData: acc.visitsNoData + r.visitsNoData,
      revenue: acc.revenue + r.revenue,
      staffCost: acc.staffCost + r.staffCost,
      margin: acc.margin + r.margin,
    }), { visitsLinked: 0, visitsNoData: 0, revenue: 0, staffCost: 0, margin: 0 });
    return {
      ...t,
      marginPercent: t.revenue > 0 ? (t.margin / t.revenue) * 100 : 0,
      avgRevPerVisit: t.visitsLinked > 0 ? t.revenue / t.visitsLinked : 0,
    };
  }, [visitFiltered]);

  // =================== COMMON UI ===================
  const toggleSort = (field: SortField) => {
    if (sortBy === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(field); setSortDir('desc'); }
  };

  const toggleCat = (cat: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const allCatNames = revenueBasis === 'sale_date'
    ? mergedCategories.map(c => c.name)
    : visitCategories.map(c => c.name);
  const expandAll = () => setExpandedCats(new Set(allCatNames));
  const collapseAll = () => setExpandedCats(new Set());

  const hasData = !loadError && (revenueBasis === 'sale_date'
    ? mergedFiltered.length > 0 || salesRows.length > 0
    : visitRows.length > 0);

  // =================== EXPORTS ===================
  const handleExportXlsx = () => {
    if (revenueBasis === 'sale_date') {
      if (mergedFlatSorted.length === 0) return;
      const data = mergedFlatSorted.map(r => ({
        'Category': r.category || 'Uncategorized',
        'Service / Tariff': r.displayName,
        'Qty Sold': r.qtySold,
        'Sales by service (EUR)': Number(r.revenue.toFixed(2)),
        'Visits': r.visitsLinked + r.visitsNoData,
        'Staff cost (EUR)': Number(r.staffCost.toFixed(2)),
        'Sales − Staff cost (EUR)': Number(r.margin.toFixed(2)),
        'Sales − Staff cost (%)': r.revenue > 0 ? Number(r.marginPercent.toFixed(1)) : 0,
      }));
      data.push({
        'Category': '',
        'Service / Tariff': 'TOTAL',
        'Qty Sold': mergedTotals.qtySold,
        'Sales by service (EUR)': Number(mergedTotals.revenue.toFixed(2)),
        'Visits': mergedTotals.visitsLinked + mergedTotals.visitsNoData,
        'Staff cost (EUR)': Number(mergedTotals.staffCost.toFixed(2)),
        'Sales − Staff cost (EUR)': Number(mergedTotals.margin.toFixed(2)),
        'Sales − Staff cost (%)': Number(mergedTotals.marginPercent.toFixed(1)),
      });
      exportToExcel(data, 'margin_by_procedure_sale_date');
    } else {
      if (visitFlatSorted.length === 0) return;
      const data = visitFlatSorted.map(r => ({
        'Category': r.categoryName || 'Uncategorized',
        'Service / Tariff': r.displayName,
        'Visits (linked)': r.visitsLinked,
        'Visits (unlinked)': r.visitsNoData,
        'Revenue earned (EUR)': Number(r.revenue.toFixed(2)),
        'Staff cost (EUR)': Number(r.staffCost.toFixed(2)),
        'Gross margin (EUR)': Number(r.margin.toFixed(2)),
        'Gross margin (%)': r.revenue > 0 ? Number(r.marginPercent.toFixed(1)) : 0,
        'Revenue earned / visit': Number(r.avgRevPerVisit.toFixed(2)),
      }));
      data.push({
        'Category': '',
        'Service / Tariff': 'TOTAL',
        'Visits (linked)': visitTotals.visitsLinked,
        'Visits (unlinked)': visitTotals.visitsNoData,
        'Revenue earned (EUR)': Number(visitTotals.revenue.toFixed(2)),
        'Staff cost (EUR)': Number(visitTotals.staffCost.toFixed(2)),
        'Gross margin (EUR)': Number(visitTotals.margin.toFixed(2)),
        'Gross margin (%)': Number(visitTotals.marginPercent.toFixed(1)),
        'Revenue earned / visit': Number(visitTotals.avgRevPerVisit.toFixed(2)),
      });
      exportToExcel(data, 'margin_by_procedure_visit_date');
    }
  };

  const handleExportDetails = () => {
    if (revenueBasis === 'sale_date') {
      const data: Record<string, string | number>[] = [];
      for (const r of mergedFlatSorted) {
        if (r.key.startsWith('notar__')) continue;
        const sales = salesByTariff.get(r.displayName) || [];
        let listed = 0;
        for (const x of sales) {
          listed += x.amount;
          data.push({
            'Category': r.category || 'Uncategorized',
            'Pricing option': r.displayName,
            'Sale date': formatApptDate(x.saleDate),
            'Client': x.clientName,
            'Basis': x.rule === 'cash' ? 'Paid at sale' : 'Paid from account balance',
            'Sales by service (EUR)': Number(x.amount.toFixed(2)),
          });
        }
        if (Math.abs(r.revenue - listed) >= 0.01) {
          data.push({
            'Category': r.category || 'Uncategorized', 'Pricing option': r.displayName,
            'Sale date': '', 'Client': 'Sales not linked to a client', 'Basis': '',
            'Sales by service (EUR)': Number((r.revenue - listed).toFixed(2)),
          });
        }
      }
      exportToExcel(data, 'margin_by_service_sales');
    } else {
      const data = visitFlatSorted.flatMap(r => (visitsByKey.get(r.pricingOptionKey) || []).map(a => ({
        'Category': r.categoryName || 'Uncategorized',
        'Service / Tariff': r.displayName,
        'Date': formatApptDate(a.start_datetime),
        'Time': formatApptTime(a.start_datetime),
        'Client': a.clientName,
        'Staff': a.staffName,
        'Location': a.locationName,
        'Revenue earned (EUR)': a.revenue != null ? Number(a.revenue.toFixed(2)) : '',
        'Staff cost (EUR)': Number(a.staffCost.toFixed(2)),
        'Gross margin (EUR)': a.margin != null ? Number(a.margin.toFixed(2)) : '',
        'Price basis': !a.hasRevenueData ? 'No price data' : a.isEstimated ? 'Estimated' : 'Package / sale',
      })));
      exportToExcel(data, 'margin_by_service_visits');
    }
  };

  const onPrint = () => handlePrint(containerRef);

  const SH = ({ field, label }: { field: SortField; label: string }) => (
    <th className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:text-slate-900 select-none" onClick={() => toggleSort(field)}>
      <div className="flex items-center gap-1 justify-end">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${sortBy === field ? 'text-blue-600' : 'text-slate-400'}`} />
      </div>
    </th>
  );

  const mc = (v: number) => v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-600' : 'text-slate-500';

  const subtitle = revenueBasis === 'sale_date'
    ? 'Sales by service = sales by payment date (matches Mindbody Sales by Service). Staff cost = per-visit pay rates (matches Mindbody Payroll). Sales − Staff cost: sales for the period minus staff pay for visits in this period. Not a margin: a package may be bought in one month and used in another. For margin, use By visit date.'
    : 'Revenue earned = income for visits delivered (package price / visits). Not comparable to Mindbody "Sales by Service" (different accounting method).';

  return (
    <div ref={containerRef} className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-blue-600" />
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Margin by Service</h2>
            <PagePurpose section="margin-by-service" />
            <p className="text-slate-500 text-xs mt-0.5">{subtitle}</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-0">
              <DateRangePicker
                startDate={dateRange.start} endDate={dateRange.end}
                activePreset={datePreset}
                onStartChange={v => setDateRange(d => ({ ...d, start: v }))}
                onEndChange={v => setDateRange(d => ({ ...d, end: v }))}
                onPreset={applyPreset}
              />
            </div>
            <LocationFilter
              value={locationId}
              onChange={(id, name) => { setLocationId(id); setLocationName(name); }}
              excludeOnlineStore={revenueBasis === 'visit_date'}
            />
          </div>

          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100">
            <span className="text-sm font-medium text-slate-600">Revenue basis:</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio" name="revenueBasis" value="sale_date"
                checked={revenueBasis === 'sale_date'}
                onChange={() => setRevenueBasis('sale_date')}
                className="accent-blue-600"
              />
              <span className="text-sm text-slate-700">By sale date</span>
              <span className="text-xs text-slate-400 ml-0.5">— as in Mindbody Sales by Service</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio" name="revenueBasis" value="visit_date"
                checked={revenueBasis === 'visit_date'}
                onChange={() => setRevenueBasis('visit_date')}
                className="accent-blue-600"
              />
              <span className="text-sm text-slate-700">By visit date</span>
            </label>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button onClick={handleGenerate}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Generate
            </button>
            {loadedAt && !loading && (
              <span className="text-xs text-slate-400">Loaded at {loadedAt}</span>
            )}
            {generated && hasData && (<>
              <button onClick={handleExportXlsx}
                className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2">
                <Download className="w-4 h-4" /> Excel
              </button>
              <button onClick={handleExportDetails}
                className="px-4 py-2.5 bg-white border border-emerald-600 text-emerald-700 rounded-lg font-medium hover:bg-emerald-50 transition-colors flex items-center gap-2">
                <Download className="w-4 h-4" /> {revenueBasis === 'sale_date' ? 'Sales Excel' : 'Visits Excel'}
              </button>
              <button onClick={onPrint}
                className="px-4 py-2.5 bg-slate-600 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors flex items-center gap-2">
                <Printer className="w-4 h-4" /> Print / PDF
              </button>
              <CopyLinkButton section="margin-by-service" params={{
                from: dateRange.start, to: dateRange.end,
                location: locationId,
                basis: revenueBasis === 'visit_date' ? 'visit' : 'sale',
              }} />
            </>)}
          </div>
        </div>

        {generated && loading && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
            <p className="text-slate-500">Loading data...</p>
          </div>
        )}

        {generated && !loading && loadError && (
          <LoadErrorBanner title="Could not load Margin by Service." message={loadError} onRetry={retryLoad} />
        )}

        {generated && !loading && !loadError && !hasData && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
            No data in selected period
          </div>
        )}

        {/* =============== SALE DATE TABLE =============== */}
        {generated && !loading && revenueBasis === 'sale_date' && hasData && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-slate-800 shrink-0">Profitability by Category</h3>
                <div className="flex gap-1">
                  <button onClick={expandAll} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Expand all</button>
                  <span className="text-xs text-slate-300">|</span>
                  <button onClick={collapseAll} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Collapse all</button>
                </div>
                {totalReturned > 0 && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    {totalReturned} returned item{totalReturned > 1 ? 's' : ''}
                  </span>
                )}
                {unallocatedAmount > 0.01 && (
                  <span className="text-xs text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                    Unallocated balance: {formatCurrency(unallocatedAmount)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search services..." className="pl-9 pr-8 py-1.5 border border-slate-300 rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                  {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>}
                </div>
                <span className="text-xs text-slate-500 shrink-0">{mergedCategories.length} categories, {mergedFiltered.length} tariffs</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="w-8"></th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 cursor-pointer hover:text-slate-900 select-none" onClick={() => toggleSort('displayName')}>
                      <div className="flex items-center gap-1">Service / Tariff <ArrowUpDown className={`w-3 h-3 ${sortBy === 'displayName' ? 'text-blue-600' : 'text-slate-400'}`} /></div>
                    </th>
                    <SH field="qtySold" label="Qty Sold" />
                    <SH field="revenue" label="Sales by service" />
                    <SH field="visitsLinked" label="Visits" />
                    <SH field="staffCost" label="Staff cost" />
                    <SH field="margin" label="Sales − Staff cost" />
                    <SH field="marginPercent" label="Sales − Staff cost %" />
                  </tr>
                </thead>
                <tbody>
                  {mergedCategories.map(cat => (
                    <MergedCategorySection key={cat.name} cat={cat} isOpen={expandedCats.has(cat.name)}
                      onToggle={() => toggleCat(cat.name)} mc={mc}
                      openRows={openRows} onToggleRow={toggleRow}
                      renderDetail={r => r.key.startsWith('notar__')
                        ? <p className="py-2 text-xs text-slate-400">Visits without a pricing option have no sales. Open By visit date to see these visits.</p>
                        : <TariffSalesList sales={salesByTariff.get(r.displayName) || []} total={r.revenue} />} />
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                  <tr className="font-bold">
                    <td></td>
                    <td className="px-4 py-3 text-slate-900">Grand Total</td>
                    <td className="px-4 py-3 text-right text-slate-900">{mergedTotals.qtySold}</td>
                    <td className="px-4 py-3 text-right text-blue-600">{formatCurrency(mergedTotals.revenue)}</td>
                    <td className="px-4 py-3 text-right text-slate-900">{mergedTotals.visitsLinked + mergedTotals.visitsNoData}</td>
                    <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(mergedTotals.staffCost)}</td>
                    <td className={`px-4 py-3 text-right ${mc(mergedTotals.margin)}`}>{formatCurrency(mergedTotals.margin)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{mergedTotals.revenue > 0 ? `${mergedTotals.marginPercent.toFixed(1)}%` : '-'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* =============== VISIT DATE TABLE =============== */}
        {generated && !loading && !loadError && revenueBasis === 'visit_date' && visitRows.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-slate-800 shrink-0">Profitability by Category</h3>
                <div className="flex gap-1">
                  <button onClick={expandAll} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Expand all</button>
                  <span className="text-xs text-slate-300">|</span>
                  <button onClick={collapseAll} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Collapse all</button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search services..." className="pl-9 pr-8 py-1.5 border border-slate-300 rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                  {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>}
                </div>
                <span className="text-xs text-slate-500 shrink-0">{visitCategories.length} categories, {visitFiltered.length} tariffs</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="w-8"></th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 cursor-pointer hover:text-slate-900 select-none" onClick={() => toggleSort('displayName')}>
                      <div className="flex items-center gap-1">Service / Tariff <ArrowUpDown className={`w-3 h-3 ${sortBy === 'displayName' ? 'text-blue-600' : 'text-slate-400'}`} /></div>
                    </th>
                    <SH field="visitsLinked" label="Linked" />
                    <SH field="visitsNoData" label="Unlinked" />
                    <SH field="revenue" label="Revenue earned" />
                    <SH field="staffCost" label="Staff cost" />
                    <SH field="margin" label="Gross margin" />
                    <SH field="marginPercent" label="Gross margin %" />
                  </tr>
                </thead>
                <tbody>
                  {visitCategories.map(cat => (
                    <VisitCategorySection key={cat.name} cat={cat} isOpen={expandedCats.has(cat.name)}
                      onToggle={() => toggleCat(cat.name)} mc={mc}
                      openRows={openRows} onToggleRow={toggleRow}
                      renderDetail={r => <TariffVisitsList visits={visitsByKey.get(r.pricingOptionKey) || []} />} />
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                  <tr className="font-bold">
                    <td></td>
                    <td className="px-4 py-3 text-slate-900">Grand Total</td>
                    <td className="px-4 py-3 text-right text-slate-900">{visitTotals.visitsLinked}</td>
                    <td className="px-4 py-3 text-right text-amber-600">{visitTotals.visitsNoData > 0 ? visitTotals.visitsNoData : '0'}</td>
                    <td className="px-4 py-3 text-right text-blue-600">{formatCurrency(visitTotals.revenue)}</td>
                    <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(visitTotals.staffCost)}</td>
                    <td className={`px-4 py-3 text-right ${mc(visitTotals.margin)}`}>{formatCurrency(visitTotals.margin)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{visitTotals.revenue > 0 ? `${visitTotals.marginPercent.toFixed(1)}%` : '-'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Print-only structured report */}
      {generated && hasData && (
        <div className="print-report hidden print:block">
          <h1>{revenueBasis === 'sale_date' ? 'Margin by Service / Tariff' : 'Margin by Service / Tariff (Visit Basis)'}</h1>
          <div className="pr-sub">
            Revenue basis: {revenueBasis === 'sale_date' ? 'By sale date' : 'By visit date'}
            {' | '}Location: {locationName}
            {' | '}Period: {dateRange.start} {'\u2014'} {dateRange.end}
            {' | '}Generated: {new Date().toLocaleDateString('en-GB')}
          </div>

          {revenueBasis === 'sale_date' ? (<>
            {mergedCategories.map(cat => (
              <div key={cat.name}>
                <h2>{cat.name}</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Service / Tariff</th>
                      <th className="text-right">Qty Sold</th>
                      <th className="text-right">Sales by service</th>
                      <th className="text-right">Visits</th>
                      <th className="text-right">Staff cost</th>
                      <th className="text-right">Sales − Staff cost</th>
                      <th className="text-right">Sales − Staff cost %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cat.rows.map(r => (
                      <React.Fragment key={r.key}>
                      <tr className="pr-svc-row">
                        <td>{r.displayName}</td>
                        <td className="text-right">{r.qtySold}</td>
                        <td className="text-right">{formatCurrency(r.revenue)}</td>
                        <td className="text-right">{r.visitsLinked + r.visitsNoData}</td>
                        <td className="text-right">{formatCurrency(r.staffCost)}</td>
                        <td className="text-right">{formatCurrency(r.margin)}</td>
                        <td className="text-right">{r.revenue > 0 ? `${r.marginPercent.toFixed(1)}%` : '-'}</td>
                      </tr>
                      {!r.key.startsWith('notar__') && (r.revenue !== 0 || salesByTariff.has(r.displayName)) && (
                        <tr className="pr-visit-header"><td colSpan={7}>
                          <TariffSalesList print sales={salesByTariff.get(r.displayName) || []} total={r.revenue} />
                        </td></tr>
                      )}
                      </React.Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>{cat.name} Total</td>
                      <td className="text-right">{cat.qtySold}</td>
                      <td className="text-right">{formatCurrency(cat.revenue)}</td>
                      <td className="text-right">{cat.visitsLinked + cat.visitsNoData}</td>
                      <td className="text-right">{formatCurrency(cat.staffCost)}</td>
                      <td className="text-right">{formatCurrency(cat.margin)}</td>
                      <td className="text-right">{cat.revenue > 0 ? `${cat.marginPercent.toFixed(1)}%` : '-'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))}
            <table>
              <tfoot>
                <tr>
                  <td>GRAND TOTAL</td>
                  <td className="text-right">{mergedTotals.qtySold}</td>
                  <td className="text-right">{formatCurrency(mergedTotals.revenue)}</td>
                  <td className="text-right">{mergedTotals.visitsLinked + mergedTotals.visitsNoData}</td>
                  <td className="text-right">{formatCurrency(mergedTotals.staffCost)}</td>
                  <td className="text-right">{formatCurrency(mergedTotals.margin)}</td>
                  <td className="text-right">{mergedTotals.revenue > 0 ? `${mergedTotals.marginPercent.toFixed(1)}%` : '-'}</td>
                </tr>
              </tfoot>
            </table>
          </>) : (<>
            {visitCategories.filter(c => c.rows.length > 0).map(cat => (
              <div key={cat.name}>
                <h2>{cat.name}</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Service / Tariff</th>
                      <th className="text-right">Linked</th>
                      <th className="text-right">Unlinked</th>
                      <th className="text-right">Revenue earned</th>
                      <th className="text-right">Staff cost</th>
                      <th className="text-right">Gross margin</th>
                      <th className="text-right">Gross margin %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cat.rows.map(r => (
                      <React.Fragment key={r.pricingOptionKey}>
                      <tr className="pr-svc-row">
                        <td>{r.displayName}</td>
                        <td className="text-right">{r.visitsLinked}</td>
                        <td className="text-right">{r.visitsNoData}</td>
                        <td className="text-right">{formatCurrency(r.revenue)}</td>
                        <td className="text-right">{formatCurrency(r.staffCost)}</td>
                        <td className="text-right">{formatCurrency(r.margin)}</td>
                        <td className="text-right">{r.revenue > 0 ? `${r.marginPercent.toFixed(1)}%` : '-'}</td>
                      </tr>
                      <tr className="pr-visit-header"><td colSpan={7}>
                        <TariffVisitsList print visits={visitsByKey.get(r.pricingOptionKey) || []} />
                      </td></tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>{cat.name} Total</td>
                      <td className="text-right">{cat.visitsLinked}</td>
                      <td className="text-right">{cat.visitsNoData}</td>
                      <td className="text-right">{formatCurrency(cat.revenue)}</td>
                      <td className="text-right">{formatCurrency(cat.staffCost)}</td>
                      <td className="text-right">{formatCurrency(cat.margin)}</td>
                      <td className="text-right">{cat.revenue > 0 ? `${cat.marginPercent.toFixed(1)}%` : '-'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))}
            <table>
              <tfoot>
                <tr>
                  <td>GRAND TOTAL</td>
                  <td className="text-right">{visitTotals.visitsLinked}</td>
                  <td className="text-right">{visitTotals.visitsNoData}</td>
                  <td className="text-right">{formatCurrency(visitTotals.revenue)}</td>
                  <td className="text-right">{formatCurrency(visitTotals.staffCost)}</td>
                  <td className="text-right">{formatCurrency(visitTotals.margin)}</td>
                  <td className="text-right">{visitTotals.revenue > 0 ? `${visitTotals.marginPercent.toFixed(1)}%` : '-'}</td>
                </tr>
              </tfoot>
            </table>
          </>)}
        </div>
      )}
    </div>
  );
}

// =================== CATEGORY BUILDERS ===================
function buildCategories(rows: MergedRow[], sorter: (arr: MergedRow[]) => MergedRow[], sortBy: SortField, sortDir: 'asc' | 'desc'): CategoryGroup[] {
  const catMap: Record<string, MergedRow[]> = {};
  rows.forEach(r => {
    const cat = (r.category || '').trim() || 'Uncategorized';
    if (!catMap[cat]) catMap[cat] = [];
    catMap[cat].push(r);
  });

  const orderLookup = new Map(CATEGORY_ORDER.map(c => [c.toLowerCase(), c]));
  const normalizedCatMap: Record<string, MergedRow[]> = {};
  for (const [cat, catRows] of Object.entries(catMap)) {
    const canonical = orderLookup.get(cat.toLowerCase()) || cat;
    if (!normalizedCatMap[canonical]) normalizedCatMap[canonical] = [];
    normalizedCatMap[canonical].push(...catRows);
  }

  const emptyCat = (): Omit<CategoryGroup, 'name'> => ({
    rows: [], qtySold: 0, revenue: 0, visitsLinked: 0, visitsNoData: 0, staffCost: 0, margin: 0, marginPercent: 0,
  });

  const buildGroup = (name: string, catRows: MergedRow[]): CategoryGroup => {
    const sorted = sorter(catRows);
    const t = sorted.reduce((acc, r) => ({
      qtySold: acc.qtySold + r.qtySold,
      revenue: acc.revenue + r.revenue,
      visitsLinked: acc.visitsLinked + r.visitsLinked,
      visitsNoData: acc.visitsNoData + r.visitsNoData,
      staffCost: acc.staffCost + r.staffCost,
      margin: acc.margin + r.margin,
    }), { qtySold: 0, revenue: 0, visitsLinked: 0, visitsNoData: 0, staffCost: 0, margin: 0 });
    return { name, rows: sorted, ...t, marginPercent: t.revenue > 0 ? (t.margin / t.revenue) * 100 : 0 };
  };

  const result: CategoryGroup[] = [];
  const used = new Set<string>();
  for (const cat of CATEGORY_ORDER) {
    used.add(cat);
    const cr = normalizedCatMap[cat];
    result.push(cr ? buildGroup(cat, cr) : { name: cat, ...emptyCat() });
  }
  for (const [cat, catRows] of Object.entries(normalizedCatMap)) {
    if (!used.has(cat)) result.push(buildGroup(cat, catRows));
  }
  const filtered = result.filter(c => c.rows.length > 0);
  const mul = sortDir === 'desc' ? -1 : 1;
  if (sortBy === 'displayName') {
    filtered.sort((a, b) => mul * a.name.localeCompare(b.name));
  } else {
    const key = sortBy as keyof CategoryGroup;
    filtered.sort((a, b) => mul * ((a[key] as number) - (b[key] as number)));
  }
  return filtered;
}

function buildVisitCategories(rows: VisitRow[], sorter: (arr: VisitRow[]) => VisitRow[], sortBy: SortField, sortDir: 'asc' | 'desc'): VisitCategoryGroup[] {
  const catMap: Record<string, VisitRow[]> = {};
  rows.forEach(r => {
    const cat = (r.categoryName || '').trim() || 'Uncategorized';
    if (!catMap[cat]) catMap[cat] = [];
    catMap[cat].push(r);
  });

  const orderLookup = new Map(CATEGORY_ORDER.map(c => [c.toLowerCase(), c]));
  const normalizedCatMap: Record<string, VisitRow[]> = {};
  for (const [cat, catRows] of Object.entries(catMap)) {
    const canonical = orderLookup.get(cat.toLowerCase()) || cat;
    if (!normalizedCatMap[canonical]) normalizedCatMap[canonical] = [];
    normalizedCatMap[canonical].push(...catRows);
  }

  const emptyCat = (): Omit<VisitCategoryGroup, 'name'> => ({
    rows: [], visitsLinked: 0, visitsNoData: 0, revenue: 0, staffCost: 0, margin: 0, marginPercent: 0,
  });

  const buildGroup = (name: string, catRows: VisitRow[]): VisitCategoryGroup => {
    const sorted = sorter(catRows);
    const t = sorted.reduce((acc, r) => ({
      visitsLinked: acc.visitsLinked + r.visitsLinked,
      visitsNoData: acc.visitsNoData + r.visitsNoData,
      revenue: acc.revenue + r.revenue,
      staffCost: acc.staffCost + r.staffCost,
      margin: acc.margin + r.margin,
    }), { visitsLinked: 0, visitsNoData: 0, revenue: 0, staffCost: 0, margin: 0 });
    return { name, rows: sorted, ...t, marginPercent: t.revenue > 0 ? (t.margin / t.revenue) * 100 : 0 };
  };

  const result: VisitCategoryGroup[] = [];
  const used = new Set<string>();
  for (const cat of CATEGORY_ORDER) {
    used.add(cat);
    const cr = normalizedCatMap[cat];
    result.push(cr ? buildGroup(cat, cr) : { name: cat, ...emptyCat() });
  }
  for (const [cat, catRows] of Object.entries(normalizedCatMap)) {
    if (!used.has(cat)) result.push(buildGroup(cat, catRows));
  }
  const filtered = result.filter(c => c.rows.length > 0);
  const mul = sortDir === 'desc' ? -1 : 1;
  if (sortBy === 'displayName') {
    filtered.sort((a, b) => mul * a.name.localeCompare(b.name));
  } else {
    const key = sortBy as keyof VisitCategoryGroup;
    filtered.sort((a, b) => mul * ((a[key] as number || 0) - (b[key] as number || 0)));
  }
  return filtered;
}

// =================== CATEGORY SECTION COMPONENTS ===================
function RowToggle({ open, label }: { open: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
      {label}
    </span>
  );
}

function DetailRow({ children }: { children: React.ReactNode }) {
  return (
    <tr className="bg-white border-b border-slate-100">
      <td></td>
      <td colSpan={7} className="pl-12 pr-4 pb-3 pt-1">{children}</td>
    </tr>
  );
}

function MergedCategorySection({ cat, isOpen, onToggle, mc, openRows, onToggleRow, renderDetail }: {
  cat: CategoryGroup; isOpen: boolean; onToggle: () => void; mc: (v: number) => string;
  openRows: Set<string>; onToggleRow: (key: string) => void; renderDetail: (r: MergedRow) => React.ReactNode;
}) {
  return (
    <>
      <tr className="bg-slate-100 border-y border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors" onClick={onToggle}>
        <td className="pl-3 text-slate-500">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </td>
        <td className="px-4 py-2.5 font-bold text-slate-800">
          {cat.name}
          <span className="ml-2 text-xs font-normal text-slate-500">({cat.rows.length} tariffs)</span>
        </td>
        <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{cat.qtySold}</td>
        <td className="px-4 py-2.5 text-right font-semibold text-blue-600">{formatCurrency(cat.revenue)}</td>
        <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{cat.visitsLinked + cat.visitsNoData}</td>
        <td className="px-4 py-2.5 text-right font-semibold text-amber-600">{formatCurrency(cat.staffCost)}</td>
        <td className={`px-4 py-2.5 text-right font-bold ${mc(cat.margin)}`}>{formatCurrency(cat.margin)}</td>
        <td className={`px-4 py-2.5 text-right font-semibold ${mc(cat.margin)}`}>{cat.revenue > 0 ? `${cat.marginPercent.toFixed(1)}%` : '-'}</td>
      </tr>
      {isOpen && cat.rows.map(r => (
        <React.Fragment key={r.key}>
        <tr className="hover:bg-slate-50 transition-colors border-b border-slate-100 cursor-pointer" onClick={() => onToggleRow(r.key)}>
          <td></td>
          <td className="px-4 py-2 pl-8 font-medium text-slate-700 text-[13px]"><RowToggle open={openRows.has(r.key)} label={r.displayName} /></td>
          <td className="px-4 py-2 text-right text-slate-600">{r.qtySold || <span className="text-slate-300">-</span>}</td>
          <td className="px-4 py-2 text-right font-medium text-blue-600">{formatCurrency(r.revenue)}</td>
          <td className="px-4 py-2 text-right text-slate-600">{r.visitsLinked + r.visitsNoData || <span className="text-slate-300">-</span>}</td>
          <td className="px-4 py-2 text-right text-amber-600">{formatCurrency(r.staffCost)}</td>
          <td className={`px-4 py-2 text-right font-semibold ${mc(r.margin)}`}>{formatCurrency(r.margin)}</td>
          <td className={`px-4 py-2 text-right ${mc(r.margin)}`}>{r.revenue > 0 ? `${r.marginPercent.toFixed(1)}%` : '-'}</td>
        </tr>
        {openRows.has(r.key) && <DetailRow>{renderDetail(r)}</DetailRow>}
        </React.Fragment>
      ))}
    </>
  );
}

function VisitCategorySection({ cat, isOpen, onToggle, mc, openRows, onToggleRow, renderDetail }: {
  cat: VisitCategoryGroup; isOpen: boolean; onToggle: () => void; mc: (v: number) => string;
  openRows: Set<string>; onToggleRow: (key: string) => void; renderDetail: (r: VisitRow) => React.ReactNode;
}) {
  return (
    <>
      <tr className="bg-slate-100 border-y border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors" onClick={onToggle}>
        <td className="pl-3 text-slate-500">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </td>
        <td className="px-4 py-2.5 font-bold text-slate-800">
          {cat.name}
          <span className="ml-2 text-xs font-normal text-slate-500">({cat.rows.length} tariffs)</span>
        </td>
        <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{cat.visitsLinked}</td>
        <td className="px-4 py-2.5 text-right font-semibold text-amber-600">{cat.visitsNoData > 0 ? cat.visitsNoData : '0'}</td>
        <td className="px-4 py-2.5 text-right font-semibold text-blue-600">{formatCurrency(cat.revenue)}</td>
        <td className="px-4 py-2.5 text-right font-semibold text-amber-600">{formatCurrency(cat.staffCost)}</td>
        <td className={`px-4 py-2.5 text-right font-bold ${mc(cat.margin)}`}>{formatCurrency(cat.margin)}</td>
        <td className={`px-4 py-2.5 text-right font-semibold ${mc(cat.margin)}`}>{cat.revenue > 0 ? `${cat.marginPercent.toFixed(1)}%` : '-'}</td>
      </tr>
      {isOpen && cat.rows.map(r => (
        <React.Fragment key={r.pricingOptionKey}>
        <tr className="hover:bg-slate-50 transition-colors border-b border-slate-100 cursor-pointer" onClick={() => onToggleRow(r.pricingOptionKey)}>
          <td></td>
          <td className="px-4 py-2 pl-8 font-medium text-slate-700 text-[13px]"><RowToggle open={openRows.has(r.pricingOptionKey)} label={r.displayName} /></td>
          <td className="px-4 py-2 text-right text-slate-600">{r.visitsLinked}</td>
          <td className="px-4 py-2 text-right">
            {r.visitsNoData > 0 ? (
              <span className="inline-flex items-center gap-1 text-amber-600">
                <AlertTriangle className="w-3 h-3" /> {r.visitsNoData}
              </span>
            ) : <span className="text-slate-400">0</span>}
          </td>
          <td className="px-4 py-2 text-right font-medium text-blue-600">{formatCurrency(r.revenue)}</td>
          <td className="px-4 py-2 text-right text-amber-600">{formatCurrency(r.staffCost)}</td>
          <td className={`px-4 py-2 text-right font-semibold ${mc(r.margin)}`}>{formatCurrency(r.margin)}</td>
          <td className={`px-4 py-2 text-right ${mc(r.margin)}`}>{r.revenue > 0 ? `${r.marginPercent.toFixed(1)}%` : '-'}
            {r.visitsEstimated > 0 && <Sparkles className="w-3 h-3 inline ml-1 text-violet-500" title={`${r.visitsEstimated} estimated`} />}
          </td>
        </tr>
        {openRows.has(r.pricingOptionKey) && <DetailRow>{renderDetail(r)}</DetailRow>}
        </React.Fragment>
      ))}
    </>
  );
}
