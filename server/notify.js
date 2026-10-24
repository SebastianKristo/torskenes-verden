// Varsler og appnavn (prompt 17).
// - /api/me/notify: hovedbryter, stille timer, lyd, volum og grupper, per bruker. Klientene bruker valgene når de
//   viser varsler lokalt (web Notification, lokale varsler i appene). Egen lyd (MP3/WAV/M4A, < 1 MB) lagres per bruker.
// - /api/app: navnet på appen («Homelab», «Torskenes Verden» …) og valgt app-ikon. Lesing er offentlig (brukes på
//   innloggingssiden og i nettleserfanen), endring krever admin.
// De innebygde lydene ligger i public/sounds/<id>.wav (offentlige under /assets/sounds/).
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config.js';
import { db, kv, OWNER } from './db.js';
import { sessionUser, userInfo, isAdmin } from './auth.js';
import { bearerOk } from './finans/routes.js';
import { broadcast } from './realtime.js';
import { vapidPublicKey, sendPush, validEndpoint } from './webpush.js';

const SOUNDS_DIR = join(config.dataDir, 'sounds');
await mkdir(SOUNDS_DIR, { recursive: true });

export const BUILTIN_SOUNDS = [['draape', 'Dråpe'], ['klokke', 'Klokke'], ['pling', 'Pling'], ['papir', 'Papir'], ['dobbel', 'Dobbel'], ['dyp', 'Dyp']];
const SOUND_IDS = [...BUILTIN_SOUNDS.map(([id]) => id), 'egen', 'stille'];
const GROUPS = ['pakker', 'finans', 'familie', 'reise', 'haptikk', 'birthdays'];
// Visningsnavn i Innstillinger → Varsler. Prompt 24: «Bursdager» (påminnelse kl. 09:00, N dager før).
export const GROUP_LABELS = { pakker: 'Pakker', finans: 'Finans', familie: 'Familie', reise: 'Reise', haptikk: 'Haptikk', birthdays: 'Bursdager' };
// Prompt 39: myk standardlyd «draape» (Dråpe) med volum 50 (den gamle «klokke» var høy og skarp på Android).
const DEFAULT_NOTIFY = { on: true, quietOn: true, quietFrom: '22:00', quietTo: '07:00', sound: 'draape', volume: 50, groups: Object.fromEntries(GROUPS.map((g) => [g, true])), ai_bg_notify: true, n_ai_in: false };
// Prompt 39: Glimt-varselet (AI-svar i bakgrunnen) har Glimt-logoen og tittelen «Glimt».
export const GLIMT_ICON = '/assets/glimt-varsel.png', GLIMT_ICON_ROUND = '/assets/glimt-varsel-rund.png', GLIMT_BADGE = '/assets/glimt-badge.png';
const glimtIcons = (category) => (category === 'ai' ? { icon: GLIMT_ICON, badge: GLIMT_BADGE, largeIcon: GLIMT_ICON_ROUND, color: '#E0553D', channel: 'glimt_ai' } : {});
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function notifyOf(id) {
  const s = kv.get(id, 'notify', {}) ?? {};
  const custom = kv.get(id, 'notify_sound', null);
  return {
    on: typeof s.on === 'boolean' ? s.on : DEFAULT_NOTIFY.on,
    quietOn: typeof s.quietOn === 'boolean' ? s.quietOn : DEFAULT_NOTIFY.quietOn,
    quietFrom: TIME.test(s.quietFrom) ? s.quietFrom : DEFAULT_NOTIFY.quietFrom,
    quietTo: TIME.test(s.quietTo) ? s.quietTo : DEFAULT_NOTIFY.quietTo,
    sound: SOUND_IDS.includes(s.sound) && (s.sound !== 'egen' || custom) ? s.sound : DEFAULT_NOTIFY.sound,
    volume: Number.isInteger(s.volume) && s.volume >= 0 && s.volume <= 100 ? s.volume : DEFAULT_NOTIFY.volume,
    groups: Object.fromEntries(GROUPS.map((g) => [g, typeof s.groups?.[g] === 'boolean' ? s.groups[g] : true])),
    // Prompt 31: «AI-svar i bakgrunnen» (på). Følger hovedbryteren «Varsler».
    ai_bg_notify: typeof s.ai_bg_notify === 'boolean' ? s.ai_bg_notify : DEFAULT_NOTIFY.ai_bg_notify,
    // Prompt 45 (claude-code-glimt-kun-systemvarsel.md): «Vis svaret i appen også» er fjernet. Glimt-svar mens appen er lukket gir BARE
    // systemvarsel; ingen banner ved retur. Feltet står igjen som false for eldre klienter.
    n_ai_in: false,
    glimtIcon: { icon: GLIMT_ICON, round: GLIMT_ICON_ROUND, badge: GLIMT_BADGE, title: 'Glimt', channel: 'glimt_ai', color: '#E0553D' },
    groupList: GROUPS.map((id) => ({ id, label: GROUP_LABELS[id] })),
    customSound: custom ? { name: custom.name, type: custom.type, size: custom.size, url: `/api/me/notify/sound?v=${custom.v}` } : null,
    sounds: [...BUILTIN_SOUNDS.map(([id, name]) => ({ id, name, url: `/assets/sounds/${id}.wav` })), { id: 'egen', name: 'Egen lyd', url: custom ? `/api/me/notify/sound?v=${custom.v}` : null }, { id: 'stille', name: 'Stille', url: null }],
  };
}

/* ---------------- Appnavn og ikon ---------------- */

const APP_ICONS = ['hus', 'monogram', 'rom', 'hus-gammel']; // prompt 39: hus-gammel = «Huset med stativ» (det gamle standardikonet)
export function appMeta() {
  const a = kv.get(OWNER, 'app_meta', {}) ?? {};
  return { name: typeof a.name === 'string' && a.name.trim() ? a.name : 'Homelab', icon: APP_ICONS.includes(a.icon) ? a.icon : 'hus', icons: APP_ICONS,
    suggestions: ['Homelab', 'Torskenes Verden'] };
}

/* ---------------- API ---------------- */

const api = new Hono();
// Sesjon eller et hvilket som helst gyldig app-token (varselvalgene gjelder brukerens egen enhet og konto).
const anyAuth = async (c, next) => {
  let id = sessionUser(c);
  if (!id && bearerOk(c, 'finance:read')) id = c.get('user');
  if (!id || !userInfo(id)) return c.json({ error: 'Ikke innlogget' }, 401);
  c.set('user', id);
  await next();
};
const bad = (c, msg, status = 400) => c.json({ error: msg }, status);

api.get('/me/notify', anyAuth, (c) => c.json(notifyOf(c.get('user'))));
api.put('/me/notify', anyAuth, async (c) => {
  const id = c.get('user'), b = await c.req.json().catch(() => ({})), cur = kv.get(id, 'notify', {}) ?? {};
  const next = { ...cur };
  for (const k of ['on', 'quietOn', 'ai_bg_notify']) if (k in b) { if (typeof b[k] !== 'boolean') return bad(c, `${k} må være true/false`); next[k] = b[k]; }
  if ('n_ai_in' in b && typeof b.n_ai_in !== 'boolean') return bad(c, 'n_ai_in må være true/false'); // prompt 45: godtas, men ignoreres (utgått)
  for (const k of ['quietFrom', 'quietTo']) if (k in b) { if (!TIME.test(b[k])) return bad(c, `${k} må være TT:MM`); next[k] = b[k]; }
  if ('sound' in b) {
    if (!SOUND_IDS.includes(b.sound)) return bad(c, 'Ukjent lyd');
    if (b.sound === 'egen' && !kv.get(id, 'notify_sound', null)) return bad(c, 'Last opp en egen lyd først');
    next.sound = b.sound;
  }
  if ('volume' in b) { const v = Math.round(Number(b.volume)); if (!(v >= 0 && v <= 100)) return bad(c, 'Volum må være 0–100'); next.volume = v; }
  if (b.groups && typeof b.groups === 'object') next.groups = { ...(cur.groups ?? {}), ...Object.fromEntries(GROUPS.filter((g) => typeof b.groups[g] === 'boolean').map((g) => [g, b.groups[g]])) };
  kv.set(id, 'notify', next);
  return c.json(notifyOf(id));
});

// Egen varsellyd: sjekker filsignaturen (MP3/WAV/M4A), ikke bare filnavnet.
function soundKind(b) {
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WAVE') return ['audio/wav', 'wav'];
  if (b.subarray(0, 3).toString() === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return ['audio/mpeg', 'mp3'];
  if (b.subarray(4, 8).toString() === 'ftyp') return ['audio/mp4', 'm4a'];
  return null;
}
const soundFile = (id) => join(SOUNDS_DIR, `${String(id).replace(/[^\w-]/g, '')}.bin`);
api.post('/me/notify/sound', anyAuth, bodyLimit({ maxSize: 1_100_000, onError: (c) => bad(c, 'Lyden er for stor (maks 1 MB)', 413) }), async (c) => {
  const id = c.get('user');
  const f = (await c.req.parseBody().catch(() => ({}))).file;
  if (!(f instanceof File)) return bad(c, 'Mangler fil');
  const b = Buffer.from(await f.arrayBuffer());
  if (b.length > 1024 * 1024) return bad(c, 'Lyden er for stor (maks 1 MB)', 413);
  const kind = soundKind(b);
  if (!kind) return bad(c, 'Bare MP3, WAV eller M4A');
  await writeFile(soundFile(id), b);
  kv.set(id, 'notify_sound', { name: String(f.name || `lyd.${kind[1]}`).slice(0, 80), type: kind[0], size: b.length, v: Date.now() });
  kv.set(id, 'notify', { ...(kv.get(id, 'notify', {}) ?? {}), sound: 'egen' });
  return c.json(notifyOf(id));
});
api.get('/me/notify/sound', anyAuth, async (c) => {
  const meta = kv.get(c.get('user'), 'notify_sound', null);
  if (!meta) return bad(c, 'Ingen egen lyd', 404);
  try { return c.body(await readFile(soundFile(c.get('user'))), 200, { 'Content-Type': meta.type, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' }); }
  catch { return bad(c, 'Ingen egen lyd', 404); }
});
api.delete('/me/notify/sound', anyAuth, async (c) => {
  const id = c.get('user');
  await unlink(soundFile(id)).catch(() => {});
  kv.del(id, 'notify_sound');
  const n = kv.get(id, 'notify', {}) ?? {};
  if (n.sound === 'egen') kv.set(id, 'notify', { ...n, sound: DEFAULT_NOTIFY.sound });
  return c.json(notifyOf(id));
});

api.get('/app', (c) => c.json(appMeta()));
api.put('/app', anyAuth, async (c) => {
  if (!isAdmin(c.get('user'))) return bad(c, 'Bare administratorer kan endre navnet på appen', 403);
  const b = await c.req.json().catch(() => ({})), cur = kv.get(OWNER, 'app_meta', {}) ?? {};
  const next = { ...cur };
  if ('name' in b) {
    const n = String(b.name ?? '').trim().replace(/\s+/g, ' ');
    if (!n || n.length > 40 || /[<>]/.test(n)) return bad(c, 'Navnet må være 1–40 tegn');
    next.name = n;
  }
  if ('icon' in b) { if (!APP_ICONS.includes(b.icon)) return bad(c, 'Ukjent ikon'); next.icon = b.icon; }
  kv.set(OWNER, 'app_meta', next);
  return c.json(appMeta());
});

/* ---------------- Prompt 31: varsler når appen er lukket ---------------- */
// Én sentral notifyUser(user, {title, body, url, tag, category}) for alt som skal varsles (AI-svar, prøveperioder,
// oppdatering, rask time):
//   1. realtime «notify» over /api/ws (appen viser det i appen hvis den er åpen)
//   2. kø per bruker (notify_queue) som de native appene henter i bakgrunnen: GET /api/notify/pending?since=<id>
//   3. Web Push (PWA og web) til brukerens abonnementer – men ikke når en klient har sendt «synlig»-heartbeat
//      (POST /api/push/presence {visible:true}) de siste 30 s, og ikke i stille timer.
// Hovedbryteren «Varsler» av → bare realtime. Kategori 'ai' følger i tillegg «AI-svar i bakgrunnen» (ai_bg_notify).
//   GET    /api/push/vapid      → {publicKey}
//   POST   /api/push/subscribe  {endpoint, keys:{p256dh, auth}} (PushSubscription.toJSON()) → {ok, id}
//   DELETE /api/push/subscribe  {endpoint} → {ok, removed}
//   POST   /api/push/presence   {visible} → {ok, visible, holdSeconds:30}
//   GET    /api/notify/pending?since=<id> → {items:[{id, ts, title, body, url, tag, category, data}], cursor, serverTime}
db.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  ua TEXT,
  created INTEGER NOT NULL,
  last_ok INTEGER,
  fails INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS notify_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  url TEXT,
  tag TEXT,
  category TEXT,
  data TEXT
);
CREATE INDEX IF NOT EXISTS notify_queue_user ON notify_queue(user_id, id);`);

const PRESENCE_HOLD_MS = 30_000;
const presence = new Map(); // user → siste «synlig»-heartbeat (ms)
export const isForeground = (user, now = Date.now()) => now - (presence.get(user) ?? 0) < PRESENCE_HOLD_MS;
export function setPresence(user, visible, now = Date.now()) { if (visible) presence.set(user, now); else presence.delete(user); }

const GROUP_OF = { pakker: 'pakker', tracking: 'pakker', finans: 'finans', abonnement: 'finans', familie: 'familie', reise: 'reise', birthdays: 'birthdays' };
const hmMin = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
function inQuiet(n, now = Date.now()) {
  if (!n.quietOn) return false;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  const t = Number(p.hour) * 60 + Number(p.minute), a = hmMin(n.quietFrom), b = hmMin(n.quietTo);
  return a === b ? false : a < b ? t >= a && t < b : t >= a || t < b;
}
const clip = (v, n) => String(v ?? '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * Varsler én bruker. → {id (kø-id eller null), realtime (antall klienter), pushed (antall), skipped?: grunn}
 * opts.now er for tester og planlagte varsler; opts.realtime=false hopper over realtime «notify».
 */
export async function notifyUser(user, { title, body = '', url = null, tag = null, category = 'system', data = null } = {}, { now = Date.now(), realtime: sendRealtime = true } = {}) {
  if (!user || !title) return { id: null, realtime: 0, pushed: 0, skipped: 'mangler' };
  let n; try { n = notifyOf(user); } catch { n = { ...DEFAULT_NOTIFY }; }
  const cat = String(category ?? 'system').slice(0, 30);
  // Prompt 39: AI-svar → tittel «Glimt», Glimt-logo (ikon/badge) og inApp = «Vis svaret i appen også» (n_ai_in).
  const glimt = cat === 'ai' || data?.kind === 'receipt.reanalyzed';
  const item = { title: clip(cat === 'ai' ? 'Glimt' : title, 120), body: clip(body, 600), url: url ? String(url).slice(0, 500) : null, tag: tag ? String(tag).slice(0, 80) : null, category: cat,
    // Prompt 45: Glimt-svar er bare systemvarsel (inApp:false, systemOnly:true) – klientene viser aldri «Glimt svarte mens du var borte».
    data: data || glimt ? { ...(data ?? {}), ...(glimt ? { ...glimtIcons('ai'), inApp: false, systemOnly: true } : {}) } : null, ...(glimt ? { icon: GLIMT_ICON, badge: GLIMT_BADGE } : {}) };
  const group = GROUP_OF[item.category];
  const off = !n.on ? 'varsler av' : item.category === 'ai' && n.ai_bg_notify === false ? 'AI-svar i bakgrunnen av' : group && n.groups?.[group] === false ? `${group} av` : null;
  let id = null;
  if (!off) {
    id = Number(db.prepare('INSERT INTO notify_queue(user_id, ts, title, body, url, tag, category, data) VALUES(?,?,?,?,?,?,?,?)')
      .run(user, now, item.title, item.body, item.url, item.tag, item.category, item.data ? JSON.stringify(item.data) : null).lastInsertRowid);
    // Rydd: 7 dager / 200 per bruker.
    db.prepare('DELETE FROM notify_queue WHERE user_id=? AND (ts < ? OR id NOT IN (SELECT id FROM notify_queue WHERE user_id=? ORDER BY id DESC LIMIT 200))').run(user, now - 7 * 86400_000, user);
  }
  // realtime:false når modulen allerede har sendt sin egen hendelse (assist, calendar-quick), så appen ikke viser det to ganger.
  const realtime = sendRealtime ? broadcast('notify', { id, ...item, silent: !!off }, [user]) : 0;
  if (off) return { id, realtime, pushed: 0, skipped: off };
  if (isForeground(user, now)) return { id, realtime, pushed: 0, skipped: 'i forgrunnen' };
  // Prompt 50 (SRVFAM50): «Hent meg» (data.priority 'high') går gjennom stille timer og sendes med høy prioritet.
  const high = item.data?.priority === 'high';
  if (inQuiet(n, now) && !high) return { id, realtime, pushed: 0, skipped: 'stille timer' };
  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id=?').all(user);
  let pushed = 0;
  for (const s of subs) {
    const r = await sendPush(s, { id, ...item }, { urgency: high || item.category === 'ai' || item.category === 'abonnement' ? 'high' : 'normal', topic: item.tag });
    if (r.ok) { pushed++; db.prepare('UPDATE push_subscriptions SET last_ok=?, fails=0 WHERE id=?').run(now, s.id); }
    else if (r.gone || s.fails >= 9) db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(s.id);
    else db.prepare('UPDATE push_subscriptions SET fails=fails+1 WHERE id=?').run(s.id);
  }
  return { id, realtime, pushed, ...(subs.length ? {} : { skipped: 'ingen abonnement' }) };
}

const pendingOut = (r) => { const data = r.data ? JSON.parse(r.data) : null; return { id: r.id, ts: r.ts, title: r.title, body: r.body, url: r.url, tag: r.tag, category: r.category, data, ...(r.category === 'ai' || data?.icon ? { icon: data?.icon ?? GLIMT_ICON, badge: data?.badge ?? GLIMT_BADGE } : {}) }; };
export const pendingFor = (user, since = 0, limit = 50) => db.prepare('SELECT * FROM notify_queue WHERE user_id=? AND id>? ORDER BY id LIMIT ?').all(user, since, limit).map(pendingOut);

const B64U = /^[A-Za-z0-9_-]+=*$/;
api.get('/push/vapid', anyAuth, (c) => c.json({ publicKey: vapidPublicKey() }));
api.post('/push/subscribe', anyAuth, async (c) => {
  const b = await c.req.json().catch(() => null);
  const endpoint = String(b?.endpoint ?? ''), p256dh = String(b?.keys?.p256dh ?? b?.p256dh ?? ''), auth = String(b?.keys?.auth ?? b?.auth ?? '');
  if (!validEndpoint(endpoint)) return bad(c, 'Ukjent push-tjeneste (bare https-endepunkt fra nettleserens push-tjeneste)');
  if (!B64U.test(p256dh) || Buffer.from(p256dh, 'base64url').length !== 65 || !B64U.test(auth) || Buffer.from(auth, 'base64url').length < 16) return bad(c, 'Ugyldige nøkler i abonnementet');
  const u = c.get('user');
  // Samme endepunkt fra en annen bruker på samme nettleser: flyttes til den som er innlogget nå.
  db.prepare('INSERT INTO push_subscriptions(user_id, endpoint, p256dh, auth, ua, created) VALUES(?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth, ua=excluded.ua, fails=0')
    .run(u, endpoint, p256dh, auth, String(c.req.header('user-agent') ?? '').slice(0, 200), Date.now());
  const n = db.prepare('SELECT count(*) FROM push_subscriptions WHERE user_id=?').pluck().get(u);
  if (n > 20) db.prepare('DELETE FROM push_subscriptions WHERE user_id=? AND id NOT IN (SELECT id FROM push_subscriptions WHERE user_id=? ORDER BY created DESC LIMIT 20)').run(u, u);
  return c.json({ ok: true, id: db.prepare('SELECT id FROM push_subscriptions WHERE endpoint=?').pluck().get(endpoint) });
});
api.delete('/push/subscribe', anyAuth, async (c) => {
  const b = await c.req.json().catch(() => null);
  const removed = db.prepare('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?').run(String(b?.endpoint ?? ''), c.get('user')).changes;
  return c.json({ ok: true, removed });
});
api.post('/push/presence', anyAuth, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const visible = b?.visible !== false;
  setPresence(c.get('user'), visible);
  return c.json({ ok: true, visible, holdSeconds: PRESENCE_HOLD_MS / 1000 });
});
api.get('/notify/pending', anyAuth, (c) => {
  const since = Math.max(0, parseInt(c.req.query('since') ?? '0', 10) || 0);
  const items = pendingFor(c.get('user'), since);
  const last = db.prepare('SELECT max(id) FROM notify_queue WHERE user_id=?').pluck().get(c.get('user')) ?? 0;
  return c.json({ items, cursor: items.length ? items[items.length - 1].id : Math.min(since, last), serverTime: new Date().toISOString() });
});

export default api;
