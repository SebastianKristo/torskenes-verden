// Prompt 51 (MEDFAM51): lagring med anbefaling (bare admin).
// Diskbruk fra Sonarr/Radarr (/diskspace og størrelsen på biblioteket) og qBittorrent (ledig plass, torrenter), og en «sett og stort»-
// liste (sett ferdig av noen i familien – plays44 – lenge siden, og stort). Sletting skjer ALDRI hardt uten bekreftelse:
//   1) POST …/delete krever {confirm:true}. Elementet slutter å overvåkes i Sonarr/Radarr med en gang (så det ikke lastes ned igjen).
//   2) Er papirkurv-mappa satt opp (MEDFAM51_TRASH_DIR + MEDFAM51_PATH_MAP), flyttes mappa dit (mode 'trash'). Ellers står filene
//      urørt i 24 t (mode 'arr'). I begge tilfeller kan det angres i 24 t.
//   3) Etter 24 t: mode 'arr' → Sonarr/Radarr sletter filene (deres egen papirkurv brukes hvis den er satt opp der). Mode 'trash' →
//      filene blir liggende i papirkurven til admin tømmer den med {confirm:'SLETT'} (bare elementer eldre enn 24 t).
import { readdir, rename, rm, stat, mkdir } from 'node:fs/promises';
import { join, resolve, basename, sep } from 'node:path';
import { db } from '../db.js';
import * as M from '../media43.js';
import { HOUR, DAY, GB, iso, sizeText, minText, errText } from './common.js';

db.exec(`CREATE TABLE IF NOT EXISTS media51_deletion (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, arr_id INTEGER NOT NULL, title TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL, src_path TEXT, trash_path TEXT, was_monitored INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL, created INTEGER NOT NULL, undo_until INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', done_at INTEGER, error TEXT);
CREATE INDEX IF NOT EXISTS media51_deletion_status ON media51_deletion(status, undo_until);`);
const q = (sql) => db.prepare(sql);
export const UNDO_MS51 = 24 * HOUR;
const bigBytes = () => Math.max(1, Number(process.env.MEDFAM51_BIG_GB) || 8) * GB;
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^the\s+/, '').replace(/[^a-z0-9æøå]+/g, '');
const SVC = { movie: 'radarr', series: 'sonarr' };

/* ---------------- Papirkurv og stier ---------------- */

export function trashDir51() {
  const d = String(process.env.MEDFAM51_TRASH_DIR ?? '').trim();
  if (!d || resolve(d) === sep || resolve(d).split(sep).filter(Boolean).length < 2) return null; // aldri / eller /media
  return resolve(d);
}
/** MEDFAM51_PATH_MAP="/data/media=/media;/tv=/media/tv": stien i Sonarr/Radarr → stien i os-containeren. */
export function pathMap51() {
  return String(process.env.MEDFAM51_PATH_MAP ?? '').split(/[;,]/).map((p) => p.split('=')).filter((p) => p.length === 2 && p[0].trim().startsWith('/') && p[1].trim().startsWith('/'))
    .map(([a, b]) => [a.trim().replace(/\/+$/, ''), resolve(b.trim())]);
}
export function localPath51(arrPath) {
  const p = String(arrPath ?? '');
  if (!p.startsWith('/') || p.split('/').includes('..')) return null;
  for (const [a, b] of pathMap51()) {
    if (p === a || p.startsWith(`${a}/`)) {
      const local = resolve(b, `.${p.slice(a.length)}`);
      if (local !== b && local.startsWith(`${b}${sep}`)) return local; // aldri selve rot-mappa
    }
  }
  return null;
}
const exists = (p) => stat(p).then(() => true, () => false);

/* ---------------- Oversikt ---------------- */

function watchIndex() {
  let rows = [];
  try { rows = q('SELECT user, title, percent, started FROM plays44 WHERE started>? ORDER BY started DESC LIMIT 20000').all(Date.now() - 1095 * DAY); } catch { rows = []; }
  const out = new Map();
  for (const r of rows) {
    const k = norm(r.title);
    const h = out.get(k) ?? { users: new Set(), lastAt: 0, active: 0, plays: 0 };
    h.plays++; h.lastAt = Math.max(h.lastAt, r.started);
    if (r.percent >= 85) h.users.add(String(r.user ?? '').trim() || 'noen');
    else if (r.percent >= 5 && Date.now() - r.started < 14 * DAY) h.active++;
    out.set(k, h);
  }
  return out;
}
const agoText = (t, now = Date.now()) => { const d = Math.round((now - t) / DAY); return d < 1 ? 'i dag' : d < 14 ? `for ${d} dager siden` : d < 60 ? `for ${Math.round(d / 7)} uker siden` : `for ${Math.round(d / 30)} måneder siden`; };
const joinN = (a) => (a.length <= 1 ? a[0] ?? '' : `${a.slice(0, -1).join(', ')} og ${a.at(-1)}`);

export async function storage51(now = Date.now()) {
  const on = { sonarr: M.svcConf43('sonarr').on, radarr: M.svcConf43('radarr').on, qbit: M.svcConf43('qbit').on };
  const errors = [];
  const safe = async (label, fn, d) => { try { return await fn(); } catch (e) { errors.push(`${label}: ${errText(e)}`); return d; } };
  const [dsS, dsR, series, movies, main, tors] = await Promise.all([
    on.sonarr ? safe('Sonarr', () => M.arr43('sonarr', 'GET', '/diskspace'), []) : [],
    on.radarr ? safe('Radarr', () => M.arr43('radarr', 'GET', '/diskspace'), []) : [],
    on.sonarr ? safe('Sonarr', () => M.seriesList43(), []) : [],
    on.radarr ? safe('Radarr', () => M.movieList43(), []) : [],
    on.qbit ? safe('qBittorrent', () => M.qb43('GET', '/sync/maindata'), null) : null,
    on.qbit ? safe('qBittorrent', () => M.torrentsRaw43(), []) : [],
  ]);
  const disks = new Map();
  for (const d of [...(Array.isArray(dsS) ? dsS : []), ...(Array.isArray(dsR) ? dsR : [])]) {
    if (!d?.path || !d.totalSpace || disks.has(d.path)) continue;
    const used = d.totalSpace - d.freeSpace;
    disks.set(d.path, { path: d.path, label: d.label || d.path, free: d.freeSpace, total: d.totalSpace, freeText: sizeText(d.freeSpace), totalText: sizeText(d.totalSpace), usedPct: Math.round((used / d.totalSpace) * 100), warn: d.freeSpace / d.totalSpace < 0.1 });
  }
  const sSize = (Array.isArray(series) ? series : []).reduce((a, x) => a + (x.statistics?.sizeOnDisk ?? 0), 0);
  const mSize = (Array.isArray(movies) ? movies : []).reduce((a, x) => a + (x.sizeOnDisk ?? x.movieFile?.size ?? 0), 0);
  const tList = Array.isArray(tors) ? tors : [];
  const tSize = tList.reduce((a, t) => a + (t.size ?? 0), 0);
  const pend = new Set(q("SELECT kind||':'||arr_id FROM media51_deletion WHERE status='pending'").pluck().all());
  const W = watchIndex(), big = bigBytes();
  const recs = [];
  for (const x of Array.isArray(movies) ? movies : []) {
    const size = x.sizeOnDisk ?? x.movieFile?.size ?? 0, h = W.get(norm(x.title));
    if (!x.hasFile || size < big || !h?.users.size || h.active || now - h.lastAt < 14 * DAY || pend.has(`movie:${x.id}`)) continue;
    recs.push({ kind: 'movie', id: x.id, title: x.title, year: x.year ?? null, size, sizeText: sizeText(size), watchedBy: [...h.users], lastWatched: iso(h.lastAt), poster: M.posterOf43('radarr', x.images, x.id),
      reason: `Sett av ${joinN([...h.users])} · sist ${agoText(h.lastAt, now)} · ${sizeText(size)}` });
  }
  for (const x of Array.isArray(series) ? series : []) {
    const size = x.statistics?.sizeOnDisk ?? 0, h = W.get(norm(x.title));
    if (size < big * 2 || x.status !== 'ended' || !h?.users.size || h.active || now - h.lastAt < 30 * DAY || pend.has(`series:${x.id}`)) continue;
    recs.push({ kind: 'series', id: x.id, title: x.title, year: x.year ?? null, size, sizeText: sizeText(size), watchedBy: [...h.users], lastWatched: iso(h.lastAt), poster: M.posterOf43('sonarr', x.images, x.id),
      reason: `Avsluttet serie · sett av ${joinN([...h.users])} · sist ${agoText(h.lastAt, now)} · ${sizeText(size)}` });
  }
  recs.sort((a, b) => b.size - a.size);
  const freeQb = main?.server_state?.free_space_on_disk ?? null;
  const tdir = trashDir51();
  return {
    disks: [...disks.values()],
    services: {
      sonarr: on.sonarr ? { size: sSize, sizeText: sizeText(sSize), count: (series ?? []).length } : null,
      radarr: on.radarr ? { size: mSize, sizeText: sizeText(mSize), count: (movies ?? []).length } : null,
      qbit: on.qbit ? { size: tSize, sizeText: sizeText(tSize), count: tList.length, seeding: tList.filter((t) => /UP$|^uploading$/.test(String(t.state))).length, free: freeQb, freeText: freeQb != null ? sizeText(freeQb) : null } : null,
    },
    recommendations: recs.slice(0, 30), recommendText: recs.length ? `${recs.length} sett og store · ${sizeText(recs.reduce((a, r) => a + r.size, 0))} kan frigjøres` : 'Ingen sett og store elementer å anbefale nå',
    bigThreshold: big, bigThresholdText: sizeText(big),
    trash: { configured: !!tdir && pathMap51().length > 0, text: tdir ? (pathMap51().length ? 'Sletting flytter til papirkurv-mappa først' : 'Papirkurv-mappa er satt, men MEDFAM51_PATH_MAP mangler – sletting går via Sonarr/Radarr etter 24 t') : 'Ingen papirkurv-mappe – sletting går via Sonarr/Radarr etter 24 t (angre i 24 t)' },
    deletions: deletions51(now).filter((d) => d.status === 'pending'),
    ...(errors.length ? { errors } : {}),
  };
}

/* ---------------- Sletting med angre ---------------- */

export function deletionOut51(d, now = Date.now()) {
  const left = Math.max(0, d.undo_until - now);
  return { id: d.id, kind: d.kind, arrId: d.arr_id, title: d.title, size: d.size, sizeText: sizeText(d.size), mode: d.mode, status: d.status,
    statusText: { pending: left ? `Slettes om ${minText(left / 60_000)} · kan angres` : 'Slettes nå', undone: 'Angret', done: d.mode === 'trash' ? 'I papirkurven' : 'Slettet', failed: 'Feilet' }[d.status] ?? d.status,
    undoUntil: iso(d.undo_until), canUndo: d.status === 'pending' && left > 0, createdAt: iso(d.created), doneAt: iso(d.done_at), error: d.error ?? null };
}
export const deletions51 = (now = Date.now()) => q('SELECT * FROM media51_deletion ORDER BY id DESC LIMIT 50').all().map((d) => deletionOut51(d, now));

async function setMonitored(kind, x, monitored) {
  const svc = SVC[kind];
  await M.arr43(svc, 'PUT', `/${kind === 'movie' ? 'movie' : 'series'}/${x.id}`, { body: { ...x, monitored } });
  M.clearMedia43(kind === 'movie' ? 'radarr:' : 'sonarr:');
}

export async function scheduleDelete51(user, { kind, id, confirm } = {}, now = Date.now()) {
  if (!SVC[kind]) return { error: 'kind må være movie eller series', status: 400 };
  if (!Number.isInteger(+id) || +id <= 0) return { error: 'Ugyldig id', status: 400 };
  if (confirm !== true) return { error: 'Bekreft slettingen (confirm:true). Filene kan angres i 24 timer.', status: 400, code: 'CONFIRM_REQUIRED' };
  if (!M.svcConf43(SVC[kind]).on) return { error: `${SVC[kind] === 'radarr' ? 'Radarr' : 'Sonarr'} er ikke satt opp`, status: 409 };
  if (q("SELECT 1 FROM media51_deletion WHERE kind=? AND arr_id=? AND status='pending'").get(kind, +id)) return { error: 'Elementet står allerede i slettekøen', status: 409 };
  let x;
  try { x = await M.arr43(SVC[kind], 'GET', `/${kind === 'movie' ? 'movie' : 'series'}/${+id}`); } catch (e) { return { error: errText(e), status: e.status === 404 ? 404 : 502 }; }
  if (!x?.id) return { error: 'Fant ikke elementet', status: 404 };
  const size = kind === 'movie' ? x.sizeOnDisk ?? x.movieFile?.size ?? 0 : x.statistics?.sizeOnDisk ?? 0;
  const wasMon = x.monitored !== false;
  try { if (wasMon) await setMonitored(kind, x, false); } catch (e) { return { error: `Fikk ikke slått av overvåking: ${errText(e)}`, status: 502 }; }
  let mode = 'arr', trash = null, src = null;
  const tdir = trashDir51(), local = localPath51(x.path);
  if (tdir && local && await exists(local)) {
    try {
      await mkdir(tdir, { recursive: true });
      trash = join(tdir, `${now}-${kind}-${+id}-${basename(local)}`.replace(/[^\w.\- ]/g, '_'));
      await rename(local, trash);
      mode = 'trash'; src = local;
    } catch (e) { trash = null; console.warn('[media51] papirkurv:', errText(e), '· bruker Sonarr/Radarr etter 24 t'); }
  }
  const d = q(`INSERT INTO media51_deletion(kind,arr_id,title,size,mode,src_path,trash_path,was_monitored,created_by,created,undo_until) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING *`)
    .get(kind, +id, String(x.title ?? '').slice(0, 200), size, mode, src, trash, wasMon ? 1 : 0, user, now, now + UNDO_MS51);
  return { deletion: deletionOut51(d, now), message: mode === 'trash' ? `«${x.title}» er flyttet til papirkurven. Du kan angre i 24 timer.` : `«${x.title}» slettes om 24 timer. Du kan angre til da.` };
}

export async function undoDelete51(id, now = Date.now()) {
  const d = q('SELECT * FROM media51_deletion WHERE id=?').get(+id);
  if (!d) return { error: 'Fant ikke slettingen', status: 404 };
  if (d.status !== 'pending' || now > d.undo_until) return { error: 'Slettingen kan ikke angres lenger', status: 409 };
  if (d.mode === 'trash' && d.trash_path && d.src_path) {
    if (await exists(d.src_path)) return { error: 'Det finnes allerede noe på den opprinnelige plassen – flytt det tilbake manuelt', status: 409 };
    try { await rename(d.trash_path, d.src_path); } catch (e) { return { error: `Fikk ikke flyttet tilbake: ${errText(e)}`, status: 500 }; }
  }
  let warn = null;
  if (d.was_monitored) {
    try { const x = await M.arr43(SVC[d.kind], 'GET', `/${d.kind === 'movie' ? 'movie' : 'series'}/${d.arr_id}`); await setMonitored(d.kind, x, true); } catch (e) { warn = `Overvåking ble ikke slått på igjen: ${errText(e)}`; }
  }
  q("UPDATE media51_deletion SET status='undone', done_at=? WHERE id=?").run(now, d.id);
  return { deletion: deletionOut51(q('SELECT * FROM media51_deletion WHERE id=?').get(d.id), now), message: `«${d.title}» er tilbake`, ...(warn ? { warning: warn } : {}) };
}

/** Kjøres jevnlig: slettinger der angrefristen er ute. */
export async function sweepDeletions51(now = Date.now()) {
  let n = 0;
  for (const d of q("SELECT * FROM media51_deletion WHERE status='pending' AND undo_until<=?").all(now)) {
    try {
      if (d.mode === 'arr') {
        if (d.kind === 'movie') {
          const files = await M.arr43('radarr', 'GET', '/moviefile', { query: { movieId: d.arr_id } });
          for (const f of Array.isArray(files) ? files : []) await M.arr43('radarr', 'DELETE', `/moviefile/${f.id}`);
        } else {
          const files = await M.arr43('sonarr', 'GET', '/episodefile', { query: { seriesId: d.arr_id } });
          for (const f of Array.isArray(files) ? files : []) await M.arr43('sonarr', 'DELETE', `/episodefile/${f.id}`);
        }
        M.clearMedia43();
      }
      q("UPDATE media51_deletion SET status='done', done_at=? WHERE id=?").run(now, d.id);
      n++;
    } catch (e) { q("UPDATE media51_deletion SET status='failed', done_at=?, error=? WHERE id=?").run(now, errText(e), d.id); }
  }
  return n;
}

/** Papirkurven: innhold og tømming (bare elementer eldre enn angrefristen, og bare med {confirm:'SLETT'}). */
export async function trashList51(now = Date.now()) {
  const dir = trashDir51();
  if (!dir) return { configured: false, items: [] };
  const names = await readdir(dir).catch(() => []);
  const items = [];
  for (const n of names) {
    const st = await stat(join(dir, n)).catch(() => null);
    if (!st) continue;
    const t = +(n.match(/^(\d{13})-/)?.[1] ?? st.mtimeMs);
    items.push({ name: n, at: iso(t), old: now - t >= UNDO_MS51 });
  }
  return { configured: true, items, count: items.length };
}
export async function emptyTrash51({ confirm } = {}, now = Date.now()) {
  if (confirm !== 'SLETT') return { error: 'Skriv SLETT for å tømme papirkurven for godt', status: 400, code: 'CONFIRM_REQUIRED' };
  const dir = trashDir51();
  if (!dir) return { error: 'Ingen papirkurv-mappe er satt opp', status: 409 };
  let removed = 0;
  for (const it of (await trashList51(now)).items) {
    if (!it.old) continue;
    const p = resolve(dir, it.name);
    if (!p.startsWith(`${dir}${sep}`)) continue;
    await rm(p, { recursive: true, force: true });
    removed++;
  }
  q("UPDATE media51_deletion SET trash_path=NULL WHERE mode='trash' AND status='done' AND done_at<=?").run(now);
  return { ok: true, removed };
}
