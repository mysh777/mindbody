import { OwnerOverview } from './OwnerOverview';
import type { CardLink } from './OwnerOverviewCards';
import { PagePurpose } from './PageHeader';

interface SalesReportPageProps {
  onOpenReport: (link: CardLink) => void;
  urlParams?: Record<string, string>;
  onParamsChange?: (params: Record<string, string>) => void;
}

export function SalesReportPage({ onOpenReport, urlParams, onParamsChange }: SalesReportPageProps) {
  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-4 sm:px-6 py-6 print:hidden">
        <h2 className="text-2xl font-bold text-slate-900">Overview</h2>
        <PagePurpose section="overview" />
      </div>
      <div className="p-4 sm:p-6">
        <OwnerOverview urlParams={urlParams} onParamsChange={onParamsChange} onOpenReport={onOpenReport} />
      </div>
    </div>
  );
}
