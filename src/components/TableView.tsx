import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Download, RefreshCw, Filter, ChevronDown } from 'lucide-react';
import { exportToExcel } from '../utils/exportExcel';

interface TableViewProps {
  tableName: string;
  displayName: string;
  onNavigate?: (tableName: string, id: string) => void;
  selectedId?: string | null;
}

const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  } catch {
    return dateString;
  }
};

const isDateColumn = (columnName: string): boolean => {
  return columnName.includes('date') || columnName.includes('_at');
};

const isNumericColumn = (columnName: string, value: any): boolean => {
  if (columnName === 'id' || columnName.includes('_id')) return false;
  return !isNaN(Number(value)) && value !== null && value !== '';
};

const getColumnWidth = (columnName: string, values: any[]): string => {
  if (columnName === 'id' || columnName.includes('_id')) return 'w-24';
  if (isDateColumn(columnName)) return 'w-28';

  const sample = values.find(v => v !== null && v !== undefined);
  if (sample && isNumericColumn(columnName, sample)) return 'w-24';

  return 'min-w-[200px]';
};

const getRelatedTable = (columnName: string): string | null => {
  const relationshipMap: Record<string, string> = {
    'client_id': 'clients',
    'staff_id': 'staff',
    'location_id': 'locations',
    'sale_id': 'sales',
    'appointment_id': 'appointments',
    'session_type_id': 'session_types',
    'service_id': 'session_types',
    'program_id': 'service_categories',
    'category_id': 'service_categories',
    'subcategory_id': 'service_subcategories',
    'pricing_option_id': 'pricing_options',
    'product_id': 'products',
    'site_id': 'sites',
  };

  return relationshipMap[columnName] || null;
};

export function TableView({ tableName, displayName, onNavigate, selectedId }: TableViewProps) {
  const [data, setData] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(100);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setColumnFilters({});
    try {
      console.log(`📊 Loading data from table: ${tableName}`);

      const { count } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });

      setTotalCount(count || 0);

      let query = supabase.from(tableName).select('*').limit(limit);

      const { data: schemaCheck } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);

      if (schemaCheck && schemaCheck.length > 0) {
        const columns = Object.keys(schemaCheck[0]);
        if (columns.includes('created_at')) {
          query = query.order('created_at', { ascending: false });
        } else if (columns.includes('synced_at')) {
          query = query.order('synced_at', { ascending: false });
        } else if (columns.includes('updated_at')) {
          query = query.order('updated_at', { ascending: false });
        }
      }

      const { data: result, error } = await query;

      if (error) {
        console.error('❌ Error loading data:', error);
        throw error;
      }
      console.log(`✅ Loaded ${result?.length || 0} rows from ${tableName}`);
      setData(result || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tableName, limit]);

  useEffect(() => {
    if (selectedId) {
      setSearch(selectedId);
    }
  }, [selectedId]);

  const columns = data.length > 0 ? Object.keys(data[0]) : [];

  const filteredData = data.filter((row) => {
    const matchesSearch = search === '' || columns.some((col) => {
      const value = row[col];
      return value && String(value).toLowerCase().includes(search.toLowerCase());
    });

    const matchesFilters = Object.keys(columnFilters).every((col) => {
      if (!columnFilters[col]) return true;
      const value = row[col];
      return value && String(value).toLowerCase().includes(columnFilters[col].toLowerCase());
    });

    return matchesSearch && matchesFilters;
  });

  const handleExport = () => {
    if (filteredData.length === 0) return;
    exportToExcel(filteredData, `${displayName}_export`);
  };

  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{displayName}</h2>
            <p className="text-slate-600 mt-1">
              {loading ? 'Loading...' : `Showing ${filteredData.length} of ${data.length} loaded records (${totalCount} total in table)`}
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
              disabled={filteredData.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export to Excel
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex gap-4 items-center mb-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search across all columns..."
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
              <option value={1000}>1000 rows</option>
            </select>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Filter className="w-4 h-4" />
              Column Filters
              <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showFilters && (
            <div className="pt-4 border-t border-slate-200">
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-4 flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-700">Filter by Column</h3>
                </div>
                {columns.map((col) => (
                  <div key={col}>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      {col.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </label>
                    <input
                      type="text"
                      placeholder="Filter..."
                      value={columnFilters[col] || ''}
                      onChange={(e) => setColumnFilters({ ...columnFilters, [col]: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                ))}
              </div>
              {Object.keys(columnFilters).filter(k => columnFilters[k]).length > 0 && (
                <button
                  onClick={() => setColumnFilters({})}
                  className="mt-3 text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-600">
            Loading...
          </div>
        ) : filteredData.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-600">
            {data.length === 0 ? 'No data available. Try running a sync first.' : 'No results match your filters'}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {columns.map((col) => {
                      const colValues = data.map(row => row[col]);
                      const widthClass = getColumnWidth(col, colValues);
                      return (
                        <th key={col} className={`px-3 py-2.5 text-left font-semibold text-slate-700 text-xs ${widthClass}`}>
                          {col.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      {columns.map((col) => {
                        const value = row[col];
                        const colValues = data.map(r => r[col]);
                        const widthClass = getColumnWidth(col, colValues);
                        const isNumeric = value !== null && value !== undefined && isNumericColumn(col, value);
                        const isDate = isDateColumn(col);
                        const relatedTable = getRelatedTable(col);
                        const isClickable = relatedTable && value && onNavigate;

                        return (
                          <td
                            key={col}
                            className={`px-3 py-2 text-slate-700 text-xs ${widthClass} ${isNumeric ? 'text-right font-mono' : ''} ${isDate ? 'font-mono' : ''}`}
                            title={value !== null && value !== undefined ? String(value) : ''}
                          >
                            {isClickable ? (
                              <button
                                onClick={() => onNavigate(relatedTable, String(value))}
                                className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                              >
                                {String(value)}
                              </button>
                            ) : (
                              value !== null && value !== undefined
                                ? (isDate ? formatDate(String(value)) : String(value))
                                : '-'
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
