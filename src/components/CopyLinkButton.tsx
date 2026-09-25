import { useState, useCallback } from 'react';
import { Link2, Check } from 'lucide-react';
import { buildReportUrl } from '../hooks/useHashRouter';
import type { MenuSection } from './Sidebar';

interface CopyLinkButtonProps {
  section: MenuSection;
  params: Record<string, string>;
}

export function CopyLinkButton({ section, params }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const url = buildReportUrl(section, params);
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [section, params]);

  return (
    <button
      onClick={handleCopy}
      className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors flex items-center gap-2"
    >
      {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Link2 className="w-4 h-4" />}
      {copied ? 'Link copied' : 'Copy link'}
    </button>
  );
}
