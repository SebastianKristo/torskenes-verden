// Prompt 47 (GLIMT47) Steg E – verktøy-omskriving. Registreres i det felles registeret (TOOLS45) når modulen importeres.
//   calendar.search  {terms[], query?, direction:'next'|'past', limit} – OR over tittel, sted, notat og deltakere, HELE ORD
//                    (ordgrenser, case-insensitivt, æøå-sikkert), med minnealiaser begge veier («Nina» ↔ «frisør»).
//                    Tom retur er et svar: {count:0, searched:{terms, direction, from, to}}.
//   calendar.next    {terms[]} – det samme med direction next og limit 1.
//   memory.save      {subject, object} – «Nina er frisøren min» (lagres bare når ordene står i meldingen).
//   web.search       {query} – nettsøk; svaret formuleres av svarsteget (answer47.js) ut fra treffene.
//   media.episode    {title, pick:'latest'|'next', season?, episode?} – Sonarr (bare serier): siste/neste episode → EpisodeSearch.
import { TOOLS45, TOOL45, eventCard45 } from './tools.js';
import { eventsFor, normText } from '../calendar.js';
import { runAsUser } from '../settings.js';
import { addDays45, longDate45 } from './dates.js';
import { anyWord47, hasWord47, words47 } from './words47.js';
import { recallFacts47, expandTerms47, saveFact47 } from './memory47.js';
import { parseEpisodeAsk43 } from './media47.js';

const ask = (question, options = null, field = null) => ({ ask: { question, ...(options ? { options } : {}), ...(field ? { field } : {}) } });
const str = (v, n = 200) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
const sTxt = (d) => ({ type: 'string', description: d });
const cap = (s) => String(s ?? '').replace(/^./, (c) => c.toUpperCase());
const osloHm = (iso) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return `${p.hour}:${p.minute}`; };

/* ---------------- Kalendersøk ---------------- */

// Ord som aldri er søketermer (spørreord, fyllord, «time/avtale» alene).
const STOP47 = new Set(['den', 'det', 'de', 'avtalen', 'avtale', 'avtaler', 'timen', 'time', 'timer', 'hendelsen', 'møtet', 'min', 'mitt', 'mi', 'mine', 'til', 'på', 'i', 'kl', 'klokka', 'fra', 'med', 'en', 'et', 'ei',
  'neste', 'første', 'denne', 'når', 'er', 'gang', 'jeg', 'skal', 'hva', 'har', 'hvor', 'hvem', 'hos', 'skjer', 'kommer', 'blir', 'sist', 'forrige', 'var', 'meg', 'vi', 'oss', 'kalender', 'kalenderen', 'dag', 'tid', 'og', 'eller', 'som', 'jo', 'da', 'nå']);
const cleanTerms = (list) => [...new Set(list.map((x) => str(x, 60)).filter(Boolean).map((x) => x.replace(/[?!.,«»"]/g, ' ').replace(/\s+/g, ' ').trim()).filter((x) => x.length >= 2 && !STOP47.has(x.toLowerCase())))];
const contentWords = (text) => cleanTerms(words47(text).filter((w) => w.length >= 3 && !/^\d+$/.test(w)));
const evText = (e) => [e.title, e.room, e.location, e.note, e.description, ...(Array.isArray(e.attendees) ? e.attendees.map((a) => (typeof a === 'string' ? a : a?.name ?? a?.email ?? '')) : [])].filter(Boolean).join('\n');
const sortEv = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.allDay ? -1 : b.allDay ? 1 : Date.parse(a.start) - Date.parse(b.start)));

/**
 * Søketermer: modellens (eller kallerens) termer som står i meldingen eller er minne-utvidelser, ellers innholdsordene i meldingen.
 * Utvidelse med minnefakta BEGGE veier: et navn i termene gir typen + aliasene, en type/et alias gir navnet.
 * → {terms (det brukeren søkte på), expanded (alle termene), person:{name, type}|null, facts}
 */
export async function searchTerms47(user, text, raw = [], facts = null) {
  const f0 = facts ?? await recallFacts47(user, text, { embed: false }).catch(() => []);
  const own = cleanTerms(raw);
  const known = expandTerms47(f0);
  // Termer modellen fant på selv (ikke i meldingen, ikke fra minnet) brukes ikke.
  let terms = own.filter((t) => hasWord47(text, t) || words47(t).every((w) => hasWord47(text, w)) || known.some((k) => normText(k) === normText(t)));
  if (!terms.length) terms = contentWords(text).filter((w) => !/^(neste|gang|skal|frisørtime)$/.test(w)).slice(0, 4);
  // Fakta som henger sammen med termene (navn ↔ type ↔ alias).
  const rel = f0.filter((f) => [f.subject, f.kind === 'alias' ? f.object : null, ...(f.aliases ?? [])].filter(Boolean).some((x) => terms.some((t) => normText(t) === normText(x) || hasWord47(t, x) || hasWord47(x, t))) || hasWord47(text, f.match));
  const expanded = [...new Set([...terms, ...expandTerms47(rel)].map((x) => x.trim()).filter(Boolean))];
  const p = rel.find((f) => f.kind === 'alias');
  return { terms, expanded, person: p ? { name: p.subject, type: p.object } : null, facts: rel };
}

const calSearch = {
  name: 'calendar.search', module: 'calendar', destructive: false,
  description: 'Finn kommende (eller tidligere) avtaler som matcher ett av ordene (OR) i tittel, sted, notat eller deltakere – hele ord, med «Glimt husker»-aliaser begge veier («Nina» ↔ «frisør»).',
  parameters: S({ terms: { type: 'array', items: { type: 'string' }, description: 'Søkeord, f.eks. ["Nina", "frisør"]' }, query: sTxt('Søkeord som tekst (eldre form)'), direction: { type: 'string', enum: ['next', 'past'] }, past: { type: 'boolean' }, limit: { type: 'integer' } }),
  async validate(args, ctx) {
    const raw = [...(Array.isArray(args.terms) ? args.terms : []), ...(typeof args.query === 'string' ? [args.query] : [])];
    const st = await searchTerms47(ctx.user, ctx.text, raw, ctx.facts ?? null);
    if (!st.expanded.length) return ask('Hva skal jeg lete etter i kalenderen?');
    const past = args.direction === 'past' || !!args.past || /(?<![a-zæøå])(sist|forrige\s+gang)(?![a-zæøå])/i.test(ctx.text);
    const limit = Number.isInteger(args.limit) && args.limit > 0 ? Math.min(args.limit, 10) : 6;
    return { args: { query: st.terms.join(' ') || st.expanded[0], terms: st.terms, expanded: st.expanded, person: st.person, past, limit } };
  },
  async run(a, ctx) {
    const from = a.past ? addDays45(ctx.today, -365) : ctx.today, to = a.past ? ctx.today : addDays45(ctx.today, 365);
    const evs = ((await runAsUser(ctx.user, () => eventsFor(ctx.user, from, to))).events ?? []).filter((e) => anyWord47(evText(e), a.expanded)).sort(sortEv);
    const now = ctx.nowMs ?? Date.now();
    const list = a.past ? evs.filter((e) => (e.allDay ? e.date <= ctx.today : Date.parse(e.start) <= now)).reverse() : evs.filter((e) => (e.allDay ? e.date >= ctx.today : Date.parse(e.end ?? e.start) > now));
    return { status: 'done', result: { query: a.query, count: list.length, searched: { terms: a.expanded, direction: a.past ? 'past' : 'next', from, to }, person: a.person ?? null,
      results: list.slice(0, a.limit).map((e) => ({ title: e.title, date: e.date, time: e.allDay ? null : osloHm(e.start), location: e.room ?? e.location ?? null })) },
    cards: list.slice(0, Math.max(a.limit, 1)).map(eventCard45), events: list.slice(0, 20) };
  },
};
const calNext = {
  ...calSearch, name: 'calendar.next',
  description: 'Neste kommende avtale som matcher ett av ordene (med «Glimt husker»-aliaser).',
  parameters: S({ terms: { type: 'array', items: { type: 'string' } }, query: sTxt('Søkeord som tekst') }),
  async validate(args, ctx) { const v = await calSearch.validate({ ...args, direction: 'next', limit: 1 }, ctx); return v.args ? { args: { ...v.args, past: false, limit: 1 } } : v; },
};
function searchSentence(a, r, today) {
  const res = r.result;
  const who = a.person ? `hos ${a.person.name} (${a.person.type})` : null;
  if (!res.count) {
    if (who) return `Jeg finner ingen ${a.past ? 'tidligere' : 'kommende'} avtale ${who} i kalenderen.`;
    return `Fant ingen ${a.past ? 'tidligere' : 'kommende'} avtale med «${(a.terms?.length ? a.terms : a.expanded).join('» eller «')}».`;
  }
  const c = r.cards[0];
  const when = `${longDate45(c.date, today)}${c.allDay ? '' : ` kl. ${c.time}`}`;
  const more = res.count > 1 && !a.past && a.limit > 1 ? ` Det er ${res.count} treff i alt.` : '';
  if (who) return `${a.past ? 'Forrige' : 'Neste'} avtale ${who} ${a.past ? 'var' : 'er'} **${c.title} ${when}**.${more}`;
  return `${a.past ? 'Sist' : 'Neste'} «${a.query}» ${a.past ? 'var' : 'er'} **${c.title} ${when}**.${more}`;
}

/* ---------------- Minne ---------------- */

const memorySave = {
  name: 'memory.save', module: 'home', destructive: false,
  description: 'Husk et fakta brukeren sier («Nina er frisøren min»). Lagres bare når ordene står i meldingen.',
  parameters: S({ subject: sTxt('Hvem/hva («Nina»)'), object: sTxt('Hva det er («frisør»)') }, ['subject', 'object']),
  async validate(args, ctx) {
    const { parseMemoryIntent } = await import('../glimt-memory.js');
    const pm = parseMemoryIntent(ctx.text);
    if (pm?.ref === 'context') return { args: { contextRef: true, type: pm.type } };
    if (pm?.ref === 'named') return { args: { subject: pm.name, object: pm.type, alias: true } };
    const subject = str(args.subject, 80), object = str(args.object, 300);
    if (!subject || !object) return ask('Hva vil du at jeg skal huske?');
    if (!hasWord47(ctx.text, subject, { suffix: false }) || !words47(object).some((w) => hasWord47(ctx.text, w))) return { error: 'Jeg lagrer bare det du faktisk sa. Si det gjerne som «Nina er frisøren min»' };
    return { args: { subject, object } };
  },
  async run(a, ctx) {
    const M = await import('../glimt-memory.js');
    if (a.contextRef || a.alias) {
      // Den eksisterende læringen («Glimt husker», med forslag om å gi eksisterende avtaler tittelen).
      const intent = a.contextRef ? { type: a.type, ref: 'context' } : { name: a.subject, type: a.object, ref: 'named' };
      const r = await M.learnFromAssist(ctx.user, ctx.text, intent);
      if (!r.memory) return { status: 'failed', error: String(r.text ?? 'Fikk ikke lagret det').replace(/\*\*/g, '').replace(/[.]$/, '') };
      try { saveFact47(ctx.user, { subject: r.memory.match, object: r.memory.type, text: '' }); } catch { /* aliasene er best effort */ }
      return { status: 'done', result: { memory: r.memory, apply: r.apply ?? null, text: r.text } };
    }
    const r = saveFact47(ctx.user, { subject: a.subject, object: a.object, text: ctx.text });
    if (r.error) return { status: 'failed', error: r.error };
    return { status: 'done', result: { memory: r.item, text: `Ok, jeg husker at **${a.subject}** ${/^(er|har|liker|bor)\s/i.test(a.object) ? a.object : `er ${a.object}`}.` } };
  },
};

/* ---------------- Nettsøk ---------------- */

const webTool = {
  name: 'web.search', module: 'home', destructive: false,
  description: 'Søk på nettet etter aktuelle fakta (personer i embeter, nyheter, priser, resultater). Svaret bygger på treffene.',
  parameters: S({ query: sTxt('Søkeord') }),
  async validate(args, ctx) {
    if (ctx.webSearch === false) return { error: 'Nettsøk er slått av' };
    const { webQueryOf } = await import('../tool-router44.js');
    const q0 = str(args.query, 200);
    // Søkeordene må komme fra meldingen (modellen skal ikke «svare» i søket).
    const q = q0 && words47(q0).filter((w) => w.length >= 3).every((w) => hasWord47(ctx.text, w) || w.length <= 3) ? q0 : webQueryOf(ctx.text);
    return { args: { query: q } };
  },
  async run(a) {
    const { webSearch } = await import('../web-search.js');
    const r = await webSearch(a.query);
    if (!r?.hits?.length) return { status: 'done', result: { query: a.query, count: 0, hits: [], provider: r?.provider ?? null, web: true } };
    return { status: 'done', result: { query: r.query ?? a.query, count: r.hits.length, provider: r.provider, web: true, hits: r.hits.slice(0, 5).map((h) => ({ title: h.title, source: h.source, published: h.published ?? null, snippet: String(h.snippet ?? '').slice(0, 400), url: h.url })) } };
  },
};

/* ---------------- Media (Sonarr) ---------------- */

const mediaTool = {
  name: 'media.episode', module: 'media', destructive: false,
  description: 'TV-serier i Sonarr: last ned/finn siste eller neste episode av en serie («last ned siste episode fra 9-1-1»).',
  parameters: S({ title: sTxt('Serien («9-1-1»)'), pick: { type: 'string', enum: ['latest', 'next'] }, season: { type: 'integer' }, episode: { type: 'integer' } }, ['title']),
  async validate(args, ctx) {
    const p = parseEpisodeAsk43(ctx.text);
    const title = p?.title ?? str(args.title, 80);
    if (!title) return ask('Hvilken serie?');
    if (!p && !words47(title).every((w) => hasWord47(ctx.text, w) || /^\d+$/.test(w))) return { error: `«${title}» står ikke i meldingen` };
    return { args: { title, pick: p?.pick ?? (args.pick === 'next' ? 'next' : 'latest'), season: p?.season ?? (Number.isInteger(args.season) ? args.season : null), episode: p?.episode ?? (Number.isInteger(args.episode) ? args.episode : null), download: p?.download ?? /last\s+ned|hent|søk/i.test(ctx.text) } };
  },
  async run(a, ctx) {
    const { episodeGlimt43 } = await import('../media43.js');
    const r = await episodeGlimt43(ctx.user, a);
    return { status: r.ok === false ? 'failed' : 'done', ...(r.ok === false ? { error: r.text } : {}), result: r, cards: (r.results ?? []).map((x) => ({ kind: 'episode', id: String(x.episodeId ?? x.id ?? x.title), title: x.title, subtitle: x.subtitle ?? null, episodeId: x.episodeId ?? null })) };
  },
};

export const SENTENCES47 = {
  'calendar.search': searchSentence, 'calendar.next': searchSentence,
  'memory.save': (a, r) => r.result?.text ?? null,
  'media.episode': (a, r) => r.result?.text ?? null,
  'web.search': () => null, // svarsteget (answer47.js) formulerer svaret ut fra treffene
};
export const FAIL_TEXT47 = { 'calendar.next': 'Fikk ikke søkt i kalenderen', 'memory.save': 'Fikk ikke lagret det', 'web.search': 'Nettsøket feilet', 'media.episode': 'Fikk ikke spurt Sonarr' };

// Registrering: calendar.search byttes ut på stedet (samme navn, samme plass i registeret), de nye legges før app.answer.
{
  const i = TOOLS45.findIndex((t) => t.name === 'calendar.search');
  if (i >= 0 && TOOLS45[i] !== calSearch && !TOOLS45[i].p47) { TOOLS45[i] = Object.assign(calSearch, { p47: true }); TOOL45['calendar.search'] = calSearch; }
  for (const t of [calNext, memorySave, webTool, mediaTool]) {
    if (TOOL45[t.name]) continue;
    const j = TOOLS45.findIndex((x) => x.name === 'app.answer');
    TOOLS45.splice(j < 0 ? TOOLS45.length : j, 0, t);
    TOOL45[t.name] = t;
  }
}
export { cap };
