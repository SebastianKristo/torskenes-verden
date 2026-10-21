// Prompt 44: Glimts eget nettsøk. Kildene prøves i rekkefølge (innstillingen web_order, standard openwebui,searxng,brave,ddg),
// hver med egen tidsgrense og feilhåndtering; feiler eller er en kilde tom, prøves neste.
//   1. Open WebUI (når adresse og nøkkel finnes): POST {url}/api/v1/retrieval/process/web/search med {queries:[q]} (0.6+) og
//      ellers {query:q} (eldre). Svaret leses tolerant: docs [{content, metadata:{source, title}}], items [{link, title, snippet}],
//      filenames [url] og collection_name. Gir endepunktet innhold uten lenker, brukes innholdet som det er.
//   2. SearXNG (searxng_url): GET /search?q=…&format=json&language=nb
//   3. Brave Search API (brave_key): GET https://api.search.brave.com/res/v1/web/search
//   4. DuckDuckGo HTML (https://html.duckduckgo.com/html/?q=) uten nøkkel, maks ett kall per 2 s (web_ddg = 0 slår den av).
// Resultat: 3–5 treff {title, url, snippet (≤ ca. 600 tegn), source, published?}, cache 10 min per søkeord.
// MOCK_DATA=1 (uten injisert fetch) gir faste mock-treff.
import { cfg } from './settings.js';

const MOCK = () => process.env.MOCK_DATA === '1';
let F = null;
/** Bare for tester: injiser fetch (null = global fetch). */
export const _setWebFetch = (fn) => { F = fn ?? null; cache.clear(); };
const fx = (u, i) => (F ?? globalThis.fetch)(u, i);
export const _webTest = { ddgGapMs: 2000, timeoutMs: 8000 };
export const WEB_TTL_MS = 10 * 60_000;
export const PROVIDERS = ['openwebui', 'searxng', 'brave', 'ddg'];
export const PROVIDER_NAME = { openwebui: 'Open WebUI', searxng: 'SearXNG', brave: 'Brave Search', ddg: 'DuckDuckGo', mock: 'Mock', cache: 'Mellomlager' };
const cache = new Map(); // nøkkel → {at, value}
export const clearWebCache = () => cache.clear();

const cfgOf = (k) => { try { return String(cfg(k) ?? '').trim(); } catch { return ''; } };
/** Innstillingene for nettsøket (ingen nøkler ut, bare satt/ikke satt). */
export function webSettings() {
  const order = cfgOf('web_order').split(',').map((x) => x.trim()).filter((x) => PROVIDERS.includes(x));
  const url = cfgOf('openwebui_url').replace(/\/+$/, ''), key = cfgOf('openwebui_key');
  return {
    order: order.length ? [...new Set(order)] : [...PROVIDERS],
    openwebui: { configured: !!(url && key) },
    searxng: { url: cfgOf('searxng_url').replace(/\/+$/, '') || null },
    brave: { configured: !!cfgOf('brave_key') },
    ddg: { on: cfgOf('web_ddg') !== '0' },
  };
}

/* ---------------- Hjelpere ---------------- */

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'", '#x2F': '/' };
export const decodeHtml = (s) => String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
  if (ENT[e] !== undefined) return ENT[e];
  if (/^#x/i.test(e)) return String.fromCodePoint(parseInt(e.slice(2), 16));
  if (/^#\d/.test(e)) return String.fromCodePoint(+e.slice(1));
  return m;
});
const plain = (s) => decodeHtml(String(s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
/** Avkortet utdrag (ca. 600 tegn, helst ved et ordskille). */
export function clip(s, n = 600) {
  const t = plain(s);
  if (t.length <= n) return t;
  const cut = t.slice(0, n), sp = cut.lastIndexOf(' ');
  return `${(sp > n * 0.7 ? cut.slice(0, sp) : cut).trim()} …`;
}
const SOURCES = [[/(^|\.)nrk\.no$/, 'NRK'], [/(^|\.)vg\.no$/, 'VG'], [/(^|\.)aftenposten\.no$/, 'Aftenposten'], [/(^|\.)dn\.no$/, 'DN'], [/(^|\.)e24\.no$/, 'E24'],
  [/(^|\.)tv2\.no$/, 'TV 2'], [/(^|\.)dagbladet\.no$/, 'Dagbladet'], [/(^|\.)regjeringen\.no$/, 'Regjeringen'], [/(^|\.)snl\.no$/, 'Store norske leksikon'],
  [/(^|\.)bbc\.(co\.uk|com)$/, 'BBC'], [/(^|\.)theguardian\.com$/, 'The Guardian'], [/(^|\.)reuters\.com$/, 'Reuters'], [/(^|\.)apnews\.com$/, 'AP'],
  [/(^|\.)gov\.uk$/, 'GOV.UK'], [/(^|\.)wikipedia\.org$/, 'Wikipedia'], [/(^|\.)yr\.no$/, 'Yr'], [/(^|\.)ssb\.no$/, 'SSB']];
/** Kort kildenavn fra adressen (nrk.no → NRK). */
export function sourceOf(url, fallback = '') {
  let host = '';
  try { host = new URL(String(url)).hostname.replace(/^www\./, '').toLowerCase(); } catch { return fallback || ''; }
  for (const [re, n] of SOURCES) if (re.test(host)) return n;
  return host || fallback;
}
function hit(h, provider) {
  const url = String(h.url ?? h.link ?? h.href ?? h.source ?? '').trim();
  const okUrl = /^https?:\/\//i.test(url) ? url : '';
  const title = plain(h.title ?? h.name ?? '') || (okUrl ? sourceOf(okUrl) : '') || 'Uten tittel';
  const snippet = clip(h.snippet ?? h.content ?? h.description ?? h.text ?? h.page_content ?? '');
  const pub = h.published ?? h.publishedDate ?? h.page_age ?? h.age ?? h.date ?? null;
  return { title: title.slice(0, 200), url: okUrl, snippet, source: okUrl ? sourceOf(okUrl, PROVIDER_NAME[provider]) : (h.sourceName ?? PROVIDER_NAME[provider]), ...(pub ? { published: String(pub).slice(0, 40) } : {}) };
}
const dedupe = (list) => { const seen = new Set(); return list.filter((h) => { const k = h.url || h.title + h.snippet.slice(0, 40); if (seen.has(k)) return false; seen.add(k); return !!(h.snippet || h.url); }); };
const keyOf = (q) => String(q ?? '').toLowerCase().replace(/[?!.]+$/g, '').replace(/\s+/g, ' ').trim();
const timeout = (signal) => (signal ? AbortSignal.any([signal, AbortSignal.timeout(_webTest.timeoutMs)]) : AbortSignal.timeout(_webTest.timeoutMs));
const mask = (s) => String(s ?? '').replace(/\bsk-[A-Za-z0-9_\-.]{4,}/g, 'sk-••••').replace(/(Bearer\s+)\S+/gi, '$1••••');

/* ---------------- Kildene ---------------- */

/** Tolker svaret fra Open WebUI web/search tolerant. */
export function parseOpenWebui(j) {
  const out = [];
  const docs = j?.docs ?? j?.data?.docs ?? j?.results ?? [];
  for (const d of Array.isArray(docs) ? docs : []) {
    const md = d?.metadata ?? {};
    out.push(hit({ title: md.title ?? d.title, url: md.source ?? md.link ?? md.url ?? d.url ?? d.link, content: d.content ?? d.page_content ?? d.snippet, published: md.published ?? md.date }, 'openwebui'));
  }
  for (const it of Array.isArray(j?.items) ? j.items : []) out.push(hit({ title: it.title, url: it.link ?? it.url, snippet: it.snippet ?? it.content }, 'openwebui'));
  // Bare filnavn (lenker) uten innhold: lenkene er bedre enn ingenting.
  if (!out.length && Array.isArray(j?.filenames)) for (const f of j.filenames) out.push(hit({ url: f, title: sourceOf(f), snippet: '' }, 'openwebui'));
  return dedupe(out);
}
async function viaOpenWebui(q, signal) {
  const url = cfgOf('openwebui_url').replace(/\/+$/, ''), key = cfgOf('openwebui_key');
  if (!url || !key) return { skip: 'ikke satt opp' };
  let last = null;
  for (const body of [{ queries: [q] }, { query: q }]) {
    const r = await fx(`${url}/api/v1/retrieval/process/web/search`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal: timeout(signal) });
    if (r.status === 400 || r.status === 422) { last = `HTTP ${r.status}`; await r.text().catch(() => ''); continue; } // feil skjema: prøv det andre
    if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(mask(`Open WebUI svarte ${r.status}${t ? `: ${t.slice(0, 120)}` : ''}`).split(key).join('sk-••••')); }
    return { hits: parseOpenWebui(await r.json().catch(() => ({}))) };
  }
  throw new Error(`Open WebUI godtok ikke søket (${last})`);
}
async function viaSearxng(q, signal) {
  const base = cfgOf('searxng_url').replace(/\/+$/, '');
  if (!base) return { skip: 'ingen adresse' };
  const r = await fx(`${base}/search?q=${encodeURIComponent(q)}&format=json&language=nb`, { headers: { accept: 'application/json' }, signal: timeout(signal) });
  if (!r.ok) throw new Error(`SearXNG svarte ${r.status}`);
  const j = await r.json();
  return { hits: dedupe((j.results ?? []).map((x) => hit({ title: x.title, url: x.url, content: x.content, published: x.publishedDate }, 'searxng'))) };
}
async function viaBrave(q, signal) {
  const key = cfgOf('brave_key');
  if (!key) return { skip: 'ingen nøkkel' };
  const r = await fx(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5&search_lang=nb`, { headers: { accept: 'application/json', 'X-Subscription-Token': key }, signal: timeout(signal) });
  if (!r.ok) throw new Error(`Brave svarte ${r.status}`);
  const j = await r.json();
  return { hits: dedupe((j.web?.results ?? []).map((x) => hit({ title: x.title, url: x.url, description: x.description, published: x.page_age ?? x.age }, 'brave'))) };
}
let ddgAt = 0;
/** DuckDuckGo HTML: titler (result__a), lenker (uddg=…) og utdrag (result__snippet). */
export function parseDdg(html) {
  const out = [];
  const blocks = String(html ?? '').split(/<div[^>]+class="[^"]*\bresult\b[^"]*"/i).slice(1);
  for (const b of blocks) {
    if (/result--ad\b/.test(b.slice(0, 200))) continue;
    const a = b.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    let href = decodeHtml(a[1]);
    const u = href.match(/[?&]uddg=([^&]+)/);
    if (u) { try { href = decodeURIComponent(u[1]); } catch { /* */ } }
    if (href.startsWith('//')) href = `https:${href}`;
    if (/duckduckgo\.com\/y\.js/.test(href)) continue; // annonser
    const sn = b.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/i);
    out.push(hit({ title: a[2], url: href, snippet: sn?.[1] ?? '' }, 'ddg'));
  }
  return dedupe(out);
}
async function viaDdg(q, signal) {
  if (cfgOf('web_ddg') === '0') return { skip: 'slått av' };
  const wait = ddgAt + _webTest.ddgGapMs - Date.now(); // vær snill: maks ett kall per 2 s
  if (wait > 0) await new Promise((r) => setTimeout(r, Math.min(wait, _webTest.ddgGapMs)));
  ddgAt = Date.now();
  const r = await fx(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=no-no`, { headers: { 'user-agent': 'Mozilla/5.0 (Nordlys OS; Glimt)', accept: 'text/html' }, signal: timeout(signal) });
  if (!r.ok) throw new Error(`DuckDuckGo svarte ${r.status}`);
  return { hits: parseDdg(await r.text()) };
}
const VIA = { openwebui: viaOpenWebui, searxng: viaSearxng, brave: viaBrave, ddg: viaDdg };

/** Faste mock-treff (MOCK_DATA=1). */
export function mockHits(q) {
  const t = keyOf(q);
  return [
    { title: `Mock-treff om «${t}»`, url: 'https://www.nrk.no/mock/1', snippet: `Dette er et fast mock-treff for «${t}» (MOCK_DATA=1). Med ekte søk står et utdrag fra nettsiden her.`, source: 'NRK', published: '2026-10-21' },
    { title: `Mer om «${t}»`, url: 'https://snl.no/mock', snippet: `Et nytt mock-treff for «${t}» fra et oppslagsverk.`, source: 'Store norske leksikon' },
    { title: `«${t}» – bakgrunn`, url: 'https://www.bbc.co.uk/news/mock', snippet: `Et tredje mock-treff for «${t}».`, source: 'BBC' },
  ];
}

/**
 * Søker på nettet. → {query, hits:[{title, url, snippet, source, published?}], provider, providerName, tried:[{provider, ok, n?, skip?, error?, ms}], cached, ms}
 * Kaster aldri; uten treff er hits [] og provider null.
 */
export async function webSearch(query, { signal = null, max = 5, order = null } = {}) {
  const q = String(query ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const t0 = Date.now();
  if (!q) return { query: q, hits: [], provider: null, providerName: null, tried: [], cached: false, ms: 0 };
  const key = keyOf(q);
  const c = cache.get(key);
  if (c && Date.now() - c.at < WEB_TTL_MS) return { ...c.value, cached: true, ms: Date.now() - t0 };
  if (MOCK() && !F) {
    const value = { query: q, hits: mockHits(q).slice(0, max), provider: 'mock', providerName: PROVIDER_NAME.mock, tried: [{ provider: 'mock', ok: true, n: 3, ms: 0 }] };
    cache.set(key, { at: Date.now(), value });
    return { ...value, cached: false, ms: Date.now() - t0 };
  }
  const tried = [];
  // Tester uten injisert fetch går aldri ut på nettet (SearXNG/Brave/DuckDuckGo); Open WebUI er lokal og kan være falsk.
  const offline = process.env.NODE_ENV === 'test' && !F;
  for (const p of order ?? webSettings().order) {
    if (signal?.aborted) break;
    if (offline && p !== 'openwebui') { tried.push({ provider: p, ok: false, skip: 'av i tester', ms: 0 }); continue; }
    const ta = Date.now();
    try {
      const r = await VIA[p](q, signal);
      if (r.skip) { tried.push({ provider: p, ok: false, skip: r.skip, ms: 0 }); continue; }
      const hits = (r.hits ?? []).slice(0, Math.max(3, Math.min(5, max)));
      tried.push({ provider: p, ok: hits.length > 0, n: hits.length, ms: Date.now() - ta });
      if (!hits.length) continue;
      const value = { query: q, hits, provider: p, providerName: PROVIDER_NAME[p], tried };
      cache.set(key, { at: Date.now(), value });
      return { ...value, cached: false, ms: Date.now() - t0 };
    } catch (e) {
      tried.push({ provider: p, ok: false, error: mask(String(e?.name === 'TimeoutError' ? 'svarte ikke i tide' : e?.cause?.code || e?.message || e)).slice(0, 160), ms: Date.now() - ta });
    }
  }
  return { query: q, hits: [], provider: null, providerName: null, tried, cached: false, ms: Date.now() - t0 };
}

/* ---------------- Til modellen og klientene ---------------- */

export const WEB_RULE = 'Svar ut fra søkeresultatene, ikke fra det du lærte i treningen. Kunnskapen din kan være utdatert. Oppgi kilden kort, f.eks. (NRK). Er resultatene uklare eller motstridende, si det.';
/** Blokken i systemprompten: «Søkeresultater (hentet nå): [1] tittel – kilde – dato – utdrag …» + regelen. */
export function webPrompt(r) {
  if (!r?.hits?.length) return '';
  const lines = r.hits.map((h, i) => `[${i + 1}] ${h.title} – ${h.source || 'ukjent kilde'}${h.published ? ` – ${h.published}` : ''} – ${h.snippet}${h.url ? ` (${h.url})` : ''}`);
  return `Søkeresultater (hentet nå) for «${r.query}»:\n${lines.join('\n')}\n${WEB_RULE}`;
}
/** meta.web til klientene (kildene kan vises): {query, hits:[{title, url, source}], provider} */
export const webMeta = (r) => ({ query: r.query, hits: r.hits.map((h) => ({ title: h.title, url: h.url, source: h.source })), provider: r.provider });
/** Faktakort (prompt 41-formen) for nettsøket. */
export function webFact(r) {
  const h = r.hits[0];
  return { tool: 'web', place: r.query, country: '', when: 'nå', window: 'hentet nå', label: `${r.hits.length} treff · ${PROVIDER_NAME[r.provider] ?? r.provider}`, values: { hits: webMeta(r).hits },
    source: h.source || PROVIDER_NAME[r.provider], provider: r.provider, query: r.query, url: h.url || null,
    text: `Ifølge søkeresultatene: ${h.snippet.replace(/\s*…$/, '')} (${h.source || PROVIDER_NAME[r.provider]}).` };
}
