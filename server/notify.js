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
import { kv, OWNER } from './db.js';
import { sessionUser, userInfo, isAdmin } from './auth.js';
import { bearerOk } from './finans/routes.js';

const SOUNDS_DIR = join(config.dataDir, 'sounds');
await mkdir(SOUNDS_DIR, { recursive: true });

export const BUILTIN_SOUNDS = [['klokke', 'Klokke'], ['pling', 'Pling'], ['papir', 'Papir'], ['dobbel', 'Dobbel'], ['dyp', 'Dyp']];
const SOUND_IDS = [...BUILTIN_SOUNDS.map(([id]) => id), 'egen', 'stille'];
const GROUPS = ['pakker', 'finans', 'familie', 'reise', 'haptikk', 'birthdays'];
// Visningsnavn i Innstillinger → Varsler. Prompt 24: «Bursdager» (påminnelse kl. 09:00, N dager før).
export const GROUP_LABELS = { pakker: 'Pakker', finans: 'Finans', familie: 'Familie', reise: 'Reise', haptikk: 'Haptikk', birthdays: 'Bursdager' };
const DEFAULT_NOTIFY = { on: true, quietOn: true, quietFrom: '22:00', quietTo: '07:00', sound: 'klokke', volume: 70, groups: Object.fromEntries(GROUPS.map((g) => [g, true])) };
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
    groupList: GROUPS.map((id) => ({ id, label: GROUP_LABELS[id] })),
    customSound: custom ? { name: custom.name, type: custom.type, size: custom.size, url: `/api/me/notify/sound?v=${custom.v}` } : null,
    sounds: [...BUILTIN_SOUNDS.map(([id, name]) => ({ id, name, url: `/assets/sounds/${id}.wav` })), { id: 'egen', name: 'Egen lyd', url: custom ? `/api/me/notify/sound?v=${custom.v}` : null }, { id: 'stille', name: 'Stille', url: null }],
  };
}

/* ---------------- Appnavn og ikon ---------------- */

const APP_ICONS = ['hus', 'monogram', 'rom'];
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
  for (const k of ['on', 'quietOn']) if (k in b) { if (typeof b[k] !== 'boolean') return bad(c, `${k} må være true/false`); next[k] = b[k]; }
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

export default api;
