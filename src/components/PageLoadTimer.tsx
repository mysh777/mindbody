import { useEffect, useRef, useState } from 'react';
import { Timer } from 'lucide-react';
import { requestTracker, supabase } from '../lib/supabase';
import type { MenuSection } from '../lib/pages';

const IDLE_MS = 600;
const MAX_WAIT_FOR_FIRST_REQUEST_MS = 5000;

interface Measurement {
  page: MenuSection;
  firstOpen: boolean;
  ms: number;
  requests: number;
  kb: number;
}

function networkType(): string | null {
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  return conn?.effectiveType ?? null;
}

export function PageLoadTimer({ page }: { page: MenuSection }) {
  const opened = useRef<Set<MenuSection>>(new Set());
  const [last, setLast] = useState<Measurement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const firstOpen = !opened.current.has(page);
    opened.current.add(page);
    const start = performance.now();
    const base = requestTracker.snapshot();
    let lastActivity = start;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      const now = requestTracker.snapshot();
      const requests = now.requests - base.requests;
      const m: Measurement = {
        page,
        firstOpen,
        ms: requests > 0 ? Math.round(lastActivity - start) : 0,
        requests,
        kb: Math.round((now.bytes - base.bytes) / 1024),
      };
      setLast(m);
      supabase.from('page_load_metrics').insert({
        page: m.page, first_open: m.firstOpen, ms: m.ms, requests: m.requests, kb: m.kb,
        app_version: __APP_BUILD__, network: networkType(), viewport_width: window.innerWidth,
      }).then(({ error }) => { if (error) console.warn('Page timing not saved:', error.message); });
    };

    const unsubscribe = requestTracker.subscribe(() => { lastActivity = performance.now(); });
    const interval = window.setInterval(() => {
      const s = requestTracker.snapshot();
      const now = performance.now();
      const sawRequest = s.requests > base.requests;
      if (s.inFlight > 0) return;
      if (!sawRequest && now - start < MAX_WAIT_FOR_FIRST_REQUEST_MS) return;
      if (now - lastActivity >= IDLE_MS) finish();
    }, 100);

    return () => {
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [page]);

  if (!last) return null;

  const seconds = (last.ms / 1000).toFixed(1);
  return (
    <button
      type="button"
      onClick={() => setOpen(o => !o)}
      title="Page load timing"
      className="fixed bottom-3 right-3 z-40 flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs text-slate-600 shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-slate-900 print:hidden"
    >
      <Timer className="h-3.5 w-3.5" />
      {last.requests === 0 ? (
        <span>Already loaded</span>
      ) : (
        <span>{seconds} s</span>
      )}
      {open && (
        <span className="text-slate-500">
          · {last.requests} requests · {last.kb >= 1024 ? `${(last.kb / 1024).toFixed(1)} MB` : `${last.kb} KB`} · {last.firstOpen ? 'first open' : 'repeat open'}
        </span>
      )}
    </button>
  );
}
