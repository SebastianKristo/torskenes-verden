// NRK-nedlaster i Media (#/media/nrk). Snakker med nrk-dl (skjold-proxmox-media/apps/nrk-dl), som kjører bak en egen
// Gluetun-tunnel til en norsk Proton-server og lagrer rett i /data/media/{tv,movies,podcast} på Unraid.
//
// Serveroppsett (bare admin): Innstillinger → Integrasjoner → NRK-nedlaster: nrk_url + nrk_token. Tokenet brukes bare her
// på serveren og sendes aldri til nettleseren eller appene. Tilgang som resten av Media (mediaAllowed43).
//
//   GET    /api/media/nrk/status              → {configured, vpn:{ok,ip,land,feil}, komprimer:{standard,crf,preset}|null, mapper, tall, ledig, bibliotek}
//   GET    /api/media/nrk/jobber              → {configured, jobber:[…], folger:[…]}
//   POST   /api/media/nrk/jobber              {url, type, kvalitet, folg, komprimer?, episoder?:[url…], tittel?}
//   POST   /api/media/nrk/jobber/:id/avbryt | /igjen
//   DELETE /api/media/nrk/jobber/:id
//   POST   /api/media/nrk/rydd
//   POST   /api/media/nrk/folger              {url, type, kvalitet, tittel?, komprimer?}
//   POST   /api/media/nrk/folger/:id/sjekk
//   DELETE /api/media/nrk/folger/:id
//   GET    /api/media/nrk/bibliotek           → {configured, tilgjengelig, elementer:[{id,tittel,type,url,bilde,meta,sesonger:[{nr,episoder:[…]}]}], feil?}
//   GET    /api/media/nrk/serie?url=…         → {configured, tilgjengelig, element} (elementet ligger også flatt på toppnivå)
//   GET    /api/media/nrk/sok?q=…             → {configured, tilgjengelig, treff:[{art,id,tittel,beskrivelse,bilde,url,tilgjengelig}]}
//   GET    /api/media/nrk/bilde?u=…           → plakat fra NRK sine bildeverter (SSRF-vern, cache)
//
// Prompt 88: klientene (web, iOS, Android) bruker fortsatt /bibliotek, /serie?url= og «episoder» (lenker) i POST /jobber.
// nrk-dl (grenen «nrk-nedlaster» i skjold-proxmox-media, eller main etter fletting) har i stedet et katalog-API, og her
// oversettes det:
//   - /bibliotek  = seriene du følger og seriene i jobbene (nyeste først, høyst 25), hver bygd fra GET /api/serie/{sid}
//                   (cache 10 min) og GET /api/serie/{sid}/sesong/{navn} (cache 60 s, høyst 15 sesonger, høyst 6 kall
//                   samtidig), pluss ferdige film- og radiojobber. Status: lastetNed → lastet, iKo → ko, kan → mangler;
//                   episoder som ikke kan lastes ned (og ikke er lastet ned eller i kø) tas ikke med.
//   - /serie?url= = samme bygging for serie-id-en i lenken (også …/serie/x/sesong/3/episode/4).
//   - POST /jobber med episoder → POST /api/episoder {serie, episoder:[PRF-id-er], kvalitet, folg, komprimer?, tittel?}.
//   - /sok        = GET /api/sok?q=.
// Katalog-kallene krever norsk VPN i nrk-dl (ellers 503 {feil:"VPN er ikke klar: …"}). Om nrk-dl har katalogen, sjekkes
// med GET /api/sok?q=: 404/405 uten {feil} betyr «for gammel nrk-dl» → tilgjengelig:false (ikke en feil).
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
  if (!r.ok) throw Object.assign(new NrkFeil(tekstFeil(d?.feil) ?? `NRK-nedlasteren svarte ${r.status}`, r.status >= 400 && r.status < 500 ? r.status : 502), { fraNrk: tekstFeil(d?.feil) != null, nrkStatus: r.status });
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

const SERIE_ID = /^[a-z0-9][a-z0-9_-]{0,100}$/;
const PRF = /^[A-Za-z]{4}\d{8}$/;
const SESONG_NAVN = /^[A-Za-z0-9_-]{1,60}$/;
const EPISODELENKER = 'Episodene må være lenker til enkeltprogrammer på tv.nrk.no';
/** Serie-id fra en tv.nrk.no-lenke (…/serie/{sid}, også …/serie/{sid}/sesong/3/episode/4), ellers null. */
export function serieId(v) {
  let u;
  try { u = new URL(String(v ?? '')); } catch { return null; }
  if (u.hostname.toLowerCase() !== 'tv.nrk.no') return null;
  const d = u.pathname.split('/').filter(Boolean);
  const sid = d[0] === 'serie' ? String(d[1] ?? '').toLowerCase() : '';
  return SERIE_ID.test(sid) ? sid : null;
}
/** PRF-id (f.eks. MSUI12345678) fra en episodelenke: siste stisegment som ser ut som en PRF-id, med store bokstaver. */
export function prfId(v) {
  let u;
  try { u = new URL(String(v ?? '')); } catch { return null; }
  const d = u.pathname.split('/').filter(Boolean).reverse().find((x) => PRF.test(x));
  return d ? d.toUpperCase() : null;
}

/* ---------------- Bibliotek ---------------- */

// Har nrk-dl katalogen? Svaret huskes i 1 min, så status ikke spør på nytt hvert 10. sekund (og en nyere eller eldre
// nrk-dl oppdages innen et minutt; katalogsvarene i cachen brukes ikke når nrk-dl er for gammel).
let bib = { v: null, at: 0, url: '' };
const gammel = (e) => (e?.status === 404 || e?.status === 405) && !e.fraNrk;
function husk(v) { bib = { v, at: Date.now(), url: nrkConf().url }; return v; }
async function harBibliotek() {
  if (bib.v != null && bib.url === nrkConf().url && Date.now() - bib.at < 60_000) return bib.v;
  // Uten søkeord svarer nrk-dl {treff:[]} (eller 503 {feil} når VPN-en ikke er klar). Begge betyr at katalogen finnes.
  try { await nrkKall('/api/sok?q=', { timeout: 4000 }); return husk(true); } catch (e) {
    if (gammel(e)) return husk(false);
    if (e?.fraNrk) return husk(true); // f.eks. 503 {feil:"VPN er ikke klar: …"}: katalogen finnes
    return true; // treg eller annen feil: endepunktet finnes trolig; ikke husk svaret
  }
}
/** Bare for tester. */
export function _resetNrk() { bib = { v: null, at: 0, url: '' }; bilder.clear(); katalogCache.clear(); }

/* ---------------- Katalogen i nrk-dl ---------------- */

// Høyst 6 katalog-kall mot nrk-dl samtidig (alle forespørsler til sammen). En ledig plass gis rett videre til neste i køen.
const SAMTIDIG = 6;
let aktive = 0;
const venter = [];
async function begrenset(fn) {
  if (aktive < SAMTIDIG) aktive++; else await new Promise((r) => venter.push(r));
  try { return await fn(); } finally { const neste = venter.shift(); if (neste) neste(); else aktive--; }
}
// Svar fra katalogen: serien i 10 min, sesongene i 60 s (de har lastetNed/iKo, som endrer seg). Løpende kall deles.
const SERIE_TTL = 600_000, SESONG_TTL = 60_000, CACHE_ANTALL = 500;
const katalogCache = new Map(); // nrk-url|sti → {at, ttl, p}
function katalog(sti, ttl, frist) {
  const k = `${nrkConf().url}|${sti}`, c = katalogCache.get(k);
  if (c && Date.now() - c.at < c.ttl) return c.p;
  const p = begrenset(() => {
    if (Date.now() > frist) throw new NrkFeil('NRK-katalogen svarte ikke i tide', 504);
    return nrkKall(sti, { timeout: 15_000 });
  });
  katalogCache.set(k, { at: Date.now(), ttl, p });
  // «Fant ikke» fra nrk-dl huskes like lenge som et svar (en serie som er borte hos NRK); andre feil prøves på nytt.
  p.catch((e) => { if (!(e?.fraNrk && e.nrkStatus === 404) && katalogCache.get(k)?.p === p) katalogCache.delete(k); });
  while (katalogCache.size > CACHE_ANTALL) katalogCache.delete(katalogCache.keys().next().value);
  return p;
}
/** Etter at episoder er lagt i køen: sesongene til serien hentes på nytt (iKo/lastetNed). */
function glemSesonger(sid) {
  for (const k of katalogCache.keys()) if (k.includes(`|/api/serie/${sid}/sesong/`)) katalogCache.delete(k);
}

const EP_FRA_KATALOG = (e) => (e.lastetNed === true ? 'lastet' : e.iKo === true ? 'ko' : e.kan === true ? 'mangler' : null);
/** Én serie fra katalogen → bibliotek-elementet klientene kjenner (via element()). */
async function byggSerie(sid, frist) {
  const s = await katalog(`/api/serie/${sid}`, SERIE_TTL, frist);
  const alle = (Array.isArray(s?.sesonger) ? s.sesonger : []).filter((x) => x && typeof x === 'object');
  const valgte = alle.map((x, i) => ({ navn: String(x.navn ?? ''), i, ok: x.tilgjengelig !== false }))
    .filter((x) => x.ok && SESONG_NAVN.test(x.navn)).slice(-15); // de nyeste 15
  let forste = null;
  const hentet = await Promise.all(valgte.map(async (x) => {
    try { return { x, d: await katalog(`/api/serie/${sid}/sesong/${x.navn}`, SESONG_TTL, frist) }; } catch (e) {
      if (gammel(e)) throw e;
      forste ??= e;
      return null;
    }
  }));
  if (valgte.length && hentet.every((h) => !h)) throw forste; // ingen sesonger kom: serien feiler
  const brukt = new Set(), sesonger = [];
  for (const h of hentet) {
    if (!h) continue;
    const m = h.x.navn.match(/\d+/);
    let nr = m ? +m[0] : h.x.i + 1;
    if (brukt.has(nr)) { nr = h.x.i + 1; while (brukt.has(nr)) nr++; }
    brukt.add(nr);
    const episoder = (Array.isArray(h.d?.episoder) ? h.d.episoder : []).slice(0, 2000).map((e, j) => {
      if (!e || typeof e !== 'object' || !PRF.test(String(e.id ?? ''))) return null;
      const status = EP_FRA_KATALOG(e);
      if (!status) return null; // verken lastet ned, i kø eller tilgjengelig hos NRK
      const id = String(e.id).toUpperCase();
      return { nr: j + 1, tittel: tekst(e.tittel) || id, varighet: e.varighet, url: `https://tv.nrk.no/program/${id}`, status };
    }).filter(Boolean);
    sesonger.push({ nr, episoder });
  }
  const n = alle.length;
  const meta = [tekst(s?.kategori, 80), n ? `${n} ${n === 1 ? 'sesong' : 'sesonger'}` : ''].filter(Boolean).join(' · ');
  return element({ id: sid, tittel: tekst(s?.tittel) || sid, type: 'tv', url: `https://tv.nrk.no/serie/${sid}`, bilde: s?.plakat || s?.bilde, meta, beskrivelse: s?.beskrivelse, sesonger });
}
/** Ferdig film- eller radiojobb uten serie-id → enkeltelement med én rad. */
function jobbElement(j) {
  const url = nrkLenke(j.url), tittel = tekst(j.tittel) || url;
  if (!url || !tittel) return null;
  const fil = Array.isArray(j.filer) && typeof j.filer[0] === 'string' ? j.filer[0] : null;
  const rad = { nr: 1, tittel, url, fil, status: 'lastet' };
  return j.type === 'film'
    ? element({ id: url, tittel, type: 'film', url, meta: 'Film', fil, status: 'lastet' })
    : element({ id: url, tittel, type: 'radio', url, meta: 'Radio', sesonger: [{ nr: 1, episoder: [rad] }] });
}
const BYGG_FRIST = 20_000; // klientene venter 30–40 s på biblioteket

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
  const { tittel, ...v } = valg(b, { episoder: true, tittel: true });
  const json = { url: lenke(b.url), ...v, folg: b.folg === true };
  if (!json.episoder) return nrkKall('/api/jobber', { method: 'POST', json });
  // Episoder valgt i biblioteket → POST /api/episoder {serie, episoder:[PRF-id-er]} i nrk-dl (én jobb).
  const serie = serieId(json.url), ider = [...new Set(json.episoder.map(prfId))];
  if (!serie || ider.some((x) => !x)) throw new NrkFeil(EPISODELENKER, 400);
  // En eldre nrk-dl kjenner ikke /api/episoder, og /api/jobber ville lastet ned hele serien. Stopp her i stedet.
  if (!(await harBibliotek())) throw new NrkFeil(GAMMEL, 409);
  let svar;
  try { svar = await nrkKall('/api/episoder', { method: 'POST', json: { serie, ...(tittel ? { tittel } : {}), episoder: ider, kvalitet: json.kvalitet, ...('komprimer' in json ? { komprimer: json.komprimer } : {}), folg: json.folg } }); } catch (e) {
    if (gammel(e)) { husk(false); throw new NrkFeil(GAMMEL, 409); }
    throw e;
  }
  glemSesonger(serie);
  return svar;
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
  const TOM = { configured: true, tilgjengelig: false, elementer: [] };
  if (!(await harBibliotek())) return TOM;
  const d = await nrkKall('/api/jobber');
  const jobber = (Array.isArray(d.jobber) ? d.jobber : []).filter((j) => j && typeof j === 'object')
    .map((j, i) => ({ j, i })).sort((a, b) => (+b.j.opprettet || 0) - (+a.j.opprettet || 0) || a.i - b.i).map((x) => x.j);
  // Seriene: først de du følger, så de i jobbene (nyeste først).
  const lenker = [
    ...(Array.isArray(d.folger) ? d.folger : []).map((f) => f?.url),
    ...jobber.flatMap((j) => [j.url, ...(Array.isArray(j.urls) ? j.urls : [])]),
  ];
  const ider = [...new Set(lenker.map(serieId).filter(Boolean))].slice(0, 25);
  const frist = Date.now() + BYGG_FRIST;
  const res = await Promise.allSettled(ider.map((sid) => byggSerie(sid, frist)));
  if (res.some((r) => r.status === 'rejected' && gammel(r.reason))) { husk(false); return TOM; }
  husk(true);
  const elementer = res.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
  // Ferdige filmer og radioprogrammer (uten serie-id) som enkeltelementer.
  const sett = new Set();
  for (const j of jobber) {
    if (j.status !== 'ferdig' || (j.type !== 'film' && j.type !== 'radio') || serieId(j.url)) continue;
    const el = jobbElement(j);
    if (el && !sett.has(el.id)) { sett.add(el.id); elementer.push(el); }
  }
  const ut = { configured: true, tilgjengelig: true, elementer: elementer.slice(0, 2000) };
  const feilet = res.filter((r) => r.status === 'rejected').map((r) => r.reason);
  if (ider.length && feilet.length === ider.length && feilet.every((e) => e?.nrkStatus === 503)) {
    ut.feil = `Fikk ikke hentet seriene fra NRK. ${feilet[0].message}`.slice(0, 500);
  }
  return ut;
}));
nrkApi.get('/serie', ...G, H(async (c) => {
  const url = lenke(c.req.query('url'));
  if (!nrkConf().on) return { configured: false, message: IKKE_SATT, tilgjengelig: false };
  const sid = serieId(url);
  if (!sid) throw new NrkFeil('Bare serier fra tv.nrk.no kan vises', 404);
  if (!(await harBibliotek())) return { configured: true, tilgjengelig: false };
  let el;
  try { el = await byggSerie(sid, Date.now() + BYGG_FRIST); } catch (e) {
    if (gammel(e)) { husk(false); return { configured: true, tilgjengelig: false }; }
    throw e;
  }
  if (!el) throw new NrkFeil('Fant ikke serien hos NRK', 404);
  return { ...el, configured: true, tilgjengelig: true, element: el };
}));
const ART = new Set(['serie', 'film', 'episode', 'radio']);
nrkApi.get('/sok', ...G, H(async (c) => {
  const q = String(c.req.query('q') ?? '').trim().slice(0, 100);
  if (!nrkConf().on) return { configured: false, message: IKKE_SATT, tilgjengelig: false, treff: [] };
  let d;
  try { d = await nrkKall(`/api/sok?q=${encodeURIComponent(q)}`, { timeout: 15_000 }); } catch (e) {
    if (gammel(e)) { husk(false); return { configured: true, tilgjengelig: false, treff: [] }; }
    throw e;
  }
  const treff = (Array.isArray(d?.treff) ? d.treff : []).slice(0, 100).map((t) => {
    if (!t || typeof t !== 'object' || !ART.has(t.art)) return null;
    const tittel = tekst(t.tittel), url = nrkLenke(t.url);
    return tittel && url ? { art: t.art, id: tekst(t.id, 200), tittel, beskrivelse: tekst(t.beskrivelse, 500), bilde: bildeUrl(t.bilde), url, tilgjengelig: t.tilgjengelig !== false } : null;
  }).filter(Boolean);
  return { configured: true, tilgjengelig: true, treff };
}));
nrkApi.get('/bilde', ...G, async (c) => {
  try {
    const b = await bilde(c.req.query('u'));
    return new Response(b.buf, { headers: { 'Content-Type': b.type, 'Content-Length': String(b.buf.length), 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" } });
  } catch (e) { return c.json({ error: e.message }, e.status ?? 502); }
});
