type Listener = () => void;

export interface RequestTracker {
  fetch: typeof fetch;
  snapshot: () => { inFlight: number; requests: number; bytes: number };
  subscribe: (listener: Listener) => () => void;
}

export function createRequestTracker(): RequestTracker {
  let inFlight = 0;
  let requests = 0;
  let bytes = 0;
  const listeners = new Set<Listener>();
  const notify = () => listeners.forEach(l => l());

  const trackedFetch: typeof fetch = async (input, init) => {
    inFlight++;
    requests++;
    notify();
    try {
      const res = await fetch(input, init);
      const length = Number(res.headers.get('content-length'));
      if (length > 0) bytes += length;
      else res.clone().arrayBuffer().then(b => { bytes += b.byteLength; }, () => {});
      return res;
    } finally {
      inFlight--;
      notify();
    }
  };

  return {
    fetch: trackedFetch,
    snapshot: () => ({ inFlight, requests, bytes }),
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
