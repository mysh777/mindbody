import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw, ChevronDown, ChevronUp, Clock, AlertCircle, CheckCircle } from 'lucide-react';

interface ApiLog {
  id: string;
  endpoint: string;
  method: string;
  request_body: any;
  response_status: number;
  response_body: any;
  error_message: string | null;
  duration_ms: number;
  created_at: string;
}

export function ApiLogs() {
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('api_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      setLogs(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const toggleExpand = (logId: string) => {
    setExpandedLog(expandedLog === logId ? null : logId);
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-green-700 bg-green-50 border-green-200';
    if (status >= 400 && status < 500) return 'text-amber-700 bg-amber-50 border-amber-200';
    if (status >= 500) return 'text-red-700 bg-red-50 border-red-200';
    return 'text-slate-700 bg-slate-50 border-slate-200';
  };

  const getStatusIcon = (status: number) => {
    if (status >= 200 && status < 300) return <CheckCircle className="w-5 h-5 text-green-600" />;
    return <AlertCircle className="w-5 h-5 text-red-600" />;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">API Request Logs</h2>
          <p className="text-sm text-slate-600 mt-1">Real-time monitoring of Mindbody API calls</p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-12">
          <div className="bg-slate-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <RefreshCw className="w-8 h-8 text-slate-400" />
          </div>
          <p className="text-slate-600 font-medium">No API logs yet</p>
          <p className="text-sm text-slate-500 mt-1">Run a sync to see detailed API request logs</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <div
              key={log.id}
              className={`border rounded-lg overflow-hidden ${getStatusColor(log.response_status)}`}
            >
              <div
                onClick={() => toggleExpand(log.id)}
                className="p-4 cursor-pointer hover:bg-opacity-70 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    {getStatusIcon(log.response_status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-mono text-xs font-semibold px-2 py-1 bg-white rounded">
                          {log.method}
                        </span>
                        <span className="font-mono text-xs font-semibold px-2 py-1 bg-white rounded">
                          {log.response_status}
                        </span>
                        <div className="flex items-center gap-1 text-xs text-slate-600">
                          <Clock className="w-3 h-3" />
                          {log.duration_ms}ms
                        </div>
                      </div>
                      <div className="text-sm font-mono break-all text-slate-700">
                        {log.endpoint}
                      </div>
                      <div className="text-xs text-slate-500 mt-2">
                        {new Date(log.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  {expandedLog === log.id ? (
                    <ChevronUp className="w-5 h-5 text-slate-600 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-600 flex-shrink-0" />
                  )}
                </div>

                {log.error_message && (
                  <div className="mt-3 p-3 bg-white rounded border border-red-300">
                    <div className="text-xs font-semibold text-red-800 mb-1">Error:</div>
                    <div className="text-xs text-red-700">{log.error_message}</div>
                  </div>
                )}
              </div>

              {expandedLog === log.id && (
                <div className="border-t border-current border-opacity-20 bg-white bg-opacity-50 p-4 space-y-3">
                  {log.request_body && (
                    <div>
                      <div className="text-xs font-semibold mb-2 text-slate-700">Request Body:</div>
                      <pre className="text-xs bg-white p-3 rounded border border-slate-200 overflow-x-auto max-h-48">
                        {JSON.stringify(log.request_body, null, 2)}
                      </pre>
                    </div>
                  )}

                  {log.response_body && (
                    <div>
                      <div className="text-xs font-semibold mb-2 text-slate-700">Response Body:</div>
                      <pre className="text-xs bg-white p-3 rounded border border-slate-200 overflow-x-auto max-h-96">
                        {typeof log.response_body === 'string'
                          ? log.response_body
                          : JSON.stringify(log.response_body, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
