import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { FileJson, ChevronDown, ChevronRight } from 'lucide-react';

interface RawData {
  id: string;
  endpoint_type: string;
  response_data: any;
  record_count: number;
  pagination_info: any;
  synced_at: string;
  created_at: string;
}

export function RawApiData() {
  const [data, setData] = useState<RawData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadRawData();
  }, []);

  const loadRawData = async () => {
    setLoading(true);
    try {
      const { data: rawData, error } = await supabase
        .from('api_raw_data')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setData(rawData || []);
    } catch (error) {
      console.error('Error loading raw data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  const endpointTypes = Array.from(new Set(data.map(d => d.endpoint_type)));
  const filteredData = selectedType
    ? data.filter(d => d.endpoint_type === selectedType)
    : data;

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FileJson className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-bold text-slate-900">Raw API Responses</h2>
              <p className="text-sm text-slate-600">View complete JSON responses from Mindbody API</p>
            </div>
          </div>
          <button
            onClick={loadRawData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Refresh
          </button>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setSelectedType(null)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              selectedType === null
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            All ({data.length})
          </button>
          {endpointTypes.map(type => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedType === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {type} ({data.filter(d => d.endpoint_type === type).length})
            </button>
          ))}
        </div>

        {filteredData.length === 0 ? (
          <div className="text-center py-12">
            <FileJson className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 text-lg">No raw data available yet</p>
            <p className="text-slate-400 text-sm mt-2">Run a sync to see raw API responses</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredData.map((item) => (
              <div key={item.id} className="border border-slate-200 rounded-lg overflow-hidden">
                <div
                  onClick={() => toggleExpand(item.id)}
                  className="flex items-center justify-between p-4 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {expandedIds.has(item.id) ? (
                      <ChevronDown className="w-5 h-5 text-slate-600" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-slate-600" />
                    )}
                    <div>
                      <h3 className="font-semibold text-slate-900">{item.endpoint_type}</h3>
                      <p className="text-sm text-slate-600">
                        {item.record_count} records • {new Date(item.synced_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {item.pagination_info && (
                    <div className="text-sm text-slate-600">
                      Page Size: {item.pagination_info.PageSize || 0} / Total: {item.pagination_info.TotalResults || 0}
                    </div>
                  )}
                </div>

                {expandedIds.has(item.id) && (
                  <div className="p-4 bg-slate-900">
                    <pre className="text-xs text-green-400 overflow-x-auto">
                      {JSON.stringify(item.response_data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
