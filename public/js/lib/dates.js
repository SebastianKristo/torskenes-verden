// Datotolking fra serveren (Fase 3, Q17): web regner ikke ut datoer selv, men viser det serveren svarer.
//   quickParse(text)          → Promise med serverens tolkning av en rask avtale (POST /api/kalender/quick/parse):
//                               {ok, why?, title, date, start, end, place, type, duration, allDay, …, label}
//   quickCached(text, onReady) → svaret hvis det allerede er hentet, ellers null; onReady(svar) kalles når det kommer
//                               (til forhåndsvisning mens brukeren skriver: tegn på nytt i onReady).
// Serveren bruker brukerens «Glimt husker»-alias selv. Svarene huskes per tekst (de siste 50).

const BASE = '/api/kalender/quick/parse';
const cache = new Map(), pending = new Map();
const keyOf = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();

async function fetchParse(text) {
  const r = await fetch(BASE, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  if (r.status === 401) { location.href = '/login'; throw new Error('Ikke innlogget'); }
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null;
  if (!r.ok || !d) throw Object.assign(new Error(d?.error || `Feil ${r.status}`), { status: r.status });
  return d;
}

export function quickParse(text) {
  const k = keyOf(text);
  if (cache.has(k)) return Promise.resolve(cache.get(k));
  if (!pending.has(k)) {
    pending.set(k, fetchParse(k).then((d) => {
      cache.set(k, d);
      if (cache.size > 50) cache.delete(cache.keys().next().value);
      return d;
    }).finally(() => pending.delete(k)));
  }
  return pending.get(k);
}

export function quickCached(text, onReady) {
  const k = keyOf(text);
  if (cache.has(k)) return cache.get(k);
  quickParse(k).then((d) => onReady?.(d), () => {});
  return null;
}
