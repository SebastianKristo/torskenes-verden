// Bakgrunnsbilder for fotovinduet (prompt 14). Bildene leveres alltid fra serveren, aldri som lenker til Wikimedia eller NASA,
// så appene slipper ATS- og hotlink-problemer.
//
// - Oslo og «Vær nå» bruker bildene som følger med i public/bg (klart, skyet, regn, snø, tåke, natt).
// - Planeter: dagens NASA APOD lastes ned én gang i døgnet til DATA_DIR/media/bg. Er APOD en video eller nede,
//   brukes et av planetbildene i public/bg, som roterer hver dag.
// Begge mappene serveres under /api/bg/:file. Den nedlastede kopien går foran den medfølgende.
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const BUNDLED = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'bg');
export const BG_CACHE = join(config.dataDir, 'media', 'bg');
await mkdir(BG_CACHE, { recursive: true });

const FILE_RE = /^[a-z0-9][a-z0-9._-]{0,80}\.(jpe?g|png|webp)$/i;
const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const url = (f) => `/api/bg/${f}`;

export const WEATHER_SET = ['clear', 'cloudy', 'rain', 'snow', 'fog', 'night'];
/** MET-symbol (clearsky_day, lightrain, fog …) → ett av værbildene. */
export function weatherKind(symbol = '') {
  const s = String(symbol ?? '');
  if (/snow|sleet/.test(s)) return 'snow';
  if (/rain|thunder|showers/.test(s)) return 'rain';
  if (/fog/.test(s)) return 'fog';
  if (/_night|polartwilight/.test(s)) return 'night';
  if (/cloudy/.test(s) && !/partly/.test(s)) return 'cloudy';
  if (!s) return 'cloudy';
  return /partly/.test(s) ? 'cloudy' : 'clear';
}
/** Værbildet først, resten som reserve (samme rekkefølge som WEATHER_SET). */
export function weatherImages(symbol) {
  const k = weatherKind(symbol);
  return [k, ...WEATHER_SET.filter((x) => x !== k)].map((x) => url(`weather-${x}.jpg`));
}

const PLANETS = ['planets-1.jpg', 'planets-2.jpg', 'planets-3.jpg'];
const dayOfYear = (d = new Date()) => Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400_000);
export const planetsToday = (d = new Date()) => { const i = dayOfYear(d) % PLANETS.length; return [...PLANETS.slice(i), ...PLANETS.slice(0, i)].map(url); };

export const osloImages = () => [url('oslo.jpg')];

// APOD: én nedlasting per dato. Feiler den, prøves det igjen tidligst etter en time.
let apodTry = { date: '', at: 0, pending: null };
const looksLikeImage = (b) => b.length > 1000 && ((b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50) || b.slice(8, 12).toString() === 'WEBP');
export async function apodImage(apod, { fetchFn = fetch, timeout = 15000 } = {}) {
  if (!apod || apod.media_type !== 'image' || !apod.url || !/^https:\/\//.test(apod.url)) return null;
  const date = String(apod.date ?? new Date().toISOString().slice(0, 10)).replace(/[^\d-]/g, '').slice(0, 10);
  const ext = /\.png($|\?)/i.test(apod.url) ? 'png' : 'jpg';
  const name = `apod-${date}.${ext}`;
  try { await readFile(join(BG_CACHE, name)); return url(name); } catch { /* ikke lastet ned ennå */ }
  if (apodTry.date === date && apodTry.pending) return apodTry.pending;
  if (apodTry.date === date && Date.now() - apodTry.at < 3600_000) return null;
  apodTry = { date, at: Date.now(), pending: null };
  apodTry.pending = (async () => {
    try {
      const r = await fetchFn(apod.url, { headers: { 'User-Agent': 'homelab-os (fotovindu)' }, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
      if (!r.ok) throw new Error(`NASA svarte ${r.status}`);
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length > 25 * 1024 * 1024 || !looksLikeImage(b)) throw new Error('APOD-bildet var ikke et gyldig bilde');
      await writeFile(join(BG_CACHE, name), b);
      // Behold bare de siste sju APOD-bildene.
      const old = (await readdir(BG_CACHE)).filter((f) => f.startsWith('apod-')).sort().slice(0, -7);
      for (const f of old) await unlink(join(BG_CACHE, f)).catch(() => {});
      return url(name);
    } catch (e) {
      console.warn('[bg] APOD:', e.message);
      return null;
    } finally { apodTry.pending = null; }
  })();
  return apodTry.pending;
}

/** Leser et bakgrunnsbilde: nedlastet kopi først, ellers det medfølgende. null når det ikke finnes. */
export async function readBg(file) {
  if (!FILE_RE.test(String(file ?? ''))) return null;
  for (const dir of [BG_CACHE, BUNDLED]) {
    try {
      const body = await readFile(join(dir, file));
      return { body, type: TYPES[file.split('.').pop().toLowerCase()] ?? 'image/jpeg', bundled: dir === BUNDLED };
    } catch { /* prøv neste */ }
  }
  return null;
}
