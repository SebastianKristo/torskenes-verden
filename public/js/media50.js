// Prompt 50 (SRVMEDIA50): Media på web.
// 1) Plakater med en gang (claude-code-media-bilder-raskt.md): serveren sender poster/fanart som /api/media/bilde/…?w=&v= og
//    posterImg {url, hash, w, h, srcset}. Her tegnes ThumbHash-plassholderen i plakatens farger med én gang (ingen grå bokser),
//    og <img srcset sizes loading fetchpriority> henter riktig bredde (service workeren svarer fra cache, se sw.js).
// 2) Sann status etter søk (claude-code-media-qbit-starter-ikke.md): POST /api/media/command gir `track`; vi spør
//    GET /api/media/track/:id til den er ferdig og viser «Fant ingen utgivelser», «Laster ned 12 % · 4,2 MB/s · 8 min»,
//    «qBittorrent svarer ikke», «Lagt til, men stoppet» [Start] osv. i stedet for et evig «Søker».
import { esc } from './util.js';
import { thumbHashToRGBA50, b64ToBytes50 } from './thumbhash50.js';

if (typeof document !== 'undefined') {
  if (!document.querySelector('link[data-m50-css]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/css/media50.css'; l.dataset.m50Css = ''; document.head.appendChild(l); }
  // Bilder som ikke lastes (f.eks. uten nett og uten cache) fjernes, så plassholderen står igjen.
  document.addEventListener('error', (e) => { const t = e.target; if (t?.classList?.contains('m50-im')) t.remove(); }, true);
}

/* ---------------- Plakater ---------------- */

const phCache = new Map();
/** ThumbHash (base64) → data-URL (PNG, maks 32 px). Huskes per hash. */
export function phUrl50(hash) {
  if (!hash) return null;
  if (phCache.has(hash)) return phCache.get(hash);
  let u = null;
  try {
    const { w, h, rgba } = thumbHashToRGBA50(b64ToBytes50(hash));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d'), id = ctx.createImageData(w, h);
    id.data.set(rgba); ctx.putImageData(id, 0, 0);
    u = cv.toDataURL('image/png');
  } catch { u = null; }
  if (phCache.size > 1500) phCache.clear();
  phCache.set(hash, u);
  return u;
}
/** style for plakatflaten: farge + plassholder (ny server) eller selve plakaten som bakgrunn (eldre server/andre kilder). */
export function bg50(x, img = 'posterImg', key = 'poster') {
  const c = `background-color:${esc(x?.color || '#3c4a5c')}`;
  const P = x?.[img];
  if (P) { const ph = phUrl50(P.hash); return ph ? `${c};background-image:url('${ph}')` : c; }
  return x?.[key] ? `${c};background-image:url('${esc(x[key])}')` : c;
}
/** <img> med srcset for plakaten. sizes = visningsbredden i CSS-piksler; high = synlig med en gang (fetchpriority). */
export function img50(x, { sizes = '120px', high = false, img = 'posterImg' } = {}) {
  const P = x?.[img];
  if (!P?.url) return '';
  return `<img class="m50-im" src="${esc(P.url)}"${P.srcset ? ` srcset="${esc(P.srcset)}" sizes="${esc(sizes)}"` : ''} alt="" decoding="async" loading="${high ? 'eager' : 'lazy'}"${high ? ' fetchpriority="high"' : ''} draggable="false">`;
}
/** Forhåndslast plakatene for de neste radene (bilder som ikke er i DOM-en ennå). */
const warmed = new Set();
export function prefetch50(items, from, n = 12, w = 320) {
  for (const x of (items ?? []).slice(from, from + n)) {
    const P = x?.posterImg; if (!P?.srcset) continue;
    const m = P.srcset.split(', ').find((s) => s.endsWith(` ${w}w`)); const u = m ? m.slice(0, m.lastIndexOf(' ')) : P.url;
    if (!u || warmed.has(u)) continue;
    warmed.add(u);
    const i = new Image(); i.decoding = 'async'; i.src = u;
  }
}

/* ---------------- Sann status etter søk ---------------- */

let api = null, repaint = () => {};
/** media43.js gir oss sin mapi (med ?server=) og hvordan siden tegnes på nytt. */
export function setup50(mapi, paint) { api = mapi; repaint = paint; }
const TR = new Map(); // nøkkel («e:<episodeId>» | «m:<movieId>» | «s:<serieId>:<sesong>») → {id, t, timer, at}
const keysOf = (t) => (t.movieIds?.length ? t.movieIds.map((id) => `m:${id}`) : t.episodeIds?.length ? t.episodeIds.map((id) => `e:${id}`) : t.seriesId != null ? [`s:${t.seriesId}:${t.seasonNumber ?? ''}`] : []);
function setT(t) { for (const k of keysOf(t)) { const cur = TR.get(k); if (cur && cur.id !== t.id) clearTimeout(cur.timer); TR.set(k, { ...(TR.get(k)?.id === t.id ? TR.get(k) : {}), id: t.id, t, at: Date.now() }); } }
async function poll(id, t0 = Date.now()) {
  if (!api) return;
  let t;
  try { t = await api(`/track/${encodeURIComponent(id)}`); } catch (e) { if (e.status === 404) return; t = null; }
  if (t) { setT(t); repaint(); }
  const live = t ? !t.final : true;
  if (!live || Date.now() - t0 > 20 * 60_000) return;
  const ms = Math.max(1500, t?.pollMs || 3000) * (document.hidden ? 4 : 1);
  const timer = setTimeout(() => poll(id, t0), ms);
  for (const k of keysOf(t ?? { episodeIds: [] })) { const e = TR.get(k); if (e?.id === id) e.timer = timer; }
}
/** Etter POST /command (svaret har track) eller et manuelt valg (POST /track). */
export function startTrack50(resp, seed) {
  const tr = resp?.track ?? (resp?.id && resp?.state ? resp : null);
  if (!tr?.id) return false;
  const t = { ...seed, ...tr, episodeIds: tr.episodeIds ?? seed?.episodeIds ?? [], movieIds: tr.movieIds ?? seed?.movieIds ?? [], seriesId: tr.seriesId ?? seed?.seriesId ?? null, seasonNumber: tr.seasonNumber ?? seed?.seasonNumber ?? null, tone: tr.tone ?? 'mut' };
  setT(t); repaint();
  setTimeout(() => poll(tr.id), 1200);
  return true;
}
/** Manuelt valg i interaktivt søk: følg nedlastingen videre (POST /api/media/track). */
export async function trackGrab50(body) {
  if (!api) return;
  try { const t = await api('/track', { method: 'POST', json: { ...body, grabbed: true } }); startTrack50(t, { episodeIds: body.episodeId ? [body.episodeId] : [], movieIds: body.movieId ? [body.movieId] : [] }); } catch { /* eldre server */ }
}
export const track50 = (k) => TR.get(k)?.t ?? null;
const TONE = { ok: 't-ok', dl: 't-dl', warn: 't-warn', bad: 't-bad', wait: 't-wait', mut: 't-mut' };
/** Statuslinja under episoden/filmen. ctx = {episodeId} | {movieId}. */
export function trackHtml50(k, ctx = {}) {
  const t = track50(k);
  if (!t) return '';
  if (ctx.episodeId && (t.episodeIds?.length ?? 0) > 3) return ''; // søk etter mange episoder: én linje over sesongene (multiTrackHtml50)
  const acts = (t.actions ?? []).map((a) => {
    if (a.id === 'manual') return ctx.movieId ? '<button type="button" class="m43-btn sm line" data-m43="minter">Velg manuelt</button>' : ctx.episodeId ? `<button type="button" class="m43-btn sm line" data-m43-epint="${+ctx.episodeId}">Velg manuelt</button>` : '';
    if (a.id === 'start' && a.hash) return `<button type="button" class="m43-btn sm ink" data-m50-start="${esc(a.hash)}" data-m50-k="${esc(k)}">Start</button>`;
    if (a.id === 'settings') return '<button type="button" class="m43-btn sm line" data-m50-set>Innstillinger → Media</button>';
    if (a.id === 'retry') return `<button type="button" class="m43-btn sm line" data-m50-retry="${esc(k)}">Søk igjen</button>`;
    return '';
  }).join('');
  const bar = t.progress != null && t.state === 'downloading' ? `<div class="m50-bar"><i style="width:${Math.max(0, Math.min(100, +t.progress || 0))}%"></i></div>` : '';
  const busy = !t.final && ['searching', 'checking', 'sent', 'starting'].includes(t.state);
  return `<div class="m50-tr${ctx.cls ? ` ${esc(ctx.cls)}` : ''} ${TONE[t.tone] ?? 't-mut'}" role="status" aria-live="polite"><div class="m50-trt">${busy ? '<span class="m50-spin" aria-hidden="true"></span>' : ''}<b>${esc(t.text ?? '')}</b></div>${t.detail ? `<span class="m50-trd">${esc(t.detail)}</span>` : ''}${bar}${acts ? `<div class="m50-tra">${acts}</div>` : ''}</div>`;
}
/** Søk etter flere enn 3 episoder (Søk alle manglende): én statuslinje for serien. */
export function multiTrackHtml50(episodeIds) {
  for (const id of episodeIds ?? []) { const t = track50(`e:${id}`); if (t && (t.episodeIds?.length ?? 0) > 3) return trackHtml50(`e:${id}`, { cls: 'movie' }); }
  return '';
}
/** Klikk på knappene i statuslinja. → true når klikket er håndtert. */
export async function click50(b) {
  const d = b?.dataset ?? {};
  if (d.m50Start) {
    b.disabled = true;
    try { await api(`/torrents/${encodeURIComponent(d.m50Start)}/start`, { method: 'POST', json: {} }); const e = TR.get(d.m50K); if (e) { e.t = { ...e.t, state: 'downloading', tone: 'dl', text: 'Startet · venter på fart …', actions: [] }; repaint(); setTimeout(() => poll(e.id), 1500); } }
    catch (er) { b.disabled = false; alert50(er.message); }
    return true;
  }
  if ('m50Set' in d) { import('./settings.js').then((m) => m.openSettings('media')).catch(() => { location.hash = '#/innstillinger/media'; }); return true; }
  if (d.m50Retry) {
    const t = track50(d.m50Retry), a = t?.actions?.find((x) => x.id === 'retry');
    if (!a?.body) return true;
    try { const r = await api('/command', { method: 'POST', json: a.body }); startTrack50(r, { episodeIds: a.body.episodeIds ?? [], movieIds: a.body.movieIds ?? [] }); } catch (er) { alert50(er.message); }
    return true;
  }
  return false;
}
let toastFn = null;
export const onToast50 = (fn) => { toastFn = fn; };
const alert50 = (m) => { if (toastFn) toastFn(m); };
