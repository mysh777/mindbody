import { AlertTriangle } from 'lucide-react';

interface LoadErrorBannerProps {
  title: string;
  message: string;
  onRetry: () => void;
}

export function LoadErrorBanner({ title, message, onRetry }: LoadErrorBannerProps) {
  return (
    <div role="alert" className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
      <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
      <div className="text-sm text-red-800 min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-red-700 mt-0.5 break-words">{message}</p>
      </div>
      <button onClick={onRetry} className="ml-auto shrink-0 text-sm font-medium text-red-700 hover:text-red-900 transition-colors">Retry</button>
    </div>
  );
}
