// NRK-nedlaster i Media (#/media/nrk). Snakker med nrk-dl (skjold-proxmox-media/apps/nrk-dl), som kjører bak en egen
// Gluetun-tunnel til en norsk Proton-server og lagrer rett i /data/media/{tv,movies,podcast} på Unraid.
//
// Serveroppsett (bare admin): Innstillinger → Integrasjoner → NRK-nedlaster: nrk_url + nrk_token. Tokenet brukes bare her
// på serveren og sendes aldri til nettleseren eller appene. Tilgang som resten av Media (mediaAllowed43).
//
//   GET    /api/media/nrk/status              → {configured, vpn:{ok,ip,land,feil}, ytdlp, ledig, tall, …}
//   GET    /api/media/nrk/jobber              → {configured, jobber:[…], folger:[…]}
//   POST   /api/media/nrk/jobber              {url, type, kvalitet, folg}
//   POST   /api/media/nrk/jobber/:id/avbryt | /igjen
//   DELETE /api/media/nrk/jobber/:id
//   POST   /api/media/nrk/rydd
//   POST   /api/media/nrk/folger              {url, type, kvalitet}
//   POST   /api/media/nrk/folger/:id/sjekk
//   DELETE /api/media/nrk/folger/:id
import { Hono } from 'hono';
import { authOrToken } from './mobile.js';
import { mediaAllowed43 } from './media43.js';
import { cfg } from './settings.js';

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
  if (!r.ok) throw new NrkFeil(d?.feil ?? `NRK-nedlasteren svarte ${r.status}`, r.status >= 400 && r.status < 500 ? r.status : 502);
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
function lenke(v) {
  let u;
  try { u = new URL(String(v ?? '').trim()); } catch { throw new NrkFeil('Lim inn en lenke fra tv.nrk.no eller radio.nrk.no', 400); }
  if (!/^https?:$/.test(u.protocol) || !NRK_HOST.test(u.hostname)) throw new NrkFeil('Bare lenker til tv.nrk.no, radio.nrk.no eller nrk.no', 400);
  return u.href;
}
const valg = (b) => ({ type: TYPER.has(b.type) ? b.type : 'auto', kvalitet: KVAL.has(String(b.kvalitet)) ? String(b.kvalitet) : 'best' });

export const nrkApi = new Hono();
nrkApi.get('/status', ...G, H(async () => {
  if (!nrkConf().on) return { configured: false, message: IKKE_SATT };
  return { configured: true, ...(await nrkKall('/api/status')) };
}));
nrkApi.get('/jobber', ...G, H(async () => {
  if (!nrkConf().on) return { configured: false, message: IKKE_SATT, jobber: [], folger: [] };
  return { configured: true, ...(await nrkKall('/api/jobber')) };
}));
nrkApi.post('/jobber', ...G, H(async (c) => {
  const b = await jb(c);
  return nrkKall('/api/jobber', { method: 'POST', json: { url: lenke(b.url), ...valg(b), folg: b.folg === true } });
}));
nrkApi.post('/jobber/:id/:handling{avbryt|igjen}', ...G, H(async (c) => nrkKall(`/api/jobber/${idOf(c)}/${c.req.param('handling')}`, { method: 'POST' })));
nrkApi.delete('/jobber/:id', ...G, H(async (c) => nrkKall(`/api/jobber/${idOf(c)}`, { method: 'DELETE' })));
nrkApi.post('/rydd', ...G, H(async () => nrkKall('/api/rydd', { method: 'POST' })));
nrkApi.post('/folger', ...G, H(async (c) => {
  const b = await jb(c);
  return nrkKall('/api/folger', { method: 'POST', json: { url: lenke(b.url), ...valg(b) } });
}));
nrkApi.post('/folger/:id/sjekk', ...G, H(async (c) => nrkKall(`/api/folger/${idOf(c)}/sjekk`, { method: 'POST' })));
nrkApi.delete('/folger/:id', ...G, H(async (c) => nrkKall(`/api/folger/${idOf(c)}`, { method: 'DELETE' })));
