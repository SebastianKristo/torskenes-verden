// Prompt 46 (SERVER46): Nyheter – serverdelen av
//   claude-code-nyheter-egne-kategorier-for-deg.md   (egne kategorier + personlig fane «For deg»)
//   claude-code-nyheter-kilder-favicon-dropdown.md   (favicon på kildene, kategori som nedtrekksmeny)
//   claude-code-nyheter-sammendrag-per-kategori.md   (Glimt-sammendrag øverst i hver kategori, cache per kategori)
//   claude-code-nyheter-innstillinger-flytt.md       (Innstillinger → Nyheter: GET /api/rss/settings med alt på ett sted)
// Rutene monteres inne i /api/rss (rss.js, sesjon eller app-token, per bruker) – unntatt favicon, som er offentlig men BARE for
// domener som finnes i en brukers kildeliste (ingen åpen proxy). Alt lagres per bruker i kv: news_categories, news_interests,
// news46_reads (lesehistorikk), news46_sum:<kategori> (sammendrag).
//
//   GET    /api/rss/categories → {standard:[{id,name}], custom:[{id,name,keywords[],icon,order}], forYou:{id:'for-deg',name:'For deg',icon},
//                                 tabs:[{id,name,icon,kind:'std'|'for-deg'|'custom'}], options:[{id,name}] (kildenes nedtrekksmeny), interests:[…]}
//   POST   /api/rss/categories {name, keywords?:[…]|'a, b', icon?} → 201 {category, categories} · 409 navnet finnes · 400 uten navn
//   PATCH  /api/rss/categories/:id {name?, keywords?, icon?, order?} → {category, categories}
//   DELETE /api/rss/categories/:id → {ok, movedFeeds, categories} (kilder på kategorien settes til Auto)
//   PUT    /api/rss/categories/order {ids:[…]} → {categories}
//   GET    /api/rss/interests → {interests:[…], suggestions:[…]} · PUT {interests:[…]} · POST {word} · DELETE /api/rss/interests/:word
//   GET    /api/rss/foryou?limit=30 → {items:[sak + score, matched:[ord]], interests, suggestions, ranked:'glimt'|'regler'}
//   POST   /api/rss/read {id, ms?} → {ok} (lesehistorikk for «For deg»: åpnede saker, lesetid, kilder)
//   GET    /api/rss/summary?cat=siste|norge|…|for-deg|<egen id> → {cat, hidden:false, points:[{text, ref, url, source}], text, count,
//            updatedAt, updatedText:'oppdatert kl. 14:05', engine:'glimt'|'lokal', stale, generating} · {hidden:true, reason} (< 3 saker / av)
//            «siste» = dagens felles sammendrag. Lages i bakgrunnen, én om gangen (forrang for kategorien som vises), og på nytt
//            ved ≥ 3 nye saker eller etter 30 min. Ingen tom boks: uten cache svarer den {pending:true, skeleton:true}.
//   GET    /api/rss/settings → {settings, feeds, categories, interests} (Innstillinger → Nyheter; samme lagring som før)
//   GET    /api/rss/favicon?domain=vg.no | ?feed=<id> → bilde (cache 30 d på disk) · 404 (klienten viser bokstavene)
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { join, resolve } from 'node:path';
import { db, kv } from './db.js';
import { config } from './config.js';
import { aiJson } from './homeos-common.js';
import { isPrivateIp46 } from './public-url46.js';
import { interestMatchesTopics53 } from './dal53/topics.js'; // prompt 53 (DAL53): interesser treffer også Gist-emner

const MOCK = () => process.env.MOCK_DATA === '1';
const STD = ['norge', 'verden', 'okonomi', 'sport', 'teknologi', 'kultur'];
const FOR_YOU = { id: 'for-deg', name: 'For deg', icon: 'lucide:sparkles', glyph: '✦' };

/* ---------------- Egne kategorier ---------------- */

const slug = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
const kwList = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x) => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 30);
const ICON_RE = /^[a-z][\w-]{0,20}:[\w-]{1,40}$/;
export const customOf46 = (user) => { const v = kv.get(user, 'news_categories', []); return (Array.isArray(v) ? v : []).filter((x) => x && typeof x.id === 'string').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); };
export const customIds46 = (user) => customOf46(user).map((c) => c.id);
const saveCustom = (user, list) => kv.set(user, 'news_categories', list.map((c, i) => ({ ...c, order: i })));
const nameTaken = (user, name, exceptId = null, stdNames = []) => {
  const n = String(name).trim().toLowerCase();
  return stdNames.some((s) => s.toLowerCase() === n) || n === FOR_YOU.name.toLowerCase() || customOf46(user).some((c) => c.id !== exceptId && c.name.toLowerCase() === n);
};
/** Treffer saken en egen kategori? (kilden står på kategorien, eller tittel/ingress har et nøkkelord) */
export function inCustom46(item, cat) {
  if (item.feedCategory === cat.id || item.category === cat.id) return true;
  const t = `${item.title ?? ''} ${item.excerpt ?? ''}`.toLowerCase();
  return (cat.keywords ?? []).some((k) => k && new RegExp(`(^|[^\\p{L}\\p{N}])${k.toLowerCase().replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`, 'u').test(t));
}
/** Fanene og nedtrekksmenyen for kildene. */
export function categoriesOut46(user, CATEGORIES) {
  const standard = CATEGORIES.map(({ id, name }) => ({ id, name }));
  const custom = customOf46(user).map(({ id, name, keywords, icon, order }) => ({ id, name, keywords: keywords ?? [], icon: icon ?? 'lucide:tag', order: order ?? 0 }));
  const tabs = [{ ...standard[0], kind: 'std' }, { ...FOR_YOU, kind: 'for-deg' }, ...standard.slice(1).map((c) => ({ ...c, kind: 'std' })), ...custom.map((c) => ({ id: c.id, name: c.name, icon: c.icon, kind: 'custom' }))];
  const options = [{ id: 'auto', name: '✦ Auto' }, ...standard.slice(1), ...custom.map(({ id, name }) => ({ id, name }))];
  return { standard, custom, forYou: FOR_YOU, tabs, options, interests: interestsOf46(user), hint: 'Velg kategori per kilde' };
}

/* ---------------- Interesser og lesehistorikk ---------------- */

export const interestsOf46 = (user) => { const v = kv.get(user, 'news_interests', []); return (Array.isArray(v) ? v : []).map((x) => (typeof x === 'string' ? x : x?.word)).filter(Boolean).slice(0, 40); };
const setInterests = (user, words) => { const seen = new Set(), out = []; for (const w of words) { const t = String(w ?? '').trim().slice(0, 40); if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); } } kv.set(user, 'news_interests', out.slice(0, 40)); return out.slice(0, 40); };
const readsOf = (user) => { const v = kv.get(user, 'news46_reads', []); return Array.isArray(v) ? v : []; };
function logRead(user, item, ms) {
  const list = readsOf(user).filter((r) => r.id !== item.id);
  list.unshift({ id: item.id, feedId: item.feedId, title: String(item.title ?? '').slice(0, 200), ms: Math.max(0, Math.min(3_600_000, +ms || 0)), at: Date.now() });
  kv.set(user, 'news46_reads', list.slice(0, 300));
}
const STOP = new Set(['og', 'i', 'på', 'til', 'for', 'med', 'som', 'av', 'er', 'det', 'en', 'et', 'den', 'de', 'har', 'om', 'fra', 'etter', 'ikke', 'kan', 'vil', 'skal', 'nå', 'nye', 'ny', 'mer', 'slik', 'dette', 'han', 'hun', 'the', 'and', 'of', 'to', 'in']);
/** Forslag til nye interesser fra det man leser (ord med stor forbokstav eller «Bodø/Glimt»-form som går igjen). */
export function suggestions46(user) {
  const have = new Set(interestsOf46(user).map((x) => x.toLowerCase()));
  const count = new Map();
  for (const r of readsOf(user).slice(0, 120)) {
    for (const m of String(r.title).matchAll(/\b([A-ZÆØÅ][\p{L}\d]+(?:[/-][A-ZÆØÅ]?[\p{L}\d]+)?)\b/gu)) {
      const w = m[1];
      if (w.length < 3 || STOP.has(w.toLowerCase()) || have.has(w.toLowerCase())) continue;
      count.set(w, (count.get(w) ?? 0) + 1 + (r.ms > 60_000 ? 1 : 0));
    }
  }
  return [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w);
}
const wordRe = (w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w.toLowerCase().replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`, 'u');
/** «For deg»: saker som matcher en interesse, rangert etter interesser, lesehistorikk (kilder man åpner mest) og ferskhet. Maks 30. */
export function forYou46(user, all, { limit = 30, now = Date.now() } = {}) {
  const words = interestsOf46(user);
  const reads = readsOf(user);
  const feedAff = new Map();
  for (const r of reads.slice(0, 200)) feedAff.set(r.feedId, (feedAff.get(r.feedId) ?? 0) + 1 + Math.min(3, (r.ms ?? 0) / 60_000));
  const readIds = new Set(reads.map((r) => r.id));
  const scored = [];
  for (const it of all) {
    const title = String(it.title ?? '').toLowerCase(), ex = String(it.excerpt ?? '').toLowerCase();
    const matched = words.filter((w) => wordRe(w).test(title) || wordRe(w).test(ex) || interestMatchesTopics53(w, it.topics)); // prompt 53: + Gist-emner
    if (!matched.length) continue;
    const s = matched.reduce((a, w) => a + (wordRe(w).test(title) ? 3 : 1), 0) + Math.log1p(feedAff.get(it.feedId) ?? 0)
      - Math.max(0, (now - (Date.parse(it.published) || now)) / 3_600_000) / 24 - (readIds.has(it.id) ? 1.5 : 0);
    scored.push({ ...it, score: Math.round(s * 100) / 100, matched });
  }
  scored.sort((a, b) => b.score - a.score);
  // Glimt-rangeringen (bakgrunn) brukes når den hører til de samme sakene.
  const rk = kv.get(user, 'news46_rank', null);
  const key = scored.slice(0, 40).map((x) => x.id).join(',');
  if (rk?.key === key && Array.isArray(rk.order)) {
    const pos = new Map(rk.order.map((id, i) => [id, i]));
    scored.sort((a, b) => (pos.get(a.id) ?? 999) - (pos.get(b.id) ?? 999));
    return { items: scored.slice(0, limit), ranked: 'glimt' };
  }
  if (scored.length > 3 && !MOCK()) queueRank(user, scored.slice(0, 40), key);
  return { items: scored.slice(0, limit), ranked: 'regler' };
}
const RANK_SCHEMA = { type: 'OBJECT', properties: { order: { type: 'ARRAY', items: { type: 'INTEGER' } } }, required: ['order'] };
const rankBusy = new Set();
function queueRank(user, items, key) {
  if (rankBusy.has(user)) return;
  rankBusy.add(user);
  enqueue(async () => {
    try {
      const r = await aiJson(`Ranger nyhetssakene etter hvor interessante de er for en leser med interessene: ${interestsOf46(user).join(', ')}. Saker leseren har åpnet nylig: ${readsOf(user).slice(0, 10).map((x) => x.title).join(' | ')}.
Svar med JSON {"order":[id, …]} (alle id-ene, mest interessant først). Saker: ${JSON.stringify(items.map((x) => ({ id: x.id, title: x.title })))}`, RANK_SCHEMA, { task: 'categorize', timeout: 60_000 });
      const order = (r.data?.order ?? []).filter((id) => items.some((x) => x.id === id));
      if (order.length) kv.set(user, 'news46_rank', { key, order, at: Date.now() });
    } catch { /* regler holder */ } finally { rankBusy.delete(user); }
  });
}

/* ---------------- Sammendrag per kategori ---------------- */

const SUM_TTL = 30 * 60_000, SUM_MIN = 3, SUM_MAX = 15;
const queue = [];
let running = false;
function enqueue(fn, front = false) { if (front) queue.unshift(fn); else queue.push(fn); pump(); }
async function pump() {
  if (running) return;
  running = true;
  try { while (queue.length) { const fn = queue.shift(); try { await fn(); } catch { /* neste */ } } } finally { running = false; }
}
const pending = new Set();
const hmOslo = (t) => new Date(t).toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' });
const SUM_SCHEMA = { type: 'OBJECT', properties: { points: { type: 'ARRAY', items: { type: 'OBJECT', properties: { text: { type: 'STRING' }, ref: { type: 'INTEGER' } }, required: ['text', 'ref'] } } }, required: ['points'] };
let sumLlm = null;
/** Bare for tester: (prompt, items) → {points:[{text, ref}]} */
export const _setNewsSummaryLlm46 = (fn) => { sumLlm = fn; };
/** Lokalt sammendrag uten AI: de 3–5 nyeste titlene som punkter. */
export const localSummary46 = (items) => items.slice(0, 5).map((it) => ({ text: `${String(it.title).replace(/\s+/g, ' ').trim()}${/[.!?]$/.test(it.title) ? '' : '.'}`, ref: it.id, id: it.id, url: it.url, source: it.feed }));
async function generate(user, cat, items) {
  const k = `${user}|${cat}`;
  pending.delete(k);
  let points = null, engine = 'lokal';
  const prompt = `Lag et kort Glimt-sammendrag på godt norsk bokmål av nyhetene i kategorien «${cat}». 3–5 korte punkter, ett per viktig sak, nøktern stil. Hvert punkt skal ha ref = id-en til saken det bygger på. Ikke finn på noe som ikke står i titlene/ingressene.
Saker: ${JSON.stringify(items.map((x) => ({ id: x.id, kilde: x.feed, tittel: x.title, ingress: String(x.excerpt ?? '').slice(0, 200) })))}`;
  try {
    const j = sumLlm ? await sumLlm(prompt, items) : MOCK() ? null : (await aiJson(prompt, SUM_SCHEMA, { task: 'text', timeout: 90_000, temperature: 0.3 })).data;
    const byId = new Map(items.map((x) => [x.id, x]));
    points = (j?.points ?? []).filter((p) => p && byId.has(+p.ref) && String(p.text ?? '').trim()).slice(0, 5)
      .map((p) => { const it = byId.get(+p.ref); return { text: String(p.text).trim().slice(0, 300), ref: it.id, id: it.id, url: it.url, source: it.feed }; });
    if (points.length >= 2) engine = 'glimt'; else points = null;
  } catch { points = null; }
  points ??= localSummary46(items);
  const out = { cat, points, text: points.map((p) => p.text).join(' '), count: items.length, ids: items.map((x) => x.id), at: Date.now(), engine };
  kv.set(user, `news46_sum:${cat}`, out);
  return out;
}
/**
 * Sammendraget for én kategori. items = sakene i kategorien (nyeste først). Lager det i bakgrunnen ved behov.
 * → {hidden:true, reason} | {pending:true, skeleton:true} | {cat, points, text, count, updatedAt, updatedText, engine, stale, generating}
 */
export function summaryFor46(user, cat, items, { enabled = true, now = Date.now(), wait = false } = {}) {
  if (!enabled) return Promise.resolve({ cat, hidden: true, reason: 'off' });
  const since = now - 24 * 3600_000;
  let list = items.filter((x) => !x.published || Date.parse(x.published) >= since).slice(0, SUM_MAX);
  if (list.length < SUM_MIN) list = items.filter((x) => !x.published || Date.parse(x.published) >= now - 48 * 3600_000).slice(0, SUM_MAX);
  if (list.length < SUM_MIN) return Promise.resolve({ cat, hidden: true, empty: true, reason: 'few', count: list.length });
  const old = kv.get(user, `news46_sum:${cat}`, null);
  const fresh = old && now - old.at < SUM_TTL && list.filter((x) => !(old.ids ?? []).includes(x.id)).length < 3;
  const outOf = (s, extra = {}) => ({ cat, hidden: false, points: s.points, text: s.text, count: s.count, updatedAt: new Date(s.at).toISOString(), updatedText: `oppdatert kl. ${hmOslo(s.at)}`, engine: s.engine, stale: !fresh, generating: !fresh, ...extra });
  if (fresh) return Promise.resolve(outOf(old, { stale: false, generating: false }));
  const k = `${user}|${cat}`;
  const job = () => generate(user, cat, list);
  if (wait) return job().then((s) => outOf(s, { stale: false, generating: false }));
  if (!pending.has(k)) { pending.add(k); enqueue(job, true); }
  return Promise.resolve(old ? outOf(old) : { cat, hidden: false, pending: true, skeleton: true, generating: true });
}

/* ---------------- Favicon ---------------- */

const ICON_DIR = () => resolve(config.dataDir, 'news46-icons');
const ICON_TTL = 30 * 86400_000, ICON_FAIL_TTL = 86400_000;
/** «https://www.vg.no/rss/feed» → «vg.no» (www., rss., feed(s). fjernes). */
export function feedDomain46(url) {
  try { let h = new URL(url).hostname.toLowerCase(); while (/^(www|rss|feeds?|m)\./.test(h) && h.split('.').length > 2) h = h.replace(/^(www|rss|feeds?|m)\./, ''); return h; } catch { return null; }
}
const DOMAIN_RE = /^(?=.{3,253}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const iconPath = (d, ext) => join(ICON_DIR(), `${d}.${ext}`);
const metaPath = (d) => join(ICON_DIR(), `${d}.json`);
const readMeta = (d) => { try { return JSON.parse(readFileSync(metaPath(d), 'utf8')); } catch { return null; } };
/** Ikonet i cachen → {buf, type} | null (og om det har feilet nylig). */
export function cachedIcon46(d) {
  const m = readMeta(d);
  if (!m) return null;
  if (!m.ok) return Date.now() - m.at < ICON_FAIL_TTL ? { failed: true } : null;
  if (Date.now() - m.at > ICON_TTL) return null;
  try { return { buf: readFileSync(iconPath(d, m.ext)), type: m.type }; } catch { return null; }
}
let iconFetch = null;
/** Bare for tester: (url) → Response-lignende {ok, status, headers:{get}, arrayBuffer, text, url} */
export const _setIconFetch46 = (fn) => { iconFetch = fn; };
async function safeFetch(url, { accept = '*/*', max = 1024 * 1024 } = {}) {
  let u = new URL(url);
  for (let hop = 0; hop < 4; hop++) {
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Ugyldig protokoll');
    if (!iconFetch) {
      const a = await lookup(u.hostname, { all: true }).catch(() => []);
      if (!a.length || a.some((x) => isPrivateIp46(x.address))) throw new Error('Intern adresse');
    }
    const r = await (iconFetch ?? fetch)(u.href, { headers: { 'User-Agent': config.metUserAgent ?? 'homelab-os', Accept: accept }, redirect: 'manual', signal: AbortSignal.timeout(8000) });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = new URL(r.headers.get('location'), u); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > max) throw new Error('For stor');
    return { buf, type: String(r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase(), url: u.href };
  }
  throw new Error('For mange omdirigeringer');
}
const isImage = (buf, type) => buf.length > 60 && (/^image\//.test(type) || buf[0] === 0x89 || (buf[0] === 0 && buf[1] === 0 && buf[2] === 1) || /^\s*<svg|<\?xml/i.test(buf.subarray(0, 100).toString()));
const sniff = (buf, type) => (buf[0] === 0x89 ? ['png', 'image/png'] : buf[0] === 0xff ? ['jpg', 'image/jpeg'] : /svg/.test(type) || /<svg/i.test(buf.subarray(0, 300).toString()) ? ['svg', 'image/svg+xml'] : buf[0] === 0 && buf[2] === 1 ? ['ico', 'image/x-icon'] : /webp/.test(type) ? ['webp', 'image/webp'] : ['png', type || 'image/png']);
/** Kandidater fra forsiden: <link rel="icon"|"apple-touch-icon"> sortert etter størrelse (SVG/PNG ≥ 64 først). */
export function iconLinks46(html, base) {
  const out = [];
  for (const m of String(html ?? '').matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = tag.match(/\brel=["']?([^"'>]+)["']?/i)?.[1]?.toLowerCase() ?? '';
    if (!/(^|\s)(icon|shortcut icon|apple-touch-icon|apple-touch-icon-precomposed|mask-icon)(\s|$)/.test(rel) || /mask-icon/.test(rel)) continue;
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    let abs; try { abs = new URL(href.replace(/&amp;/g, '&'), base).href; } catch { continue; }
    const sizes = tag.match(/\bsizes=["']([^"']+)["']/i)?.[1] ?? '';
    const size = /any/i.test(sizes) ? 512 : Math.max(0, ...sizes.split(/\s+/).map((s) => +s.split('x')[0] || 0));
    const type = tag.match(/\btype=["']([^"']+)["']/i)?.[1] ?? '';
    const svg = /svg/.test(type) || /\.svg(\?|$)/i.test(abs);
    const sz = svg ? 512 : size || (/apple-touch/.test(rel) ? 180 : 16);
    out.push({ url: abs, size: sz, svg, png: /png/.test(type) || /\.png(\?|$)/i.test(abs) });
  }
  return out.sort((a, b) => (b.size >= 64) - (a.size >= 64) || (b.svg || b.png) - (a.svg || a.png) || b.size - a.size);
}
const iconBusy = new Map();
/** Henter (og cacher) ikonet for et domene. Rekkefølge: forsidens <link rel=icon>, /favicon.ico, Google s2, feedens <image>/<icon>. */
export function fetchIcon46(domain, feedUrl = null) {
  const d = String(domain ?? '').toLowerCase();
  if (!DOMAIN_RE.test(d)) return Promise.resolve(null);
  const hit = cachedIcon46(d);
  if (hit) return Promise.resolve(hit.failed ? null : hit);
  if (iconBusy.has(d)) return iconBusy.get(d);
  const p = (async () => {
    const tries = [];
    try { const home = await safeFetch(`https://${d}/`, { accept: 'text/html', max: 2 * 1024 * 1024 }); for (const l of iconLinks46(home.buf.toString('utf8'), home.url).slice(0, 4)) tries.push(l.url); } catch { /* forsiden svarer ikke */ }
    tries.push(`https://${d}/favicon.ico`, `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(d)}`);
    if (feedUrl) {
      try { const f = await safeFetch(feedUrl, { accept: 'application/rss+xml, application/atom+xml, */*', max: 5 * 1024 * 1024 }); const x = f.buf.toString('utf8'); const img = x.match(/<image>[\s\S]*?<url>\s*([^<\s]+)\s*<\/url>/i)?.[1] ?? x.match(/<icon>\s*([^<\s]+)\s*<\/icon>/i)?.[1] ?? x.match(/<logo>\s*([^<\s]+)\s*<\/logo>/i)?.[1]; if (img) tries.push(new URL(img.replace(/&amp;/g, '&'), feedUrl).href); } catch { /* */ }
    }
    mkdirSync(ICON_DIR(), { recursive: true });
    for (const url of tries) {
      try {
        const r = await safeFetch(url, { accept: 'image/*', max: 1024 * 1024 });
        if (!isImage(r.buf, r.type)) continue;
        const [ext, type] = sniff(r.buf, r.type);
        writeFileSync(iconPath(d, ext), r.buf);
        writeFileSync(metaPath(d), JSON.stringify({ ok: true, ext, type, src: url, at: Date.now() }));
        return { buf: r.buf, type };
      } catch { /* neste */ }
    }
    writeFileSync(metaPath(d), JSON.stringify({ ok: false, at: Date.now() }));
    return null;
  })().finally(() => iconBusy.delete(d));
  iconBusy.set(d, p);
  return p;
}
/** Feltene kildelisten får: {domain, favicon, favErr}. */
export function feedIcon46(feed) {
  const domain = feedDomain46(feed.url);
  if (!domain) return { domain: null, favicon: null, favErr: true };
  const m = existsSync(metaPath(domain)) ? readMeta(domain) : null;
  return { domain, favicon: `/api/rss/favicon?domain=${encodeURIComponent(domain)}`, favErr: !!m && !m.ok && Date.now() - m.at < ICON_FAIL_TTL };
}
/** Offentlig rute (montert før /api/rss): bare domener som står i en brukers kildeliste. */
export async function faviconHandler46(c) {
  let d = String(c.req.query('domain') ?? '').toLowerCase();
  const feedId = Number(c.req.query('feed'));
  let feedUrl = null;
  if (!d && Number.isInteger(feedId)) { const f = db.prepare('SELECT url FROM rss_feed WHERE id=?').get(feedId); if (f) { d = feedDomain46(f.url) ?? ''; feedUrl = f.url; } }
  if (!DOMAIN_RE.test(d)) return c.body(null, 404);
  if (!feedUrl) {
    const f = db.prepare('SELECT url FROM rss_feed').all().find((x) => feedDomain46(x.url) === d);
    if (!f) return c.body(null, 404, { 'Cache-Control': 'public, max-age=3600' });
    feedUrl = f.url;
  }
  if (MOCK() && !iconFetch) return c.body(null, 404, { 'Cache-Control': 'no-store' });
  const icon = await fetchIcon46(d, feedUrl).catch(() => null);
  if (!icon?.buf) return c.body(null, 404, { 'Cache-Control': 'public, max-age=3600' });
  return c.body(icon.buf, 200, { 'Content-Type': icon.type, 'Cache-Control': 'public, max-age=604800', 'X-Content-Type-Options': 'nosniff', ...(icon.type === 'image/svg+xml' ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } : {}) });
}

/* ---------------- Ruter (monteres i rss.js) ---------------- */

/** deps: {latest, CATEGORIES, settingsOf, settingsOut, feedsOf} fra rss.js. */
export function mountNews46(api, deps) {
  const { latest, CATEGORIES, settingsOf, settingsOut, feedsOf } = deps;
  const stdNames = CATEGORIES.map((c) => c.name);
  const body = async (c) => { const b = await c.req.json().catch(() => null); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };
  const cats = (u) => categoriesOut46(u, CATEGORIES);

  api.get('/categories', (c) => c.json(cats(c.get('user'))));
  api.post('/categories', async (c) => {
    const u = c.get('user'), b = await body(c);
    const name = String(b.name ?? '').trim().slice(0, 30);
    if (!name) return c.json({ error: 'Gi kategorien et navn', field: 'name' }, 400);
    if (nameTaken(u, name, null, stdNames)) return c.json({ error: `Kategorien «${name}» finnes allerede`, field: 'name' }, 409);
    const list = customOf46(u);
    if (list.length >= 20) return c.json({ error: 'Maks 20 egne kategorier' }, 409);
    if (b.icon !== undefined && b.icon !== null && !ICON_RE.test(String(b.icon))) return c.json({ error: 'Ugyldig ikon', field: 'icon' }, 400);
    let id = `c-${slug(name) || 'kategori'}`;
    if (STD.includes(id) || list.some((x) => x.id === id)) id = `${id}-${createHash('sha1').update(`${name}${Date.now()}`).digest('hex').slice(0, 4)}`;
    const cat = { id, name, keywords: kwList(b.keywords), icon: b.icon ?? 'lucide:tag', order: list.length, created: Date.now() };
    saveCustom(u, [...list, cat]);
    return c.json({ category: cat, categories: cats(u) }, 201);
  });
  api.put('/categories/order', async (c) => {
    const u = c.get('user'), b = await body(c);
    if (!Array.isArray(b.ids)) return c.json({ error: 'Forventet {ids:[…]}' }, 400);
    const list = customOf46(u), pos = new Map(b.ids.map((id, i) => [String(id), i]));
    saveCustom(u, [...list].sort((a, z) => (pos.get(a.id) ?? 999) - (pos.get(z.id) ?? 999)));
    return c.json({ categories: cats(u) });
  });
  api.patch('/categories/:id', async (c) => {
    const u = c.get('user'), id = c.req.param('id'), b = await body(c);
    const list = customOf46(u), cat = list.find((x) => x.id === id);
    if (!cat) return c.json({ error: 'Fant ikke kategorien' }, 404);
    if (b.name !== undefined) {
      const name = String(b.name ?? '').trim().slice(0, 30);
      if (!name) return c.json({ error: 'Navnet kan ikke være tomt', field: 'name' }, 400);
      if (nameTaken(u, name, id, stdNames)) return c.json({ error: `Kategorien «${name}» finnes allerede`, field: 'name' }, 409);
      cat.name = name;
    }
    if (b.keywords !== undefined) cat.keywords = kwList(b.keywords);
    if (b.icon !== undefined) { if (b.icon !== null && !ICON_RE.test(String(b.icon))) return c.json({ error: 'Ugyldig ikon', field: 'icon' }, 400); cat.icon = b.icon ?? 'lucide:tag'; }
    if (Number.isInteger(b.order)) { list.splice(list.indexOf(cat), 1); list.splice(Math.max(0, Math.min(list.length, b.order)), 0, cat); }
    saveCustom(u, list);
    return c.json({ category: cat, categories: cats(u) });
  });
  api.delete('/categories/:id', (c) => {
    const u = c.get('user'), id = c.req.param('id');
    const list = customOf46(u);
    if (!list.some((x) => x.id === id)) return c.json({ error: 'Fant ikke kategorien' }, 404);
    const moved = db.prepare("UPDATE rss_feed SET category='auto' WHERE user=? AND category=?").run(u, id).changes;
    saveCustom(u, list.filter((x) => x.id !== id));
    kv.del?.(u, `news46_sum:${id}`);
    return c.json({ ok: true, movedFeeds: moved, categories: cats(u), feeds: feedsOf(u) });
  });

  api.get('/interests', (c) => c.json({ interests: interestsOf46(c.get('user')), suggestions: suggestions46(c.get('user')) }));
  api.put('/interests', async (c) => { const b = await body(c); if (!Array.isArray(b.interests ?? b.words)) return c.json({ error: 'Forventet {interests:[…]}' }, 400); return c.json({ interests: setInterests(c.get('user'), b.interests ?? b.words), suggestions: suggestions46(c.get('user')) }); });
  api.post('/interests', async (c) => { const b = await body(c); const w = String(b.word ?? '').trim(); if (!w) return c.json({ error: 'Skriv en interesse' }, 400); return c.json({ interests: setInterests(c.get('user'), [...interestsOf46(c.get('user')), w]), suggestions: suggestions46(c.get('user')) }, 201); });
  api.delete('/interests/:word', (c) => { const w = decodeURIComponent(c.req.param('word')).toLowerCase(); return c.json({ interests: setInterests(c.get('user'), interestsOf46(c.get('user')).filter((x) => x.toLowerCase() !== w)), suggestions: suggestions46(c.get('user')) }); });

  api.post('/read', async (c) => {
    const u = c.get('user'), b = await body(c);
    const it = latest(u, { limit: 400 }).find((x) => x.id === Number(b.id));
    if (!it) return c.json({ error: 'Fant ikke saken' }, 404);
    logRead(u, it, b.ms);
    return c.json({ ok: true });
  });
  api.get('/foryou', (c) => {
    const u = c.get('user');
    const limit = Math.max(1, Math.min(30, parseInt(c.req.query('limit') ?? '30', 10) || 30));
    const r = forYou46(u, latest(u, { limit: 400 }), { limit });
    return c.json({ ...r, interests: interestsOf46(u), suggestions: suggestions46(u), empty: !interestsOf46(u).length ? 'Legg til interesser, så samler Glimt sakene for deg her.' : r.items.length ? null : 'Ingen saker matcher interessene dine akkurat nå.' });
  });
  api.get('/summary', async (c) => {
    const u = c.get('user'), cat = String(c.req.query('cat') ?? 'siste').replace(/^fordeg$/, 'for-deg');
    const s = settingsOf(u);
    const items = itemsForCat46(u, cat, { latest, CATEGORIES });
    if (!items) return c.json({ error: 'Ukjent kategori' }, 400);
    const enabled = cat === 'siste' ? s.aiSummary !== false : s.aiSummary !== false && s.catSummary !== false;
    return c.json(await summaryFor46(u, cat, items, { enabled, wait: c.req.query('wait') === '1' }), 200, { 'Cache-Control': 'no-store' });
  });
  api.get('/settings', (c) => {
    const u = c.get('user');
    return c.json({ settings: settingsOut(settingsOf(u)), feeds: feedsOf(u), categories: cats(u), interests: interestsOf46(u), deepLink: { web: '/#/innstillinger/nyheter', app: 'finanshub://innstillinger/nyheter' } });
  });
}
/** Sakene i en fane: standard (siste/norge/…), «for-deg» eller en egen kategori. → [sak] | null (ukjent) */
export function itemsForCat46(user, cat0, { latest, CATEGORIES, limit = 200 }) {
  const cat = cat0 === 'fordeg' ? FOR_YOU.id : cat0; // klientene bruker også «fordeg»
  if (cat === 'siste' || CATEGORIES.some((c) => c.id === cat)) return latest(user, { cat, limit });
  if (cat === FOR_YOU.id) return forYou46(user, latest(user, { limit: 400 }), { limit: 30 }).items;
  const cc = customOf46(user).find((x) => x.id === cat);
  if (!cc) return null;
  return latest(user, { limit: 400 }).filter((it) => inCustom46(it, cc)).slice(0, limit);
}
