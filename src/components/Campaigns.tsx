import { useEffect, useState } from 'react';
import { SimplePage } from './PageHeader';
import { ListsOverview } from './campaigns/ListsOverview';
import { UploadWizard } from './campaigns/UploadWizard';
import { ManualBuilder } from './campaigns/ManualBuilder';
import { ListDetail } from './campaigns/ListDetail';
import { useClientIndex } from './campaigns/useClientIndex';

interface CampaignsProps {
  active: boolean;
  onViewClient?: (clientId: string) => void;
  urlParams?: Record<string, string>;
  onParamsChange?: (params: Record<string, string>) => void;
}

// Visited pages stay mounted and share the address bar, so the address is only read while this page is shown.
export function Campaigns({ active, onViewClient, urlParams, onParamsChange }: CampaignsProps) {
  const [nav, setNav] = useState<Record<string, string>>(urlParams ?? {});
  useEffect(() => { if (active) setNav(urlParams ?? {}); }, [active, urlParams]);
  const listId = nav.list || '';
  const view = listId ? 'list' : nav.view === 'upload' || nav.view === 'manual' ? nav.view : 'lists';
  const { index, error: indexError } = useClientIndex(view !== 'lists');
  const go = (params: Record<string, string>) => { setNav(params); onParamsChange?.(params); };

  return (
    <SimplePage section="campaigns">
      <div className="max-w-7xl mx-auto">
        {indexError && view !== 'lists' && (
          <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">Could not load clients: {indexError}</div>
        )}
        {view === 'lists' && <ListsOverview onOpen={id => go({ list: id })} onUpload={() => go({ view: 'upload' })} onManual={() => go({ view: 'manual' })} />}
        {view === 'upload' && <UploadWizard index={index} onCancel={() => go({})} onSaved={id => go({ list: id })} />}
        {view === 'manual' && <ManualBuilder index={index} onCancel={() => go({})} onSaved={id => go({ list: id })} />}
        {view === 'list' && (
          <ListDetail key={listId} listId={listId} index={index} onBack={() => go({})} onDeleted={() => go({})} onViewClient={onViewClient} />
        )}
      </div>
    </SimplePage>
  );
}
