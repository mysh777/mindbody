import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Download, Filter } from 'lucide-react';
import { exportToExcel } from '../utils/exportExcel';

type DataType = 'clients' | 'appointments' | 'classes' | 'sales' | 'staff';

export function DataTable() {
  const [dataType, setDataType] = useState<DataType>('clients');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(100);

  const dataTypes: { value: DataType; label: string }[] = [
    { value: 'clients', label: 'Clients' },
    { value: 'appointments', label: 'Appointments' },
    { value: 'classes', label: 'Classes' },
    { value: 'sales', label: 'Sales' },
    { value: 'staff', label: 'Staff' },
  ];

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase
        .from(dataType)
        .select('*')
        .limit(limit);

      if (error) throw error;
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
    if (!search) return true;
    return JSON.stringify(row).toLowerCase().includes(search.toLowerCase());
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
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
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
          </div>

          <div className="flex gap-3 items-center">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
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

        <div className="text-sm text-slate-600 mb-4">
          Showing {filteredData.length} of {data.length} records
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-600">Loading...</div>
        ) : filteredData.length === 0 ? (
          <div className="text-center py-12 text-slate-600">No data available</div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {columns.map((col) => (
                    <th key={col} className="px-4 py-3 text-left font-semibold text-slate-700 whitespace-nowrap">
                      {col.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
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
