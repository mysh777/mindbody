import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Download } from 'lucide-react';
import { exportToExcel } from '../utils/exportExcel';

type DataSource = 'sales' | 'appointments' | 'class_visits';
type AggregationType = 'sum' | 'count' | 'avg';

export function PivotTable() {
  const [dataSource, setDataSource] = useState<DataSource>('sales');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [rowField, setRowField] = useState('');
  const [columnField, setColumnField] = useState('');
  const [valueField, setValueField] = useState('');
  const [aggregation, setAggregation] = useState<AggregationType>('sum');

  const dataSources: { value: DataSource; label: string }[] = [
    { value: 'sales', label: 'Sales Data' },
    { value: 'appointments', label: 'Appointments' },
    { value: 'class_visits', label: 'Class Visits' },
  ];

  const loadData = async () => {
    setLoading(true);
    try {
      let query = supabase.from(dataSource).select('*');

      if (dataSource === 'sales') {
        query = supabase.from('sales').select(`
          *,
          clients!sales_client_id_fkey(first_name, last_name, email, city, state)
        `);
      } else if (dataSource === 'appointments') {
        query = supabase.from('appointments').select(`
          *,
          clients!appointments_client_id_fkey(first_name, last_name, email),
          staff!appointments_staff_id_fkey(first_name, last_name)
        `);
      }

      const { data: result, error } = await query.limit(1000);

      if (error) throw error;

      const flattenedData = (result || []).map(item => {
        const flattened: any = { ...item };
        if (item.clients && typeof item.clients === 'object') {
          Object.keys(item.clients).forEach(key => {
            flattened[`client_${key}`] = item.clients[key];
          });
          delete flattened.clients;
        }
        if (item.staff && typeof item.staff === 'object') {
          Object.keys(item.staff).forEach(key => {
            flattened[`staff_${key}`] = item.staff[key];
          });
          delete flattened.staff;
        }
        return flattened;
      });

      setData(flattenedData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [dataSource]);

  const availableFields = useMemo(() => {
    if (data.length === 0) return [];
    return Object.keys(data[0]).filter(key =>
      !key.includes('raw_data') &&
      !key.includes('synced_at') &&
      !key.includes('created_at')
    );
  }, [data]);

  const numericFields = useMemo(() => {
    if (data.length === 0) return [];
    const sample = data[0];
    return availableFields.filter(field =>
      typeof sample[field] === 'number' ||
      (sample[field] && !isNaN(Number(sample[field])))
    );
  }, [data, availableFields]);

  const pivotData = useMemo(() => {
    if (!rowField || !columnField || !valueField || data.length === 0) return null;

    const grouped: Record<string, Record<string, number[]>> = {};
    const columnValues = new Set<string>();

    data.forEach(row => {
      const rowValue = String(row[rowField] || 'N/A');
      const colValue = String(row[columnField] || 'N/A');
      const value = Number(row[valueField]) || 0;

      columnValues.add(colValue);

      if (!grouped[rowValue]) {
        grouped[rowValue] = {};
      }
      if (!grouped[rowValue][colValue]) {
        grouped[rowValue][colValue] = [];
      }
      grouped[rowValue][colValue].push(value);
    });

    const columns = Array.from(columnValues).sort();
    const rows = Object.keys(grouped).sort();

    const tableData = rows.map(rowValue => {
      const rowData: Record<string, any> = { [rowField]: rowValue };
      let rowTotal = 0;

      columns.forEach(colValue => {
        const values = grouped[rowValue][colValue] || [];
        let cellValue = 0;

        if (values.length > 0) {
          if (aggregation === 'sum') {
            cellValue = values.reduce((sum, v) => sum + v, 0);
          } else if (aggregation === 'count') {
            cellValue = values.length;
          } else if (aggregation === 'avg') {
            cellValue = values.reduce((sum, v) => sum + v, 0) / values.length;
          }
        }

        rowData[colValue] = cellValue;
        rowTotal += cellValue;
      });

      rowData['Total'] = rowTotal;
      return rowData;
    });

    const totalRow: Record<string, any> = { [rowField]: 'Total' };
    columns.forEach(colValue => {
      totalRow[colValue] = tableData.reduce((sum, row) => sum + (row[colValue] || 0), 0);
    });
    totalRow['Total'] = tableData.reduce((sum, row) => sum + (row['Total'] || 0), 0);
    tableData.push(totalRow);

    return { columns, data: tableData };
  }, [data, rowField, columnField, valueField, aggregation]);

  const handleExport = () => {
    if (pivotData) {
      exportToExcel(pivotData.data, `pivot_${dataSource}_${rowField}_${columnField}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-6">Pivot Table Configuration</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Data Source</label>
            <select
              value={dataSource}
              onChange={(e) => {
                setDataSource(e.target.value as DataSource);
                setRowField('');
                setColumnField('');
                setValueField('');
              }}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              {dataSources.map((ds) => (
                <option key={ds.value} value={ds.value}>
                  {ds.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Row Field</label>
            <select
              value={rowField}
              onChange={(e) => setRowField(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="">Select field...</option>
              {availableFields.map((field) => (
                <option key={field} value={field}>
                  {field.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Column Field</label>
            <select
              value={columnField}
              onChange={(e) => setColumnField(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="">Select field...</option>
              {availableFields.map((field) => (
                <option key={field} value={field}>
                  {field.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Value Field</label>
            <select
              value={valueField}
              onChange={(e) => setValueField(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="">Select field...</option>
              {numericFields.map((field) => (
                <option key={field} value={field}>
                  {field.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Aggregation</label>
            <select
              value={aggregation}
              onChange={(e) => setAggregation(e.target.value as AggregationType)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="sum">Sum</option>
              <option value="count">Count</option>
              <option value="avg">Average</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleExport}
              disabled={!pivotData}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="w-5 h-5" />
              Export to Excel
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-600">Loading data...</div>
        ) : !rowField || !columnField || !valueField ? (
          <div className="text-center py-12 text-slate-600">
            Please select row, column, and value fields to generate pivot table
          </div>
        ) : pivotData ? (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">
                    {rowField.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  </th>
                  {pivotData.columns.map((col) => (
                    <th key={col} className="px-4 py-3 text-right font-semibold text-slate-700 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-semibold text-slate-700 bg-slate-100">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {pivotData.data.map((row, idx) => {
                  const isTotal = row[rowField] === 'Total';
                  return (
                    <tr key={idx} className={`${isTotal ? 'bg-slate-100 font-semibold' : 'hover:bg-slate-50'} transition-colors`}>
                      <td className="px-4 py-3 text-slate-700">
                        {row[rowField]}
                      </td>
                      {pivotData.columns.map((col) => (
                        <td key={col} className="px-4 py-3 text-right text-slate-700">
                          {typeof row[col] === 'number' ? row[col].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right text-slate-900 font-semibold bg-slate-50">
                        {typeof row['Total'] === 'number' ? row['Total'].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
