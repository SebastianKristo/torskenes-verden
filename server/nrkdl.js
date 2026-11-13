// NRK-nedlaster i Media (#/media/nrk). Snakker med nrk-dl (skjold-proxmox-media/apps/nrk-dl), som kjører bak en egen
// Gluetun-tunnel til en norsk Proton-server og lagrer rett i /data/media/{tv,movies,podcast} på Unraid.
//
// Serveroppsett (bare admin): Innstillinger → Integrasjoner → NRK-nedlaster: nrk_url + nrk_token. Tokenet brukes bare her
// på serveren og sendes aldri til nettleseren eller appene. Tilgang som resten av Media (mediaAllowed43).
//
//   GET    /api/media/nrk/status              → {configured, vpn:{ok,ip,land,feil}, komprimer:{standard,crf,preset}|null, mapper, tall, ledig, bibliotek}
//   GET    /api/media/nrk/jobber              → {configured, jobber:[…], folger:[…]}
//   POST   /api/media/nrk/jobber              {url, type, kvalitet, folg, komprimer?, episoder?:[url…]}
//   POST   /api/media/nrk/jobber/:id/avbryt | /igjen
//   DELETE /api/media/nrk/jobber/:id
//   POST   /api/media/nrk/rydd
//   POST   /api/media/nrk/folger              {url, type, kvalitet, tittel?, komprimer?}
//   POST   /api/media/nrk/folger/:id/sjekk
//   DELETE /api/media/nrk/folger/:id
//   GET    /api/media/nrk/bibliotek           → {configured, tilgjengelig, elementer:[{id,tittel,type,url,bilde,meta,sesonger:[{nr,episoder:[…]}]}]}
//   GET    /api/media/nrk/serie?url=…         → {configured, tilgjengelig, element} (elementet ligger også flatt på toppnivå)
//   GET    /api/media/nrk/bilde?u=…           → plakat fra NRK sine bildeverter (SSRF-vern, cache)
//
// Prompt 87: bibliotek-endepunktene i nrk-dl (/api/bibliotek, /api/serie, «episoder» i POST) finnes kanskje ikke ennå.
// 404/405 uten {feil} fra nrk-dl på disse betyr «for gammel nrk-dl» → tilgjengelig:false (ikke en feil).
import { Hono } from 'hono';
import { authOrToken } from './mobile.js';
import { mediaAllowed43 } from './media43.js';
import { cfg } from './settings.js';
import { guardedGet46 } from './gphoto46.js';

const ID = /^[a-f0-9]{12}$/;
const NRK_HOST = /(^|\.)(nrk\.no|nrksuper\.no)$/i;
const TYPER = new Set(['auto', 'tv', 'film', 'radio']);
const KVAL = new Set(['best', '1080', '720', '540']);
const IKKE_SATT = 'NRK-nedlasteren er ikke satt opp. Innstillinger → Integrasjoner → NRK-nedlaster.';

let fetchImpl = (u, i) => fetch(u, i);
/** Bare for tester. */
export function _setFetchNrk(f) { fetchImpl = f ?? ((u, i) => fetch(u, i)); }

export function nrkConf() {
  const url = String(cfg('nrk_url') ?? '').trim().replace(/\/+$/, '');
  return { url, token: String(cfg('nrk_token') ?? '').trim(), on: /^https?:\/\/\S+$/.test(url) };
}

const tekstFeil = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : null);
class NrkFeil extends Error {
  constructor(msg, status = 502) { super(msg); this.status = status; }
}

/** Kall mot nrk-dl. Feil fra nrk-dl ({feil}) sendes videre med samme status; nettverksfeil blir 502 med norsk tekst. */
export async function nrkKall(sti, { method = 'GET', json, timeout = 10_000 } = {}) {
  const c = nrkConf();
  if (!c.on) throw new NrkFeil(IKKE_SATT, 503);
  let r;
  try {
    r = await fetchImpl(`${c.url}${sti}`, {
      method,
      headers: { Accept: 'application/json', ...(json ? { 'Content-Type': 'application/json' } : {}), ...(c.token ? { Authorization: `Bearer ${c.token}` } : {}) },
      ...(json ? { body: JSON.stringify(json) } : {}),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    throw new NrkFeil(e?.name === 'TimeoutError' ? 'NRK-nedlasteren svarte ikke i tide' : `Får ikke kontakt med NRK-nedlasteren (${e?.cause?.code ?? e?.name ?? 'feil'})`);
  }
  const d = await r.json().catch(() => null);
  if (r.status === 401) throw new NrkFeil('NRK-nedlasteren avviste tokenet. Sjekk tokenet under Innstillinger → Integrasjoner → NRK-nedlaster.', 502);
  if (!r.ok) throw Object.assign(new NrkFeil(tekstFeil(d?.feil) ?? `NRK-nedlasteren svarte ${r.status}`, r.status >= 400 && r.status < 500 ? r.status : 502), { fraNrk: tekstFeil(d?.feil) != null });
  return d ?? {};
}

/** Test tilkobling (Integrasjoner). */
export async function testNrk() {
  const c = nrkConf();
  if (!c.on) return { ok: false, code: 'missing', message: 'Mangler adresse' };
  const t0 = Date.now();
  try {
    const s = await nrkKall('/api/status');
    const v = s.vpn ?? {};
    if (!v.ok) return { ok: false, message: `Svarer, men VPN-en er ikke norsk: ${v.feil ?? 'ukjent'}` };
    return { ok: true, message: `✓ NRK-nedlaster svarte på ${Date.now() - t0} ms · VPN i ${v.land} (${v.ip}) · yt-dlp ${s.ytdlp ?? '?'}` };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

const H = (fn) => async (c) => {
  try { return c.json(await fn(c)); } catch (e) { return c.json({ error: e.message, ...(e.status === 503 ? { configured: false } : {}) }, e.status ?? 502); }
};
const guard = async (c, next) => {
  if (!mediaAllowed43(c.get('user'))) return c.json({ error: 'Du har ikke tilgang til Media. Be en administrator om tilgang.', restricted: true }, 403);
  await next();
};
const G = [authOrToken, guard];
const jb = async (c) => { const b = await c.req.json().catch(() => null); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };
const idOf = (c) => { const id = c.req.param('id'); if (!ID.test(id)) throw new NrkFeil('Ugyldig id', 400); return id; };
const BARE_NRK = 'Bare lenker fra nrk.no og nrksuper.no.';
const GAMMEL = 'Biblioteket krever en nyere versjon av nrk-dl.';

/** NRK-lenke (nrk.no / nrksuper.no med underdomener) → normalisert https-adresse, ellers null. */
export function nrkLenke(v) {
  let u;
  try { u = new URL(String(v ?? '').trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.port || !NRK_HOST.test(u.hostname)) return null;
  u.protocol = 'https:';
  return u.href.length <= 2000 ? u.href : null;
}
function lenke(v) { const u = nrkLenke(v); if (!u) throw new NrkFeil(BARE_NRK, 400); return u; }
/** type/kvalitet fra listene (utelatt = auto/best), komprimer bare når den er satt (boolean), tittel og episoder når de finnes. */
function valg(b, { tittel = false, episoder = false } = {}) {
  const ut = { type: 'auto', kvalitet: 'best' };
  if (b.type != null && b.type !== '') { if (!TYPER.has(b.type)) throw new NrkFeil('Ugyldig type', 400); ut.type = b.type; }
  if (b.kvalitet != null && b.kvalitet !== '') { if (!KVAL.has(String(b.kvalitet))) throw new NrkFeil('Ugyldig kvalitet', 400); ut.kvalitet = String(b.kvalitet); }
  if (b.komprimer != null) { if (typeof b.komprimer !== 'boolean') throw new NrkFeil('«komprimer» må være sann eller usann', 400); ut.komprimer = b.komprimer; }
  if (tittel && typeof b.tittel === 'string' && b.tittel.trim()) ut.tittel = b.tittel.trim().slice(0, 200);
  if (episoder && b.episoder != null) {
    if (!Array.isArray(b.episoder) || b.episoder.length > 200) throw new NrkFeil('«episoder» må være en liste med høyst 200 lenker', 400);
    const L = [...new Set(b.episoder.map(lenke))];
    if (L.length) ut.episoder = L;
  }
  return ut;
}

/* ---------------- Bibliotek ---------------- */

// Har nrk-dl bibliotek-endepunktene? Svaret huskes (ja: 10 min, nei: 1 min), så status ikke spør på nytt hvert 10. sekund.
let bib = { v: null, at: 0, url: '' };
const gammel = (e) => (e?.status === 404 || e?.status === 405) && !e.fraNrk;
function husk(v) { bib = { v, at: Date.now(), url: nrkConf().url }; return v; }
async function harBibliotek() {
  if (bib.v != null && bib.url === nrkConf().url && Date.now() - bib.at < (bib.v ? 600_000 : 60_000)) return bib.v;
  try { await nrkKall('/api/bibliotek', { timeout: 4000 }); return husk(true); } catch (e) {
    if (gammel(e)) return husk(false);
    return true; // treg eller annen feil: endepunktet finnes trolig; ikke husk svaret
  }
}
/** Bare for tester. */
export function _resetNrk() { bib = { v: null, at: 0, url: '' }; bilder.clear(); }

const tekst = (v, n = 300) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, n) : '');
/** Varighet fra nrk-dl (sekunder som tall, eller tekst som «42 min» / «1 t 32 min» / «1:32:00») → hele sekunder, ellers null. */
export function sekunder(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  const t = tekst(v, 40).toLowerCase();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(+t) || null;
  let m = t.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (m) return m[3] != null ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2];
  m = t.match(/^(?:(\d+)\s*t(?:imer?)?)?\s*(?:(\d+)\s*min(?:utter)?)?\s*(?:(\d+)\s*s(?:ek)?)?$/);
  const s = m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
  return s > 0 ? s : null;
}
/** Sekunder → «42 min» / «2 t 13 min» (tom tekst når varigheten er ukjent). */
export function varighetTekst(s) {
  if (!s) return '';
  const m = Math.max(1, Math.round(s / 60));
  return m >= 60 ? `${Math.floor(m / 60)} t ${m % 60} min` : `${m} min`;
}
const varighet = (v) => { const s = sekunder(v); return { varighet: s, varighetTekst: varighetTekst(s) }; };
const EP_STATUS = { lastet: 'lastet', ok: 'lastet', ferdig: 'lastet', laster: 'laster', kjorer: 'laster', ko: 'ko', mangler: 'mangler' };
const epStatus = (e) => EP_STATUS[String(e?.status ?? '').toLowerCase()] ?? (e?.fil ? 'lastet' : 'mangler');
const TYPE_INN = { tv: 'tv', serie: 'tv', film: 'film', movie: 'film', radio: 'radio', podkast: 'radio', podcast: 'radio' };
/** Adressen klientene henter plakaten fra (vår bildeproxy), eller null når bildet ikke ligger hos NRK. */
export function bildeUrl(v) {
  const u = nrkBilde(v);
  return u ? `/api/media/nrk/bilde?u=${encodeURIComponent(u)}` : null;
}
function nrkBilde(v) {
  let u;
  try { u = new URL(String(v ?? '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !NRK_HOST.test(u.hostname) || u.href.length > 1000) return null;
  return u.href;
}
/** Ett bibliotek-element fra nrk-dl → formen klientene får (bare kjente felter, begrenset størrelse). */
export function element(x) {
  if (!x || typeof x !== 'object') return null;
  const tittel = tekst(x.tittel), type = TYPE_INN[String(x.type ?? '').toLowerCase()] ?? 'tv', url = nrkLenke(x.url);
  if (!tittel) return null;
  const ep = (e) => ({ nr: Number.isFinite(+e?.nr) ? +e.nr : 0, tittel: tekst(e?.tittel), ...varighet(e?.varighet), url: nrkLenke(e?.url), fil: tekst(e?.fil, 500) || null, status: epStatus(e) });
  let sesonger = (Array.isArray(x.sesonger) ? x.sesonger : []).slice(0, 200)
    .map((s) => ({ nr: Number.isFinite(+s?.nr) ? +s.nr : 0, episoder: (Array.isArray(s?.episoder) ? s.episoder : []).slice(0, 2000).filter((e) => e && typeof e === 'object').map(ep) }))
    .filter((s) => s.episoder.length);
  // Film: alltid én rad, også når nrk-dl ikke sender sesonger for filmer.
  if (type === 'film' && !sesonger.length) sesonger = [{ nr: 1, episoder: [{ nr: 1, tittel, ...varighet(x.varighet), url, fil: tekst(x.fil, 500) || null, status: epStatus(x) }] }];
  return { id: tekst(x.id ?? url ?? tittel, 200), tittel, type, url, bilde: bildeUrl(x.bilde), meta: tekst(x.meta), beskrivelse: tekst(x.beskrivelse ?? x.desc, 1000), sesonger };
}

/* ---------------- Plakater ---------------- */

const BILDE_MAX = 5 * 1024 * 1024, BILDE_TTL = 24 * 3600_000, BILDE_ANTALL = 200;
const BILDE_TYPE = /^image\/(jpeg|png|webp|avif|gif)\b/i;
const bilder = new Map(); // url → {buf, type, at}
let bildeHent = (url) => guardedGet46(url, { hostOk: (u) => nrkBilde(u.href) != null, maxBytes: BILDE_MAX, accept: 'image/avif,image/webp,image/jpeg,image/png,image/*' });
/** Bare for tester: (url) → {buf, type}. */
export function _setBildeNrk(f) { bildeHent = f ?? ((url) => guardedGet46(url, { hostOk: (u) => nrkBilde(u.href) != null, maxBytes: BILDE_MAX, accept: 'image/*' })); }
async function bilde(v) {
  const url = nrkBilde(v);
  if (!url) throw new NrkFeil('Bare bilder fra NRK kan hentes', 400);
  const c = bilder.get(url);
  if (c && Date.now() - c.at < BILDE_TTL) { bilder.delete(url); bilder.set(url, c); return c; }
  let r;
  try { r = await bildeHent(url); } catch { throw new NrkFeil('Fikk ikke hentet bildet fra NRK', 502); }
  const type = String(r?.type ?? '').split(';')[0].trim().toLowerCase();
  if (!BILDE_TYPE.test(type) || !r.buf?.length) throw new NrkFeil('NRK svarte ikke med et bilde', 502);
  const ny = { buf: r.buf, type, at: Date.now() };
  bilder.set(url, ny);
  while (bilder.size > BILDE_ANTALL) bilder.delete(bilder.keys().next().value);
  return ny;
}

/* ---------------- Ruter ---------------- */

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o?.[k] !== undefined).map((k) => [k, o[k]]));
/** Status fra nrk-dl → bare feltene klientene trenger (aldri adresse, token eller ukjente felter). */
function statusUt(s, bibliotek) {
  const k = s.komprimer && typeof s.komprimer === 'object' ? { standard: s.komprimer.standard === true, crf: s.komprimer.crf ?? null, preset: s.komprimer.preset ?? null } : null;
  return { configured: true, vpn: pick(s.vpn ?? {}, ['ok', 'ip', 'land', 'feil']), komprimer: k, mapper: s.mapper ?? {}, tall: s.tall ?? {}, ledig: s.ledig ?? null, bibliotek, ...pick(s, ['ytdlp', 'medier', 'folgTimer', 'skrivbar']) };
}

export const nrkApi = new Hono();
nrkApi.get('/status', ...G, H(async () => {
  if (!nrkConf().on) return { configured: false, message: IKKE_SATT };
  const [s, b] = await Promise.all([nrkKall('/api/status'), harBibliotek()]);
  return statusUt(s, b);
}));
nrkApi.get('/jobber', ...G, H(async () => {
  if (!nrkConf().on) return { configured: false, message: IKKE_SATT, jobber: [], folger: [] };
  const d = await nrkKall('/api/jobber');
  return { configured: true, jobber: Array.isArray(d.jobber) ? d.jobber : [], folger: Array.isArray(d.folger) ? d.folger : [] };
}));
nrkApi.post('/jobber', ...G, H(async (c) => {
  const b = await jb(c);
  const json = { url: lenke(b.url), ...valg(b, { episoder: true }), folg: b.folg === true };
  // En eldre nrk-dl kjenner ikke «episoder» og ville lastet ned hele serien. Stopp her i stedet.
  if (json.episoder && !(await harBibliotek())) throw new NrkFeil(GAMMEL, 409);
  return nrkKall('/api/jobber', { method: 'POST', json });
}));
nrkApi.post('/jobber/:id/:handling{avbryt|igjen}', ...G, H(async (c) => nrkKall(`/api/jobber/${idOf(c)}/${c.req.param('handling')}`, { method: 'POST' })));
nrkApi.delete('/jobber/:id', ...G, H(async (c) => nrkKall(`/api/jobber/${idOf(c)}`, { method: 'DELETE' })));
nrkApi.post('/rydd', ...G, H(async () => nrkKall('/api/rydd', { method: 'POST' })));
nrkApi.post('/folger', ...G, H(async (c) => {
  const b = await jb(c);
  return nrkKall('/api/folger', { method: 'POST', json: { url: lenke(b.url), ...valg(b, { tittel: true }) } });
}));
nrkApi.post('/folger/:id/sjekk', ...G, H(async (c) => nrkKall(`/api/folger/${idOf(c)}/sjekk`, { method: 'POST' })));
nrkApi.delete('/folger/:id', ...G, H(async (c) => nrkKall(`/api/folger/${idOf(c)}`, { method: 'DELETE' })));

nrkApi.get('/bibliotek', ...G, H(async () => {
  if (!nrkConf().on) return { configured: false, message: IKKE_SATT, tilgjengelig: false, elementer: [] };
  let d;
  try { d = await nrkKall('/api/bibliotek', { timeout: 30_000 }); } catch (e) {
    if (gammel(e)) { husk(false); return { configured: true, tilgjengelig: false, elementer: [] }; }
    throw e;
  }
  husk(true);
  const L = Array.isArray(d) ? d : Array.isArray(d?.elementer) ? d.elementer : Array.isArray(d?.bibliotek) ? d.bibliotek : [];
  return { configured: true, tilgjengelig: true, elementer: L.slice(0, 2000).map(element).filter(Boolean) };
}));
nrkApi.get('/serie', ...G, H(async (c) => {
  const url = lenke(c.req.query('url'));
  if (!nrkConf().on) return { configured: false, message: IKKE_SATT, tilgjengelig: false };
  let d;
  try { d = await nrkKall(`/api/serie?url=${encodeURIComponent(url)}`, { timeout: 30_000 }); } catch (e) {
    if (gammel(e)) { husk(false); return { configured: true, tilgjengelig: false }; }
    throw e;
  }
  const el = element(Array.isArray(d) ? d[0] : d?.element ?? d);
  if (!el) throw new NrkFeil('Fant ikke serien hos NRK', 404);
  return { ...el, configured: true, tilgjengelig: true, element: el };
}));
nrkApi.get('/bilde', ...G, async (c) => {
  try {
    const b = await bilde(c.req.query('u'));
    return new Response(b.buf, { headers: { 'Content-Type': b.type, 'Content-Length': String(b.buf.length), 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" } });
  } catch (e) { return c.json({ error: e.message }, e.status ?? 502); }
});
