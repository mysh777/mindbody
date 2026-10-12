import { useEffect, useState } from 'react';
import { loadClientIndex, type ClientIndex } from '../../utils/campaignMatch';

export function useClientIndex(enabled: boolean) {
  const [index, setIndex] = useState<ClientIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || index) return;
    let cancelled = false;
    setError(null);
    loadClientIndex([])
      .then(ix => { if (!cancelled) setIndex(ix); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [enabled, index]);

  return { index, error };
}
