// Prompt 51 (MEDFAM51): lydbøker og podkaster via Audiobookshelf (valgfri container i docker-compose.yml, profil «audiobookshelf»).
// Adresse og API-token står bare i .env (ABS_URL, ABS_TOKEN – et admin-token, så serveren kan lese fremdriften til hver bruker).
// Tokenet sendes aldri til klienten: omslag går via /api/media51/audio/cover/:id. «Fortsett der du slapp» per familiemedlem: brukeren
// kobles til en Audiobookshelf-bruker med samme brukernavn, eller valgt selv (PUT /api/media51/audio/me {absUser}).
import { kv } from '../db.js';
import { userInfo } from '../auth.js';
import { MOCK, DAY, getJson, errText, serviceUrl, minText, clean } from './common.js';

export const absConf51 = () => ({ url: serviceUrl('ABS_URL'), token: String(process.env.ABS_TOKEN ?? '').trim(), publicUrl: serviceUrl('ABS_PUBLIC_URL') });
export const absOn51 = () => { const c = absConf51(); return !!(c.url && c.token); };
const demo = () => MOCK() && !absOn51();
const ID = /^[\w-]{1,64}$/;
const abs = (path, o = {}) => { const c = absConf51(); return getJson(`${c.url}/api${path}`, { ...o, headers: { Authorization: `Bearer ${c.token}`, ...(o.headers ?? {}) } }); };

const cache = new Map();
async function cached(key, ttl, fn) { const h = cache.get(key); if (h && h.exp > Date.now()) return h.v; const v = await fn(); cache.set(key, { v, exp: Date.now() + ttl }); return v; }
export const _clearAbs51 = () => cache.clear();

export async function audioStatus51() {
  if (demo()) return { configured: false, mock: true, reachable: true, libraries: [{ id: 'demo-books', name: 'Lydbøker', mediaType: 'book' }, { id: 'demo-pods', name: 'Podkaster', mediaType: 'podcast' }], text: 'Demo (MOCK_DATA)' };
  if (!absOn51()) return { configured: false, reachable: false, libraries: [], text: 'Audiobookshelf er ikke satt opp. Start containeren (docker compose --profile audiobookshelf up -d) og sett ABS_URL og ABS_TOKEN i .env.' };
  try {
    const r = await cached('libs', 5 * 60_000, () => abs('/libraries'));
    const libraries = (r?.libraries ?? []).map((l) => ({ id: l.id, name: l.name, mediaType: l.mediaType === 'podcast' ? 'podcast' : 'book' }));
    return { configured: true, reachable: true, libraries, text: `${libraries.length} ${libraries.length === 1 ? 'bibliotek' : 'biblioteker'}` };
  } catch (e) { return { configured: true, reachable: false, libraries: [], error: errText(e), text: `Fikk ikke kontakt med Audiobookshelf: ${errText(e)}` }; }
}

/** Hvilken Audiobookshelf-bruker hører til Nordlys-brukeren. → {id, username} | null */
async function absUserOf(u) {
  const want = String(kv.get(u, 'medfam51_abs_user', null) ?? userInfo(u)?.username ?? '').toLowerCase();
  if (!want) return null;
  const list = await cached('users', 5 * 60_000, async () => (await abs('/users'))?.users ?? []);
  const x = list.find((y) => String(y.username ?? '').toLowerCase() === want);
  return x ? { id: x.id, username: x.username } : null;
}
export async function setAbsUser51(u, name) {
  const n = clean(name, 64);
  if (!n) { kv.del(u, 'medfam51_abs_user'); return { ok: true, absUser: null }; }
  if (absOn51()) {
    const list = await cached('users', 5 * 60_000, async () => (await abs('/users'))?.users ?? []);
    if (!list.some((y) => String(y.username ?? '').toLowerCase() === n.toLowerCase())) return { error: 'Fant ingen bruker med det navnet i Audiobookshelf', status: 404 };
  }
  kv.set(u, 'medfam51_abs_user', n);
  return { ok: true, absUser: n };
}

const DEMO = [
  { id: 'demo-1', title: 'Sofies verden', author: 'Jostein Gaarder', kind: 'book', currentTime: 3 * 3600 + 1200, duration: 14 * 3600, lastUpdate: Date.now() - 2 * 3600_000 },
  { id: 'demo-2', title: 'Hva skjedde nå?', author: 'NRK', kind: 'podcast', episodeTitle: 'Uke 43', currentTime: 900, duration: 2400, lastUpdate: Date.now() - DAY },
];
function out(x, c) {
  const pct = x.duration ? Math.min(100, Math.round((x.currentTime / x.duration) * 100)) : 0;
  const left = x.duration ? Math.max(0, (x.duration - x.currentTime) / 60) : null;
  return { id: x.id, episodeId: x.episodeId ?? null, title: x.title, author: x.author ?? null, episodeTitle: x.episodeTitle ?? null, kind: x.kind, progress: pct, progressText: `${pct} %`,
    currentTime: Math.round(x.currentTime), duration: Math.round(x.duration ?? 0), remainingText: left != null ? `${minText(left)} igjen` : null, lastUpdate: new Date(x.lastUpdate).toISOString(),
    coverUrl: x.mock ? null : `/api/media51/audio/cover/${encodeURIComponent(x.id)}`, openUrl: c?.publicUrl ? `${c.publicUrl}/item/${encodeURIComponent(x.id)}` : null };
}

/** «Fortsett der du slapp» for brukeren. */
export async function audioContinue51(u, { limit = 10 } = {}) {
  if (demo()) return { configured: false, mock: true, absUser: 'demo', items: DEMO.map((x) => out({ ...x, mock: true })) };
  if (!absOn51()) return { configured: false, items: [], text: 'Audiobookshelf er ikke satt opp' };
  const c = absConf51();
  let au;
  try { au = await absUserOf(u); } catch (e) { return { configured: true, items: [], error: errText(e) }; }
  if (!au) return { configured: true, items: [], absUser: null, text: 'Fant ingen Audiobookshelf-bruker med ditt brukernavn – velg bruker under Media › Lydbøker' };
  let progress = [];
  try { progress = (await abs(`/users/${encodeURIComponent(au.id)}`))?.mediaProgress ?? []; } catch (e) { return { configured: true, items: [], absUser: au.username, error: errText(e) }; }
  const open = progress.filter((p) => !p.isFinished && !p.hideFromContinueListening && (p.currentTime ?? 0) > 30 && ID.test(String(p.libraryItemId ?? '')))
    .sort((a, b) => (b.lastUpdate ?? 0) - (a.lastUpdate ?? 0)).slice(0, Math.max(1, Math.min(20, limit)));
  const items = [];
  for (const p of open) {
    try {
      const it = await cached(`item:${p.libraryItemId}`, 10 * 60_000, () => abs(`/items/${encodeURIComponent(p.libraryItemId)}`, { headers: {} }));
      const md = it?.media?.metadata ?? {};
      const ep = p.episodeId ? (it?.media?.episodes ?? []).find((e) => e.id === p.episodeId) : null;
      items.push(out({ id: p.libraryItemId, episodeId: p.episodeId ?? null, title: md.title ?? 'Uten tittel', author: md.authorName ?? md.author ?? null, episodeTitle: ep?.title ?? null,
        kind: it?.mediaType === 'podcast' ? 'podcast' : 'book', currentTime: p.currentTime ?? 0, duration: p.duration || it?.media?.duration || ep?.duration || 0, lastUpdate: p.lastUpdate ?? Date.now() }, c));
    } catch { /* elementet er borte */ }
  }
  return { configured: true, absUser: au.username, items };
}

/** Omslag via serveren (tokenet blir på serveren). → Response | null */
export async function audioCover51(id) {
  if (!ID.test(String(id)) || !absOn51()) return null;
  const r = await getJson(`${absConf51().url}/api/items/${encodeURIComponent(id)}/cover?width=400`, { headers: { Authorization: `Bearer ${absConf51().token}`, Accept: 'image/*' }, raw: true, timeout: 15_000 });
  const ct = r.headers.get('content-type') ?? '';
  if (!r.ok || !/^image\/(jpeg|png|webp)/i.test(ct)) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 5 * 1024 * 1024) return null;
  return { buf, type: ct.split(';')[0] };
}
