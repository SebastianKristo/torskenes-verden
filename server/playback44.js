// Prompt 44 (SERVER44): Avspilling – Plex og Jellyfin (Tautulli-lignende), «Logg inn med Plex» (PIN-flyt).
// claude-code-avspilling-plex-jellyfin.md, Avspilling.dc.html. Tokenet er en serverhemmelighet (kryptert, aldri til klienten).
// Plex/Jellyfin-oppsettet er det samme som Media bruker (mediaSource43: eierens, ellers første admin med nøkkel).
//
//   POST /api/playback/plex/pin (admin) → {id, code, authUrl, clientId, expiresAt}
//   GET  /api/playback/plex/pin/:id (admin) → {id, code, status:'waiting'|'ok'|'expired', server?:{name, url}, servers?:[{id,name,url,local}], message}
//   PUT  /api/playback/plex/server {id} (admin) → {ok, server}   · DELETE /api/playback/plex (admin) → {ok}  («Logg ut av Plex»)
//   GET  /api/playback/sessions?server=all|plex|jellyfin → {items:[Strøm], kpi:{streams, streamsText, bandwidth, bandwidthText, weekPlays, users}, servers:{plex, jellyfin}}
//        Strøm: {id, server, title, subtitle, kind, poster, user, userInitial, device, platform, state:'playing'|'paused'|'buffering',
//                decision:'direct'|'transcode', decisionText, chips:[…], progress, buffer, position, duration, remainingText}
//   GET  /api/playback/history?q=&user=&server=&page=1 → {items:[{id, server, when, whenText, title, subtitle, poster, user, device, platform, duration, durationText, percent, watched}], users:[{name, count}], page, pages, total}
//   GET  /api/playback/stats?range=7d|30d|12m → {range, perDay:[{date, count}], topShows:[{title, plays}], topUsers:[{name, hours, hoursText}], platforms:[{name, pct}], total}
//   GET  /api/playback/libraries → {items:[{server, key, title, type, count, countText, size, sizeText, lastAdded}]}
//   Jobb: hvert minutt leses sesjonene og lagres i tabellen plays44 (historikken forsvinner ikke når Plex/Jellyfin glemmer den).
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { db, kv, OWNER } from './db.js';
import { isAdmin } from './auth.js';
import { authOrToken } from './mobile.js';
import { userCfg, setUserCfg } from './settings.js';
import { mediaAllowed43, mediaSource43 } from './media43.js';

const MOCK = () => process.env.MOCK_DATA === '1';
db.exec(`CREATE TABLE IF NOT EXISTS plays44 (id INTEGER PRIMARY KEY AUTOINCREMENT, server TEXT NOT NULL, skey TEXT NOT NULL, user TEXT NOT NULL DEFAULT '', item TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '', subtitle TEXT, kind TEXT, started INTEGER NOT NULL, stopped INTEGER, seen INTEGER NOT NULL, duration INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0,
  percent INTEGER NOT NULL DEFAULT 0, device TEXT, platform TEXT, transcode INTEGER NOT NULL DEFAULT 0, poster TEXT, UNIQUE(server, skey));
CREATE INDEX IF NOT EXISTS plays44_started ON plays44(started);`);
const q = (sql) => db.prepare(sql);

/* ---------------- Oppsett ---------------- */

const plexConf = () => { const s = mediaSource43('plex').user; return { url: String(userCfg(s, 'plex_url') ?? '').replace(/\/+$/, ''), token: String(userCfg(s, 'plex_token') ?? '').trim(), src: s }; };
const jfConf = () => { const s = mediaSource43('jellyfin').user; return { url: String(userCfg(s, 'jf_url') ?? '').replace(/\/+$/, ''), key: String(userCfg(s, 'jf_key') ?? '').trim() }; };
const plexOn = () => { const c = plexConf(); return !!(c.url && c.token); };
const jfOn = () => { const c = jfConf(); return !!(c.url && c.key); };
const demo = () => MOCK() && !fx;
const clientId = () => { let id = kv.get(OWNER, 'plex44_client', null); if (!id) { id = randomUUID(); kv.set(OWNER, 'plex44_client', id); } return id; };
const PLEX_HDR = () => ({ Accept: 'application/json', 'X-Plex-Client-Identifier': clientId(), 'X-Plex-Product': 'Homelab', 'X-Plex-Version': '4.4', 'X-Plex-Platform': 'Web', 'X-Plex-Device-Name': 'Nordlys OS' });
let fx = null;
/** Bare for tester: bytt ut fetch (plex.tv, Plex og Jellyfin). */
export const _setPlaybackFetch44 = (fn) => { fx = fn; };
async function getJson(url, headers = {}, ms = 10_000, method = 'GET') {
  const r = await (fx ?? fetch)(url, { method, headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(ms) });
  if (r.status === 401) throw Object.assign(new Error('Tokenet ble avvist (401)'), { status: 502 });
  if (!r.ok) throw Object.assign(new Error(`svarte ${r.status}`), { status: 502 });
  const t = await r.text();
  try { return t ? JSON.parse(t) : null; } catch { return null; }
}
const plexGet = (path) => { const c = plexConf(); return getJson(`${c.url}${path}${path.includes('?') ? '&' : '?'}X-Plex-Token=${encodeURIComponent(c.token)}`, PLEX_HDR()); };
const jfGet = (path) => { const c = jfConf(); return getJson(`${c.url}${path}`, { 'X-Emby-Token': c.key }); };

/* ---------------- PIN-flyt ---------------- */

const pins = new Map();
async function startPin() {
  const cid = clientId();
  let id, code;
  if (demo()) { id = Math.floor(Math.random() * 1e9); code = 'K7QX'; }
  else { const j = await getJson('https://plex.tv/api/v2/pins?strong=true', PLEX_HDR(), 10_000, 'POST'); id = j?.id; code = j?.code; }
  if (!id || !code) throw Object.assign(new Error('Plex svarte ikke med en PIN'), { status: 502 });
  const p = { id: String(id), code, at: Date.now(), exp: Date.now() + 5 * 60_000, polls: 0 };
  pins.set(p.id, p);
  const authUrl = `https://app.plex.tv/auth#?clientID=${encodeURIComponent(cid)}&code=${encodeURIComponent(code)}&context%5Bdevice%5D%5Bproduct%5D=Homelab`;
  return { id: p.id, code: demo() ? code : code.slice(0, 4).toUpperCase(), fullCode: code, authUrl, clientId: cid, expiresAt: new Date(p.exp).toISOString(), pollMs: 2000 };
}
const bestConn = (r) => { const cs = (r.connections ?? []).slice().sort((a, b) => (b.local - a.local) || (a.relay - b.relay)); return cs[0]?.uri ?? null; };
async function pollPin(id) {
  const p = pins.get(String(id));
  if (!p) throw Object.assign(new Error('Ukjent eller utløpt PIN'), { status: 404 });
  if (Date.now() > p.exp) { pins.delete(p.id); return { id: p.id, code: p.code, status: 'expired', message: 'Koden er utløpt. Prøv igjen.' }; }
  p.polls++;
  let token = null;
  if (demo()) token = p.polls >= 2 ? 'demo-plex-token' : null;
  else token = (await getJson(`https://plex.tv/api/v2/pins/${encodeURIComponent(p.id)}`, PLEX_HDR()))?.authToken ?? null;
  if (!token) return { id: p.id, code: p.code, status: 'waiting', message: `Venter på godkjenning … kode ${p.code}` };
  let servers = [];
  if (demo()) servers = [{ id: 'demo', name: 'Hjemme-Plex', url: 'http://192.168.1.20:32400', local: true, accessToken: 'demo-plex-token' }];
  else {
    const list = await getJson('https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1', { ...PLEX_HDR(), 'X-Plex-Token': token });
    servers = (Array.isArray(list) ? list : []).filter((r) => String(r.provides ?? '').includes('server')).map((r) => ({ id: r.clientIdentifier, name: r.name, url: bestConn(r), local: (r.connections ?? []).some((x) => x.local), accessToken: r.accessToken ?? token })).filter((x) => x.url);
  }
  pins.delete(p.id);
  kv.set(OWNER, 'plex44_servers', servers.map(({ accessToken, ...x }) => x)); // tokenene lagres ikke her
  const pick = servers[0];
  if (pick) saveServer(pick);
  plex44Secrets.set('servers', servers);
  return { id: p.id, code: p.code, status: 'ok', server: pick ? { id: pick.id, name: pick.name, url: pick.url } : null, servers: servers.map(({ accessToken, ...x }) => x), message: pick ? `Koblet til ${pick.name}` : 'Logget inn, men fant ingen Plex-server på kontoen' };
}
const plex44Secrets = new Map();
function saveServer(s) {
  if (!demo()) setUserCfg(OWNER, { plex_url: s.url, plex_token: s.accessToken });
  kv.set(OWNER, 'plex44_server', { id: s.id, name: s.name, url: s.url, at: Date.now() });
}

/* ---------------- Demo ---------------- */

const DEMO_SESS = [
  { server: 'plex', title: 'Slow Horses', subtitle: 'S06E03 · Dead Drop', kind: 'episode', user: 'Petter', device: 'Chromecast', platform: 'Chromecast', state: 'playing', decision: 'transcode', chips: ['1080p → 720p', 'EAC3 5.1', 'Undertekster brennes inn', 'CPU 38 %'], bitrate: 8_000, progress: 42, buffer: 55, duration: 52 * 60_000 },
  { server: 'plex', title: 'Wicked', subtitle: 'Film · 2024', kind: 'movie', user: 'Sebastian', device: 'Apple TV', platform: 'tvOS', state: 'playing', decision: 'direct', chips: ['4K', 'HDR10', 'EAC3 5.1', '24 Mbit/s'], bitrate: 24_000, progress: 18, buffer: 24, duration: 160 * 60_000 },
  { server: 'jellyfin', title: 'The Bear', subtitle: 'S04E02 · Bolognese', kind: 'episode', user: 'Ingrid', device: 'iPhone', platform: 'iOS', state: 'paused', decision: 'direct', chips: ['1080p', 'AAC 2.0', '6 Mbit/s'], bitrate: 6_000, progress: 71, buffer: 80, duration: 34 * 60_000 },
];
function seedDemo() {
  if (q('SELECT 1 FROM plays44 LIMIT 1').get()) return;
  const T = [['Slow Horses', 'episode', 'S06E0'], ['The Bear', 'episode', 'S04E0'], ['Shrinking', 'episode', 'S03E0'], ['Wicked', 'movie', ''], ['Flow', 'movie', ''], ['Severance', 'episode', 'S02E0']];
  const U = [['Sebastian', 'Apple TV', 'tvOS'], ['Petter', 'Chromecast', 'Chromecast'], ['Ingrid', 'iPhone', 'iOS']];
  const ins = q('INSERT OR IGNORE INTO plays44(server, skey, user, item, title, subtitle, kind, started, stopped, seen, duration, position, percent, device, platform, transcode) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const now = Date.now();
  for (let i = 0; i < 60; i++) {
    const [t, k, ep] = T[i % T.length], [u, d, p] = U[(i * 7) % U.length];
    const started = now - (i * 11 + 2) * 3600_000, dur = k === 'movie' ? 130 * 60_000 : 45 * 60_000, pct = [100, 96, 64, 100, 32, 91][i % 6];
    ins.run(i % 4 === 0 ? 'jellyfin' : 'plex', `demo-${i}`, u, `${t}-${i}`, t, k === 'episode' ? `${ep}${(i % 8) + 1}` : 'Film', k, started, started + dur * pct / 100, started + dur * pct / 100, dur, dur * pct / 100, pct, d, p, i % 5 === 1 ? 1 : 0);
  }
}

/* ---------------- Sesjoner ---------------- */

const minText = (ms) => { const m = Math.max(0, Math.round(ms / 60_000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} t ${m % 60} min`; };
const initial = (n) => String(n ?? '?').trim().charAt(0).toUpperCase() || '?';
function plexSession(x) {
  const ts = x.TranscodeSession, media = x.Media?.[0] ?? {}, part = media.Part?.[0] ?? {};
  const decision = ts && (ts.videoDecision === 'transcode' || ts.audioDecision === 'transcode') ? 'transcode' : 'direct';
  const res = media.videoResolution ? (/4k/i.test(media.videoResolution) ? '4K' : `${media.videoResolution}p`.replace('pp', 'p')) : null;
  const chips = [res && ts?.videoDecision === 'transcode' && ts.height ? `${res} → ${ts.height}p` : res, media.videoProfile && /hdr|dovi/i.test(String(part.Stream?.find?.((s) => s.streamType === 1)?.displayTitle ?? '')) ? 'HDR' : null,
    media.audioCodec ? `${String(media.audioCodec).toUpperCase()}${media.audioChannels ? ` ${media.audioChannels === 6 ? '5.1' : media.audioChannels === 8 ? '7.1' : '2.0'}` : ''}` : null,
    media.bitrate ? `${Math.round(media.bitrate / 1000)} Mbit/s` : null, ts?.transcodeHwRequested ? 'Maskinvare' : null].filter(Boolean);
  const dur = +x.duration || 0, pos = +x.viewOffset || 0;
  return { id: `plex-${x.sessionKey ?? x.Session?.id}`, skey: String(x.Session?.id ?? x.sessionKey ?? x.ratingKey), server: 'plex', title: x.type === 'episode' ? x.grandparentTitle : x.title,
    subtitle: x.type === 'episode' ? `S${String(x.parentIndex ?? 0).padStart(2, '0')}E${String(x.index ?? 0).padStart(2, '0')} · ${x.title}` : `Film · ${x.year ?? ''}`.trim(), kind: x.type === 'episode' ? 'episode' : 'movie',
    poster: x.thumb ? `/api/media/poster?src=plex&id=${encodeURIComponent(x.grandparentThumb ?? x.thumb)}` : null, user: x.User?.title ?? '', device: x.Player?.title ?? x.Player?.device ?? '', platform: x.Player?.platform ?? '',
    state: x.Player?.state === 'paused' ? 'paused' : x.Player?.state === 'buffering' ? 'buffering' : 'playing', decision, chips, bitrate: +(x.Session?.bandwidth ?? media.bitrate ?? 0), duration: dur, position: pos,
    progress: dur ? Math.round((pos / dur) * 100) : 0, buffer: ts?.progress ? Math.round(+ts.progress) : null, item: String(x.ratingKey ?? '') };
}
function jfSession(x) {
  const it = x.NowPlayingItem; if (!it) return null;
  const tr = x.TranscodingInfo, dur = Math.round((it.RunTimeTicks ?? 0) / 10_000), pos = Math.round((x.PlayState?.PositionTicks ?? 0) / 10_000);
  const decision = tr && tr.IsVideoDirect === false ? 'transcode' : 'direct';
  const chips = [it.Height ? (it.Height >= 2000 ? '4K' : `${it.Height}p`) : null, tr?.Height && decision === 'transcode' ? `→ ${tr.Height}p` : null, tr?.AudioCodec ? String(tr.AudioCodec).toUpperCase() : null, tr?.Bitrate ? `${Math.round(tr.Bitrate / 1e6)} Mbit/s` : null].filter(Boolean);
  return { id: `jf-${x.Id}`, skey: String(x.Id), server: 'jellyfin', title: it.SeriesName ?? it.Name, subtitle: it.SeriesName ? `S${String(it.ParentIndexNumber ?? 0).padStart(2, '0')}E${String(it.IndexNumber ?? 0).padStart(2, '0')} · ${it.Name}` : `Film · ${it.ProductionYear ?? ''}`.trim(),
    kind: it.SeriesName ? 'episode' : 'movie', poster: null, user: x.UserName ?? '', device: x.DeviceName ?? '', platform: x.Client ?? '', state: x.PlayState?.IsPaused ? 'paused' : 'playing', decision, chips,
    bitrate: Math.round((tr?.Bitrate ?? 0) / 1000), duration: dur, position: pos, progress: dur ? Math.round((pos / dur) * 100) : 0, buffer: null, item: String(it.Id ?? '') };
}
async function rawSessions(which = 'all') {
  if (demo()) return DEMO_SESS.filter((x) => which === 'all' || x.server === which).map((x, i) => ({ ...x, id: `demo-${i}`, skey: `demo-live-${i}`, position: x.duration * x.progress / 100, item: x.title, poster: null }));
  const out = [], errors = {};
  if ((which === 'all' || which === 'plex') && plexOn()) { try { const j = await plexGet('/status/sessions'); out.push(...(j?.MediaContainer?.Metadata ?? []).map(plexSession)); } catch (e) { errors.plex = e.message; } }
  if ((which === 'all' || which === 'jellyfin') && jfOn()) { try { const j = await jfGet('/Sessions?ActiveWithinSeconds=120'); out.push(...(Array.isArray(j) ? j : []).map(jfSession).filter(Boolean)); } catch (e) { errors.jellyfin = e.message; } }
  out.errors = errors;
  return out;
}
const kbps = (n) => (n >= 1000 ? `${String(Math.round(n / 100) / 10).replace('.', ',')} Mbit/s` : `${n} kbit/s`);
async function sessionsOut(which) {
  const list = await rawSessions(which);
  const items = list.map((x) => ({ ...x, userInitial: initial(x.user), decisionText: x.decision === 'transcode' ? 'Omkoder' : 'Direkte avspilling', decisionColor: x.decision === 'transcode' ? '#b23a2a' : '#2f6b4a',
    remainingText: `${minText(x.duration - x.position)} igjen`, color: x.server === 'plex' ? '#e5a00d' : '#7b4fd6' }));
  const bw = items.reduce((a, x) => a + (x.bitrate || 0), 0);
  const week = q('SELECT COUNT(*) n FROM plays44 WHERE started>?').get(Date.now() - 7 * 86400_000).n;
  return { items, kpi: { streams: items.length, streamsText: `${items.length} ${items.length === 1 ? 'strøm' : 'strømmer'}`, bandwidth: bw, bandwidthText: kbps(bw), weekPlays: week, users: new Set(items.map((x) => x.user)).size },
    servers: serversOut(), ...(list.errors && Object.keys(list.errors).length ? { errors: list.errors } : {}) };
}
function serversOut() {
  const ps = kv.get(OWNER, 'plex44_server', null);
  return { plex: { connected: demo() || plexOn(), name: ps?.name ?? (demo() ? 'Hjemme-Plex' : null), mock: demo() || undefined }, jellyfin: { connected: demo() || jfOn(), mock: demo() || undefined } };
}

/* ---------------- Logging av avspillinger (hvert minutt) ---------------- */

export async function logPlays44(now = Date.now()) {
  if (demo()) { seedDemo(); return 0; }
  if (!plexOn() && !jfOn()) return 0;
  const list = await rawSessions('all');
  const up = q(`INSERT INTO plays44(server, skey, user, item, title, subtitle, kind, started, seen, duration, position, percent, device, platform, transcode, poster) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(server, skey) DO UPDATE SET seen=excluded.seen, position=excluded.position, percent=excluded.percent, transcode=MAX(plays44.transcode, excluded.transcode), stopped=NULL`);
  for (const x of list) up.run(x.server, `${x.skey}:${x.item}`, x.user, x.item, x.title, x.subtitle, x.kind, now, now, x.duration, Math.round(x.position), x.progress, x.device, x.platform, x.decision === 'transcode' ? 1 : 0, x.poster);
  // Sesjoner som ikke er der lenger, er ferdige.
  const active = new Set(list.map((x) => `${x.server}|${x.skey}:${x.item}`));
  for (const r of q('SELECT id, server, skey, seen FROM plays44 WHERE stopped IS NULL AND seen>?').all(now - 3 * 3600_000)) if (!active.has(`${r.server}|${r.skey}`)) q('UPDATE plays44 SET stopped=? WHERE id=?').run(r.seen, r.id);
  return list.length;
}
let timer = null;
export function startPlayback44() {
  if (timer || process.env.NODE_ENV === 'test') return;
  timer = setInterval(() => logPlays44().catch((e) => console.warn('[playback]', e.message)), 60_000);
  timer.unref?.();
  setTimeout(() => logPlays44().catch(() => {}), 15_000).unref?.();
}

/* ---------------- Historikk, statistikk og biblioteker ---------------- */

const WD = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
const whenText = (t, now = Date.now()) => { const d = new Date(t), hm = new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' }).format(d); const days = Math.floor((now - t) / 86400_000); return days < 1 ? `i dag ${hm}` : days < 2 ? `i går ${hm}` : days < 7 ? `${WD[d.getDay()]} ${hm}` : new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', day: 'numeric', month: 'short' }).format(d); };
export function history44({ q: qs = '', user = '', server = '', page = 1 } = {}) {
  if (demo()) seedDemo();
  const where = [], args = [];
  if (qs) { where.push('(title LIKE ? OR subtitle LIKE ? OR user LIKE ? OR device LIKE ?)'); const l = `%${String(qs).slice(0, 80)}%`; args.push(l, l, l, l); }
  if (user) { where.push('user=?'); args.push(String(user)); }
  if (server === 'plex' || server === 'jellyfin') { where.push('server=?'); args.push(server); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = q(`SELECT COUNT(*) n FROM plays44 ${w}`).get(...args).n, per = 25, pages = Math.max(1, Math.ceil(total / per)), p = Math.max(1, Math.min(pages, +page || 1));
  const items = q(`SELECT * FROM plays44 ${w} ORDER BY started DESC LIMIT ? OFFSET ?`).all(...args, per, (p - 1) * per).map((r) => {
    const watched = (r.stopped ?? r.seen) - r.started;
    return { id: r.id, server: r.server, when: new Date(r.started).toISOString(), whenText: whenText(r.started), title: r.title, subtitle: r.subtitle, kind: r.kind, poster: r.poster, user: r.user, userInitial: initial(r.user), device: r.device, platform: r.platform,
      duration: Math.max(0, watched), durationText: minText(watched), percent: r.percent, watched: r.percent >= 90, transcode: !!r.transcode, live: r.stopped == null && Date.now() - r.seen < 3 * 60_000 };
  });
  const users = q('SELECT user AS name, COUNT(*) count FROM plays44 GROUP BY user ORDER BY count DESC').all().filter((x) => x.name);
  return { items, users, page: p, pages, total };
}
export function stats44(range = '7d') {
  if (demo()) seedDemo();
  const days = range === '30d' ? 30 : range === '12m' ? 365 : 7, since = Date.now() - days * 86400_000;
  const rows = q('SELECT * FROM plays44 WHERE started>?').all(since);
  const perDay = new Map();
  for (let i = days - 1; i >= 0 && days <= 31; i--) perDay.set(new Date(Date.now() - i * 86400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' }), 0);
  for (const r of rows) { const d = new Date(r.started).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' }); const k = days > 31 ? d.slice(0, 7) : d; if (days <= 31 && !perDay.has(k)) continue; perDay.set(k, (perDay.get(k) ?? 0) + 1); }
  const by = (f) => { const m = new Map(); for (const r of rows) { const k = f(r); if (k) m.set(k, (m.get(k) ?? 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const hours = new Map(); for (const r of rows) hours.set(r.user, (hours.get(r.user) ?? 0) + ((r.stopped ?? r.seen) - r.started) / 3600_000);
  const plat = by((r) => r.platform), tot = rows.length || 1;
  return { range, perDay: [...perDay.entries()].sort().map(([date, count]) => ({ date, count })), topShows: by((r) => (r.kind === 'episode' ? r.title : null)).slice(0, 8).map(([title, plays]) => ({ title, plays })),
    topMovies: by((r) => (r.kind === 'movie' ? r.title : null)).slice(0, 8).map(([title, plays]) => ({ title, plays })),
    topUsers: [...hours.entries()].filter(([n]) => n).sort((a, b) => b[1] - a[1]).map(([name, h]) => ({ name, hours: Math.round(h * 10) / 10, hoursText: `${String(Math.round(h * 10) / 10).replace('.', ',')} t` })),
    platforms: plat.map(([name, n]) => ({ name, pct: Math.round((n / tot) * 100) })), total: rows.length };
}
const sizeText = (b) => (!b ? null : b >= 1024 ** 4 ? `${String(Math.round(b / 1024 ** 4 * 10) / 10).replace('.', ',')} TB` : `${Math.round(b / 1024 ** 3)} GB`);
export async function libraries44() {
  if (demo()) return { items: [['plex', '1', 'Filmer', 'movie', 412, 9.1 * 1024 ** 4], ['plex', '2', 'Serier', 'show', 40, 6.4 * 1024 ** 4], ['jellyfin', 'a', 'Barn', 'movie', 86, 0.9 * 1024 ** 4]].map(([server, key, title, type, count, size]) => ({ server, key, title, type, count, countText: `${count} ${type === 'show' ? 'serier' : 'filmer'}`, size, sizeText: sizeText(size), lastAdded: null })) };
  const items = [], errors = {};
  if (plexOn()) {
    try {
      const j = await plexGet('/library/sections');
      for (const d of j?.MediaContainer?.Directory ?? []) {
        let count = null; try { count = (await plexGet(`/library/sections/${d.key}/all?X-Plex-Container-Start=0&X-Plex-Container-Size=0`))?.MediaContainer?.totalSize ?? null; } catch { /* valgfritt */ }
        items.push({ server: 'plex', key: String(d.key), title: d.title, type: d.type, count, countText: count != null ? `${count} ${d.type === 'show' ? 'serier' : d.type === 'movie' ? 'filmer' : 'elementer'}` : null, size: null, sizeText: null, lastAdded: d.updatedAt ? new Date(d.updatedAt * 1000).toISOString() : null });
      }
    } catch (e) { errors.plex = e.message; }
  }
  if (jfOn()) {
    try { const j = await jfGet('/Library/VirtualFolders'); for (const d of Array.isArray(j) ? j : []) items.push({ server: 'jellyfin', key: d.ItemId, title: d.Name, type: d.CollectionType ?? 'mixed', count: null, countText: null, size: null, sizeText: null, lastAdded: null }); } catch (e) { errors.jellyfin = e.message; }
  }
  return { items, ...(Object.keys(errors).length ? { errors } : {}) };
}

/* ---------------- Ruter ---------------- */

const guard = async (c, next) => { if (!mediaAllowed43(c.get('user'))) return c.json({ error: 'Du har ikke tilgang til Avspilling. Be en administrator om tilgang.', restricted: true }, 403); await next(); };
const admin = async (c, next) => { if (!isAdmin(c.get('user')) || c.get('actor')) return c.json({ error: 'Bare administratorer kan koble til Plex', restricted: true }, 403); await next(); };
const G = [authOrToken, guard], A = [authOrToken, guard, admin];
const H = (fn) => async (c) => { try { return c.json(await fn(c)); } catch (e) { return c.json({ error: e.message }, e.status && e.status < 600 ? e.status : 502); } };
export const playback44Api = new Hono();
playback44Api.post('/plex/pin', ...A, H(() => startPin()));
playback44Api.get('/plex/pin/:id', ...A, H((c) => pollPin(c.req.param('id'))));
playback44Api.get('/plex/servers', ...A, (c) => c.json({ items: kv.get(OWNER, 'plex44_servers', []) ?? [], selected: kv.get(OWNER, 'plex44_server', null) }));
playback44Api.put('/plex/server', ...A, H(async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const s = (plex44Secrets.get('servers') ?? []).find((x) => x.id === b?.id);
  if (!s) throw Object.assign(new Error('Logg inn med Plex på nytt for å bytte server'), { status: 409 });
  saveServer(s);
  return { ok: true, server: { id: s.id, name: s.name, url: s.url } };
}));
playback44Api.delete('/plex', ...A, H(() => { if (!demo()) setUserCfg(OWNER, { plex_token: null }); kv.set(OWNER, 'plex44_server', null); return { ok: true, message: 'Logget ut av Plex' }; }));
playback44Api.get('/sessions', ...G, H((c) => sessionsOut(['plex', 'jellyfin'].includes(c.req.query('server')) ? c.req.query('server') : 'all')));
playback44Api.get('/history', ...G, H((c) => history44(c.req.query())));
playback44Api.get('/stats', ...G, H((c) => stats44(c.req.query('range'))));
playback44Api.get('/libraries', ...G, H(() => libraries44()));
playback44Api.get('/status', ...G, (c) => c.json(serversOut()));
