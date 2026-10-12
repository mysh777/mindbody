import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { searchClients, type ClientIndex, type IndexedClient } from '../../utils/campaignMatch';

interface ClientPickerProps {
  index: ClientIndex;
  onPick: (client: IndexedClient) => void;
  onClose?: () => void;
  excludeIds?: Set<string>;
  placeholder?: string;
  autoFocus?: boolean;
}

export function ClientPicker({ index, onPick, onClose, excludeIds, placeholder, autoFocus }: ClientPickerProps) {
  const [query, setQuery] = useState('');
  const results = useMemo(
    () => searchClients(index, query, 30).filter(c => !excludeIds?.has(c.id)).slice(0, 12),
    [index, query, excludeIds],
  );

  return (
    <div className="relative">
      <div className="flex items-center gap-2 border border-slate-300 rounded-lg bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-teal-500">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder ?? 'Search by name, phone or email'}
          className="flex-1 text-sm outline-none bg-transparent text-slate-800 placeholder:text-slate-400"
        />
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close search">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {query.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-auto">
          {results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-500">No clients found</div>
          ) : results.map(c => (
            <button
              key={c.id}
              onClick={() => { onPick(c); setQuery(''); }}
              className="w-full text-left px-3 py-2 hover:bg-teal-50 transition-colors border-b border-slate-100 last:border-0"
            >
              <div className="text-sm font-medium text-slate-800">{c.name || `Client ${c.id}`}</div>
              <div className="text-xs text-slate-500">{[c.phone, c.email, `ID ${c.id}`].filter(Boolean).join(' · ')}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ClientLabel({ client, id }: { client: IndexedClient | undefined; id: string }) {
  return (
    <div>
      <div className="text-sm font-medium text-slate-800">{client?.name || `Client ${id}`}</div>
      <div className="text-xs text-slate-500">{[client?.phone, client?.email, `ID ${id}`].filter(Boolean).join(' · ')}</div>
    </div>
  );
}
