// Nyhetsleser (prompt 13): RSS 2.0 og Atom per bruker. Feedene hentes hvert 10. minutt og lagres i SQLite.
// ✦ AI-sammendrag lager en kort ingress over de viktigste sakene; ✦ AI-kategorisering setter kategori
// per sak når kilden står på «Auto» og feeden selv ikke har en kategori vi kjenner igjen.
// Rutene godtar sesjon eller app-token, så Papir-appen og PWA-en bruker de samme endepunktene.
// Prompt 27 (Nyhetsleser): hver sak i GET /api/rss har image (RSS media:thumbnail/media:content/enclosure, ellers og:image
// fra artikkelsiden, hentet i backend og sjekket på nytt etter 24 t; null hvis ingen) og readMin (ord / 230).
//   GET /api/rss/article?url= → {url, title, source, color, category, image, published, readMin, summary, points:[3], aiNote,
//       ai, related:[saker i samme kategori]}. Bare adresser fra brukerens egne kilder. Artikkelteksten hentes med enkel
//       readability (<article>/<p>), ✦ AI lager JSON {sammendrag, punkter} på brukerens språk (language). Cache per bruker og URL.
//       Uten AI: de første setningene fra saken (ai:false). MOCK_DATA=1: realistisk tekst fra mock.js.
import { Hono } from 'hono';
import { db, kv } from './db.js';
import { config } from './config.js';
import { aiJson } from './homeos-common.js';
import { authOrToken, languageOf } from './mobile.js';
import { ICON_DEFAULTS, validId as validIconId } from './icons.js';

const MOCK = process.env.MOCK_DATA === '1';
const REFRESH_MS = 10 * 60_000;
const MAX_ITEMS = 60; // per feed

db.exec(`
CREATE TABLE IF NOT EXISTS rss_feed (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'auto',
  enabled INTEGER NOT NULL DEFAULT 1,
  color TEXT NOT NULL DEFAULT '#6b665c',
  sort INTEGER NOT NULL DEFAULT 0,
  last_fetch INTEGER,
  last_error TEXT,
  created INTEGER NOT NULL,
  UNIQUE (user, url)
);
CREATE TABLE IF NOT EXISTS rss_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id INTEGER NOT NULL REFERENCES rss_feed(id) ON DELETE CASCADE,
  guid TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  published TEXT NOT NULL,
  category TEXT,
  ai_category TEXT,
  image TEXT,
  excerpt TEXT,
  UNIQUE (feed_id, guid)
);
CREATE INDEX IF NOT EXISTS rss_item_pub ON rss_item(feed_id, published);
CREATE TABLE IF NOT EXISTS rss_article (
  user TEXT NOT NULL,
  url TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'nb',
  data TEXT NOT NULL,
  fetched INTEGER NOT NULL,
  PRIMARY KEY (user, url, lang)
);
`);
// Prompt 27: når og:image sist ble sjekket, og lesetid fra artikkelteksten.
for (const [col, type] of [['image_checked', 'INTEGER'], ['read_min', 'INTEGER']]) {
  if (!db.prepare('PRAGMA table_info(rss_item)').all().some((c) => c.name === col)) db.exec(`ALTER TABLE rss_item ADD COLUMN ${col} ${type}`);
}

export const CATEGORIES = [['siste', 'Siste'], ['norge', 'Norge'], ['verden', 'Verden'], ['okonomi', 'Økonomi'], ['sport', 'Sport'], ['teknologi', 'Teknologi'], ['kultur', 'Kultur']]
  .map(([id, name]) => ({ id, name }));
const CAT_IDS = CATEGORIES.slice(1).map((c) => c.id);

const DEFAULT_FEEDS = [
  ['NRK', 'https://www.nrk.no/toppsaker.rss', 'auto', '#c8102e'],
  ['VG', 'https://www.vg.no/rss/feed', 'auto', '#d7263d'],
  ['E24', 'https://e24.no/rss', 'okonomi', '#1a5a8a'],
  ['Aftenposten', 'https://www.aftenposten.no/rss', 'auto', '#2a3440'],
  ['Tek.no', 'https://www.tek.no/rss', 'teknologi', '#e05a2a'],
];

/* ---------------- Innstillinger ---------------- */

const settingsOf = (user) => ({ aiSummary: true, aiCategorize: true, ic: {}, icSrc: {}, icOn: true, ...kv.get(user, 'hl_rss', {}) });

// Prompt 23: ikoner på fanene. ic = {fane: 'prefix:name' | ''} ('' = ingen ikon), icSrc = {fane: 'std'|'ai'|'pick'}, icOn = vis ikoner.
// Nøkkelen er kategori-id-en (siste, norge …) eller fanenavnet; maks 40 faner. Mangler fanen i ic, gjelder standardikonet.
const IC_SRC = ['std', 'ai', 'pick'];
const tabKey = (k) => typeof k === 'string' && k.trim().length >= 1 && k.length <= 40;
const plainObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function cleanIcons(b) {
  const out = {};
  if (b.ic !== undefined) {
    if (!plainObj(b.ic) || Object.keys(b.ic).length > 40) return { error: 'Ugyldige ikoner' };
    for (const [k, v] of Object.entries(b.ic)) if (!tabKey(k) || typeof v !== 'string' || (v !== '' && !validIconId(v))) return { error: `Ugyldig ikon for ${k}` };
    out.ic = { ...b.ic };
  }
  if (b.icSrc !== undefined) {
    if (!plainObj(b.icSrc) || Object.keys(b.icSrc).length > 40) return { error: 'Ugyldig ikonkilde' };
    const src = {};
    for (const [k, v] of Object.entries(b.icSrc)) {
      const x = v === 'user' ? 'pick' : v; // designet skriver «user» for eget valg
      if (!tabKey(k) || !IC_SRC.includes(x)) return { error: `Ugyldig ikonkilde for ${k}` };
      src[k] = x;
    }
    out.icSrc = src;
  }
  if (b.icOn !== undefined) { if (typeof b.icOn !== 'boolean') return { error: 'icOn må være true eller false' }; out.icOn = b.icOn; }
  return { out };
}
const settingsOut = (s) => ({ aiSummary: !!s.aiSummary, aiCategorize: !!s.aiCategorize, ic: s.ic ?? {}, icSrc: s.icSrc ?? {}, icOn: s.icOn !== false });

function ensureFeeds(user) {
  if (kv.get(user, 'rss_seeded', false)) return;
  const ins = db.prepare('INSERT OR IGNORE INTO rss_feed (user, name, url, category, color, sort, created) VALUES (?,?,?,?,?,?,?)');
  DEFAULT_FEEDS.forEach(([n, u, c, col], i) => ins.run(user, n, u, c, col, i, Date.now()));
  kv.set(user, 'rss_seeded', true);
}

/* ---------------- Tolking av RSS/Atom ---------------- */

const decode = (t = '') => String(t).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();
const raw = (xml, name) => xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))?.[1];
const tag = (xml, name) => decode(raw(xml, name) ?? '');
const attr = (xml, name, a) => xml.match(new RegExp(`<${name}\\b[^>]*\\b${a}=["']([^"']+)["']`, 'i'))?.[1];
const httpUrl = (u) => (u && /^https?:\/\//i.test(u.trim()) ? u.trim().replace(/&amp;/g, '&') : null);
// Atom: <link rel="alternate" href> (eller uten rel) er artikkelen; rel="self"/"enclosure" hoppes over.
const atomLink = (b) => {
  const links = [...b.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const pick = links.find((l) => !/\brel=/i.test(l) || /\brel=["']alternate["']/i.test(l)) ?? links[0];
  return pick?.match(/\bhref=["']([^"']+)["']/i)?.[1] ?? null;
};
const isoDate = (s) => { const d = new Date(s); return Number.isNaN(+d) ? null : d.toISOString(); };

/** Kategorinavn fra feeden («Sport», «Økonomi», «Utenriks» …) til våre faste kategorier, ellers null. */
export function mapCategory(s) {
  const t = String(s ?? '').toLowerCase();
  if (!t) return null;
  if (/sport|fotball|håndball|ski|eliteserien|langrenn/.test(t)) return 'sport';
  if (/økonomi|okonomi|næringsliv|naeringsliv|børs|finans|business|marked|penger/.test(t)) return 'okonomi';
  if (/tek|tech|data|mobil|gaming|vitenskap|science/.test(t)) return 'teknologi';
  if (/kultur|film|musikk|bok|underholdning|rampelys|kjendis|tv|kunst/.test(t)) return 'kultur';
  if (/utenriks|verden|world|internasjonal|europa|usa/.test(t)) return 'verden';
  if (/innenriks|norge|nyheter|lokal|oslo|politikk/.test(t)) return 'norge';
  return null;
}

/** Leser RSS 2.0, RSS 1.0 (RDF) og Atom. Gir { title, items:[{guid,title,url,published,category,image,excerpt}] }. */
export function parseFeed(xml) {
  xml = String(xml ?? '');
  const atom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  if (!atom && !/<(rss|rdf:RDF|channel)[\s>]/i.test(xml)) throw new Error('Adressen er ikke en RSS- eller Atom-feed');
  const head = xml.split(/<(item|entry)[\s>]/i)[0];
  const title = tag(head, 'title');
  const blocks = [...xml.matchAll(atom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi)].map((m) => m[0]);
  const items = blocks.map((b) => {
    const link = atom ? atomLink(b) : (tag(b, 'link') || attr(b, 'link', 'href'));
    const url = httpUrl(link) ?? httpUrl(tag(b, 'guid'));
    const t = tag(b, 'title');
    const published = isoDate(tag(b, atom ? 'published' : 'pubDate') || tag(b, 'updated') || tag(b, 'dc:date')) ?? new Date().toISOString();
    const cat = atom ? (attr(b, 'category', 'term') ?? tag(b, 'category')) : tag(b, 'category');
    const image = httpUrl(attr(b, 'media:content', 'url')) ?? httpUrl(attr(b, 'media:thumbnail', 'url'))
      ?? (/image\//i.test(attr(b, 'enclosure', 'type') ?? '') ? httpUrl(attr(b, 'enclosure', 'url')) : null)
      ?? httpUrl((raw(b, 'description') ?? raw(b, 'content') ?? '').match(/<img[^>]+src=["']([^"']+)/i)?.[1]?.replace(/&amp;/g, '&'));
    // Ingressen er ofte HTML med escapede tagger (&lt;p&gt;), så taggene fjernes også etter dekoding.
    const excerpt = (tag(b, atom ? 'summary' : 'description') || tag(b, 'content')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280);
    const guid = (tag(b, atom ? 'id' : 'guid') || url || t).slice(0, 500);
    return { guid, title: t.slice(0, 300), url, published, category: cat ? cat.slice(0, 60) : null, image, excerpt };
  }).filter((x) => x.title);
  return { title, items };
}

/* ---------------- Henting ---------------- */

const MOCK_NEWS = [['Kraftig regn ventes på Østlandet i kveld', 'Innenriks'], ['Ny rekord for elbilsalg i september', 'Økonomi'], ['Stortinget behandler statsbudsjettet', 'Politikk'],
  ['Oslo Børs stiger før helgen', 'Børs'], ['Ruter innfører nye nattlinjer fra november', 'Oslo'], ['Snø i fjellet i natt, glatte veier over Haukeli', ''],
  ['Nytt boligprosjekt på Bislett godkjent', ''], ['Strømprisen faller neste uke', 'Økonomi'], ['FN-toppmøte om klima åpner i Genève', 'Utenriks'],
  ['Bodø/Glimt klare for kvartfinale', 'Sport'], ['Valg i Tyskland: tett løp mellom partiene', ''], ['Equinor kutter i Nordsjøen', ''],
  ['Ny Android-oppdatering ruller ut i dag', 'Teknologi'], ['Norge til EM-sluttspill i håndball', 'Sport'], ['Museet åpner nytt bygg i Bjørvika', 'Kultur'],
  ['Nordlys kan ses over Østlandet i kveld', '']];

function mockFeed(url) {
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'kilde'; } })();
  const seed = [...host].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const items = MOCK_NEWS.filter((_, i) => (i + seed) % 3 !== 0).slice(0, 8).map(([t, cat], i) => ({
    guid: `${host}-${i}`, title: t, url: `https://${host}/sak/${seed}-${i}`, published: new Date(Date.now() - (i * 13 + (seed % 9)) * 60_000).toISOString(),
    category: cat || null, image: (i + seed) % 4 === 3 ? null : `https://picsum.photos/seed/${host.split('.')[0]}${i}/640/360`, excerpt: '',
  }));
  return { title: host.split('.')[0].replace(/^./, (c) => c.toUpperCase()), items };
}

async function fetchFeed(url) {
  if (MOCK) return mockFeed(url);
  const res = await fetch(url, { headers: { 'User-Agent': config.metUserAgent, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Kilden svarte ${res.status}`);
  const len = +(res.headers.get('content-length') ?? 0);
  if (len > 5 * 1024 * 1024) throw new Error('Feeden er for stor');
  const text = await res.text();
  if (text.length > 5 * 1024 * 1024) throw new Error('Feeden er for stor');
  return parseFeed(text);
}

const upsert = db.prepare(`INSERT INTO rss_item (feed_id, guid, title, url, published, category, image, excerpt) VALUES (@feed_id, @guid, @title, @url, @published, @category, @image, @excerpt)
  ON CONFLICT(feed_id, guid) DO UPDATE SET title=excluded.title, url=excluded.url, category=excluded.category, image=COALESCE(excluded.image, rss_item.image), excerpt=excluded.excerpt`);
const prune = db.prepare('DELETE FROM rss_item WHERE feed_id=? AND id NOT IN (SELECT id FROM rss_item WHERE feed_id=? ORDER BY published DESC LIMIT ?)');

async function refreshFeed(f) {
  try {
    const { items } = await fetchFeed(f.url);
    db.transaction(() => {
      for (const it of items.slice(0, MAX_ITEMS)) upsert.run({ feed_id: f.id, ...it });
      prune.run(f.id, f.id, MAX_ITEMS);
    })();
    db.prepare('UPDATE rss_feed SET last_fetch=?, last_error=NULL WHERE id=?').run(Date.now(), f.id);
  } catch (e) {
    db.prepare('UPDATE rss_feed SET last_fetch=?, last_error=? WHERE id=?').run(Date.now(), String(e.message ?? e).slice(0, 200), f.id);
  }
}

/** Henter alle aktive feeder for brukeren (eller alle brukere) og kategoriserer nye saker med AI. */
export async function refresh(user, { force = false } = {}) {
  const feeds = db.prepare(`SELECT * FROM rss_feed WHERE enabled=1 ${user ? 'AND user=?' : ''}`).all(...(user ? [user] : []))
    .filter((f) => force || !f.last_fetch || Date.now() - f.last_fetch > REFRESH_MS - 30_000);
  await Promise.all(feeds.map(refreshFeed));
  const users = user ? [user] : [...new Set(feeds.map((f) => f.user))];
  for (const u of users) await enrichImages(u).catch(() => {});
  for (const u of users) {
    if (settingsOf(u).aiCategorize) await aiCategorize(u).catch(() => {});
    if (settingsOf(u).aiSummary) await makeDigest(u, { force }).catch(() => {});
  }
}

let timer = null;
export function startRssWorker() {
  if (timer) return;
  const tick = () => refresh(null).catch((e) => console.warn('[rss]', e.message));
  timer = setInterval(tick, REFRESH_MS);
  timer.unref?.();
  setTimeout(tick, 15_000).unref?.();
}

/* ---------------- Prompt 27: bilde, lesetid og artikkel ---------------- */

const WPM = 230;
let pageFetch = null;
/** Testene kan bytte ut hentingen av artikkelsider: fn(url) → Response eller HTML-tekst. */
export const _setArticleFetch = (fn) => { pageFetch = fn; };
async function fetchPage(url) {
  const r = pageFetch ? await pageFetch(url) : await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (homelab-nyhetsleser)', Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
  if (typeof r === 'string') return r;
  if (!r.ok) throw new Error(`Siden svarte ${r.status}`);
  if (!/html|xml|text/i.test(r.headers.get('content-type') ?? 'text/html')) throw new Error('Ikke en nettside');
  const t = await r.text();
  return t.slice(0, 3 * 1024 * 1024);
}
const metaOf = (html, ...names) => {
  for (const n of names) {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*>`, 'i'))?.[0];
    const v = m?.match(/\bcontent=["']([^"']+)["']/i)?.[1];
    if (v) return decode(v);
  }
  return null;
};
/** Enkel readability: teksten i <article> (ellers hele siden) fra <p>-avsnitt, uten skript, meny og bunntekst. */
export function articleOf(html, base = null) {
  html = String(html ?? '');
  const image = (() => { const v = metaOf(html, 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'); if (!v) return null; try { return httpUrl(new URL(v, base ?? undefined).href); } catch { return httpUrl(v); } })();
  const title = metaOf(html, 'og:title', 'twitter:title') ?? tag(html, 'title') ?? null;
  let body = html.replace(/<(script|style|noscript|nav|header|footer|aside|form|figure|svg)\b[\s\S]*?<\/\1>/gi, ' ');
  const art = body.match(/<article\b[\s\S]*?<\/article>/gi);
  if (art?.length) body = art.sort((a, b) => b.length - a.length)[0];
  const paras = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => decode(m[1])).filter((p) => p.length >= 40 && !/^(les også|annonse|del artikkelen)/i.test(p));
  const text = paras.join('\n\n').slice(0, 40_000);
  const words = text ? text.split(/\s+/).length : 0;
  return { image, title, text, words, readMin: words ? Math.max(1, Math.round(words / WPM)) : null };
}
const readMinOf = (r) => r.read_min ?? Math.max(1, Math.round(((r.excerpt ?? '').split(/\s+/).length * 6) / WPM)); // anslag til teksten er hentet

/** og:image for saker uten bilde (høyst 8 per runde, hver sjekket på nytt etter 24 t). */
async function enrichImages(user) {
  const rows = db.prepare(`SELECT i.id, i.url FROM rss_item i JOIN rss_feed f ON f.id=i.feed_id WHERE f.user=? AND f.enabled=1 AND i.image IS NULL AND i.url IS NOT NULL
    AND (i.image_checked IS NULL OR i.image_checked < ?) ORDER BY i.published DESC LIMIT 8`).all(user, Date.now() - 24 * 3600_000);
  if (!rows.length) return 0;
  const set = db.prepare('UPDATE rss_item SET image=COALESCE(?, image), read_min=COALESCE(?, read_min), image_checked=? WHERE id=?');
  let n = 0;
  await Promise.race([Promise.all(rows.map(async (r) => {
    let a = { image: null, readMin: null };
    if (!MOCK || pageFetch) { try { a = articleOf(await fetchPage(r.url), r.url); } catch { /* prøv igjen om 24 t */ } }
    set.run(a.image, a.readMin, Date.now(), r.id);
    if (a.image) n++;
  })), new Promise((res) => setTimeout(res, 9000).unref?.())]);
  return n;
}

const ARTICLE_SCHEMA = { type: 'OBJECT', properties: { sammendrag: { type: 'STRING' }, punkter: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['sammendrag', 'punkter'] };
export const AI_NOTE = { nb: 'Laget av AI fra saken. Kan inneholde feil.', en: 'Made by AI from the article. May contain errors.' };
const sentences = (t) => String(t ?? '').replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+(\s|$)/g)?.map((x) => x.trim()) ?? (t ? [String(t).trim()] : []);
let mockMod = null;

/** Artikkelvisningen: tekst, bilde, ✦ sammendrag og 3 punkter, og relaterte saker. */
export async function articleFor(user, url) {
  ensureFeeds(user);
  const row = db.prepare(`SELECT i.*, f.name AS feed, f.category AS fcat, f.color FROM rss_item i JOIN rss_feed f ON f.id=i.feed_id WHERE f.user=? AND i.url=? ORDER BY i.published DESC LIMIT 1`).get(user, url);
  if (!row) return null;
  const s = settingsOf(user), lang = languageOf(user);
  const category = catOf(row, s);
  const related = latest(user, { cat: category, limit: 7 }).filter((x) => x.id !== row.id).slice(0, 6);
  const hit = db.prepare('SELECT data, fetched FROM rss_article WHERE user=? AND url=? AND lang=?').get(user, url, lang);
  let d = hit && Date.now() - hit.fetched < 7 * 24 * 3600_000 ? JSON.parse(hit.data) : null;
  if (!d) {
    let a = { image: null, title: null, text: '', words: 0, readMin: null }, mock = null;
    if (MOCK && !pageFetch) { mockMod ??= await import('./mock.js'); mock = mockMod.mockArticle(row.title, category, row.feed); a = { ...a, text: mock.text, words: mock.text.split(/\s+/).length, readMin: Math.max(1, Math.round(mock.text.split(/\s+/).length / WPM)) }; }
    else { try { a = articleOf(await fetchPage(url), url); } catch { /* bare tittel og ingress */ } }
    const source = a.text || row.excerpt || row.title;
    let summary = null, points = [], ai = false, provider = null;
    if (s.aiSummary && source.length > 60) {
      try {
        const r = await aiJson(`${lang === 'en' ? 'Answer in English.' : 'Svar på norsk bokmål.'} Lag et kort sammendrag (2–3 setninger, nøytralt, uten egne meninger) og nøyaktig 3 hovedpunkter (korte, maks 15 ord hver) av nyhetssaken. Bruk bare det som står i teksten.
Tittel: ${row.title}
Tekst: ${source.slice(0, 12_000)}`, ARTICLE_SCHEMA, { temperature: 0.2 });
        summary = String(r.data?.sammendrag ?? '').trim().slice(0, 800) || null;
        points = (Array.isArray(r.data?.punkter) ? r.data.punkter : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 3);
        ai = !!summary; provider = r.provider ?? null;
      } catch { /* uten AI: utdrag */ }
    }
    if (!summary && mock) { summary = mock.summary; points = mock.points; ai = true; provider = 'mock'; }
    if (!summary) { const sn = sentences(source); summary = sn.slice(0, 2).join(' ') || row.title; points = sn.slice(2, 5); }
    d = { title: a.title && a.title.length > 3 ? a.title : row.title, image: row.image ?? a.image ?? null, readMin: a.readMin ?? readMinOf(row), words: a.words, summary, points, ai, provider };
    db.prepare('INSERT OR REPLACE INTO rss_article (user, url, lang, data, fetched) VALUES (?,?,?,?,?)').run(user, url, lang, JSON.stringify(d), Date.now());
    db.prepare('UPDATE rss_item SET image=COALESCE(image, ?), read_min=COALESCE(?, read_min) WHERE id=?').run(d.image, a.readMin, row.id);
  }
  return { id: row.id, url, title: row.title, source: row.feed, color: row.color, category, image: d.image ?? row.image ?? null, published: row.published, readMin: d.readMin,
    summary: d.summary, points: d.points, ai: d.ai, provider: d.provider, aiNote: d.ai ? AI_NOTE[lang] ?? AI_NOTE.nb : null, related };
}

/* ---------------- AI ---------------- */

const CAT_SCHEMA = { type: 'OBJECT', properties: { items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'INTEGER' }, category: { type: 'STRING', enum: CAT_IDS } }, required: ['id', 'category'] } } }, required: ['items'] };

/** Setter ai_category på saker fra «Auto»-kilder der feeden ikke har en kategori vi kjenner igjen. */
export async function aiCategorize(user) {
  const todo = db.prepare(`SELECT i.id, i.title, i.category FROM rss_item i JOIN rss_feed f ON f.id=i.feed_id
    WHERE f.user=? AND f.category='auto' AND i.ai_category IS NULL ORDER BY i.published DESC LIMIT 40`).all(user)
    .filter((i) => !mapCategory(i.category));
  if (!todo.length) return 0;
  const r = await aiJson(`Sett én kategori på hver nyhetssak. Kategorier: ${CAT_IDS.join(', ')} (norge = innenriks, verden = utenriks, okonomi = økonomi og næringsliv).
Saker: ${JSON.stringify(todo.map((t) => ({ id: t.id, title: t.title })))}`, CAT_SCHEMA, { task: 'categorize' });
  const set = db.prepare('UPDATE rss_item SET ai_category=? WHERE id=?');
  let n = 0;
  for (const it of r.data?.items ?? []) if (CAT_IDS.includes(it.category) && todo.some((t) => t.id === it.id)) { set.run(it.category, it.id); n++; }
  return n;
}

const DIGEST_SCHEMA = { type: 'OBJECT', properties: { text: { type: 'STRING' } }, required: ['text'] };

/** Kort ingress (1–2 setninger) over de viktigste sakene akkurat nå. Lagres og lages på nytt når sakene endres. */
export async function makeDigest(user, { force = false } = {}) {
  const top = latest(user, { limit: 8 });
  if (!top.length) return null;
  const key = top.map((t) => t.id).join(',');
  const old = kv.get(user, 'rss_digest', null);
  if (!force && old?.key === key) return old;
  if (!force && old?.at && Date.now() - Date.parse(old.at) < 20 * 60_000) return old;
  const r = await aiJson(`${languageOf(user) === 'en' ? 'Write the summary in English. ' : ''}Skriv en kort ingress på norsk bokmål (maks 2 setninger, ca. 35 ord) som oppsummerer de viktigste nyhetene nå, i nøktern morgenavis-stil. Ikke list opp kilder.
Saker: ${JSON.stringify(top.map((t) => `${t.feed}: ${t.title}`))}`, DIGEST_SCHEMA);
  const text = String(r.data?.text ?? '').trim().slice(0, 400);
  if (!text) return old;
  const d = { text, at: new Date().toISOString(), key, provider: r.provider };
  kv.set(user, 'rss_digest', d);
  return d;
}

/* ---------------- Lesing ---------------- */

const catOf = (row, s) => (row.fcat !== 'auto' ? row.fcat : mapCategory(row.category) ?? (s.aiCategorize ? row.ai_category : null) ?? 'norge');

/** Siste saker for brukeren, valgfritt filtrert på kategori eller feed. */
export function latest(user, { cat = 'siste', feed = null, limit = 40 } = {}) {
  ensureFeeds(user);
  const s = settingsOf(user);
  const rows = db.prepare(`SELECT i.*, f.name AS feed, f.category AS fcat, f.color FROM rss_item i JOIN rss_feed f ON f.id=i.feed_id
    WHERE f.user=? AND f.enabled=1 ${feed ? 'AND f.id=?' : ''} ORDER BY i.published DESC LIMIT 400`).all(user, ...(feed ? [+feed] : []));
  const out = [];
  for (const r of rows) {
    const category = catOf(r, s);
    if (cat && cat !== 'siste' && category !== cat) continue;
    out.push({ id: r.id, feedId: r.feed_id, feed: r.feed, color: r.color, title: r.title, url: r.url, published: r.published, category,
      ai: r.fcat === 'auto' && !mapCategory(r.category) && s.aiCategorize && !!r.ai_category, image: r.image ?? null, readMin: readMinOf(r), excerpt: r.excerpt || '' });
    if (out.length >= limit) break;
  }
  return out;
}

const feedsOf = (user) => {
  ensureFeeds(user);
  return db.prepare(`SELECT f.*, (SELECT COUNT(*) FROM rss_item i WHERE i.feed_id=f.id) AS count FROM rss_feed f WHERE f.user=? ORDER BY f.sort, f.id`).all(user)
    .map((f) => ({ id: f.id, name: f.name, url: f.url, category: f.category, enabled: !!f.enabled, color: f.color, count: f.count, lastFetch: f.last_fetch ? new Date(f.last_fetch).toISOString() : null, lastError: f.last_error }));
};

/** For /api/mobile/home: de 5 nyeste sakene. Henter i bakgrunnen hvis ingenting er hentet ennå. */
export function newsFor(user, n = 5) {
  try {
    const items = latest(user, { limit: n });
    if (!items.length) refresh(user).catch(() => {});
    return items.map(({ id, title, url, feed, published, category, image, readMin, excerpt }) => ({ id, title, url, feed, published, category, image, readMin, excerpt: excerpt || '' })); // prompt 35: excerpt (ingress i briefen)
  } catch { return []; }
}

/* ---------------- Ruter ---------------- */

const api = new Hono();
api.use('*', (c, next) => authOrToken(c, next));
const json = async (c) => c.req.json().catch(() => ({}));
const COLORS = ['#6b665c', '#2f5d8a', '#2f7a4f', '#b23a2a', '#5b4a8a', '#c8553d', '#1a5a8a'];
const validCat = (v) => v === 'auto' || CAT_IDS.includes(v);

api.get('/', async (c) => {
  const user = c.get('user');
  ensureFeeds(user);
  // Første gang (ingenting hentet): vent litt på feedene, men aldri mer enn 6 sekunder.
  if (!db.prepare('SELECT 1 FROM rss_feed WHERE user=? AND last_fetch IS NOT NULL LIMIT 1').get(user)) {
    await Promise.race([refresh(user), new Promise((r) => setTimeout(r, 6000))]).catch(() => {});
  } else refresh(user).catch(() => {}); // henter bare feeder som er eldre enn 10 min
  const s = settingsOf(user);
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '40', 10) || 40, 1), 200);
  const cat = c.req.query('cat') || 'siste';
  if (cat !== 'siste' && !CAT_IDS.includes(cat)) return c.json({ error: 'Ukjent kategori' }, 400);
  return c.json({
    items: latest(user, { cat, feed: c.req.query('feed') || null, limit }),
    feeds: feedsOf(user), settings: settingsOut(s), iconDefaults: ICON_DEFAULTS,
    digest: s.aiSummary ? (({ text, at }) => (text ? { text, at } : null))(kv.get(user, 'rss_digest', {}) ?? {}) : null,
    categories: CATEGORIES,
    updatedAt: (() => { const t = db.prepare('SELECT MAX(last_fetch) AS t FROM rss_feed WHERE user=?').get(user)?.t; return t ? new Date(t).toISOString() : null; })(),
  });
});

api.get('/article', async (c) => {
  const url = httpUrl(String(c.req.query('url') ?? ''));
  if (!url) return c.json({ error: 'Mangler eller ugyldig url' }, 400);
  const a = await articleFor(c.get('user'), url);
  if (!a) return c.json({ error: 'Fant ikke saken i dine kilder' }, 404);
  return c.json(a);
});

api.post('/feeds', async (c) => {
  const user = c.get('user');
  ensureFeeds(user);
  const b = await json(c);
  let url = String(b.url ?? '').trim();
  if (!url) return c.json({ error: 'Mangler adresse' }, 400);
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try { const u = new URL(url); if (!['http:', 'https:'].includes(u.protocol)) throw new Error(); } catch { return c.json({ error: 'Ugyldig adresse' }, 400); }
  if (url.length > 500) return c.json({ error: 'Adressen er for lang' }, 400);
  if (db.prepare('SELECT 1 FROM rss_feed WHERE user=? AND url=?').get(user, url)) return c.json({ error: 'Kilden finnes allerede' }, 409);
  const category = b.category ?? 'auto';
  if (!validCat(category)) return c.json({ error: 'Ukjent kategori' }, 400);
  let parsed;
  try { parsed = await fetchFeed(url); } catch (e) { return c.json({ error: `Kunne ikke lese feeden: ${e.message}` }, 422); }
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, '').split('.')[0]; } catch { return 'Kilde'; } })();
  const name = String(b.name ?? '').trim().slice(0, 40) || parsed.title?.slice(0, 40) || host.replace(/^./, (ch) => ch.toUpperCase());
  const n = db.prepare('SELECT COUNT(*) AS n FROM rss_feed WHERE user=?').get(user).n;
  const id = db.prepare('INSERT INTO rss_feed (user, name, url, category, color, sort, created) VALUES (?,?,?,?,?,?,?)')
    .run(user, name, url, category, COLORS[n % COLORS.length], n, Date.now()).lastInsertRowid;
  const f = db.prepare('SELECT * FROM rss_feed WHERE id=?').get(id);
  db.transaction(() => { for (const it of parsed.items.slice(0, MAX_ITEMS)) upsert.run({ feed_id: id, ...it }); })();
  db.prepare('UPDATE rss_feed SET last_fetch=? WHERE id=?').run(Date.now(), id);
  if (settingsOf(user).aiCategorize && category === 'auto') aiCategorize(user).catch(() => {});
  return c.json({ feed: feedsOf(user).find((x) => x.id === f.id), feeds: feedsOf(user) }, 201);
});

const ownFeed = (c) => db.prepare('SELECT * FROM rss_feed WHERE id=? AND user=?').get(+c.req.param('id'), c.get('user'));

api.patch('/feeds/:id', async (c) => {
  const f = ownFeed(c);
  if (!f) return c.json({ error: 'Fant ikke kilden' }, 404);
  const b = await json(c);
  if (b.name !== undefined) { const n = String(b.name).trim().slice(0, 40); if (!n) return c.json({ error: 'Navnet kan ikke være tomt' }, 400); db.prepare('UPDATE rss_feed SET name=? WHERE id=?').run(n, f.id); }
  if (b.category !== undefined) { if (!validCat(b.category)) return c.json({ error: 'Ukjent kategori' }, 400); db.prepare('UPDATE rss_feed SET category=? WHERE id=?').run(b.category, f.id); }
  if (b.enabled !== undefined) db.prepare('UPDATE rss_feed SET enabled=? WHERE id=?').run(b.enabled ? 1 : 0, f.id);
  if (b.sort !== undefined && Number.isInteger(b.sort)) db.prepare('UPDATE rss_feed SET sort=? WHERE id=?').run(b.sort, f.id);
  return c.json({ feeds: feedsOf(c.get('user')) });
});

api.delete('/feeds/:id', (c) => {
  const f = ownFeed(c);
  if (!f) return c.json({ error: 'Fant ikke kilden' }, 404);
  db.prepare('DELETE FROM rss_item WHERE feed_id=?').run(f.id);
  db.prepare('DELETE FROM rss_feed WHERE id=?').run(f.id);
  return c.json({ feeds: feedsOf(c.get('user')) });
});

api.put('/settings', async (c) => {
  const user = c.get('user'), b = await json(c), next = settingsOf(user);
  for (const k of ['aiSummary', 'aiCategorize']) if (typeof b[k] === 'boolean') next[k] = b[k];
  const ic = cleanIcons(b);
  if (ic.error) return c.json({ error: ic.error }, 400);
  Object.assign(next, ic.out);
  // Hele hl_rss beholdes (også felt fra eldre/nyere klienter), bare de kjente feltene overskrives.
  kv.set(user, 'hl_rss', { ...kv.get(user, 'hl_rss', {}), ...settingsOut(next) });
  if (typeof b.aiCategorize === 'boolean' && next.aiCategorize) aiCategorize(user).catch(() => {});
  if (typeof b.aiSummary === 'boolean' && next.aiSummary) makeDigest(user).catch(() => {});
  return c.json(settingsOut(next));
});

api.post('/refresh', async (c) => {
  const user = c.get('user');
  ensureFeeds(user);
  await refresh(user, { force: true });
  const s = settingsOf(user), d = kv.get(user, 'rss_digest', null);
  return c.json({ ok: true, feeds: feedsOf(user), digest: s.aiSummary && d?.text ? { text: d.text, at: d.at } : null });
});

export default api;
