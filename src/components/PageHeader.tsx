import type { ReactNode } from 'react';
import { PAGES, type MenuSection } from '../lib/pages';

export function PagePurpose({ section }: { section: MenuSection }) {
  return <p className="text-sm text-slate-500 mt-1 leading-relaxed">{PAGES[section].purpose}</p>;
}

interface SimplePageProps {
  section: MenuSection;
  actions?: ReactNode;
  children: ReactNode;
}

export function SimplePage({ section, actions, children }: SimplePageProps) {
  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{PAGES[section].label}</h2>
          <PagePurpose section={section} />
        </div>
        {actions}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}
