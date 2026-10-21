// Prompt 40 (SERVER40): Nyheter – egen Glimt-side med langt sammendrag, referanser og bilder fra sakene (claude-code-nyheter-glimt-side.md).
// Montert under /api/news (sesjon eller app-token, per bruker). Sakene kommer fra RSS-cachen (rss.js), maks 30.
//
// POST /api/news/glimt {sources?:[feedId|navn], ids?:[sak-id], topics?:['norge','okonomi',…], period?:'idag'|'24t'|'uke', length?:'kort'|'lang', force?}
//   → {title:'Siste døgn', lead, sections:[{h, topic, text, refs:[n], sentences:[{text, refs:[n]}], image?:{url, src, ref, alt, caption, ratio:'16:9'|'3:2'}}],
//      refs:[{n, id, title, source, url, image, time}], images:[{url, src, ref, alt, caption}], sources:[{id, name, count, on}],
//      topics:[{id, name, count, on}], meta:{count, sourceCount, length, period}, foot, engine:'glimt'|'lokal', updatedAt, cached}
//   Cache 30 min per (bruker, utvalg, saker). Feiler AI → lokalt sammendrag av titlene gruppert per tema.
// GET  /api/news/glimt/sources → {sources:[{id, name, count, on}], topics:[…], prefs}
// GET  /api/news/glimt/prefs · PUT {sources?, topics?, period?, length?} → prefs (user_prefs.news_glimt, brukes også av briefen)
// POST /api/glimt/news-digest  (samme som POST /api/news/glimt; navnet i spesifikasjonen)
import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { kv } from './db.js';
import { authOrToken } from './mobile.js';
import { latest, CATEGORIES } from './rss.js';
import { proxied } from './glimt35.js';

const TOPIC_ORDER = ['norge', 'okonomi', 'verden', 'sport', 'teknologi', 'kultur'];
const TOPIC_NAME = { norge: 'Norge og Oslo', okonomi: 'Økonomi', verden: 'Verden', sport: 'Sport', teknologi: 'Teknologi', kultur: 'Kultur' };
const PERIODS = { idag: 'Dette skjer i dag', '24t': 'Siste døgn', uke: 'Uka i nyheter' };
const cache = new Map(); // nøkkel → {at, out}
const CACHE_MS = 30 * 60_000;
const MAX = 30;

const prefsOf = (u) => ({ sources: [], topics: [], period: '24t', length: 'kort', ...(kv.get(u, 'news_glimt', null) ?? {}) });
function cleanPrefs(b, cur) {
  const out = { ...cur };
  if (Array.isArray(b.sources)) out.sources = b.sources.slice(0, 40).map((x) => (typeof x === 'number' ? x : String(x).slice(0, 60)));
  if (Array.isArray(b.topics)) out.topics = b.topics.filter((t) => TOPIC_ORDER.includes(t));
  if (b.period !== undefined) { if (!PERIODS[b.period]) return { error: 'period må være idag, 24t eller uke' }; out.period = b.period; }
  if (b.length !== undefined) { if (!['kort', 'lang'].includes(b.length)) return { error: 'length må være kort eller lang' }; out.length = b.length; }
  return { prefs: out };
}
const osloMidnight = (now = Date.now()) => { const d = new Date(now).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' }); const utc = Date.parse(`${d}T00:00:00Z`);
  const off = new Date(utc).toLocaleString('sv-SE', { timeZone: 'Europe/Oslo', hourCycle: 'h23' }).slice(11, 13); return utc - (+off) * 3600_000; };
const sinceOf = (period, now = Date.now()) => (period === 'idag' ? osloMidnight(now) : period === 'uke' ? now - 7 * 86400_000 : now - 86400_000);
const hm = (iso) => (iso ? new Date(iso).toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' }) : null);
const clean = (s) => String(s ?? '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\s+/g, ' ').trim();

/** Sakene som passer valget (nyeste først, maks 30). */
export function pickItems40(user, { sources = [], ids = [], topics = [], period = '24t' } = {}, now = Date.now()) {
  const all = latest(user, { limit: 400 });
  const since = sinceOf(period, now);
  const src = sources.map((s) => String(s).toLowerCase());
  return all.filter((it) => (ids.length ? ids.map(Number).includes(it.id) : true)
    && (src.length ? src.includes(String(it.feedId)) || src.includes(String(it.feed).toLowerCase()) : true)
    && (topics.length ? topics.includes(it.category) : true)
    && (ids.length || !it.published || Date.parse(it.published) >= since)).slice(0, MAX);
}

/** Lokalt sammendrag (uten AI): titlene gruppert per tema, alle setninger med referanse. */
export function localDigest40(items, { length = 'kort' } = {}) {
  const per = length === 'lang' ? 6 : 3;
  const byTopic = new Map();
  items.forEach((it, i) => { const t = TOPIC_ORDER.includes(it.category) ? it.category : 'norge'; if (!byTopic.has(t)) byTopic.set(t, []); byTopic.get(t).push({ ...it, n: i + 1 }); });
  const sections = [];
  for (const t of TOPIC_ORDER) {
    const list = byTopic.get(t);
    if (!list?.length) continue;
    const sentences = list.slice(0, per).map((it) => {
      const title = clean(it.title).replace(/[.!?]+$/, '');
      const ex = length === 'lang' && it.excerpt ? ` ${clean(it.excerpt).split(/(?<=[.!?])\s/)[0].slice(0, 220)}` : '';
      return { text: `${it.feed} melder: ${title}.${ex}`, refs: [it.n] };
    });
    sections.push({ h: TOPIC_NAME[t], topic: t, sentences, imageRef: list.find((x) => x.image)?.n ?? null });
  }
  const top = sections.slice(0, 2).map((s) => s.h.toLowerCase());
  const feeds = [...new Set(items.map((i) => i.feed))];
  const lead = items.length ? `${items.length} ${items.length === 1 ? 'sak' : 'saker'} fra ${feeds.length} ${feeds.length === 1 ? 'kilde' : 'kilder'}. Mest om ${top.join(' og ') || 'nyhetene'}.` : 'Ingen saker passer valget ditt ennå.';
  return { lead, sections };
}

/** AI-svaret {ingress, seksjoner:[{tittel, avsnitt:[{tekst, ref:[n]}], bilde:n}]} → samme form som localDigest40 (ugyldige referanser fjernes). */
export function fromAi40(j, n) {
  if (!j || typeof j !== 'object' || !Array.isArray(j.seksjoner) || !j.seksjoner.length) return null;
  const ok = (r) => Number.isInteger(+r) && +r >= 1 && +r <= n;
  const sections = j.seksjoner.slice(0, 8).map((s) => ({ h: clean(s.tittel).slice(0, 60) || 'Nyheter', topic: Object.entries(TOPIC_NAME).find(([, v]) => v.toLowerCase() === clean(s.tittel).toLowerCase())?.[0] ?? null,
    sentences: (Array.isArray(s.avsnitt) ? s.avsnitt : []).slice(0, 10).map((a) => ({ text: clean(a.tekst).replace(/\s*\[\d+\]/g, '').slice(0, 400), refs: (Array.isArray(a.ref) ? a.ref : []).map(Number).filter(ok) })).filter((a) => a.text),
    imageRef: ok(s.bilde) ? +s.bilde : null })).filter((s) => s.sentences.length);
  if (!sections.length) return null;
  return { lead: clean(j.ingress).slice(0, 400), sections };
}

let llmImpl = null;
/** Bare for tester: (prompt, items) → AI-JSON. */
export const _setNewsLlm = (fn) => { llmImpl = fn; };

export async function newsGlimt40(user, sel = {}, { now = Date.now() } = {}) {
  const prefs = prefsOf(user);
  const o = { sources: sel.sources ?? prefs.sources ?? [], ids: sel.ids ?? [], topics: sel.topics ?? prefs.topics ?? [], period: PERIODS[sel.period] ? sel.period : prefs.period ?? '24t', length: sel.length === 'lang' || sel.length === 'kort' ? sel.length : prefs.length ?? 'kort' };
  const items = pickItems40(user, o, now);
  const key = createHash('sha1').update(JSON.stringify([user, o, items.map((i) => i.id)])).digest('hex');
  const hit = cache.get(key);
  if (!sel.force && hit && now - hit.at < CACHE_MS) return { ...hit.out, cached: true };
  let d = null, engine = 'lokal';
  if (items.length) {
    const prompt = `Lag et nøkternt nyhetssammendrag på norsk bokmål (${o.length === 'lang' ? 'langt, 4–6 avsnitt per tema' : 'kort, 1–3 avsnitt per tema'}). Bruk BARE det som står i sakene. `
      + 'Hver setning skal ha referanse til saken(e) den bygger på. Ingen tall som ikke står i kilden. Skriv «NRK melder at …». '
      + 'Svar KUN JSON {"ingress":"2 setninger","seksjoner":[{"tittel":"Norge og Oslo|Økonomi|Verden|Sport|Teknologi|Kultur","avsnitt":[{"tekst":"…","ref":[1]}],"bilde":1}]}.\nSaker:\n'
      + items.map((it, i) => `[${i + 1}] ${it.feed}: ${clean(it.title)}${it.excerpt ? ` – ${clean(it.excerpt).slice(0, 300)}` : ''}`).join('\n');
    try {
      const j = llmImpl ? await llmImpl(prompt, items) : process.env.MOCK_DATA === '1' && !process.env.OLLAMA_URL ? null
        // Prompt 43: samme utvalg samtidig (to faner, widget + app) gir ett kall til Ollama.
        : await (await import('./ai-gate.js')).once(`news40|${key}`, async () => (await (await import('./ai-run.js')).run('brief', { user, prompt, json: true, temperature: 0.2, numPredict: o.length === 'lang' ? 1400 : 700, title: 'Glimt · nyhetssammendrag', phased: true, background: true })).data);
      d = fromAi40(j, items.length);
      if (d) engine = 'glimt';
    } catch { d = null; }
  }
  d ??= localDigest40(items, { length: o.length });
  const used = new Set(d.sections.flatMap((s) => [...s.sentences.flatMap((x) => x.refs), ...(s.imageRef ? [s.imageRef] : [])]));
  const renum = new Map([...used].sort((a, b) => a - b).map((n, i) => [n, i + 1]));
  const R = (n) => renum.get(n);
  const refs = [...renum.entries()].map(([old, n]) => { const it = items[old - 1]; return { n, id: it.id, title: it.title, source: it.feed, url: it.url, image: it.image ? proxied(it.image) ?? it.image : null, imageUrl: it.image ?? null, time: it.published, timeLabel: hm(it.published), category: it.category }; });
  const withImg = o.length === 'lang' ? Infinity : 3;
  const images = [];
  const sections = d.sections.map((s, i) => {
    const sentences = s.sentences.map((x) => ({ text: x.text, refs: x.refs.map(R).filter(Boolean) }));
    const ref = s.imageRef ? R(s.imageRef) : null, it = s.imageRef ? items[s.imageRef - 1] : null;
    const image = i < withImg && it?.image ? { url: it.image, src: proxied(it.image) ?? it.image, ref, alt: clean(it.title), caption: `Bilde fra saken [${ref}] · ${it.feed}`, ratio: i === 0 ? '16:9' : '3:2' } : null;
    if (image) images.push({ url: image.url, src: image.src, ref, alt: image.alt, caption: image.caption });
    return { h: s.h, topic: s.topic, text: sentences.map((x) => x.text).join(' '), refs: [...new Set(sentences.flatMap((x) => x.refs))], sentences, ...(image ? { image } : {}) };
  });
  const allFeeds = latest(user, { limit: 400 });
  const since = sinceOf(o.period, now);
  const inPeriod = allFeeds.filter((it) => !it.published || Date.parse(it.published) >= since);
  const feedMap = new Map();
  for (const it of allFeeds) if (!feedMap.has(it.feedId)) feedMap.set(it.feedId, { id: it.feedId, name: it.feed });
  const src = (o.sources ?? []).map((s) => String(s).toLowerCase());
  const sources = [...feedMap.values()].map((f) => ({ ...f, count: inPeriod.filter((x) => x.feedId === f.id).length, on: !src.length || src.includes(String(f.id)) || src.includes(f.name.toLowerCase()) }));
  const topics = TOPIC_ORDER.map((t) => ({ id: t, name: CATEGORIES.find((c) => c.id === t)?.name ?? t, count: inPeriod.filter((x) => x.category === t).length, on: !o.topics.length || o.topics.includes(t) }));
  const at = new Date(now);
  const out = { title: PERIODS[o.period], kicker: '✦ GLIMT · NYHETSOPPSUMMERING', lead: d.lead, sections, refs, images, sources, topics,
    meta: { count: items.length, sourceCount: new Set(items.map((i) => i.feedId)).size, length: o.length, period: o.period, date: at.toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' }) },
    foot: `Laget av Glimt kl. ${hm(at.toISOString())} fra kildene du har valgt. Trykk på et tall for å lese saken.`, engine, updatedAt: at.toISOString(), cached: false, selection: o };
  cache.set(key, { at: now, out });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return out;
}

export const news40Api = new Hono();
news40Api.use('*', authOrToken);
const body = async (c) => { const b = await c.req.json().catch(() => ({})); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };
export const newsGlimtHandler = async (c) => {
  const b = await body(c);
  const sel = { ...(Array.isArray(b.sources) ? { sources: b.sources } : {}), ...(Array.isArray(b.ids) ? { ids: b.ids } : {}), ...(Array.isArray(b.topics) ? { topics: b.topics } : {}),
    ...(b.period ? { period: b.period } : {}), ...(b.length ? { length: b.length } : {}), force: b.force === true };
  if (b.save === true) { const r = cleanPrefs(b, prefsOf(c.get('user'))); if (!r.error) kv.set(c.get('user'), 'news_glimt', r.prefs); }
  return c.json(await newsGlimt40(c.get('user'), sel));
};
news40Api.post('/glimt', newsGlimtHandler);
news40Api.get('/glimt/sources', async (c) => {
  const u = c.get('user'), p = prefsOf(u);
  const r = await newsGlimt40(u, { ids: [-1] }); // bare listene (ingen saker valgt)
  return c.json({ sources: r.sources, topics: r.topics, prefs: p });
});
news40Api.get('/glimt/prefs', (c) => c.json(prefsOf(c.get('user'))));
news40Api.put('/glimt/prefs', async (c) => {
  const r = cleanPrefs(await body(c), prefsOf(c.get('user')));
  if (r.error) return c.json({ error: r.error }, 400);
  kv.set(c.get('user'), 'news_glimt', r.prefs);
  return c.json(r.prefs);
});
export const newsDigestApi = new Hono();
newsDigestApi.use('*', authOrToken);
newsDigestApi.post('/', newsGlimtHandler);
