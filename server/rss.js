// Nyhetsleser (prompt 13): RSS 2.0 og Atom per bruker. Feedene hentes hvert 10. minutt og lagres i SQLite.
// ✦ AI-sammendrag lager en kort ingress over de viktigste sakene; ✦ AI-kategorisering setter kategori
// per sak når kilden står på «Auto» og feeden selv ikke har en kategori vi kjenner igjen.
// Rutene godtar sesjon eller app-token, så Papir-appen og PWA-en bruker de samme endepunktene.
import { Hono } from 'hono';
import { db, kv } from './db.js';
import { config } from './config.js';
import { aiJson } from './homeos-common.js';
import { authOrToken } from './mobile.js';

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
`);

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

const settingsOf = (user) => ({ aiSummary: true, aiCategorize: true, ...kv.get(user, 'hl_rss', {}) });

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
    category: cat || null, image: null, excerpt: '',
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
  const r = await aiJson(`Skriv en kort ingress på norsk bokmål (maks 2 setninger, ca. 35 ord) som oppsummerer de viktigste nyhetene nå, i nøktern morgenavis-stil. Ikke list opp kilder.
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
      ai: r.fcat === 'auto' && !mapCategory(r.category) && s.aiCategorize && !!r.ai_category, image: r.image, excerpt: r.excerpt || '' });
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
    return items.map(({ id, title, url, feed, published, category, image }) => ({ id, title, url, feed, published, category, image }));
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
    feeds: feedsOf(user), settings: { aiSummary: !!s.aiSummary, aiCategorize: !!s.aiCategorize },
    digest: s.aiSummary ? (({ text, at }) => (text ? { text, at } : null))(kv.get(user, 'rss_digest', {}) ?? {}) : null,
    categories: CATEGORIES,
    updatedAt: (() => { const t = db.prepare('SELECT MAX(last_fetch) AS t FROM rss_feed WHERE user=?').get(user)?.t; return t ? new Date(t).toISOString() : null; })(),
  });
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
  kv.set(user, 'hl_rss', { aiSummary: next.aiSummary, aiCategorize: next.aiCategorize });
  if (next.aiCategorize) aiCategorize(user).catch(() => {});
  if (next.aiSummary) makeDigest(user).catch(() => {});
  return c.json({ aiSummary: next.aiSummary, aiCategorize: next.aiCategorize });
});

api.post('/refresh', async (c) => {
  const user = c.get('user');
  ensureFeeds(user);
  await refresh(user, { force: true });
  const s = settingsOf(user), d = kv.get(user, 'rss_digest', null);
  return c.json({ ok: true, feeds: feedsOf(user), digest: s.aiSummary && d?.text ? { text: d.text, at: d.at } : null });
});

export default api;
