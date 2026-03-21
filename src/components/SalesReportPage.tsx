import { useState } from 'react';
import { RefreshCw, Download, BarChart3, Layers, Users, Clock, ListChecks, AlertTriangle } from 'lucide-react';
import { SalesFilterBar } from './SalesFilterBar';
import { SalesOverviewTab } from './SalesOverviewTab';
import { ByServiceTab } from './ByServiceTab';
import { ByStaffTab } from './ByStaffTab';
import { ExpiredServicesTab } from './ExpiredServicesTab';
import { ServicePricelistTab } from './ServicePricelistTab';
import { DataIssuesTab } from './DataIssuesTab';
import { useSalesMarginData } from '../hooks/useSalesMarginData';
import type { AppointmentStatusFilter } from '../hooks/useSalesMarginData';
import { getFilterPresetDates, formatCurrency } from '../utils/salesFilters';
import { exportToExcel } from '../utils/exportExcel';

interface SalesReportPageProps {
  onNavigate?: (tableName: string, id: string) => void;
}

type Tab = 'overview' | 'by-service' | 'by-staff' | 'pricelist' | 'data-issues' | 'expired';

const tabs: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'by-service', label: 'By Service', icon: Layers },
  { id: 'by-staff', label: 'By Staff', icon: Users },
  { id: 'pricelist', label: 'Service Pricelist', icon: ListChecks },
  { id: 'data-issues', label: 'Data Issues', icon: AlertTriangle },
  { id: 'expired', label: 'Expired Services', icon: Clock },
];

export function SalesReportPage({ onNavigate }: SalesReportPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [dateRange, setDateRange] = useState(getFilterPresetDates('this_month'));
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [statusFilter, setStatusFilter] = useState<AppointmentStatusFilter>('Completed');
  const [exporting, setExporting] = useState(false);

  const { loading, appointments, sales, summary, byService, byStaff, reload } =
    useSalesMarginData({ dateRange, selectedLocation, statusFilter });

  const handleExport = async () => {
    setExporting(true);
    try {
      if (activeTab === 'by-service') {
        const exportData = byService.map(r => ({
          'Service': r.sessionTypeName,
          'Category': r.categoryName,
          'Visits': r.visits,
          'Revenue': r.revenue,
          'Staff Cost': r.staffCost,
          'Margin': r.margin,
          'Margin %': r.revenue > 0 ? `${r.marginPercent.toFixed(1)}%` : '',
          'Visits No Data': r.visitsNoData,
        }));
        exportToExcel(exportData, `margin_by_service_${dateRange.start}_to_${dateRange.end}`);
      } else if (activeTab === 'by-staff') {
        const exportData = byStaff.map(r => ({
          'Staff': r.staffName,
          'Visits': r.visits,
          'Revenue': r.revenue,
          'Staff Cost': r.staffCost,
          'Margin': r.margin,
          'Margin %': r.revenue > 0 ? `${r.marginPercent.toFixed(1)}%` : '',
          'Visits No Data': r.visitsNoData,
        }));
        exportToExcel(exportData, `margin_by_staff_${dateRange.start}_to_${dateRange.end}`);
      } else {
        const exportData = appointments.map(a => ({
          'Date': new Date(a.start_datetime).toLocaleDateString('de-DE'),
          'Status': a.status || '',
          'Client': a.clientName,
          'Service': a.sessionTypeName,
          'Pricing Option': a.pricingOptionName || '',
          'Staff': a.staffName,
          'Location': a.locationName,
          'Revenue / Visit': a.hasRevenueData ? Number((a.revenue || 0).toFixed(2)) : 'N/A',
          'Staff Cost': Number(a.staffCost.toFixed(2)),
          'Margin': a.hasRevenueData ? Number((a.margin || 0).toFixed(2)) : 'N/A',
          'Margin %': a.hasRevenueData && a.revenue ? `${(((a.margin || 0) / a.revenue) * 100).toFixed(1)}%` : '',
          'Data Issue': a.noDataReason === 'ok' ? '' : a.noDataReason,
        }));
        exportToExcel(exportData, `profitability_detail_${dateRange.start}_to_${dateRange.end}`);
      }
    } finally {
      setExporting(false);
    }
  };

  const showFilters = activeTab !== 'expired';
  const showExport = activeTab !== 'expired';

  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Profitability Report</h2>
            <p className="text-slate-600 mt-1">
              {loading ? 'Loading...' : (
                <>
                  {summary.totalAppointments} visits ({statusFilter === 'all' ? 'Completed + Booked' : statusFilter}) | Cash In: {formatCurrency(summary.cashIn)} | Margin: {formatCurrency(summary.grossMargin)}
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {showExport && (
              <button
                onClick={handleExport}
                disabled={exporting || loading}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                <Download className={`w-4 h-4 ${exporting ? 'animate-pulse' : ''}`} />
                {exporting ? 'Exporting...' : 'Export'}
              </button>
            )}
            <button
              onClick={reload}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {showFilters && (
          <div className="space-y-3">
            <SalesFilterBar
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              selectedLocation={selectedLocation}
              onLocationChange={setSelectedLocation}
            />
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600 font-medium">Status:</span>
              {(['Completed', 'Booked', 'all'] as AppointmentStatusFilter[]).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    statusFilter === s
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {s === 'all' ? 'All (Completed + Booked)' : s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-1 inline-flex gap-1 flex-wrap">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            const issueCount = tab.id === 'data-issues' ? summary.appointmentsNoData : 0;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {issueCount > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {issueCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {activeTab === 'overview' && (
          <SalesOverviewTab
            loading={loading}
            summary={summary}
            appointments={appointments}
            sales={sales}
          />
        )}

        {activeTab === 'by-service' && (
          <ByServiceTab
            loading={loading}
            byService={byService}
            appointments={appointments}
            onNavigate={onNavigate}
          />
        )}

        {activeTab === 'by-staff' && (
          <ByStaffTab
            loading={loading}
            byStaff={byStaff}
            appointments={appointments}
            onNavigate={onNavigate}
          />
        )}

        {activeTab === 'pricelist' && (
          <ServicePricelistTab
            loading={loading}
            appointments={appointments}
            dateRange={dateRange}
          />
        )}

        {activeTab === 'data-issues' && (
          <DataIssuesTab
            loading={loading}
            appointments={appointments}
            onNavigate={onNavigate}
          />
        )}

        {activeTab === 'expired' && (
          <ExpiredServicesTab onNavigate={onNavigate} />
        )}
      </div>
    </div>
  );
}
