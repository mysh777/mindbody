import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Download, Filter, RefreshCw, ChevronDown } from 'lucide-react';
import { exportToExcel } from '../utils/exportExcel';

type DataType = 'clients' | 'appointments' | 'classes' | 'sales' | 'staff' | 'locations' | 'class_descriptions' | 'products' | 'services' | 'sale_items' | 'class_visits';

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

export function DataTable() {
  const [dataType, setDataType] = useState<DataType>('sales');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(100);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);

  const dataTypes: { value: DataType; label: string }[] = [
    { value: 'clients', label: 'Clients' },
    { value: 'appointments', label: 'Appointments' },
    { value: 'classes', label: 'Classes' },
    { value: 'sales', label: 'Sales' },
    { value: 'sale_items', label: 'Sale Items' },
    { value: 'staff', label: 'Staff' },
    { value: 'locations', label: 'Locations' },
    { value: 'class_descriptions', label: 'Class Descriptions' },
    { value: 'class_visits', label: 'Class Visits' },
    { value: 'products', label: 'Products' },
    { value: 'services', label: 'Services' },
  ];

  const loadData = async () => {
    setLoading(true);
    setColumnFilters({});
    try {
      console.log(`📊 Loading data from table: ${dataType}`);
      const { data: result, error } = await supabase
        .from(dataType)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('❌ Error loading data:', error);
        throw error;
      }
      console.log(`✅ Loaded ${result?.length || 0} rows from ${dataType}`);
      setData(result || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [dataType, limit]);

  const filteredData = data.filter((row) => {
    if (search && !JSON.stringify(row).toLowerCase().includes(search.toLowerCase())) {
      return false;
    }

    for (const [col, filterValue] of Object.entries(columnFilters)) {
      if (!filterValue) continue;
      const cellValue = row[col];
      if (cellValue === null || cellValue === undefined) return false;
      if (!String(cellValue).toLowerCase().includes(filterValue.toLowerCase())) {
        return false;
      }
    }

    return true;
  });

  const columns = data.length > 0 ? Object.keys(data[0]).filter(key => !key.includes('raw_data')) : [];

  const handleExport = () => {
    exportToExcel(filteredData, `${dataType}_export`);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col gap-4">
          <div className="flex gap-3 items-center flex-wrap">
            <select
              value={dataType}
              onChange={(e) => setDataType(e.target.value as DataType)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-medium"
            >
              {dataTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>

            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value={50}>50 rows</option>
              <option value={100}>100 rows</option>
              <option value={500}>500 rows</option>
              <option value={1000}>1000 rows</option>
            </select>

            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium ml-auto"
            >
              <Filter className="w-4 h-4" />
              Filters
              <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>

            <button
              onClick={handleExport}
              disabled={filteredData.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>

          {showFilters && (
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="col-span-full">
                  <input
                    type="text"
                    placeholder="Search all columns..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
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

          <div className="text-sm text-slate-600">
            Showing {filteredData.length} of {data.length} records
          </div>
        </div>
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

                      return (
                        <td
                          key={col}
                          className={`px-3 py-2 text-slate-700 text-xs ${widthClass} ${isNumeric ? 'text-right font-mono' : ''} ${isDate ? 'font-mono' : ''}`}
                          title={value !== null && value !== undefined ? String(value) : ''}
                        >
                          {value !== null && value !== undefined
                            ? (isDate ? formatDate(String(value)) : String(value))
                            : '-'}
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
  );
}
