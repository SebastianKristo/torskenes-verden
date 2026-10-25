// Prompt 51 (MEDCTL51): mediekontroll – play/pause/stopp/neste/forrige/søk i tid og volum for aktive avspillinger i Plex og
// Jellyfin (deres egne API-er, via serveren så nøklene aldri forlater den), og Audiobookshelf-fremdrift (lesing – ABS lar seg ikke
// fjernstyre fra et annet program). API-formene står i SERVER51-API.md (seksjon MEDCTL51), brukerveiledningen i docs/mediekontroll-51.md.
//
//   GET  /api/medctl51/now                         → {items:[Ctl], audio:[Lyd], admin, configured:{plex, jellyfin, abs}, errors?}
//   POST /api/medctl51/sessions/:id/:action         action = play|pause|toggle|stop|next|previous|seek|volume
//        seek: {position (ms)} eller {offset (± ms)} · volume: {volume 0–100} eller {delta ± }  → {ok, action, item:Ctl|null, message}
//
// Hvem kan styre hva: brukeren styrer sine egne avspillinger, admin styrer alle. «Egne» avgjøres BARE av koblingen admin har satt
// (Homelab-bruker → Plex-/Jellyfin-/Audiobookshelf-brukernavn, GET/PUT /api/medctl51/links, unik per tjeneste). Navnet brukeren selv
// setter i «I kveld» (medfam51_plex_user) brukes bare til forslag – aldri til tilgang. Uten kobling kan en vanlig bruker bare se. Serveren slår alltid opp sesjonen på nytt før en kommando
// (id-en fra klienten er bare en peker – eierskap og evner avgjøres her). Rate limit per bruker (12 per 10 s, 60 per minutt).
// Feil: 400 ugyldig, 403 ikke din avspilling, 404 avspillingen er borte, 409 avspilleren kan ikke fjernstyres, 429 for mange, 502 Plex/Jellyfin.
import { Hono } from 'hono';
import { kv, OWNER } from './db.js';
import { isAdmin, userInfo, listUsers } from './auth.js';
import { authOrToken as authOrToken0 } from './mobile.js';
import { mediaAllowed43 } from './media43.js';
import { pb44 } from './playback44.js';
import { absConf51, absOn51 } from './medfam51/audio.js';
import { getJson as mfGet, errText } from './medfam51/common.js';

const MOCK = () => process.env.MOCK_DATA === '1';
export const ACTIONS51 = ['play', 'pause', 'toggle', 'stop', 'next', 'previous', 'seek', 'volume'];
const LABEL = { play: 'Spiller', pause: 'Satt på pause', toggle: 'Byttet', stop: 'Stoppet', next: 'Neste', previous: 'Forrige', seek: 'Hoppet', volume: 'Volum' };
const minText = (ms) => { const m = Math.max(0, Math.round(ms / 60_000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} t ${m % 60} min`; };
const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const lc = (s) => String(s ?? '').trim().toLowerCase();

/* ---------------- Rate limit (per bruker, i minnet) ---------------- */

export const LIMITS51 = [{ ms: 10_000, max: 12 }, { ms: 60_000, max: 60 }];
const hits = new Map();
/** → sekunder til neste kommando er lov (0 = lov nå). Teller bare når den er lov. */
export function rateCheck51(user, now = Date.now()) {
  const list = (hits.get(user) ?? []).filter((t) => t > now - 60_000);
  for (const { ms, max } of LIMITS51) {
    const recent = list.filter((t) => t > now - ms);
    if (recent.length >= max) { hits.set(user, list); return Math.max(1, Math.ceil((recent[0] + ms - now) / 1000)); }
  }
  list.push(now); hits.set(user, list);
  return 0;
}
export const _resetMedctl51 = () => { hits.clear(); cache = null; demoState.clear(); absCache = null; };

/* ---------------- Sesjoner med fjernkontroll-felt ---------------- */

const demoState = new Map(); // demo-id → {state, position, volume, stopped, at}
let cache = null; // {at, list}
const CACHE_MS = 2000;

function demoList() {
  return pb44.DEMO_SESS.map((x, i) => {
    const id = `demo-${i}`, s = demoState.get(id) ?? {};
    if (s.stopped) return null;
    const pos = s.position ?? x.duration * x.progress / 100;
    return { ...x, id, skey: `demo-live-${i}`, item: x.title, poster: null, state: s.state ?? x.state, position: pos, progress: x.duration ? Math.round((pos / x.duration) * 100) : 0,
      ctl: { kind: 'demo', volume: s.volume ?? 80, remote: true, volumeOk: true } };
  }).filter(Boolean);
}

async function liveList() {
  if (pb44.demo()) return demoList();
  const out = [], errors = {};
  if (pb44.plexOn()) {
    try {
      const j = await pb44.plexGet('/status/sessions');
      for (const x of j?.MediaContainer?.Metadata ?? []) {
        const s = pb44.plexSession(x);
        s.ctl = { kind: 'plex', machine: String(x.Player?.machineIdentifier ?? ''), sessionId: String(x.Session?.id ?? ''), type: x.type === 'track' ? 'music' : x.type === 'photo' ? 'photo' : 'video', remote: !!x.Player?.machineIdentifier, volumeOk: true, volume: null };
        out.push(s);
      }
    } catch (e) { errors.plex = errText(e); }
  }
  if (pb44.jfOn()) {
    try {
      const j = await pb44.jfGet('/Sessions?ActiveWithinSeconds=120');
      for (const x of Array.isArray(j) ? j : []) {
        const s = pb44.jfSession(x); if (!s) continue;
        const cmds = Array.isArray(x.Capabilities?.SupportedCommands) ? x.Capabilities.SupportedCommands : Array.isArray(x.SupportedCommands) ? x.SupportedCommands : [];
        s.ctl = { kind: 'jellyfin', sessionId: String(x.Id ?? ''), remote: x.SupportsRemoteControl !== false, volumeOk: cmds.includes('SetVolume'), volume: Number.isFinite(x.PlayState?.VolumeLevel) ? x.PlayState.VolumeLevel : null, muted: !!x.PlayState?.IsMuted };
        out.push(s);
      }
    } catch (e) { errors.jellyfin = errText(e); }
  }
  out.errors = errors;
  return out;
}
async function sessions(fresh = false) {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.list;
  const list = await liveList();
  cache = { at: Date.now(), list };
  return list;
}

/** Hører avspillingen til brukeren? (Plex-/Jellyfin-navnet mot navnene brukeren har hos oss.) */
/* ---------------- Koblinger (bare admin): Homelab-bruker → mediebrukernavn ---------------- */

export const SERVICES51 = ['plex', 'jellyfin', 'abs'];
const LINKS = 'medctl51_links';
const links = () => { const v = kv.get(OWNER, LINKS, {}); return v && typeof v === 'object' ? v : {}; };
/** Mediebrukernavnet admin har koblet brukeren til for en tjeneste ('plex'|'jellyfin'|'abs'), ellers null. */
export const linkOf51 = (u, svc) => { const n = links()[u]?.[svc]; return n ? String(n) : null; };
/** Admin setter koblingen. Tom verdi fjerner. Samme mediebrukernavn kan ikke kobles til to brukere (409). */
export function setLinks51(u, b = {}) {
  if (!userInfo(u)) return { error: 'Fant ikke brukeren', status: 404 };
  const all = links(), cur = { ...(all[u] ?? {}) };
  for (const svc of SERVICES51) {
    if (!(svc in b)) continue;
    const n = String(b[svc] ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64);
    if (!n) { delete cur[svc]; continue; }
    const taken = Object.entries(all).find(([id, l]) => id !== u && lc(l?.[svc]) === lc(n));
    if (taken) return { error: `«${n}» er allerede koblet til ${userInfo(taken[0])?.name ?? 'en annen bruker'}`, status: 409, code: 'LINK_TAKEN' };
    cur[svc] = n;
  }
  if (Object.keys(cur).length) all[u] = cur; else delete all[u];
  kv.set(OWNER, LINKS, all);
  return { ok: true, link: linkOut(u) };
}
const linkOut = (u) => { const x = userInfo(u) ?? {}; const l = links()[u] ?? {}; return { userId: u, name: x.name ?? x.username ?? u, username: x.username ?? null, plex: l.plex ?? null, jellyfin: l.jellyfin ?? null, abs: l.abs ?? null }; };
export const links51 = () => ({ links: listUsers().map((x) => linkOut(x.id)) });

const SVC = { plex: 'plex', jellyfin: 'jellyfin', audiobookshelf: 'abs' };
/** Hører avspillingen til brukeren? Bare via admin-koblingen for sesjonens tjeneste. Demo-sesjoner har server plex/jellyfin. */
export const ownsSession51 = (u, s) => { const n = linkOf51(u, SVC[s?.server] ?? ''); return !!n && !!s?.user && lc(s.user) === lc(n); };
function controlsOf(s) {
  const c = s.ctl ?? {};
  if (c.kind === 'plex') return c.remote ? ['playpause', 'stop', 'previous', 'next', 'seek', 'volume'] : ['stop'];
  if (c.kind === 'jellyfin') return c.remote ? ['playpause', 'stop', 'previous', 'next', 'seek', ...(c.volumeOk ? ['volume'] : [])] : [];
  if (c.kind === 'demo') return ['playpause', 'stop', 'previous', 'next', 'seek', 'volume'];
  return [];
}
function ctlOut(s, u) {
  const mine = ownsSession51(u, s), admin = isAdmin(u), controls = controlsOf(s);
  const allowed = mine || admin, canControl = allowed && controls.length > 0;
  return { id: s.id, server: s.server, title: s.title, subtitle: s.subtitle, kind: s.kind, poster: s.poster ?? null, user: s.user, userInitial: String(s.user ?? '?').trim().charAt(0).toUpperCase() || '?',
    device: s.device, platform: s.platform, state: s.state, position: Math.round(s.position ?? 0), duration: Math.round(s.duration ?? 0), progress: s.progress ?? 0,
    positionText: clock(s.position ?? 0), durationText: clock(s.duration ?? 0), remainingText: `${minText((s.duration ?? 0) - (s.position ?? 0))} igjen`,
    mine, canControl, controls: canControl ? controls : [], volume: s.ctl?.volume ?? null, muted: s.ctl?.muted ?? false,
    controlText: !allowed ? (linkOf51(u, SVC[s.server] ?? '') ? 'Bare den som ser på, eller en administrator, kan styre denne' : 'Be en administrator koble deg til ditt Plex-/Jellyfin-navn for å styre dine avspillinger') : !controls.length ? 'Denne avspilleren kan ikke fjernstyres' : controls.length === 1 ? 'Avspilleren kan bare stoppes herfra' : null,
    color: s.server === 'plex' ? '#e5a00d' : s.server === 'jellyfin' ? '#7b4fd6' : '#5b6b7a' };
}

/* ---------------- Audiobookshelf (fremdrift i åpne lytteøkter) ---------------- */

let absCache = null;
const DEMO_ABS = [{ id: 'abs-demo-1', title: 'Sofies verden', author: 'Jostein Gaarder', episodeTitle: null, kind: 'book', user: 'Ingrid', device: 'iPhone', position: (3 * 3600 + 1200) * 1000, duration: 14 * 3600_000, itemId: 'demo-1' }];
async function absNow(u) {
  const admin = isAdmin(u);
  let list;
  if (MOCK() && !absOn51()) list = DEMO_ABS;
  else if (!absOn51()) return { items: [], configured: false };
  else if (absCache && Date.now() - absCache.at < 15_000) list = absCache.list;
  else {
    const c = absConf51(), h = { headers: { Authorization: `Bearer ${c.token}` } };
    const [online, users] = await Promise.all([mfGet(`${c.url}/api/users/online`, h), mfGet(`${c.url}/api/users`, h).catch(() => null)]);
    const names = new Map((users?.users ?? []).map((x) => [x.id, x.username]));
    list = (online?.openSessions ?? []).map((x) => ({ id: `abs-${x.id}`, title: x.displayTitle ?? x.mediaMetadata?.title ?? 'Uten tittel', author: x.displayAuthor ?? null, episodeTitle: x.episodeId ? (x.displayTitle ?? null) : null,
      kind: x.mediaType === 'podcast' ? 'podcast' : 'book', user: names.get(x.userId) ?? x.user?.username ?? '', device: x.deviceInfo?.deviceName ?? x.deviceInfo?.clientName ?? '',
      position: Math.round((x.currentTime ?? 0) * 1000), duration: Math.round((x.duration ?? 0) * 1000), itemId: /^[\w-]{1,64}$/.test(String(x.libraryItemId ?? '')) ? x.libraryItemId : null }));
    absCache = { at: Date.now(), list };
  }
  // Bare admin-koblingen (eller samme brukernavn som i Homelab) – aldri navnet brukeren har satt selv.
  const me = lc(linkOf51(u, 'abs') ?? userInfo(u)?.username ?? '');
  const mineOf = (x) => !!me && lc(x.user) === me;
  const items = list.filter((x) => admin || mineOf(x)).map((x) => {
    const pct = x.duration ? Math.min(100, Math.round((x.position / x.duration) * 100)) : 0;
    return { ...x, server: 'audiobookshelf', mine: mineOf(x), progress: pct, progressText: `${pct} %`, positionText: clock(x.position), durationText: clock(x.duration), remainingText: `${minText(x.duration - x.position)} igjen`,
      coverUrl: x.itemId && !String(x.itemId).startsWith('demo') ? `/api/media51/audio/cover/${encodeURIComponent(x.itemId)}` : null, canControl: false, controls: [], controlText: 'Styres i Audiobookshelf-appen – fremdriften synkes dit' };
  });
  return { items, configured: absOn51() || undefined };
}

/* ---------------- Kommandoer ---------------- */

let cmdId = 0;
async function send(url, { method = 'GET', headers = {}, body } = {}) {
  let r;
  try { r = await pb44.fetch(url, { method, headers: { Accept: 'application/json', ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: 'error', signal: AbortSignal.timeout(8000) }); }
  catch (e) { throw Object.assign(new Error(`fikk ikke kontakt (${errText(e)})`), { status: 502 }); }
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error(`nøkkelen ble avvist (${r.status})`), { status: 502, upstream: r.status });
  if (!r.ok) throw Object.assign(new Error(`svarte ${r.status}`), { status: 502, upstream: r.status });
  return r;
}
async function plexCmd(s, path, extra = '') {
  const c = pb44.plexConf();
  return send(`${c.url}/player/playback/${path}?type=${s.ctl.type}&commandID=${++cmdId}${extra}&X-Plex-Token=${encodeURIComponent(c.token)}`, { headers: { ...pb44.PLEX_HDR(), 'X-Plex-Target-Client-Identifier': s.ctl.machine } });
}
async function plexTerminate(s) {
  const c = pb44.plexConf();
  if (!s.ctl.sessionId) throw Object.assign(new Error('Plex oppga ingen sesjon å stoppe'), { status: 409 });
  return send(`${c.url}/status/sessions/terminate?sessionId=${encodeURIComponent(s.ctl.sessionId)}&reason=${encodeURIComponent('Stoppet fra Nordlys')}&X-Plex-Token=${encodeURIComponent(c.token)}`, { headers: pb44.PLEX_HDR() });
}
async function jfCmd(s, path, body) {
  const c = pb44.jfConf();
  return send(`${c.url}/Sessions/${encodeURIComponent(s.ctl.sessionId)}/${path}`, { method: 'POST', headers: { 'X-Emby-Token': c.key }, body });
}
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
/** Ny posisjon/volum fra body. → {position?, volume?} eller {error} */
function argsFor(action, s, b) {
  if (action === 'seek') {
    const pos = Number.isFinite(+b.position) && b.position !== null && b.position !== '' ? +b.position : Number.isFinite(+b.offset) && b.offset !== null && b.offset !== '' ? (s.position ?? 0) + +b.offset : null;
    if (pos == null) return { error: 'Oppgi position (ms) eller offset (± ms)' };
    return { position: Math.round(clamp(pos, 0, Math.max(0, (s.duration || pos) - 1000))) };
  }
  if (action === 'volume') {
    const cur = s.ctl?.volume ?? 50;
    const v = Number.isFinite(+b.volume) && b.volume !== null && b.volume !== '' ? +b.volume : Number.isFinite(+b.delta) && b.delta !== null && b.delta !== '' ? cur + +b.delta : null;
    if (v == null) return { error: 'Oppgi volume (0–100) eller delta' };
    return { volume: Math.round(clamp(v, 0, 100)) };
  }
  return {};
}
async function run(s, action, a) {
  const k = s.ctl?.kind;
  const playing = s.state === 'playing' || s.state === 'buffering';
  const act = action === 'toggle' ? (playing ? 'pause' : 'play') : action;
  if (k === 'demo') {
    const st = demoState.get(s.id) ?? {};
    if (act === 'pause') st.state = 'paused'; else if (act === 'play') st.state = 'playing'; else if (act === 'stop') st.stopped = true;
    else if (act === 'seek') st.position = a.position; else if (act === 'volume') st.volume = a.volume; else if (act === 'next' || act === 'previous') st.position = 0;
    demoState.set(s.id, st);
    return act;
  }
  if (k === 'plex') {
    if (act === 'stop') {
      if (s.ctl.remote) { try { await plexCmd(s, 'stop'); return act; } catch { /* reserve: avslutt strømmen fra serveren */ } }
      await plexTerminate(s); return act;
    }
    if (!s.ctl.remote) throw Object.assign(new Error('Denne Plex-avspilleren kan ikke fjernstyres'), { status: 409 });
    const map = { play: ['play'], pause: ['pause'], next: ['skipNext'], previous: ['skipPrevious'], seek: ['seekTo', `&offset=${a.position}`], volume: ['setParameters', `&volume=${a.volume}`] };
    try { await plexCmd(s, ...map[act]); }
    catch (e) { if (e.upstream === 400 || e.upstream === 404 || e.upstream === 406) throw Object.assign(new Error('Plex-avspilleren tok ikke imot kommandoen (den støtter kanskje ikke fjernkontroll – Stopp virker likevel)'), { status: 409 }); throw e; }
    return act;
  }
  if (k === 'jellyfin') {
    if (!s.ctl.remote) throw Object.assign(new Error('Denne Jellyfin-avspilleren kan ikke fjernstyres'), { status: 409 });
    if (act === 'volume') {
      if (!s.ctl.volumeOk) throw Object.assign(new Error('Avspilleren lar seg ikke volumstyre'), { status: 409 });
      await jfCmd(s, 'Command', { Name: 'SetVolume', Arguments: { Volume: String(a.volume) } }); return act;
    }
    const map = { play: 'Playing/Unpause', pause: 'Playing/Pause', stop: 'Playing/Stop', next: 'Playing/NextTrack', previous: 'Playing/PreviousTrack', seek: `Playing/Seek?SeekPositionTicks=${a.position * 10_000}` };
    await jfCmd(s, map[act]); return act;
  }
  throw Object.assign(new Error('Ukjent avspiller'), { status: 409 });
}
const NEED = { play: 'playpause', pause: 'playpause', toggle: 'playpause', stop: 'stop', next: 'next', previous: 'previous', seek: 'seek', volume: 'volume' };

/** Kjører en kommando for brukeren. → {ok, action, item, message} eller {error, status, code?} */
export async function control51(u, id, action, b = {}) {
  if (!ACTIONS51.includes(action)) return { error: `Ukjent handling. Bruk ${ACTIONS51.join(', ')}`, status: 400 };
  if (!/^[\w.:-]{1,120}$/.test(String(id ?? ''))) return { error: 'Ugyldig avspillings-id', status: 400 };
  const wait = rateCheck51(u);
  if (wait) return { error: `For mange kommandoer – vent ${wait} s`, status: 429, code: 'RATE_LIMIT', retryAfter: wait };
  const s = (await sessions(true)).find((x) => x.id === id);
  if (!s) return { error: 'Avspillingen er ikke aktiv lenger', status: 404, code: 'NOT_PLAYING' };
  if (!ownsSession51(u, s) && !isAdmin(u)) return { error: 'Du kan bare styre dine egne avspillinger', status: 403, code: 'NOT_YOURS' };
  if (!controlsOf(s).includes(NEED[action])) return { error: 'Denne avspilleren kan ikke styres slik herfra', status: 409, code: 'UNSUPPORTED' };
  const a = argsFor(action, s, b && typeof b === 'object' ? b : {});
  if (a.error) return { error: a.error, status: 400 };
  let act;
  try { act = await run(s, action, a); } catch (e) { return { error: e.status === 409 ? e.message : `${s.server === 'plex' ? 'Plex' : 'Jellyfin'} ${e.message}`, status: e.status === 409 ? 409 : 502, code: e.status === 409 ? 'UNSUPPORTED' : 'UPSTREAM' }; }
  cache = null;
  // Svaret viser forventet tilstand med en gang (Plex/Jellyfin oppdaterer sesjonslisten etter et par sekunder).
  const next = act === 'stop' ? null : { ...s, state: act === 'pause' ? 'paused' : act === 'play' ? 'playing' : s.state, position: act === 'seek' ? a.position : act === 'next' || act === 'previous' ? 0 : s.position,
    ctl: { ...s.ctl, volume: act === 'volume' ? a.volume : s.ctl?.volume ?? null } };
  if (next) next.progress = next.duration ? Math.round((next.position / next.duration) * 100) : 0;
  const msg = act === 'seek' ? `Hoppet til ${clock(a.position)}` : act === 'volume' ? `Volum ${a.volume} %` : `${LABEL[act]}: ${s.title}`;
  console.info(`[medctl51] ${act} ${s.server} av ${userInfo(u)?.username ?? u}${ownsSession51(u, s) ? '' : ' (admin)'}`);
  return { ok: true, action: act, item: next ? ctlOut(next, u) : null, message: msg };
}

export async function now51(u) {
  const list = await sessions();
  let audio = { items: [] }, absErr = null;
  try { audio = await absNow(u); } catch (e) { absErr = errText(e); }
  const errors = { ...(list.errors ?? {}), ...(absErr ? { audiobookshelf: absErr } : {}) };
  const demo = pb44.demo();
  return { items: list.map((s) => ctlOut(s, u)), audio: audio.items, admin: isAdmin(u), configured: { plex: demo || pb44.plexOn(), jellyfin: demo || pb44.jfOn(), abs: absOn51() || (MOCK() && !absOn51()) },
    ...(demo ? { mock: true } : {}), ...(Object.keys(errors).length ? { errors } : {}) };
}

/* ---------------- Ruter ---------------- */

export const medctl51Api = new Hono();
medctl51Api.use('*', (c, next) => authOrToken0(c, next));
medctl51Api.use('*', async (c, next) => { if (!mediaAllowed43(c.get('user'))) return c.json({ error: 'Du har ikke tilgang til Media. Be en administrator om tilgang.', restricted: true }, 403); await next(); });
medctl51Api.get('/now', async (c) => { try { return c.json(await now51(c.get('user'))); } catch (e) { return c.json({ error: errText(e) }, 502); } });
medctl51Api.post('/sessions/:id/:action', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const r = await control51(c.get('user'), c.req.param('id'), c.req.param('action'), b);
  if (r.error) {
    if (r.retryAfter) c.header('Retry-After', String(r.retryAfter));
    return c.json({ error: r.error, ...(r.code ? { code: r.code } : {}), ...(r.retryAfter ? { retryAfter: r.retryAfter } : {}) }, r.status ?? 400);
  }
  return c.json(r);
});
const adminOnly = async (c, next) => { if (!isAdmin(c.get('user')) || c.get('actor')) return c.json({ error: 'Bare administratorer kan koble brukere til Plex/Jellyfin', restricted: true }, 403); await next(); };
medctl51Api.get('/links', adminOnly, (c) => c.json(links51()));
medctl51Api.put('/links/:userId', adminOnly, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const r = setLinks51(c.req.param('userId'), b && typeof b === 'object' ? b : {});
  return r.error ? c.json({ error: r.error, ...(r.code ? { code: r.code } : {}) }, r.status) : c.json(r);
});
export const mountMedctl51 = (app) => app.route('/api/medctl51', medctl51Api);
