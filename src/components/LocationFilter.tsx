import { useState, useEffect } from 'react';
import { MapPin } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Location {
  id: string;
  name: string;
}

interface LocationFilterProps {
  value: string;
  onChange: (locationId: string, locationName: string) => void;
  excludeOnlineStore?: boolean;
}

export function LocationFilter({ value, onChange, excludeOnlineStore = true }: LocationFilterProps) {
  const [locations, setLocations] = useState<Location[]>([]);

  useEffect(() => {
    supabase.from('locations').select('id, name').order('name').then(({ data }) => {
      let locs = (data || []).map(l => ({ id: String(l.id), name: l.name || `Location ${l.id}` }));
      if (excludeOnlineStore) {
        locs = locs.filter(l => !l.name.toLowerCase().includes('online store'));
      }
      setLocations(locs);
    });
  }, [excludeOnlineStore]);

  const handleChange = (id: string) => {
    const loc = locations.find(l => l.id === id);
    onChange(id, id === 'all' ? 'All locations' : loc?.name || '');
  };

  return (
    <div className="flex items-center gap-2">
      <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
      <select
        value={value}
        onChange={e => handleChange(e.target.value)}
        className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
      >
        <option value="all">All locations</option>
        {locations.map(l => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>
    </div>
  );
}
