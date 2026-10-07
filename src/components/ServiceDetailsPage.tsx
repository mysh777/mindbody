import { useState } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { SalesFilterBar } from './SalesFilterBar';
import { ServicePricelistTab } from './ServicePricelistTab';
import { SimplePage } from './PageHeader';
import { useSalesMarginData, type AppointmentStatusFilter } from '../hooks/useSalesMarginData';
import { getFilterPresetDates } from '../utils/salesFilters';

export function ServiceDetailsPage() {
  return (
    <SimplePage section="service-pricelist">
      <ServiceDetails />
    </SimplePage>
  );
}

function ServiceDetails() {
  const [dateRange, setDateRange] = useState(getFilterPresetDates('last_month'));
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [statusFilter, setStatusFilter] = useState<AppointmentStatusFilter>('Completed');
  const { loading, loadError, appointments, reload } =
    useSalesMarginData({ dateRange, selectedLocation, statusFilter });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SalesFilterBar
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          initialPreset="last_month"
          selectedLocation={selectedLocation}
          onLocationChange={setSelectedLocation}
        />
        <button
          onClick={reload}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600 font-medium">Status:</span>
        {(['Completed', 'Booked', 'all'] as AppointmentStatusFilter[]).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === s ? 'bg-sky-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {s === 'all' ? 'All (Completed + Booked)' : s}
          </button>
        ))}
      </div>

      {loadError && (
        <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <p className="font-medium">Visit data could not be loaded, so the figures below are incomplete.</p>
            <p className="text-xs text-red-700 mt-0.5">{loadError}</p>
          </div>
          <button onClick={reload} className="ml-auto text-sm font-medium text-red-700 hover:text-red-900">Retry</button>
        </div>
      )}

      <ServicePricelistTab loading={loading} appointments={appointments} dateRange={dateRange} />
    </div>
  );
}
