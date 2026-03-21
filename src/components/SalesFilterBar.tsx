import { useState, useEffect, useCallback } from 'react';
import { Building2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  FilterPreset,
  DateRange,
  getFilterPresetDates,
  getMonthsForTimeline,
} from '../utils/salesFilters';

interface SalesFilterBarProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  selectedLocation: string;
  onLocationChange: (location: string) => void;
}

export function SalesFilterBar({
  dateRange,
  onDateRangeChange,
  selectedLocation,
  onLocationChange,
}: SalesFilterBarProps) {
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [filterPreset, setFilterPreset] = useState<FilterPreset>('this_month');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const months = getMonthsForTimeline();

  const loadLocations = useCallback(async () => {
    const { data } = await supabase.from('locations').select('id, name').order('name');
    setLocations(data || []);
  }, []);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const handlePresetChange = (preset: FilterPreset) => {
    setFilterPreset(preset);
    setSelectedMonth(null);
    if (preset !== 'custom') {
      onDateRangeChange(getFilterPresetDates(preset));
    }
  };

  const handleMonthSelect = (month: { start: string; end: string; label: string }) => {
    setSelectedMonth(month.label);
    setFilterPreset('custom');
    onDateRangeChange({ start: month.start, end: month.end });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(['today', 'this_week', 'this_month', 'last_month', 'this_year'] as FilterPreset[]).map(preset => (
          <button
            key={preset}
            onClick={() => handlePresetChange(preset)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterPreset === preset && !selectedMonth
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {preset.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </button>
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2">
        {months.map(month => (
          <button
            key={month.label}
            onClick={() => handleMonthSelect(month)}
            className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
              selectedMonth === month.label
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {month.label}
          </button>
        ))}
      </div>

      <div className="flex gap-4 items-center">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-500" />
          <select
            value={selectedLocation}
            onChange={(e) => onLocationChange(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            <option value="all">All Locations</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
