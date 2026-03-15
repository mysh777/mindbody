import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import type { SyncLog } from '../types/mindbody';

export function SyncHistory() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(false);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sync_logs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error loading sync logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'started':
        return <Clock className="w-5 h-5 text-blue-600 animate-pulse" />;
      default:
        return <AlertCircle className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-3 py-1 rounded-full text-xs font-medium";
    switch (status) {
      case 'completed':
        return `${baseClasses} bg-green-100 text-green-700`;
      case 'failed':
        return `${baseClasses} bg-red-100 text-red-700`;
      case 'started':
        return `${baseClasses} bg-blue-100 text-blue-700`;
      default:
        return `${baseClasses} bg-slate-100 text-slate-700`;
    }
  };

  const formatDuration = (started: string, completed: string | null) => {
    if (!completed) return 'In progress...';
    const start = new Date(started);
    const end = new Date(completed);
    const diff = Math.round((end.getTime() - start.getTime()) / 1000);
    if (diff < 60) return `${diff}s`;
    const minutes = Math.floor(diff / 60);
    const seconds = diff % 60;
    return `${minutes}m ${seconds}s`;
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-slate-600">
        Loading sync history...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-6">Sync History</h2>

        {logs.length === 0 ? (
          <div className="text-center py-12 text-slate-600">
            No sync history available yet
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="mt-0.5">{getStatusIcon(log.status)}</div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-slate-900">
                        {log.sync_type.charAt(0).toUpperCase() + log.sync_type.slice(1)} Sync
                      </h3>
                      <span className={getStatusBadge(log.status)}>
                        {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div>
                        <span className="text-slate-600">Started:</span>
                        <span className="ml-2 text-slate-900">
                          {new Date(log.started_at).toLocaleString()}
                        </span>
                      </div>

                      {log.completed_at && (
                        <div>
                          <span className="text-slate-600">Duration:</span>
                          <span className="ml-2 text-slate-900">
                            {formatDuration(log.started_at, log.completed_at)}
                          </span>
                        </div>
                      )}

                      {log.status === 'completed' && (
                        <div>
                          <span className="text-slate-600">Records:</span>
                          <span className="ml-2 text-slate-900 font-semibold">
                            {log.records_synced.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>

                    {log.error_message && (
                      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-700">{log.error_message}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
