import { useState } from 'react';
import { TableView } from './TableView';
import { ServicesGroupedView } from './ServicesGroupedView';

interface ReferenceTablesProps {
  onNavigate?: (tableName: string, id: string) => void;
}

type ReferenceTab = 'sites' | 'locations' | 'staff' | 'service-categories' | 'services' | 'pricing-options' | 'retail-products';

const tabs: { id: ReferenceTab; label: string; tableName: string }[] = [
  { id: 'sites', label: 'Sites', tableName: 'sites' },
  { id: 'locations', label: 'Locations', tableName: 'locations' },
  { id: 'staff', label: 'Staff', tableName: 'staff' },
  { id: 'service-categories', label: 'Categories', tableName: 'service_categories' },
  { id: 'services', label: 'Services', tableName: 'session_types' },
  { id: 'pricing-options', label: 'Pricing Options', tableName: 'pricing_options' },
  { id: 'retail-products', label: 'Products', tableName: 'retail_products' },
];

export function ReferenceTables({ onNavigate }: ReferenceTablesProps) {
  const [activeTab, setActiveTab] = useState<ReferenceTab>('staff');

  const renderTabContent = () => {
    if (activeTab === 'services') {
      return <ServicesGroupedView />;
    }

    const tab = tabs.find(t => t.id === activeTab);
    if (!tab) return null;

    return (
      <TableView
        tableName={tab.tableName}
        displayName={tab.label}
        onNavigate={onNavigate}
        selectedId={null}
        hideHeader
      />
    );
  };

  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-6">
        <h2 className="text-2xl font-bold text-slate-900">Reference Tables</h2>
        <p className="text-slate-600 mt-1">Browse and manage reference data</p>
      </div>

      <div className="bg-white border-b border-slate-200 px-6">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {renderTabContent()}
      </div>
    </div>
  );
}
