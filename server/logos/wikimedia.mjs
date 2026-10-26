// Prompt 69: Wikidata og Wikimedia Commons for logo-jobben (fetch-logos.mjs og grow-nsi.mjs). Bare offentlige data:
// det som sendes, er kjedenavn, domener og Wikidata-id-er fra registeret, aldri brukerdata.
//
// Wikimedias regler for API-bruk (https://meta.wikimedia.org/wiki/User-Agent_policy, API:Etiquette):
//   - tydelig User-Agent med kontaktadresse (WM_UA), ikke en nettleser-UA
//   - maks én forespørsel om gangen per vert (kø per vert under), maxlag=5, og Retry-After respekteres ved 429/503
//   - hurtigbuffer: samme URL hentes bare én gang per kjøring, og entiteter hentes i bunker på 50 (wbgetentities)
// Logoen hentes som PNG fra Commons via Special:FilePath/<fil>?width=256, slik at SVG aldri må tolkes her.
import { normalize } from './match.js';

export const WM_UA = 'KristoHomelab-logos/1.0 (https://kristo.no; logo-jobb i GitHub Actions) node/' + process.versions.node;
export const WD_API = 'https://www.wikidata.org/w/api.php';
export const WD_SPARQL = 'https://query.wikidata.org/sparql';
export const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const TIMEOUT = 20_000;
// Logo-egenskapene i prioritert rekkefølge: logo image, small logo or icon, icon.
export const LOGO_PROPS = ['P154', 'P8972', 'P2910'];
const NORWAY = 'Q20';

let fetchImpl = (...a) => globalThis.fetch(...a);
let sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Til testene: bytt ut fetch (og ventingen), og tøm køer og hurtigbuffer. */
export function _setWikimediaFetch(f, { noSleep = true } = {}) {
  fetchImpl = f ?? ((...a) => globalThis.fetch(...a));
  if (noSleep) sleep = () => Promise.resolve();
  CACHE.clear(); ENT.clear(); QUEUE.clear(); stats.requests = 0;
}
export const stats = { requests: 0 };

/* ---------------- Kø per vert + hurtigbuffer ---------------- */

const QUEUE = new Map(); // vert → siste løfte i køen
const CACHE = new Map(); // url → løfte med { ok, status, json?, buf?, url }
function queued(host, job) {
  const prev = QUEUE.get(host) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(job);
  QUEUE.set(host, next.catch(() => {}));
  return next;
}

/** GET mot en Wikimedia-vert, én om gangen per vert og bufret. as: 'json' | 'buf'. */
export function wmGet(url, { as = 'json', accept } = {}) {
  const key = `${as} ${url}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const host = new URL(url).hostname;
  const p = queued(host, async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      stats.requests++;
      let r;
      try {
        r = await fetchImpl(url, { headers: { 'User-Agent': WM_UA, 'Api-User-Agent': WM_UA, Accept: accept ?? (as === 'json' ? 'application/json' : 'image/png,image/*;q=0.8') }, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT) });
      } catch (e) { return { ok: false, status: 0, error: e.message }; }
      if (r.status === 429 || r.status === 503) {
        await r.body?.cancel?.().catch(() => {});
        const wait = Math.min(30, Number(r.headers.get('retry-after')) || 5 * (attempt + 1));
        await sleep(wait * 1000);
        continue;
      }
      if (!r.ok) { await r.body?.cancel?.().catch(() => {}); return { ok: false, status: r.status, url: r.url || url }; }
      if (as === 'buf') return { ok: true, status: r.status, url: r.url || url, type: r.headers.get('content-type') ?? '', buf: Buffer.from(await r.arrayBuffer()) };
      let json;
      try { json = await r.json(); } catch { return { ok: false, status: r.status, error: 'ugyldig JSON' }; }
      // maxlag: serveren ber oss vente.
      if (json?.error?.code === 'maxlag') { await sleep(Math.min(30, Number(r.headers.get('retry-after')) || 5) * 1000); continue; }
      return { ok: true, status: r.status, url: r.url || url, json };
    }
    return { ok: false, status: 429, error: 'for mange forsøk' };
  });
  CACHE.set(key, p);
  return p;
}

const qs = (o) => new URLSearchParams({ format: 'json', formatversion: '2', maxlag: '5', ...o }).toString();

/* ---------------- Entiteter ---------------- */

const ENT = new Map(); // Qid → entitet eller null
const isQid = (q) => /^Q\d+$/.test(String(q ?? ''));

/** Henter entitetene (claims, labels, aliases, sitelinks ikke med) i bunker på 50. Returnerer Map Qid → entitet|null. */
export async function getEntities(ids) {
  const want = [...new Set(ids.filter(isQid))].filter((q) => !ENT.has(q));
  for (let i = 0; i < want.length; i += 50) {
    const chunk = want.slice(i, i + 50);
    const r = await wmGet(`${WD_API}?${qs({ action: 'wbgetentities', ids: chunk.join('|'), props: 'claims|labels|aliases', languages: 'nb|nn|no|en' })}`);
    const got = r.ok ? r.json?.entities ?? {} : {};
    for (const q of chunk) {
      const e = got[q];
      // Omdirigerte entiteter kommer tilbake under ny id; ta vare på begge.
      if (e && !e.missing) { ENT.set(q, e); if (e.id && e.id !== q) ENT.set(e.id, e); } else if (r.ok) ENT.set(q, null);
    }
  }
  return new Map(ids.filter(isQid).map((q) => [q, ENT.get(q) ?? null]));
}
export const getEntity = async (q) => (await getEntities([q])).get(q) ?? null;

// Verdiene for en egenskap: foretrukket rang først, aldri «deprecated».
export function claimValues(e, prop) {
  const cs = (e?.claims?.[prop] ?? []).filter((c) => c.rank !== 'deprecated' && c.mainsnak?.snaktype === 'value');
  cs.sort((a, b) => (b.rank === 'preferred') - (a.rank === 'preferred'));
  return cs.map((c) => c.mainsnak.datavalue?.value).filter((v) => v != null);
}
const qidsOf = (e, prop) => claimValues(e, prop).map((v) => v?.id).filter(Boolean);

/** Første logo i prioritert rekkefølge (P154 → P8972 → P2910): { prop, file } eller null. */
export function logoFile(e) {
  for (const prop of LOGO_PROPS) {
    const f = claimValues(e, prop).find((v) => typeof v === 'string' && v.trim());
    if (f) return { prop, file: f.trim() };
  }
  return null;
}

/** Offisielt nettsted (P856) som domene uten www., eller ''. Foretrukket rang, så .no foran andre. */
export function domainOf(e) {
  const hosts = claimValues(e, 'P856').map((u) => { try { return new URL(String(u)).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; } }).filter(Boolean);
  return hosts.find((h) => h.endsWith('.no')) ?? hosts[0] ?? '';
}
/** Fargen (P465, sRGB-heks) hvis Wikidata har den. */
export function colorOf(e) {
  const c = claimValues(e, 'P465').find((v) => /^[0-9a-f]{6}$/i.test(String(v)));
  return c ? `#${String(c).toUpperCase()}` : null;
}
export const inNorway = (e) => qidsOf(e, 'P17').includes(NORWAY) || qidsOf(e, 'P495').includes(NORWAY);
export function names(e) {
  const out = new Set();
  for (const l of Object.values(e?.labels ?? {})) out.add(normalize(l.value));
  for (const list of Object.values(e?.aliases ?? {})) for (const a of list) out.add(normalize(a.value));
  out.delete('');
  return out;
}

/** Commons: PNG-utgave av fila (Special:FilePath gir PNG for SVG med width). */
export const commonsPngUrl = (file, width = 256) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(String(file).replace(/ /g, '_'))}?width=${width}`;

/** Lisensene fra Commons (extmetadata LicenseShortName) for filene, i bunker på 50. Map fil → lisens|''. */
export async function commonsLicenses(files) {
  const out = new Map();
  const list = [...new Set(files.filter(Boolean))];
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    const r = await wmGet(`${COMMONS_API}?${qs({ action: 'query', prop: 'imageinfo', iiprop: 'extmetadata', iiextmetadatafilter: 'LicenseShortName', titles: chunk.map((f) => `File:${f}`).join('|') })}`);
    const pages = r.ok ? r.json?.query?.pages ?? [] : [];
    const norm = new Map((r.ok ? r.json?.query?.normalized ?? [] : []).map((n) => [n.to, n.from]));
    for (const p of pages) {
      const lic = p.imageinfo?.[0]?.extmetadata?.LicenseShortName?.value ?? '';
      const title = norm.get(p.title) ?? p.title;
      const f = String(title).replace(/^File:/, '');
      out.set(f, String(lic).replace(/<[^>]+>/g, '').trim());
      out.set(f.replace(/_/g, ' '), out.get(f));
    }
  }
  return out;
}

/* ---------------- Finne Wikidata-id når feltet er tomt ---------------- */

/** Wikidata-id via offisielt nettsted (P856), med SPARQL over de vanlige URL-variantene. */
export async function qidForDomain(domain) {
  const d = String(domain ?? '').toLowerCase().replace(/^www\./, '').trim();
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d)) return null;
  const urls = [];
  for (const proto of ['https', 'http']) for (const host of [d, `www.${d}`]) for (const tail of ['', '/']) urls.push(`<${proto}://${host}${tail}>`);
  const sparql = `SELECT ?item WHERE { VALUES ?u { ${urls.join(' ')} } ?item wdt:P856 ?u . } LIMIT 5`;
  const r = await wmGet(`${WD_SPARQL}?${new URLSearchParams({ query: sparql, format: 'json' })}`, { accept: 'application/sparql-results+json' });
  const ids = (r.ok ? r.json?.results?.bindings ?? [] : []).map((b) => String(b.item?.value ?? '').split('/').pop()).filter(isQid);
  if (!ids.length) return null;
  // Flere treff (morselskap og kjede): ta den med logo, helst i Norge.
  const ents = await getEntities(ids);
  const ranked = ids.map((q) => ents.get(q)).filter(Boolean).sort((a, b) => (!!logoFile(b) - !!logoFile(a)) || (inNorway(b) - inNorway(a)));
  return ranked[0]?.id ?? null;
}

/** Wikidata-id via navn: wbsearchentities (nb, så en), og kandidaten må ha navnet som etikett/alias og være norsk
 *  (P17/P495 Norge) eller ha domenet fra registeret. */
export async function qidForName(name, { domain = '' } = {}) {
  const want = normalize(name);
  if (!want || want.length < 2) return null;
  const seen = [];
  for (const lang of ['nb', 'en']) {
    const r = await wmGet(`${WD_API}?${qs({ action: 'wbsearchentities', search: name, language: lang, uselang: lang, type: 'item', limit: '7' })}`);
    for (const s of r.ok ? r.json?.search ?? [] : []) if (isQid(s.id) && !seen.includes(s.id)) seen.push(s.id);
  }
  if (!seen.length) return null;
  const ents = await getEntities(seen);
  const d = String(domain).toLowerCase().replace(/^www\./, '');
  for (const q of seen) {
    const e = ents.get(q);
    if (!e || !names(e).has(want)) continue;
    if (inNorway(e) || (d && domainOf(e) === d)) return e.id ?? q;
  }
  return null;
}
