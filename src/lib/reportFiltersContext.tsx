import { createContext, useContext, useState, ReactNode } from 'react';

type FilterPreset = 'today' | 'this_week' | 'this_month' | 'last_month' | 'this_year' | 'custom';

interface DateRange {
  start: string;
  end: string;
}

interface StaffReportFilters {
  filterPreset: FilterPreset;
  dateRange: DateRange;
  selectedMonth: string | null;
  search: string;
  selectedLocation: string;
  expandedLocations: string[];
  expandedId: string | null;
}

interface ClientReportFilters {
  search: string;
  expandedId: string | null;
}

interface AppointmentsFilters {
  filterPreset: FilterPreset;
  dateRange: DateRange;
  selectedMonth: string | null;
  selectedLocation: string;
  selectedStaff: string;
  selectedStatus: string;
  search: string;
  currentPage: number;
}

interface SalesReportFilters {
  filterPreset: FilterPreset;
  dateRange: DateRange;
  selectedMonth: string | null;
  selectedLocation: string;
  search: string;
}

interface SalesByPricingFilters {
  filterPreset: FilterPreset;
  dateRange: DateRange;
  selectedMonth: string | null;
}

interface ReportFiltersState {
  staffReport: StaffReportFilters;
  clientReport: ClientReportFilters;
  appointments: AppointmentsFilters;
  salesReport: SalesReportFilters;
  salesByPricing: SalesByPricingFilters;
}

function getDefaultDateRange(): DateRange {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    start: firstDay.toISOString().split('T')[0],
    end: today.toISOString().split('T')[0],
  };
}

const defaultFilters: ReportFiltersState = {
  staffReport: {
    filterPreset: 'this_month',
    dateRange: getDefaultDateRange(),
    selectedMonth: null,
    search: '',
    selectedLocation: 'all',
    expandedLocations: ['all'],
    expandedId: null,
  },
  clientReport: {
    search: '',
    expandedId: null,
  },
  appointments: {
    filterPreset: 'this_month',
    dateRange: getDefaultDateRange(),
    selectedMonth: null,
    selectedLocation: 'all',
    selectedStaff: 'all',
    selectedStatus: 'all',
    search: '',
    currentPage: 1,
  },
  salesReport: {
    filterPreset: 'this_month',
    dateRange: getDefaultDateRange(),
    selectedMonth: null,
    selectedLocation: 'all',
    search: '',
  },
  salesByPricing: {
    filterPreset: 'this_month',
    dateRange: getDefaultDateRange(),
    selectedMonth: null,
  },
};

interface ReportFiltersContextType {
  filters: ReportFiltersState;
  setStaffReportFilters: (filters: Partial<StaffReportFilters>) => void;
  setClientReportFilters: (filters: Partial<ClientReportFilters>) => void;
  setAppointmentsFilters: (filters: Partial<AppointmentsFilters>) => void;
  setSalesReportFilters: (filters: Partial<SalesReportFilters>) => void;
  setSalesByPricingFilters: (filters: Partial<SalesByPricingFilters>) => void;
}

const ReportFiltersContext = createContext<ReportFiltersContextType | null>(null);

export function ReportFiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<ReportFiltersState>(defaultFilters);

  const setStaffReportFilters = (newFilters: Partial<StaffReportFilters>) => {
    setFilters(prev => ({
      ...prev,
      staffReport: { ...prev.staffReport, ...newFilters },
    }));
  };

  const setClientReportFilters = (newFilters: Partial<ClientReportFilters>) => {
    setFilters(prev => ({
      ...prev,
      clientReport: { ...prev.clientReport, ...newFilters },
    }));
  };

  const setAppointmentsFilters = (newFilters: Partial<AppointmentsFilters>) => {
    setFilters(prev => ({
      ...prev,
      appointments: { ...prev.appointments, ...newFilters },
    }));
  };

  const setSalesReportFilters = (newFilters: Partial<SalesReportFilters>) => {
    setFilters(prev => ({
      ...prev,
      salesReport: { ...prev.salesReport, ...newFilters },
    }));
  };

  const setSalesByPricingFilters = (newFilters: Partial<SalesByPricingFilters>) => {
    setFilters(prev => ({
      ...prev,
      salesByPricing: { ...prev.salesByPricing, ...newFilters },
    }));
  };

  return (
    <ReportFiltersContext.Provider
      value={{
        filters,
        setStaffReportFilters,
        setClientReportFilters,
        setAppointmentsFilters,
        setSalesReportFilters,
        setSalesByPricingFilters,
      }}
    >
      {children}
    </ReportFiltersContext.Provider>
  );
}

export function useReportFilters() {
  const context = useContext(ReportFiltersContext);
  if (!context) {
    throw new Error('useReportFilters must be used within a ReportFiltersProvider');
  }
  return context;
}
