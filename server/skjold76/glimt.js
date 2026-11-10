// Prompt 76 (SKJSRV): Skjold Lab i Glimt og i felles søk.
//   skjold.find {query} – lesekall: «hvor er M3-skruene?» → «M3 × 10 skruer ligger i Hovedskap · Rad 4 · Skuff 2 (ca. 50 stk)» + kort som åpner Skjold Lab.
//   Felles søk (⌘K, webx51): typen «Deler» (partDocs76 / partSig76 / partResult76).
import { db } from '../db.js';
import { TOOLS45, TOOL45 } from '../glimt45/tools.js';
import { SENTENCES46, FAIL_TEXT46 } from '../glimt45/tools46.js';
import { registerLocalPlan76 } from '../glimt45/plan.js';
import { ensureUser76, searchParts76, partOut76, cabCache76, normSpec76, words76, locationOf76 } from './store.js';
import { usedIn82 } from './projects82.js'; // prompt 82: «hvor er ESP32-ene brukt?»

const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
export const OPEN76 = (id = null) => (id ? { web: `/#/skjold/del/${id}`, deepLink: `finanshub://skjold/del/${id}` } : { web: '/#/skjold', deepLink: 'finanshub://skjold' });

/* ---------------- Spørsmålet → søkeord ---------------- */

const STOP76 = new Set(['hvor', 'er', 'ligger', 'finner', 'finne', 'jeg', 'har', 'lagt', 'lagret', 'puttet', 'satt', 'gjort', 'av', 'med', 'de', 'den', 'det', 'dei', 'mine', 'min', 'mitt', 'mitt', 'noen', 'noe',
  'hvilken', 'hvilke', 'skuff', 'skuffe', 'skuffen', 'i', 'på', 'pa', 'til', 'en', 'et', 'ei', 'vi', 'skapet', 'skap', 'sorteringsskapet', 'skjold', 'lab', 'kan', 'du', 'si', 'meg', 'finn', 'vis',
  'ligg', 'oppbevarer', 'oppbevart', 'oss', 'sånn', 'slike', 'var', 'igjen', 'der', 'hva', 'om', 'ha', 'mange', 'nå', 'na', 'ca', 'stk', 'få', 'fa', 'ut', 'hos', 'som',
  'ene', 'brukt', 'brukte', 'bruker', 'ble', 'blitt', 'hvilket', 'hvilke', 'produkt', 'produkter', 'prosjekt', 'prosjekter', 'sjekket']);
/** Prompt 82: spørsmålet gjelder hvor delen er brukt (produkter), ikke hvor den ligger. */
export const USED_Q82 = /(?<![\p{L}])(brukt|brukte|sjekket\s+ut)(?![\p{L}])/iu;
/** «Hvor er M3-skruene?» → «m3 skru» (stammet, uten fyllord). */
export function queryOf76(text) {
  const t = String(text ?? '').replace(/[«»"“”?!.]/g, ' ');
  const ws = words76(t.replace(/-/g, ' ')).filter((w) => !STOP76.has(w));
  return ws.join(' ');
}
const PART_Q = /(?<![\p{L}])(hvor\s+(?:er|ligger|finner\s+jeg|har\s+jeg\s+(?:lagt|lagret|puttet))|hvilken\s+skuff|hvor\s+mange)(?![\p{L}])/iu;
const PART_HINT = /(?<![\p{L}])(skuff\w*|sorteringsskap\w*|skjold\s*lab|skapet|deler|komponent\w*)(?![\p{L}])/iu;

/* ---------------- Verktøyet ---------------- */

export function findParts76(user, query, limit = 5) {
  ensureUser76(user);
  const r = searchParts76(user, { q: query, limit });
  const cc = cabCache76(user);
  return { total: r.total, items: r.rows.map((x) => partOut76(x, { user, cabCache: cc })) };
}
const qtyTxt = (p) => `${p.unit === 'stk' ? 'ca. ' : ''}${String(p.qty).replace('.', ',')} ${p.unit}`;
export const partCard76 = (p) => ({ kind: 'part', id: p.id, title: p.name, subtitle: `${p.location.text} · ${qtyTxt(p)}${p.low ? ' · lite igjen' : ''}`, thumbUrl: p.thumbUrl, location: p.location,
  open: { ...OPEN76(p.id), ...(p.location.cabinetId ? { drawer: `/#/skjold/skap/${p.location.cabinetId}/${p.location.short}` } : {}) } });

export const findTool76 = {
  name: 'skjold.find', module: 'home', parallel: true,
  description: 'Finn hvor en del ligger i sorteringsskapet (Skjold Lab): skap, rad, skuff og antall. query = delen («M3-skruer», «10k motstand», «ESP32»).',
  parameters: S({ query: { type: 'string', description: 'Hva brukeren leter etter («M3-skruer», «10k motstand», «ESP32»)' } }),
  async validate(args, ctx) {
    const fromArgs = queryOf76(args?.query ?? '');
    const query = fromArgs || queryOf76(ctx.text);
    if (!query) return { ask: { question: 'Hvilken del leter du etter?', field: 'query' } };
    return { args: { query } };
  },
  async run(a, ctx) {
    let r = findParts76(ctx.user, a.query);
    // Ingen treff med alle ordene: prøv uten det siste (ofte et beskrivende ord: «M3 skruer lange»).
    if (!r.total && a.query.includes(' ')) r = findParts76(ctx.user, a.query.split(' ').slice(0, -1).join(' '));
    const used = USED_Q82.test(ctx?.text ?? '') || a.used === true; // prompt 82
    return { status: 'done', result: { query: a.query, count: r.total, items: r.items.map((p) => ({ id: p.id, name: p.name, qty: p.qty, unit: p.unit, low: p.low, location: p.location, ...(used ? { usedIn: usedIn82(ctx.user, p.id) } : {}) })), open: OPEN76(), ...(used ? { used: true } : {}) },
      cards: r.items.map(partCard76) };
  },
};
SENTENCES46['skjold.find'] = (a, r) => {
  const { items, count, query } = r.result;
  if (!items.length) return `Fant ingen deler som passer «${query}» i Skjold Lab.`;
  if (r.result.used) return usedSentence82(items); // prompt 82
  const [p, ...more] = items;
  const where = p.location.cabinetId ? `ligger i ${p.location.text}` : 'er registrert, men har ingen plass ennå';
  const head = `${p.name} ${where} (${qtyTxt(p)}${p.low ? ', lite igjen' : ''}).`;
  if (!more.length) return head;
  const rest = more.slice(0, 3).map((x) => `${x.name} (${x.location.short ?? 'uten plass'})`);
  return `${head} Fant også ${rest.length === 1 ? rest[0] : `${rest.slice(0, -1).join(', ')} og ${rest.at(-1)}`}${count > 4 ? ` – ${count} treff i alt` : ''}.`;
};
/** Prompt 82: «ESP32 DevKitC er brukt i «Værstasjon» (2 stk) og «Lys» (1 stk).» */
export function usedSentence82(items) {
  const withUse = items.filter((p) => p.usedIn?.length);
  if (!withUse.length) return `${items[0].name} er ikke sjekket ut til noe produkt.`;
  const one = (p) => { const l = p.usedIn.slice(0, 4).map((x) => `«${x.name}» (${qtyTxt({ qty: x.qty, unit: p.unit }).replace('ca. ', '')})`); return `${p.name} er brukt i ${l.length === 1 ? l[0] : `${l.slice(0, -1).join(', ')} og ${l.at(-1)}`}`; };
  return `${withUse.slice(0, 2).map(one).join('. ')}.`;
}
FAIL_TEXT46['skjold.find'] = 'Fikk ikke søkt i Skjold Lab';

if (!TOOL45['skjold.find']) {
  const i = TOOLS45.findIndex((x) => x.name === 'app.answer');
  TOOLS45.splice(i < 0 ? TOOLS45.length : i, 0, findTool76);
  TOOL45['skjold.find'] = findTool76;
}

/** Lokal plan (modellen nede) og hint: «hvor er/ligger …» når ordene treffer brukerens deler, eller skuff/skap nevnes. */
export function localSkjold76(text, { user = null } = {}) {
  const t = String(text ?? '').trim();
  if (!t || !PART_Q.test(t)) return null;
  const query = queryOf76(t);
  if (!query) return null;
  const hint = PART_HINT.test(t);
  if (!hint) {
    if (!user) return null;
    let hit = 0;
    try { hit = searchParts76(user, { q: query, limit: 1 }).total; } catch { hit = 0; }
    if (!hit) return null;
  }
  return { intent: 'search', module: 'home', calls: [{ tool: 'skjold.find', args: { query } }], engine: 'lokal' };
}
registerLocalPlan76(localSkjold76);

/* ---------------- Felles søk (webx51) ---------------- */

const J = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };
const hasTable = () => !!db.prepare("SELECT 1 FROM sqlite_master WHERE name='skj_parts'").get();
export function partDocs76(u) {
  if (!hasTable()) return [];
  const cc = cabCache76(u);
  return db.prepare('SELECT * FROM skj_parts WHERE user_id=? AND deleted_at IS NULL ORDER BY id LIMIT 5000').all(u).map((r) => {
    const specs = J(r.specs, {}), tags = J(r.tags, []);
    const loc = locationOf76(r, cc);
    const spec = Object.values(specs).join(' ');
    return { type: 'part', ref: String(r.id), title: r.name, body: [r.category, spec, normSpec76(spec), tags.join(' '), loc.label, r.description].filter(Boolean).join(' ').slice(0, 1500),
      meta: { loc: loc.text, short: loc.short, cabinetId: loc.cabinetId, qty: r.qty, unit: r.unit, low: r.min_qty != null && r.qty <= r.min_qty } };
  });
}
export function partSig76(u) {
  if (!hasTable()) return '';
  return db.prepare("SELECT count(*)||':'||ifnull(max(updated),0)||':'||ifnull(sum(qty),0) FROM skj_parts WHERE user_id=? AND deleted_at IS NULL").pluck().get(u)
    + db.prepare("SELECT ':'||count(*)||':'||ifnull(max(updated),0) FROM skj_cabinets WHERE user_id=?").pluck().get(u);
}
export function partResult76(base, h) {
  const m = h.meta ?? {};
  const q = `${String(m.qty ?? '').replace('.', ',')} ${m.unit ?? ''}`.trim();
  return { ...base, subtitle: [m.loc, q, m.low ? 'lite igjen' : null].filter(Boolean).join(' · '),
    link: { web: `/#/skjold/del/${h.ref}`, app: `papir://open?type=part&id=${encodeURIComponent(h.ref)}`, route: 'skjold', ref: h.ref },
    actions: [{ id: 'open', label: 'Åpne', kind: 'open' }, ...(m.cabinetId ? [{ id: 'drawer', label: `Vis skuff ${m.short}`, kind: 'open', url: `/#/skjold/skap/${m.cabinetId}/${m.short}` }] : [])] };
}
