export const stats = { requests: 0, bytes: 0 };
const orig = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  stats.requests++;
  const res = await orig(input, init);
  const buf = await res.clone().arrayBuffer();
  stats.bytes += buf.byteLength;
  return res;
}) as typeof fetch;
