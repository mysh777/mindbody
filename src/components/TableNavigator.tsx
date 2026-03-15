import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Database, ChevronRight, RefreshCw } from 'lucide-react';

interface TableInfo {
  name: string;
  rows: number;
  displayName: string;
}

interface TableNavigatorProps {
  onTableSelect: (table: string) => void;
  selectedTable: string;
}

export function TableNavigator({ onTableSelect, selectedTable }: TableNavigatorProps) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const tableDisplayNames: Record<string, string> = {
    sites: 'Sites',
    locations: 'Locations',
    staff: 'Staff',
    service_categories: 'Service Categories',
    services: 'Services',
    staff_services: 'Staff ↔ Services',
    pricing_options: 'Pricing Options',
    pricing_option_services: 'Pricing ↔ Services',
    clients: 'Clients',
    appointments: 'Appointments',
    appointment_addons: 'Appointment Addons',
    sales: 'Sales',
    sale_items: 'Sale Items',
    retail_products: 'Retail Products',
    sync_logs: 'Sync Logs',
    api_logs: 'API Logs',
    api_raw_data: 'Raw API Data',
  };

  const tableOrder = [
    'sites',
    'locations',
    'staff',
    'service_categories',
    'services',
    'staff_services',
    'pricing_options',
    'pricing_option_services',
    'clients',
    'appointments',
    'appointment_addons',
    'sales',
    'sale_items',
    'retail_products',
    'sync_logs',
    'api_logs',
    'api_raw_data',
  ];

  const loadTables = async () => {
    setLoading(true);
    try {
      const tableCounts = await Promise.all(
        tableOrder.map(async (tableName) => {
          const { count, error } = await supabase
            .from(tableName)
            .select('*', { count: 'exact', head: true });

          return {
            name: tableName,
            rows: error ? 0 : (count || 0),
            displayName: tableDisplayNames[tableName] || tableName,
          };
        })
      );

      setTables(tableCounts);
    } catch (error) {
      console.error('Error loading tables:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTables();
  }, []);

  return (
    <div className="bg-white border-r border-slate-200 h-full overflow-y-auto">
      <div className="sticky top-0 bg-white border-b border-slate-200 p-4 z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-slate-600" />
            <h2 className="font-semibold text-slate-900">Database Tables</h2>
          </div>
          <button
            onClick={loadTables}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh counts"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className="text-xs text-slate-500">Click a table to view its data</p>
      </div>

      <div className="p-2">
        {tables.map((table) => (
          <button
            key={table.name}
            onClick={() => onTableSelect(table.name)}
            className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 transition-all ${
              selectedTable === table.name
                ? 'bg-blue-50 text-blue-900 border border-blue-200'
                : 'text-slate-700 hover:bg-slate-50 border border-transparent'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <ChevronRight
                  className={`w-4 h-4 flex-shrink-0 transition-transform ${
                    selectedTable === table.name ? 'rotate-90 text-blue-600' : 'text-slate-400'
                  }`}
                />
                <span className="text-sm font-medium truncate">{table.displayName}</span>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                  selectedTable === table.name
                    ? 'bg-blue-100 text-blue-700'
                    : table.rows > 0
                    ? 'bg-slate-100 text-slate-600'
                    : 'bg-slate-50 text-slate-400'
                }`}
              >
                {table.rows.toLocaleString()}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
