// Prompt 33: «Glimt husker» på klienten (web og PWA bruker samme modul via /assets/js/glimt-memory.js).
// API: GET/POST /api/glimt/memory, DELETE /api/glimt/memory/:id, POST /api/glimt/memory/:id/apply {dryRun?}.
// - loadMemory() henter brukerens alias én gang (cache) så parseQuick kan få dem som tredje parameter i forhåndsvisningen.
// - LEARN_TYPES er valgene i «Lær Glimt hva dette er…»-arket (Frisør, Lege, Tannlege, Fysio, Optiker, Psykolog, Annet).
// - nameOfEvent(ev) gjetter avsenderen/bedriften fra notatet (signaturen i SMS-en) eller tittelen.
// Ingen DOM her: hver klient tegner arket i sin egen stil.
import { senderOf, niceCase, isNoiseLine } from './quick-time.js';

export const LEARN_TYPES = [['frisør', 'Frisør'], ['lege', 'Lege'], ['tannlege', 'Tannlege'], ['fysio', 'Fysio'], ['optiker', 'Optiker'], ['psykolog', 'Psykolog'], ['annet', 'Annet']];
const DIN = { frisør: 'frisøren din', lege: 'legen din', tannlege: 'tannlegen din', fysio: 'fysioterapeuten din', optiker: 'optikeren din', psykolog: 'psykologen din', annet: 'lagret' };
/** «frisøren din» (Ok, Glimt husker at X er frisøren din). */
export const dinOf = (t) => DIN[t] ?? 'lagret';
export const typeName = (t) => LEARN_TYPES.find(([k]) => k === t)?.[1] ?? 'Annet';
const M = { items: null, at: 0, p: null, base: '/api' };

/** PWA kan bruke en annen base (samme /api på Homelab-serveren). */
export function setMemoryBase(b) { M.base = b || '/api'; }
async function call(path, method = 'GET', json) {
  const r = await fetch(M.base + '/glimt/memory' + path, { method, credentials: 'same-origin', cache: 'no-store', headers: json ? { 'Content-Type': 'application/json' } : {}, body: json ? JSON.stringify(json) : undefined });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => ({})) : {};
  if (!r.ok) throw Object.assign(new Error(d.error || (r.status === 404 ? 'Serveren støtter ikke «Glimt husker» ennå.' : `Feil ${r.status}`)), { status: r.status });
  return d;
}
/** Aliasene (cache). force = hent på nytt. Eldre server (404): tom liste. */
export function loadMemory(force = false) {
  if (!force && M.items && Date.now() - M.at < 5 * 60_000) return Promise.resolve(M.items);
  if (M.p && !force) return M.p;
  M.p = call('').then((d) => { M.items = Array.isArray(d.items) ? d.items : []; M.at = Date.now(); return M.items; })
    .catch(() => { M.items = M.items ?? []; M.at = Date.now(); return M.items; }).finally(() => { M.p = null; });
  return M.p;
}
/** Det som er i cachen nå (til parseQuick). */
export const memoryNow = () => M.items ?? [];
export async function addMemory(body) { const d = await call('', 'POST', body); await loadMemory(true); return d; }
export async function deleteMemory(id) { const d = await call(`/${encodeURIComponent(id)}`, 'DELETE'); M.items = (M.items ?? []).filter((m) => m.id !== id); return d; }
export const applyMemory = (id, dryRun = false) => call(`/${encodeURIComponent(id)}/apply`, 'POST', { dryRun });

/** Avsender/bedrift for en hendelse: signaturen i notatet («Mvh PÅHÅRET Studio Hoff»), ellers tittelen uten «Frisør · ». */
export function nameOfEvent(ev) {
  const note = ev?.note ?? ev?.n ?? '';
  const s = senderOf(note);
  if (s) return s;
  const t = String(ev?.title ?? ev?.t ?? '').replace(/^[^·]{2,20}·\s*/, '').trim();
  return t && !isNoiseLine(t) ? niceCase(t) : '';
}
/** «Frisør · Påhåret» for listen i innstillingene. */
export const memoryLine = (m) => (m.title ? (m.title.toLowerCase().includes(typeName(m.type).toLowerCase()) || m.type === 'annet' ? `→ ${m.title}` : `→ ${typeName(m.type)} · ${m.title}`) : `→ ${typeName(m.type)}`);
