// Prompt 89 (SRV89): Live Activities (iOS) og Live Updates (Android) – felles API for appene (kontrakten i CONTRACT89, docs/live-activities.md).
// Alt er per bruker (authOrToken). Feil: {error:"norsk tekst"}.
//
//   GET    /api/live/aktiviteter      → {aktiviteter:[Akt], oppdatert:ISO}
//   POST   /api/live/handling {id, handling, platform?} → {ok, aktivitet?, url?, skjultTil?}
//   GET    /api/live/innstillinger    → {nedlasting, backup, spiller, avtale, pakke}   (bool, standard true; backup alltid false for ikke-admin)
//   PUT    /api/live/innstillinger    {…samme…} → samme
//   POST   /api/live/tokens {platform:"ios"|"android", kind:"pushtostart"|"liveactivity"|"fcm", token, aktivitetId?, type?} → {ok}
//   DELETE /api/live/tokens {token}   → {ok}
//
// Akt = {id, type, tittel, undertittel, verdi, progress (0–1|null), segmenter ({antall, ferdig}|null, bare pakke), meta, start (ISO|null),
//        slutt (ISO|null), status:"aktiv"|"pause"|"ferdig", handlinger:[{id, tittel}], url}
// Kildene er de eksisterende modulene (ingen nye eksterne kall): qBittorrent/Sonarr/Radarr-køen (media43), NRK-jobbene (nrkdl),
// backup (system-backup + restic i backup51, bare admin), Spilles nå (medctl51/playback44: egne økter, alle for admin),
// neste avtale (brukerens kalender, starter innen 60 min) og pakkesporing (ute for levering, eller levert siste 30 min).
//
// Push (iOS): server/apns.js. Jobben hvert 5. s (bare når APNs er satt opp og noen har registrert iOS-tokens) sender push-to-start
// for nye aktiviteter, oppdateringer ved endring (maks hvert 5. s for nedlasting/backup) og «end» med dismissal-date
// (+15 min, pakke +30 min etter levert, avtale ved starttid). Android: ingen Firebase – appen poller /api/live/aktiviteter.
import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { db, kv } from './db.js';
import { isAdmin } from './auth.js';
import { authOrToken } from './mobile.js';
import { runAsUser } from './settings.js';
import { mediaAllowed43, torrentsOut43, torrentAction43 } from './media43.js';
import { nrkConf, nrkKall } from './nrkdl.js';
import { now51, control51 } from './medctl51.js';
import { eventsFor } from './calendar.js';
import { trk42 } from './tracking.js';
import { jobOut, smbTarget } from './system-backup.js';
import { backupRunning51, getRun51, backupRuns51, LABEL as RESTIC_LABEL } from './backup51.js';
import { apnsConf89, sendLive89 } from './apns.js';

db.exec(`CREATE TABLE IF NOT EXISTS live89_tokens (user_id TEXT NOT NULL, platform TEXT NOT NULL, kind TEXT NOT NULL, token TEXT NOT NULL,
  aktivitet_id TEXT, type TEXT, updated INTEGER NOT NULL, PRIMARY KEY (user_id, token));
CREATE INDEX IF NOT EXISTS live89_tokens_tok ON live89_tokens(token);
CREATE TABLE IF NOT EXISTS live89_push (user_id TEXT NOT NULL, akt_id TEXT NOT NULL, type TEXT NOT NULL, hash TEXT NOT NULL, sent_at INTEGER NOT NULL,
  ended INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, akt_id));`);
const q = (s) => db.prepare(s);

export const TYPES89 = ['nedlasting', 'backup', 'spiller', 'avtale', 'pakke'];
export const ID_RE89 = /^[a-z0-9:_-]{1,80}$/;
export const HANDLINGER89 = ['pause', 'fortsett', 'stopp', 'rute', 'utsett'];
export const ACCENT89 = { nedlasting: '#5ac8fa', backup: '#30d158', spiller: '#ffb340', avtale: '#ff6a4d', pakke: '#bf8cff' };
export const ATTR_TYPE89 = 'Plat51Attributes';
const DONE_MS = 15 * 60_000, PKG_DONE_MS = 30 * 60_000, SOON_MS = 60 * 60_000, SNOOZE_MS = 5 * 60_000, THROTTLE_MS = 5000;
const URL = { nedlasting: 'homelab://media/ned', backup: 'homelab://innstillinger/backup', spiller: 'homelab://media/avspilling', avtale: 'homelab://kalender', pakke: 'homelab://sporing' };

const slug = (s, n = 60) => String(s ?? '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, n) || 'x';
const sha = (s) => createHash('sha1').update(String(s)).digest('hex');
const iso = (t) => (Number.isFinite(t) && t > 0 ? new Date(t).toISOString() : null);
const pct = (p) => `${Math.max(0, Math.min(100, Math.floor(p)))} %`;
const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, Math.round(x * 1000) / 1000)) : null);
const H = (id, tittel) => ({ id, tittel });
const hhmm = (t) => new Date(t).toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' });
const osloDay = (t) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
const join = (...xs) => xs.filter((x) => x != null && x !== '').join(' · ');
/** Én aktivitet i kontraktens form. Interne oppslag (ref) holdes utenfor svaret. */
function akt(type, o) {
  return { id: o.id, type, tittel: String(o.tittel ?? '').slice(0, 120), undertittel: String(o.undertittel ?? '').slice(0, 160), verdi: String(o.verdi ?? '').slice(0, 24),
    progress: o.progress == null ? null : clamp01(o.progress), segmenter: type === 'pakke' && o.segmenter ? o.segmenter : null, meta: String(o.meta ?? '').slice(0, 160),
    start: o.start ?? null, slutt: o.slutt ?? null, status: o.status ?? 'aktiv', handlinger: o.handlinger ?? [], url: o.url ?? URL[type] };
}

/* ---------------- Innstillinger (per bruker) ---------------- */

const PREFS = 'live89_prefs';
export function prefs89(u) {
  const v = kv.get(u, PREFS, {}) ?? {};
  const out = Object.fromEntries(TYPES89.map((t) => [t, v[t] !== false]));
  if (!isAdmin(u)) out.backup = false;
  return out;
}
function setPrefs89(u, b) {
  const cur = kv.get(u, PREFS, {}) ?? {};
  for (const t of TYPES89) if (typeof b?.[t] === 'boolean') cur[t] = b[t];
  kv.set(u, PREFS, cur);
  invalidate(u);
  return prefs89(u);
}

/* ---------------- Kildene ---------------- */

// NRK-jobber pauset herfra (avbryt i nrk-dl) vises som «pause» med Fortsett (igjen) i 6 t. Ferdige vises 15 min etter at vi så dem kjøre.
const nrkPaused = new Map(), nrkRan = new Map(), nrkDone = new Map(), qbPaused = new Map(); // qbPaused: torrenter pauset herfra beholder plassen sin
let nrkCache = null;
async function nrkJobs(now) {
  if (!nrkConf().on) return [];
  if (nrkCache && now - nrkCache.at < 3000 && nrkCache.at <= now) return nrkCache.list;
  let list = [];
  try { const d = await nrkKall('/api/jobber', { timeout: 5000 }); list = Array.isArray(d?.jobber) ? d.jobber.filter((j) => j && typeof j === 'object' && /^[a-f0-9]{12}$/.test(String(j.id ?? ''))) : []; } catch { list = nrkCache?.list ?? []; }
  nrkCache = { at: now, list };
  return list;
}
async function downloads(u, now) {
  if (!mediaAllowed43(u)) return [];
  const out = [];
  let tq = null;
  try { tq = await torrentsOut43(); } catch { tq = null; }
  if (tq?.items) {
    const queued = tq.items.filter((t) => t.status === 'queued').length;
    const pick = tq.items.filter((t) => ['dl', 'meta', 'stall', 'check'].includes(t.status) || (t.status === 'pause' && t.progress < 100)
      || (t.status === 'seed' && t.completedAt && now - Date.parse(t.completedAt) < DONE_MS && now >= Date.parse(t.completedAt)));
    for (const [h, t] of qbPaused) if (now - t > 6 * 3600_000) qbPaused.delete(h);
    const rank = (t) => (t.status === 'pause' && !qbPaused.has(String(t.hash).toLowerCase()) ? 1 : t.status === 'seed' ? 2 : 0);
    for (const t of pick.sort((a, b) => rank(a) - rank(b)).slice(0, 3)) {
      const status = t.status === 'seed' ? 'ferdig' : t.status === 'pause' ? 'pause' : 'aktiv';
      const kilde = t.seriesId ? 'Sonarr' : t.movieId ? 'Radarr' : 'qBittorrent';
      const eta = status === 'aktiv' && Number.isFinite(t.eta) && t.eta > 0 && t.eta < 8640000 ? now + t.eta * 1000 : null;
      out.push({ ref: { kind: 'qb', hash: String(t.hash).toLowerCase() }, a: akt('nedlasting', {
        id: `nedlasting:qb:${slug(t.hash, 64)}`, tittel: t.title, undertittel: join(t.code && t.code !== 'Film' ? t.code : null, kilde, queued ? `${queued} i kø` : null),
        verdi: status === 'ferdig' ? 'Ferdig' : pct(t.progress), progress: status === 'ferdig' ? 1 : t.progress / 100, meta: status === 'ferdig' ? 'Lastet ned' : t.statusText,
        start: t.addedAt ?? null, slutt: iso(eta), status, handlinger: status === 'aktiv' ? [H('pause', 'Pause')] : status === 'pause' ? [H('fortsett', 'Fortsett')] : [] }) });
    }
  }
  const jobs = await nrkJobs(now);
  const ko = jobs.filter((j) => j.status === 'ko').length;
  for (const [id, t] of nrkPaused) if (now - t > 6 * 3600_000) nrkPaused.delete(id);
  let n = 0;
  for (const j of jobs) {
    if (j.status === 'kjorer') nrkRan.set(j.id, now);
    if (j.status === 'ferdig' && nrkRan.has(j.id) && !nrkDone.has(j.id)) nrkDone.set(j.id, now);
    const done = j.status === 'ferdig' && nrkDone.has(j.id) && now - nrkDone.get(j.id) < DONE_MS;
    const paused = j.status === 'avbrutt' && nrkPaused.has(j.id);
    if (!(j.status === 'kjorer' || done || paused) || n >= 2) continue;
    n++;
    const p = Math.max(0, Math.min(100, Number(j.prosent) || 0));
    const status = done ? 'ferdig' : paused ? 'pause' : 'aktiv';
    const eta = status === 'aktiv' && Number.isFinite(+j.eta) && +j.eta > 0 ? now + +j.eta * 1000 : null;
    out.push({ ref: { kind: 'nrk', id: j.id }, a: akt('nedlasting', {
      id: `nedlasting:nrk:${j.id}`, tittel: j.tittel || 'NRK', undertittel: join(j.av ? `${j.nr ?? 1} av ${j.av}` : null, 'NRK', ko ? `${ko} i kø` : null),
      verdi: status === 'ferdig' ? 'Ferdig' : pct(p), progress: status === 'ferdig' ? 1 : p / 100, meta: status === 'pause' ? 'Pauset' : String(j.melding ?? '').slice(0, 160),
      start: iso((+j.opprettet || 0) * 1000), slutt: iso(eta), status, handlinger: status === 'aktiv' ? [H('pause', 'Pause')] : status === 'pause' ? [H('fortsett', 'Fortsett')] : [] }) });
  }
  return out;
}

const SCOPE = { all: 'Hele systemet', finans: 'Finans', custom: 'Utvalgte moduler' };
function backups(u, now) {
  if (!isAdmin(u)) return [];
  const out = [];
  let row = null;
  try { row = q("SELECT * FROM backup_jobs WHERE state='running' OR (state IN ('done','failed') AND finished>?) ORDER BY started DESC LIMIT 1").get(now - DONE_MS); } catch { row = null; }
  const j = row ? jobOut(row) : null;
  if (j) {
    const smb = (() => { try { return smbTarget(); } catch { return null; } })();
    const status = j.state === 'running' ? 'aktiv' : 'ferdig';
    const p = Math.max(0, Math.min(100, Number(j.pct) || 0));
    out.push({ ref: { kind: 'sys', id: j.id }, a: akt('backup', {
      id: `backup:sys:${slug(j.id)}`, tittel: smb?.enabled ? 'Backup til NAS' : 'Backup', undertittel: join(smb?.enabled ? smb.label : null, SCOPE[j.scope] ?? null, `${j.modules?.length ?? 0} moduler`),
      verdi: status === 'ferdig' ? (j.ok ? 'Ferdig' : 'Feilet') : pct(p), progress: status === 'ferdig' ? 1 : p / 100,
      meta: status === 'ferdig' ? (j.ok ? 'Backupen er tatt og kontrollert' : `Feilet: ${String(j.error ?? '').slice(0, 120)}`) : p >= 96 ? 'Kontrollerer …' : 'Pakker filene …',
      start: j.at, slutt: null, status, handlinger: [] }) });
  }
  const run = backupRunning51();
  let r = run?.kind === 'backup' ? getRun51(run.id) : null;
  if (!r) { const last = backupRuns51(1)[0]; if (last && last.state !== 'running' && last.finishedAt && now - last.finishedAt < DONE_MS) r = last; }
  if (r) {
    const total = r.targets.length || 1, ok = r.targets.filter((t) => t.state !== 'pending' && t.state !== 'running').length;
    const status = r.state === 'running' ? 'aktiv' : 'ferdig';
    out.push({ ref: { kind: 'restic', id: r.id }, a: akt('backup', {
      id: `backup:restic:${slug(r.id)}`, tittel: 'Backup (restic)', undertittel: r.targets.map((t) => RESTIC_LABEL[t.id] ?? t.id).join(' · '),
      verdi: status === 'ferdig' ? (r.state === 'ok' ? 'Ferdig' : 'Feilet') : `${ok}/${total}`, progress: status === 'ferdig' ? 1 : ok / total,
      meta: status === 'ferdig' ? (r.state === 'ok' ? 'Alle mål er oppdatert' : String(r.error ?? 'Noen mål feilet').slice(0, 120)) : `${RESTIC_LABEL[r.targets.find((t) => t.state === 'running')?.id] ?? 'Forbereder'} …`,
      start: iso(r.startedAt), slutt: null, status, handlinger: [] }) });
  }
  return out;
}

function spillerAkt(s, now) {
  const playing = s.state !== 'paused';
  const dur = Math.max(0, +s.duration || 0), pos = Math.max(0, Math.min(dur || Infinity, +s.position || 0));
  const start = playing && dur ? now - pos : null;
  const h = [];
  if (s.canControl && s.controls.includes('playpause')) h.push(playing ? H('pause', 'Pause') : H('fortsett', 'Spill av'));
  if (s.canControl && s.controls.includes('stop')) h.push(H('stopp', 'Stopp'));
  return akt('spiller', { id: `spiller:${slug(s.id)}`, tittel: s.title, undertittel: join(s.subtitle, s.user, s.device), verdi: s.positionText, progress: dur ? pos / dur : null,
    meta: s.remainingText, start: iso(start), slutt: start ? iso(start + dur) : null, status: playing ? 'aktiv' : 'pause', handlinger: h });
}
async function players(u, now) {
  if (!mediaAllowed43(u)) return [];
  let r;
  try { r = await now51(u); } catch { return []; }
  const admin = isAdmin(u);
  return (r?.items ?? []).filter((s) => s.mine || admin).slice(0, 4).map((s) => ({ ref: { kind: 'play', sid: s.id }, a: spillerAkt(s, now) }));
}

const SNOOZE = 'live89_utsatt';
const snoozes = (u, now) => { const v = kv.get(u, SNOOZE, {}) ?? {}; return Object.fromEntries(Object.entries(v).filter(([, t]) => +t > now)); };
const placeOf = (e) => String(e.address || e.map?.label || e.room || e.location || '').trim();
async function appointment(u, now) {
  let evs;
  try { evs = (await runAsUser(u, () => eventsFor(u, osloDay(now), osloDay(now + SOON_MS)))).events; } catch { return []; }
  const sn = snoozes(u, now);
  const next = evs.filter((e) => !e.allDay && e.type !== 'bursdag' && e.start && !e.inAllDayRow)
    .map((e) => ({ e, t: Date.parse(e.start) })).filter((x) => x.t > now && x.t - now <= SOON_MS)
    .sort((a, b) => a.t - b.t).find((x) => !sn[`avtale:${sha(x.e.id).slice(0, 20)}`]);
  if (!next) return [];
  const { e, t } = next, place = placeOf(e), min = Math.max(1, Math.ceil((t - now) / 60_000));
  const id = `avtale:${sha(e.id).slice(0, 20)}`;
  return [{ ref: { kind: 'event', ev: e, place }, a: akt('avtale', {
    id, tittel: e.title, undertittel: join(hhmm(t), place || null), verdi: `${min} min`, progress: 1 - (t - now) / SOON_MS,
    meta: place ? `Starter ${hhmm(t)} · ${place}` : `Starter ${hhmm(t)}`, start: iso(t - SOON_MS), slutt: iso(t), status: 'aktiv',
    handlinger: [...(place ? [H('rute', 'Vis rute')] : []), H('utsett', 'Utsett 5 min')], url: `homelab://kalender?id=${encodeURIComponent(e.id)}` }) }];
}

function packages(u, now) {
  let rows;
  try { rows = q("SELECT * FROM hl_shipments WHERE user_id=? AND archived=0 AND (status='out_for_delivery' OR (status='delivered' AND updated_at>?)) ORDER BY updated_at DESC LIMIT 4").all(u, now - PKG_DONE_MS); } catch { return []; }
  return runAsUser(u, () => rows.map((r) => {
    const s = trk42.view(r), done = r.status === 'delivered';
    const ferdig = done ? 4 : Math.max(0, Math.min(4, s.step ?? 3));
    const stopp = String(s.lastEvent?.text ?? '').match(/(\d{1,3})\s*stopp/i)?.[1];
    return { ref: { kind: 'pkg', id: r.id }, a: akt('pakke', {
      id: `pakke:${slug(r.id)}`, tittel: s.shop || s.title || s.carrierName, undertittel: join(done ? 'Levert' : 'Ute for levering', s.carrierName, stopp ? `${stopp} stopp unna` : null),
      verdi: done ? 'Levert' : stopp ? `${stopp} stopp` : 'På vei', progress: ferdig / 4, segmenter: { antall: 4, ferdig },
      meta: String(s.lastEvent?.line ?? s.statusText ?? '').slice(0, 160), start: null, slutt: null, status: done ? 'ferdig' : 'aktiv', handlinger: [],
      url: `homelab://sporing/${encodeURIComponent(r.id)}` }) };
  }));
}

/* ---------------- Samlet liste (cache 3 s per bruker) ---------------- */

const cache = new Map();
const invalidate = (u) => { cache.delete(u); };
export const _resetHits89 = () => { hits.clear(); cache.clear(); };
export const _resetLive89 = () => { cache.clear(); nrkPaused.clear(); qbPaused.clear(); nrkRan.clear(); nrkDone.clear(); nrkCache = null; hits.clear(); };
/** → [{a: Akt, ref}] for brukeren, bare typene brukeren har slått på. */
export async function liveItems89(u, { now = Date.now(), fresh = false } = {}) {
  const hit = cache.get(u);
  if (!fresh && hit && now - hit.at < 3000 && now >= hit.at) return hit.list;
  const p = prefs89(u);
  const parts = await Promise.all([
    p.nedlasting ? downloads(u, now).catch(() => []) : [],
    p.backup ? Promise.resolve().then(() => backups(u, now)).catch(() => []) : [],
    p.spiller ? players(u, now).catch(() => []) : [],
    p.avtale ? appointment(u, now).catch(() => []) : [],
    p.pakke ? Promise.resolve().then(() => packages(u, now)).catch(() => []) : [],
  ]);
  const seen = new Set();
  const list = parts.flat().filter((x) => x?.a && ID_RE89.test(x.a.id) && !seen.has(x.a.id) && seen.add(x.a.id));
  cache.set(u, { at: now, list });
  return list;
}
export const activities89 = async (u, o) => (await liveItems89(u, o)).map((x) => x.a);

/* ---------------- Handlinger ---------------- */

export const LIMIT89 = { ms: 10_000, max: 10 };
const hits = new Map();
function rate(u, now) {
  const l = (hits.get(u) ?? []).filter((t) => t > now - LIMIT89.ms && t <= now);
  if (l.length >= LIMIT89.max) { hits.set(u, l); return Math.max(1, Math.ceil((l[0] + LIMIT89.ms - now) / 1000)); }
  l.push(now); hits.set(u, l);
  return 0;
}
const err = (error, status, extra = {}) => ({ error, status, ...extra });
/** → {ok, aktivitet?, url?, skjultTil?} eller {error, status} */
export async function handling89(u, b = {}, { now = Date.now() } = {}) {
  const id = String(b?.id ?? ''), h = String(b?.handling ?? '');
  if (!ID_RE89.test(id)) return err('Ugyldig aktivitets-id', 400);
  if (!HANDLINGER89.includes(h)) return err(`Ukjent handling. Bruk ${HANDLINGER89.join(', ')}`, 400);
  const wait = rate(u, now);
  if (wait) return err(`For mange handlinger – vent ${wait} s`, 429, { retryAfter: wait });
  const it = (await liveItems89(u, { now, fresh: true })).find((x) => x.a.id === id);
  if (!it) return err('Fant ikke aktiviteten', 404);
  if (!it.a.handlinger.some((x) => x.id === h)) return err('Handlingen kan ikke brukes på denne aktiviteten nå', 409);
  const r = it.ref;
  const again = async () => { invalidate(u); return (await liveItems89(u, { now, fresh: true })).find((x) => x.a.id === id)?.a ?? null; };
  try {
    if (r.kind === 'qb') { await torrentAction43(r.hash, h === 'pause' ? 'pause' : 'resume'); if (h === 'pause') qbPaused.set(r.hash, now); else qbPaused.delete(r.hash); return { ok: true, aktivitet: await again() }; }
    if (r.kind === 'nrk') {
      await nrkKall(`/api/jobber/${r.id}/${h === 'pause' ? 'avbryt' : 'igjen'}`, { method: 'POST' });
      if (h === 'pause') nrkPaused.set(r.id, now); else nrkPaused.delete(r.id);
      nrkCache = null;
      return { ok: true, aktivitet: await again() };
    }
    if (r.kind === 'play') {
      const x = await control51(u, r.sid, h === 'pause' ? 'pause' : h === 'stopp' ? 'stop' : 'play');
      if (x.error) return err(x.error, x.status ?? 502);
      invalidate(u);
      return { ok: true, aktivitet: x.item ? spillerAkt(x.item, now) : null };
    }
    if (r.kind === 'event') {
      if (h === 'rute') {
        const android = String(b?.platform ?? '').toLowerCase() === 'android', e = r.ev, enc = encodeURIComponent(r.place);
        const url = android ? (e.map?.googleUrl ?? `https://www.google.com/maps/search/?api=1&query=${enc}`) : (e.map?.appleUrl ?? `https://maps.apple.com/?q=${enc}`);
        return { ok: true, url };
      }
      const v = snoozes(u, now), until = now + SNOOZE_MS;
      v[id] = until;
      kv.set(u, SNOOZE, v);
      invalidate(u);
      return { ok: true, aktivitet: null, skjultTil: iso(until) };
    }
  } catch (e) { return err(String(e?.message ?? 'Handlingen feilet').slice(0, 200), e?.status >= 400 && e.status < 600 ? e.status : 502); }
  return err('Handlingen kan ikke brukes på denne aktiviteten nå', 409);
}

/* ---------------- Tokens ---------------- */

const TOKEN_RE = /^[\w:.\-+/=]{8,4096}$/;
const MAX_TOKENS = 50;
export function addToken89(u, b = {}) {
  if (!['ios', 'android'].includes(b?.platform) || !['pushtostart', 'liveactivity', 'fcm'].includes(b?.kind) || typeof b?.token !== 'string' || !TOKEN_RE.test(b.token)) {
    return err('Forventet {platform:ios|android, kind:pushtostart|liveactivity|fcm, token}', 400);
  }
  if (b.aktivitetId != null && (typeof b.aktivitetId !== 'string' || !ID_RE89.test(b.aktivitetId))) return err('Ugyldig aktivitetId', 400);
  if (b.type != null && !TYPES89.includes(b.type)) return err(`Ugyldig type. Bruk ${TYPES89.join(', ')}`, 400);
  // Et token hører til én enhet: siste innloggede bruker eier det.
  q('DELETE FROM live89_tokens WHERE token=? AND user_id<>?').run(b.token, u);
  q(`INSERT INTO live89_tokens(user_id, platform, kind, token, aktivitet_id, type, updated) VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(user_id, token) DO UPDATE SET platform=excluded.platform, kind=excluded.kind, aktivitet_id=excluded.aktivitet_id, type=excluded.type, updated=excluded.updated`)
    .run(u, b.platform, b.kind, b.token, b.aktivitetId ?? null, b.type ?? null, Date.now());
  q(`DELETE FROM live89_tokens WHERE user_id=? AND token NOT IN (SELECT token FROM live89_tokens WHERE user_id=? ORDER BY updated DESC LIMIT ${MAX_TOKENS})`).run(u, u);
  return { ok: true };
}
export function removeToken89(u, b = {}) {
  if (typeof b?.token !== 'string' || !TOKEN_RE.test(b.token)) return err('Forventet {token}', 400);
  q('DELETE FROM live89_tokens WHERE user_id=? AND token=?').run(u, b.token);
  return { ok: true };
}

/* ---------------- Push via APNs ---------------- */

const unix = (t) => Math.floor(t / 1000);
const PLAT_STATE = { aktiv: 'active', pause: 'stalled', ferdig: 'done' };
/** content-state: feltene i Plat51Attributes.ContentState (title, sub, endAt, progress (-1 = ingen), state, value) + alle Akt-feltene flatt. */
export function contentState89(a) {
  const endAt = a.slutt ? unix(Date.parse(a.slutt)) : 0;
  return { title: a.tittel, sub: a.undertittel, endAt, progress: a.progress ?? -1, state: PLAT_STATE[a.status] ?? 'active', value: a.verdi,
    id: a.id, type: a.type, tittel: a.tittel, undertittel: a.undertittel, verdi: a.verdi, segmenter: a.segmenter, meta: a.meta, start: a.start, slutt: a.slutt,
    startAt: a.start ? unix(Date.parse(a.start)) : 0, status: a.status, handlinger: a.handlinger, url: a.url };
}
export const attributes89 = (a) => ({ kind: a.type, key: a.id, color: ACCENT89[a.type], id: a.id, type: a.type });
/** Hva som teller som «endring». Tid som tikker i appen (spiller, avtale) sender ikke push hvert sekund. */
function hashOf(a) {
  const base = { s: a.status, t: a.tittel, u: a.undertittel, h: a.handlinger.map((x) => x.id), seg: a.segmenter };
  if (a.type === 'spiller') Object.assign(base, { st: a.start ? Math.round(Date.parse(a.start) / 30_000) : null });
  else if (a.type === 'avtale') Object.assign(base, { sl: a.slutt, m: a.meta });
  else Object.assign(base, { v: a.verdi, p: a.progress, m: a.meta, sl: a.slutt ? Math.round(Date.parse(a.slutt) / 60_000) : null });
  return sha(JSON.stringify(base)).slice(0, 16);
}
const dismissal = (a, now) => (a.type === 'avtale' && a.slutt ? Math.max(now, Date.parse(a.slutt)) : now + (a.type === 'pakke' ? PKG_DONE_MS : DONE_MS));

let running = false;
/** Én runde: push-to-start, oppdatering og avslutning for alle brukere med iOS-tokens. → {sent, failed, removed} */
export async function pushTick89({ now = Date.now() } = {}) {
  const res = { sent: 0, failed: 0, removed: 0 };
  if (running || !apnsConf89().on) return res;
  running = true;
  try {
    const users = q("SELECT DISTINCT user_id FROM live89_tokens WHERE platform='ios' AND kind IN ('pushtostart','liveactivity')").pluck().all();
    for (const u of users) await pushUser(u, now, res);
  } finally { running = false; }
  return res;
}
async function pushUser(u, now, res) {
  const toks = q("SELECT * FROM live89_tokens WHERE user_id=? AND platform='ios'").all(u);
  const p2s = toks.filter((t) => t.kind === 'pushtostart'), byAkt = (id) => toks.filter((t) => t.kind === 'liveactivity' && t.aktivitet_id === id);
  const recs = new Map(q('SELECT * FROM live89_push WHERE user_id=?').all(u).map((r) => [r.akt_id, r]));
  let list;
  try { list = (await liveItems89(u, { now, fresh: true })).map((x) => x.a); } catch { return; }
  const send = async (tokens, aps, priority) => {
    for (const t of tokens) {
      const r = await sendLive89({ token: t.token, payload: { aps }, priority, now });
      if (r.ok) res.sent++;
      else {
        res.failed++;
        if (r.gone) { q('DELETE FROM live89_tokens WHERE user_id=? AND token=?').run(u, t.token); res.removed++; }
        if (process.env.NODE_ENV !== 'test') console.warn(`[live89] APNs ${r.status || '-'} ${r.reason ?? ''}`.trim()); // aldri token, nøkkel eller JWT
      }
    }
  };
  const upsert = q(`INSERT INTO live89_push(user_id, akt_id, type, hash, sent_at, ended) VALUES(?,?,?,?,?,?)
    ON CONFLICT(user_id, akt_id) DO UPDATE SET hash=excluded.hash, sent_at=excluded.sent_at, ended=excluded.ended`);
  for (const a of list) {
    let rec = recs.get(a.id);
    recs.delete(a.id);
    const h = hashOf(a), ts = unix(now);
    if (rec?.ended && a.status !== 'ferdig') { q('DELETE FROM live89_push WHERE user_id=? AND akt_id=?').run(u, a.id); rec = null; }
    if (!rec) {
      if (a.status === 'ferdig') { upsert.run(u, a.id, a.type, h, now, 1); continue; } // aldri start noe som allerede er ferdig
      await send(p2s, { timestamp: ts, event: 'start', 'content-state': contentState89(a), 'attributes-type': ATTR_TYPE89, attributes: attributes89(a),
        alert: { title: a.tittel, body: a.undertittel || a.verdi }, 'stale-date': ts + 3600 }, 10);
      upsert.run(u, a.id, a.type, h, now, 0);
      continue;
    }
    if (rec.ended || rec.hash === h) continue;
    const end = a.status === 'ferdig';
    if (!end && (a.type === 'nedlasting' || a.type === 'backup') && now - rec.sent_at < THROTTLE_MS && now >= rec.sent_at) continue;
    await send(byAkt(a.id), { timestamp: ts, event: end ? 'end' : 'update', 'content-state': contentState89(a), ...(end ? { 'dismissal-date': unix(dismissal(a, now)) } : { 'stale-date': ts + 3600 }) },
      end || (a.type !== 'nedlasting' && a.type !== 'backup') ? 10 : 5);
    upsert.run(u, a.id, a.type, h, now, end ? 1 : 0);
  }
  // Borte fra lista: avslutt (avtale ved starttid, som da er nå; andre +15 min) og glem.
  for (const rec of recs.values()) {
    if (!rec.ended) {
      const ts = unix(now);
      await send(byAkt(rec.akt_id), { timestamp: ts, event: 'end', 'content-state': { title: '', sub: '', endAt: 0, progress: -1, state: 'done', value: '', id: rec.akt_id, type: rec.type, status: 'ferdig', handlinger: [] },
        'dismissal-date': rec.type === 'avtale' ? ts : unix(now + DONE_MS) }, 10);
    }
    q('DELETE FROM live89_push WHERE user_id=? AND akt_id=?').run(u, rec.akt_id);
  }
}
let timer = null;
export function startLive89() {
  if (timer) return;
  timer = setInterval(() => { pushTick89().catch((e) => console.warn('[live89]', String(e?.message ?? e).slice(0, 200))); }, THROTTLE_MS);
  timer.unref?.();
}

/* ---------------- Ruter ---------------- */

export const live89Api = new Hono();
live89Api.use('*', authOrToken);
const body = async (c) => { const b = await c.req.json().catch(() => null); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };
const out = (c, r) => (r.error ? (r.retryAfter && c.header('Retry-After', String(r.retryAfter)), c.json({ error: r.error, ...(r.retryAfter ? { retryAfter: r.retryAfter } : {}) }, r.status ?? 400)) : c.json(r));
live89Api.get('/aktiviteter', async (c) => {
  const now = Date.now();
  return c.json({ aktiviteter: await activities89(c.get('user'), { now }), oppdatert: new Date(now).toISOString() }, 200, { 'Cache-Control': 'no-store' });
});
live89Api.post('/handling', async (c) => out(c, await handling89(c.get('user'), await body(c))));
live89Api.get('/innstillinger', (c) => c.json(prefs89(c.get('user'))));
live89Api.put('/innstillinger', async (c) => c.json(setPrefs89(c.get('user'), await body(c))));
live89Api.post('/tokens', async (c) => out(c, addToken89(c.get('user'), await body(c))));
live89Api.delete('/tokens', async (c) => out(c, removeToken89(c.get('user'), await body(c))));
export const mountLive89 = (app) => app.route('/api/live', live89Api);
