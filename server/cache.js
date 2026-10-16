// Liten minnecache med TTL. Samtidige kall for samme nøkkel deler ett løfte,
// og ved feil returneres siste gode verdi (merket stale) hvis den finnes.
const store = new Map();

export async function cached(key, ttlMs, fn) {
  const hit = store.get(key);
  const now = Date.now();
  if (hit?.value !== undefined && hit.expires > now) return hit.value;
  if (hit?.pending) return hit.pending;
  const pending = (async () => {
    try {
      const value = await fn();
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    } catch (err) {
      if (hit?.value !== undefined) {
        store.set(key, { value: hit.value, expires: Date.now() + Math.min(ttlMs, 60_000) });
        return { ...hit.value, stale: true };
      }
      store.delete(key);
      throw err;
    }
  })();
  store.set(key, { ...hit, pending });
  return pending;
}

export async function fetchJson(url, opts = {}, timeoutMs = 10_000) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${new URL(url).host} svarte ${res.status}`);
  return res.json();
}
