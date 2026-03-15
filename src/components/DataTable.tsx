import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Download, Filter, RefreshCw } from 'lucide-react';
import { exportToExcel } from '../utils/exportExcel';

type DataType = 'clients' | 'appointments' | 'classes' | 'sales' | 'staff' | 'locations' | 'class_descriptions' | 'products' | 'services' | 'sale_items' | 'class_visits';

export function DataTable() {
  const [dataType, setDataType] = useState<DataType>('sales');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(100);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

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
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
          <div className="flex gap-4 items-center flex-wrap">
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
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
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
          </div>

          <div className="flex gap-3 items-center">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search all columns..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64"
              />
            </div>
            <button
              onClick={handleExport}
              disabled={filteredData.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="w-5 h-5" />
              Export to Excel
            </button>
          </div>
        </div>

        <div className="text-sm text-slate-600 mb-4 flex items-center justify-between">
          <span>Showing {filteredData.length} of {data.length} records</span>
          {Object.keys(columnFilters).filter(k => columnFilters[k]).length > 0 && (
            <button
              onClick={() => setColumnFilters({})}
              className="text-blue-600 hover:text-blue-700 text-xs font-medium"
            >
              Clear column filters
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-600">Loading...</div>
        ) : filteredData.length === 0 ? (
          <div className="text-center py-12 text-slate-600">
            {data.length === 0 ? 'No data available. Try running a sync first.' : 'No results match your filters'}
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  {columns.map((col) => (
                    <th key={col} className="px-4 py-3 text-left font-semibold text-slate-700 whitespace-nowrap">
                      <div className="flex flex-col gap-2">
                        <div>{col.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</div>
                        <input
                          type="text"
                          placeholder="Filter..."
                          value={columnFilters[col] || ''}
                          onChange={(e) => setColumnFilters({ ...columnFilters, [col]: e.target.value })}
                          className="px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-normal"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    {columns.map((col) => (
                      <td key={col} className="px-4 py-3 text-slate-700 whitespace-nowrap max-w-xs overflow-hidden text-ellipsis">
                        {row[col] !== null && row[col] !== undefined ? String(row[col]) : '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
