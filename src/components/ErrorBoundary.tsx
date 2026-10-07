import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  scope?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.scope || 'app'}]`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="min-h-full flex items-center justify-center p-8 bg-slate-50">
        <div className="max-w-lg w-full bg-white border border-red-200 rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-2 text-red-700 font-semibold">
            <AlertTriangle className="w-5 h-5" />
            {this.props.scope ? `This page failed to load` : 'The app failed to load'}
          </div>
          <p className="mt-2 text-sm text-slate-600">{this.props.scope ? 'Other pages keep working. ' : ''}Details for support:</p>
          <pre className="mt-3 p-3 bg-slate-50 rounded-lg text-xs text-slate-800 whitespace-pre-wrap break-words max-h-48 overflow-auto">
            {error.message || String(error)}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => this.setState({ error: null })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-700 transition-colors"
            >
              <RotateCw className="w-4 h-4" /> Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
