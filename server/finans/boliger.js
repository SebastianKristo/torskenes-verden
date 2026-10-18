// Boliger: kategorier med underkategorier (felles for alle boliger), AI-kategorisering og oppsett av boligsiden.
// Utgiftene i fh_folder_entries peker på kategorien med category_id (underkategorien hvis den har en);
// kolonnen category beholder navnet på hovedkategorien, så faste regninger og eldre klienter virker som før.
import { Hono } from 'hono';
import { db, kv, OWNER, settings, saveSettings } from './db.js';
import { askJson } from './ai.js';

const q = (sql) => db.prepare(sql);
const bad = (c, msg, code = 400) => c.json({ error: msg }, code);
const clean = (v, max = 40) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/* ---------- Tabeller og migrering ---------- */

db.exec(`
CREATE TABLE IF NOT EXISTS fh_bolig_categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#A0A0AA',
  parent_id INTEGER REFERENCES fh_bolig_categories(id) ON DELETE CASCADE,
  created_by_ai INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS fh_bolig_categories_parent ON fh_bolig_categories(parent_id);
`);
if (!q('PRAGMA table_info(fh_folder_entries)').all().some((c) => c.name === 'category_id')) db.exec('ALTER TABLE fh_folder_entries ADD COLUMN category_id INTEGER');
if (!q('PRAGMA table_info(fh_folder_entries)').all().some((c) => c.name === 'ai_cat')) db.exec('ALTER TABLE fh_folder_entries ADD COLUMN ai_cat INTEGER NOT NULL DEFAULT 0');
// 1 = brukeren har valgt kategorien selv; AI og heuristikk endrer den da aldri.
if (!q('PRAGMA table_info(fh_folder_entries)').all().some((c) => c.name === 'cat_manual')) db.exec('ALTER TABLE fh_folder_entries ADD COLUMN cat_manual INTEGER NOT NULL DEFAULT 0');

export const DEFAULT_TREE = [
  ['Strøm', '#F2C14E', []], ['Vann og avløp', '#7AA7FF', []], ['Hage og uteområde', '#5FD3A8', ['Blomster', 'Jord og gjødsel', 'Plen']],
  ['Håndverker', '#FF7A3D', ['Snekker', 'Elektriker', 'Rørlegger']], ['Basseng', '#4FC3E8', ['Pumpe og filter', 'Kjemikalier']],
  ['Møbler og interiør', '#E89BD0', ['Hagemøbler']], ['Reparasjon', '#FF8A7A', []], ['Vaktmester', '#C9B27A', ['Snømåking']],
  ['Kommunale avgifter', '#B79CFF', []], ['Vedlikehold', '#FFB08A', ['Maling og bygg']], ['Forsikring', '#A0A0AA', []],
];
// Farger for kategorier som fantes før kategoritreet (Dagligvarer, Annet) og for nye kategorier fra AI.
const LEGACY_COLORS = { Dagligvarer: '#C9E265', Annet: '#6E6E78' };
const AI_COLORS = ['#8FD3FF', '#C9E265', '#FF6B8B', '#9DBDFF', '#E6E6AE', '#F7A8D8', '#7FD1B9', '#FFC27A'];

const findTop = (name) => q('SELECT * FROM fh_bolig_categories WHERE parent_id IS NULL AND lower(name)=lower(?)').get(name);
const findSub = (pid, name) => q('SELECT * FROM fh_bolig_categories WHERE parent_id=? AND lower(name)=lower(?)').get(pid, name);
const nextSort = (pid) => q('SELECT ifnull(max(sort),0)+1 FROM fh_bolig_categories WHERE parent_id IS ?').pluck().get(pid ?? null);
function insertCat(name, { parentId = null, color, ai = false } = {}) {
  const parent = parentId ? q('SELECT * FROM fh_bolig_categories WHERE id=?').get(parentId) : null;
  const col = color || parent?.color || LEGACY_COLORS[name] || AI_COLORS[q('SELECT count(*) FROM fh_bolig_categories WHERE parent_id IS NULL').pluck().get() % AI_COLORS.length];
  return q('INSERT INTO fh_bolig_categories(name,color,parent_id,created_by_ai,sort,created) VALUES(?,?,?,?,?,?) RETURNING *').get(name, col, parentId, ai ? 1 : 0, nextSort(parentId), Date.now());
}
function seedDefaults() {
  for (const [name, color, subs] of DEFAULT_TREE) {
    const top = findTop(name) ?? insertCat(name, { color });
    for (const s of subs) if (!findSub(top.id, s)) insertCat(s, { parentId: top.id });
  }
}
// Første gang: standardtreet.
function migrate() {
  if (kv.get(OWNER, 'fh_bolig_cat_v1', false)) return;
  db.transaction(() => { seedDefaults(); kv.set(OWNER, 'fh_bolig_cat_v1', true); })();
}
migrate();
// Utgifter uten kategori-ID (fra før kategoritreet, eller fra demo- og backupdata) kobles til kategorien med samme navn,
// og til underkategorien heuristikken finner i den hovedkategorien. Manglende navn opprettes. Kjøres ved hver lesing,
// men gjør ingenting når alt er koblet.
export function linkLegacy() {
  const rows = q("SELECT id, category, description FROM fh_folder_entries WHERE category_id IS NULL AND category IS NOT NULL AND category<>''").all();
  if (!rows.length) return;
  db.transaction(() => {
    for (const r of rows) {
      const top = findTop(r.category) ?? insertCat(r.category);
      const guess = catPair(heuristicCat(r.description));
      const id = guess.top?.id === top.id && guess.sub ? guess.sub.id : top.id;
      q('UPDATE fh_folder_entries SET category_id=? WHERE id=?').run(id, r.id);
    }
  })();
}

/* ---------- Oppslag ---------- */

export const catById = (id) => (id ? q('SELECT * FROM fh_bolig_categories WHERE id=?').get(id) : null);
// { top, sub } for en kategori-ID (sub er null for hovedkategorier).
export function catPair(id) {
  const c = catById(id);
  if (!c) return { top: null, sub: null };
  if (!c.parent_id) return { top: c, sub: null };
  return { top: catById(c.parent_id), sub: c };
}
export const catLabel = (id) => { const { top, sub } = catPair(id); return top ? (sub ? `${top.name} › ${sub.name}` : top.name) : 'Annet'; };
export function catTree() {
  linkLegacy();
  const rows = q('SELECT c.*, (SELECT count(*) FROM fh_folder_entries e WHERE e.category_id=c.id) AS cnt FROM fh_bolig_categories c ORDER BY c.sort, c.id').all();
  const tops = rows.filter((r) => !r.parent_id);
  return tops.map((t) => {
    const children = rows.filter((r) => r.parent_id === t.id).map((s) => ({ id: s.id, name: s.name, color: s.color, parentId: t.id, ai: !!s.created_by_ai, count: s.cnt }));
    return { id: t.id, name: t.name, color: t.color, parentId: null, ai: !!t.created_by_ai, count: t.cnt + children.reduce((a, s) => a + s.count, 0), children };
  });
}
// Valgliste for skjemaer: hovedkategori og «Hovedkategori › Underkategori».
export const catOptions = () => catTree().flatMap((t) => [{ id: t.id, label: t.name, color: t.color }, ...t.children.map((s) => ({ id: s.id, label: `${t.name} › ${s.name}`, color: t.color, sub: true }))]);
// Felt til en utgift i JSON-svaret.
export function entryCat(e) {
  const { top, sub } = catPair(e.category_id);
  const name = top?.name ?? e.category ?? 'Annet';
  return { categoryId: e.category_id ?? null, category: name, subcategory: sub?.name ?? null, categoryLabel: sub ? `${name} › ${sub.name}` : name,
    color: top?.color ?? LEGACY_COLORS[name] ?? '#6E6E78', aiCategory: !!e.ai_cat };
}
export const colorOf = (name) => findTop(name)?.color ?? LEGACY_COLORS[name] ?? null;
export const aiNewAllowed = () => settings().boligAiNew !== false;

/* ---------- Heuristikk (uten AI) ---------- */

const RULES = [
  [/blomst|plante|stauder|løk\b|rose|blomsterbutikk|mester grønn/i, 'Hage og uteområde', 'Blomster'],
  [/jord\b|gjødsel|kompost|bark\b|plantejord/i, 'Hage og uteområde', 'Jord og gjødsel'],
  [/plen|gress|gressklipper|robotklipper|plenfrø/i, 'Hage og uteområde', 'Plen'],
  [/plantasjen|hage|uteområde|hekk|beskjær/i, 'Hage og uteområde', null],
  [/hagemøbler|utemøbler|parasoll|solseng/i, 'Møbler og interiør', 'Hagemøbler'],
  [/ikea|bohus|skeidar|jysk|kid interiør|sofa|møbel|interiør|bord\b|stol\b|seng\b/i, 'Møbler og interiør', null],
  [/snekker|tømrer/i, 'Håndverker', 'Snekker'],
  [/elektriker|elektro|el-installatør|sikringsskap/i, 'Håndverker', 'Elektriker'],
  [/rørlegger|vvs|sanitær/i, 'Håndverker', 'Rørlegger'],
  [/håndverk|murer|maler(firma|mester)|blikkenslager|byggmester/i, 'Håndverker', null],
  [/pumpe|filter|sandfilter/i, 'Basseng', 'Pumpe og filter'],
  [/klor|ph[- ]?(minus|pluss)|kjemikal|algemiddel/i, 'Basseng', 'Kjemikalier'],
  [/basseng|pool|spa\b|boblebad/i, 'Basseng', null],
  [/snømåking|brøyt|strøsand/i, 'Vaktmester', 'Snømåking'],
  [/vaktmester|vaktmestertjeneste/i, 'Vaktmester', null],
  [/reparasjon|reparert|service på|utbedring/i, 'Reparasjon', null],
  [/maling|beis|jotun|flügger|panel|trelast|byggevarer|maxbo|byggmakker|montér|obs bygg|xl-bygg/i, 'Vedlikehold', 'Maling og bygg'],
  [/fjordkraft|tibber|strøm|hafslund|elvia|nettleie|lyse\b|kraft/i, 'Strøm', null],
  [/vann|avløp|septik/i, 'Vann og avløp', null],
  [/kommun|renovasjon|eiendomsskatt|feiing|avgift/i, 'Kommunale avgifter', null],
  [/forsikring|gjensidige|if skade|tryg|fremtind|storebrand/i, 'Forsikring', null],
  [/biltema|jernia|clas ohlson|vedlikehold|verktøy|ved\b|pellets/i, 'Vedlikehold', null],
  [/rema|kiwi|meny|coop|extra|joker|bunnpris|spar\b/i, 'Dagligvarer', null],
];
// Gir kategori-ID (underkategori hvis den finnes) fra tekst. Lager aldri nye kategorier; mangler regelen, «Annet».
export function heuristicCat(text) {
  const s = String(text ?? '');
  for (const [re, topName, subName] of RULES) {
    if (!re.test(s)) continue;
    const top = findTop(topName);
    if (!top) continue;
    const sub = subName ? findSub(top.id, subName) : null;
    return (sub ?? top).id;
  }
  return (findTop('Annet') ?? insertCat('Annet')).id;
}

/* ---------- AI-kategorisering ---------- */

const SCHEMA = { type: 'object', properties: { category: { type: 'string' }, subcategory: { type: 'string', nullable: true }, is_new: { type: 'boolean' } }, required: ['category', 'is_new'] };
const PROMPT = (text, tree, allowNew) => `Du kategoriserer en utgift for en bolig (hus, hytte eller utleie) i Norge. Svar KUN med JSON.
Eksisterende kategorier (hovedkategori: underkategorier):
${tree.map((t) => `- ${t.name}${t.children.length ? ': ' + t.children.map((s) => s.name).join(', ') : ''}`).join('\n')}
Regler:
- Velg den hovedkategorien og eventuelt underkategorien som passer best. Bruk nøyaktig navnene over.
- subcategory er null hvis ingen underkategori passer, eller hvis hovedkategorien ikke har noen.
${allowNew ? `- Passer ingen hovedkategori, lag en ny kort norsk kategori (f.eks. «Sikkerhet» med underkategori «Alarm» for Verisure, «Oppvarming» › «Ved og pellets»), og sett is_new=true.
- Passer hovedkategorien, men ingen underkategori, kan du lage en ny underkategori (f.eks. «Møbler og interiør» › «Sofa») med is_new=true.` : '- Du kan IKKE lage nye kategorier. Velg alltid blant de eksisterende (bruk «Annet» hvis ingenting passer), og sett is_new=false.'}
Utgift:
"""
${String(text).slice(0, 4000)}
"""`;

// Spør AI om kategori for teksten. Gir { id, created: [navn …] } eller kaster hvis ingen motor svarer.
export async function aiCat(text, { allowNew = aiNewAllowed() } = {}) {
  const tree = catTree();
  const x = await askJson(PROMPT(text, tree, allowNew), SCHEMA, { timeout: 30_000, task: 'categorize' });
  const topName = clean(x.category), subName = x.subcategory ? clean(x.subcategory) : '';
  if (!topName) throw new Error('AI ga ingen kategori');
  const created = [];
  let top = findTop(topName);
  if (!top) {
    if (!allowNew) return { id: heuristicCat(text), created };
    top = insertCat(topName, { ai: true }); created.push(top.name);
  }
  let sub = subName ? findSub(top.id, subName) : null;
  if (subName && !sub && allowNew) { sub = insertCat(subName, { parentId: top.id, ai: true }); created.push(`${top.name} › ${sub.name}`); }
  return { id: (sub ?? top).id, created };
}

// Etter at en utgift er lagt inn med heuristisk kategori: la AI forbedre den i bakgrunnen.
// Brukerens eget valg overstyres aldri (manual=true på posten hoppes over av kalleren).
const notices = [];
export function refineEntry(entryId, text) {
  setImmediate(async () => {
    try {
      const { id, created } = await aiCat(text);
      const e = q('SELECT * FROM fh_folder_entries WHERE id=?').get(entryId);
      if (!e || !id || e.cat_manual) return;
      const top = catPair(id).top;
      q('UPDATE fh_folder_entries SET category_id=?, category=?, ai_cat=? WHERE id=?').run(id, top?.name ?? e.category, created.length ? 1 : 0, entryId);
      if (created.length) notices.push({ folderId: e.folder_id, entryId, text: `✦ AI laget ${created.length === 1 ? 'kategorien' : 'kategoriene'} ${created.map((n) => `«${n}»`).join(' og ')} for «${e.description}»`, at: Date.now() });
      if (notices.length > 50) notices.splice(0, notices.length - 50);
    } catch { /* ingen AI – den heuristiske kategorien blir stående */ }
  });
}
export const noticesFor = (folderId, since = 0) => notices.filter((n) => n.folderId === folderId && n.at > since);
// Setter kategori på en ny post: eksplisitt valg vinner, ellers heuristikk nå og AI etterpå.
// ai=false hopper over AI (f.eks. når kategorien kommer fra et prosjekt).
export function assignCategory(entryId, text, chosenId, { ai = true } = {}) {
  const e = q('SELECT cat_manual FROM fh_folder_entries WHERE id=?').get(entryId);
  if (!e || (e.cat_manual && !chosenId)) return;
  const chosen = chosenId ? catById(+chosenId) : null;
  const id = chosen ? chosen.id : heuristicCat(text);
  const top = catPair(id).top;
  q('UPDATE fh_folder_entries SET category_id=?, category=?, ai_cat=0, cat_manual=? WHERE id=?').run(id, top?.name ?? 'Annet', chosen && ai ? 1 : 0, entryId);
  if (!chosen && ai) refineEntry(entryId, text);
}

/* ---------- Oppsett av boligsiden (per bruker) ---------- */

export const LAYOUT_CARDS = [['kpi', 'Nøkkeltall'], ['months', 'Utgifter per måned'], ['cats', 'Kategorier'], ['projects', 'Prosjekter'], ['bills', 'Faste regninger'], ['add', 'Legg til utgift'], ['entries', 'Utgifter']];
const IDS = LAYOUT_CARDS.map(([id]) => id);
export function layoutFor(uid) {
  const v = kv.get(uid, 'fh_bolig_layout', null) ?? {};
  const order = [...new Set((Array.isArray(v.order) ? v.order : []).filter((x) => IDS.includes(x)))];
  for (const id of IDS) if (!order.includes(id)) order.splice(IDS.indexOf(id), 0, id);
  return { order, hid: [...new Set((Array.isArray(v.hid) ? v.hid : []).filter((x) => IDS.includes(x)))], cards: LAYOUT_CARDS.map(([id, name]) => ({ id, name })) };
}

/* ---------- API (/finans/api/boliger) ---------- */

export const bolApi = new Hono();
// Kategoriene deles av alle boliger, så bare administratorer kan endre dem (prompt 21: en eier av én bolig skal ikke
// kunne endre kategoriene for alle andre).
const canManage = (c) => !!c.get('access')?.admin;
const writeOk = (c) => c.get('access')?.session || c.get('access')?.scopes?.has('finance:write');
const catsOut = (c) => c.json({ categories: catTree(), options: catOptions(), aiNew: aiNewAllowed(), canManage: canManage(c) });

bolApi.get('/categories', (c) => catsOut(c));
bolApi.post('/categories', async (c) => {
  if (!canManage(c) || !writeOk(c)) return bad(c, 'Bare administratorer kan endre kategoriene', 403);
  const b = await c.req.json().catch(() => ({}));
  const name = clean(b.name);
  if (!name) return bad(c, 'Skriv et navn på kategorien');
  const parent = b.parentId ? catById(+b.parentId) : null;
  if (b.parentId && (!parent || parent.parent_id)) return bad(c, 'Underkategorier kan bare ligge under en hovedkategori');
  if (parent ? findSub(parent.id, name) : findTop(name)) return bad(c, `«${name}» finnes allerede`);
  insertCat(name, { parentId: parent?.id ?? null, color: /^#[0-9a-f]{6}$/i.test(b.color ?? '') ? b.color : undefined });
  return catsOut(c);
});
bolApi.patch('/categories/:id', async (c) => {
  if (!canManage(c) || !writeOk(c)) return bad(c, 'Bare administratorer kan endre kategoriene', 403);
  const cat = catById(+c.req.param('id'));
  if (!cat) return c.notFound();
  const b = await c.req.json().catch(() => ({}));
  const name = b.name !== undefined ? clean(b.name) : cat.name;
  if (!name) return bad(c, 'Skriv et navn på kategorien');
  const clash = cat.parent_id ? findSub(cat.parent_id, name) : findTop(name);
  if (clash && clash.id !== cat.id) return bad(c, `«${name}» finnes allerede`);
  q('UPDATE fh_bolig_categories SET name=?, color=?, created_by_ai=0 WHERE id=?').run(name, /^#[0-9a-f]{6}$/i.test(b.color ?? '') ? b.color : cat.color, cat.id);
  if (!cat.parent_id) q('UPDATE fh_folder_entries SET category=? WHERE category=?').run(name, cat.name);
  return catsOut(c);
});
// Fjerner en kategori. Utgiftene beholdes: fra en underkategori flyttes de til hovedkategorien, fra en hovedkategori til «Annet».
bolApi.delete('/categories/:id', (c) => {
  if (!canManage(c) || !writeOk(c)) return bad(c, 'Bare administratorer kan endre kategoriene', 403);
  const cat = catById(+c.req.param('id'));
  if (!cat) return c.notFound();
  db.transaction(() => {
    if (cat.parent_id) q('UPDATE fh_folder_entries SET category_id=? WHERE category_id=?').run(cat.parent_id, cat.id);
    else {
      const other = cat.name === 'Annet' ? null : (findTop('Annet') ?? insertCat('Annet'));
      const ids = [cat.id, ...q('SELECT id FROM fh_bolig_categories WHERE parent_id=?').pluck().all(cat.id)];
      for (const id of ids) q('UPDATE fh_folder_entries SET category_id=?, category=? WHERE category_id=?').run(other?.id ?? null, other?.name ?? null, id);
    }
    q('DELETE FROM fh_bolig_categories WHERE id=?').run(cat.id);
  })();
  return catsOut(c);
});
// Nullstill: standardkategoriene kommer tilbake, og egne eller AI-lagde kategorier uten utgifter fjernes.
// Kategorier som er i bruk beholdes, så ingen utgifter mister kategorien sin.
bolApi.post('/categories/reset', (c) => {
  if (!canManage(c) || !writeOk(c)) return bad(c, 'Bare administratorer kan endre kategoriene', 403);
  db.transaction(() => {
    const def = new Map(DEFAULT_TREE.map(([n, , subs]) => [n.toLowerCase(), new Set(subs.map((s) => s.toLowerCase()))]));
    const used = (id) => !!q('SELECT 1 FROM fh_folder_entries WHERE category_id=? LIMIT 1').get(id);
    for (const s of q('SELECT s.*, t.name AS top FROM fh_bolig_categories s JOIN fh_bolig_categories t ON t.id=s.parent_id').all()) {
      if (!def.get(s.top.toLowerCase())?.has(s.name.toLowerCase()) && !used(s.id)) q('DELETE FROM fh_bolig_categories WHERE id=?').run(s.id);
    }
    for (const t of q('SELECT * FROM fh_bolig_categories WHERE parent_id IS NULL').all()) {
      const kids = q('SELECT count(*) FROM fh_bolig_categories WHERE parent_id=?').pluck().get(t.id);
      if (!def.has(t.name.toLowerCase()) && !used(t.id) && !kids) q('DELETE FROM fh_bolig_categories WHERE id=?').run(t.id);
    }
    seedDefaults();
    DEFAULT_TREE.forEach(([n], i) => q('UPDATE fh_bolig_categories SET sort=? WHERE parent_id IS NULL AND lower(name)=lower(?)').run(i + 1, n));
  })();
  return catsOut(c);
});
bolApi.put('/settings', async (c) => {
  if (!canManage(c) || !writeOk(c)) return bad(c, 'Bare administratorer kan endre dette', 403);
  const b = await c.req.json().catch(() => ({}));
  if (typeof b.aiNew === 'boolean') saveSettings({ boligAiNew: b.aiNew });
  return catsOut(c);
});
bolApi.get('/layout', (c) => c.json(layoutFor(c.get('user'))));
bolApi.put('/layout', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (b.reset) kv.del(c.get('user'), 'fh_bolig_layout');
  else kv.set(c.get('user'), 'fh_bolig_layout', { order: Array.isArray(b.order) ? b.order.slice(0, 20) : [], hid: Array.isArray(b.hid) ? b.hid.slice(0, 20) : [] });
  return c.json(layoutFor(c.get('user')));
});
// Brukes av «Legg i bolig» og AI-forslag i skjemaet: hvilken kategori ville en tekst fått?
bolApi.post('/categories/suggest', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const text = clean(b.text, 2000);
  if (!text) return bad(c, 'Mangler tekst');
  try { const r = await aiCat(text, { allowNew: false }); return c.json({ id: r.id, label: catLabel(r.id), engine: 'ai' }); } catch { const id = heuristicCat(text); return c.json({ id, label: catLabel(id), engine: 'regler' }); }
});

/* ---------------- Kommende forfall (prompt 16) ---------------- */
// Faste regninger og avdrag som ikke er betalt, sortert etter dato. Forfall kan stå som ISO-dato eller «dd.mm»
// (da regnes neste gang datoen kommer). Brukes av boligsiden på web og i appene.
const DAY = 86_400_000;
export function dueDate(raw, today = new Date()) {
  const s = String(raw ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/);
  if (!m) return null;
  const d = +m[1], mo = +m[2];
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  let y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : today.getFullYear();
  const iso = (yy) => `${yy}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // Uten år: er datoen passert for over en måned siden, gjelder neste år.
  if (!m[3] && new Date(iso(y) + 'T12:00') < new Date(today.getTime() - 31 * DAY)) y += 1;
  return iso(y);
}
export function upcomingOf(out, { days = 90, today = new Date() } = {}) {
  const t0 = new Date(today.toISOString().slice(0, 10) + 'T00:00').getTime();
  const rows = [];
  for (const b of out.bills ?? []) {
    const date = dueDate(b.nextDue, today);
    if (date) rows.push({ kind: 'bill', id: b.id, title: b.category, sub: [b.name, b.freq, b.payer].filter(Boolean).join(' · '), amount: b.last?.amount ?? null, date, color: b.color });
  }
  for (const p of out.projects ?? []) for (const x of p.installments ?? []) {
    if (x.paid) continue;
    const date = dueDate(x.due, today);
    if (date) rows.push({ kind: 'installment', id: x.id, projectId: p.id, title: x.label, sub: `${p.name}${p.vendor ? ' · ' + p.vendor : ''}`, amount: x.amount, date, color: p.color });
  }
  return rows.map((r) => ({ ...r, days: Math.round((new Date(r.date + 'T00:00').getTime() - t0) / DAY) }))
    .filter((r) => r.days <= days).sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- Bakgrunn per bolig (prompt 24) ---------- */
// fh_folders.background: 'color' | 'preset:stromstad' | 'upload:<versjon>'. Tom (NULL) = standard: Strømstad-bildet når
// «Strømstad» står i navnet eller adressen, ellers farge. Opplastede bilder ligger i DATA_DIR/boliger/<id>/bg.jpg,
// skalert til maks 1200 px med ImageMagick når det finnes (ellers lagres bildet slik klienten sendte det).
if (!q('PRAGMA table_info(fh_folders)').all().some((c) => c.name === 'background')) db.exec('ALTER TABLE fh_folders ADD COLUMN background TEXT');

export const BG_PRESETS = { stromstad: { label: 'Strømstad', url: '/assets/boliger/stromstad.webp', jpg: '/assets/boliger/stromstad.jpg' } };
const BG_RE = /^(color|preset:[a-z0-9-]{1,30}|upload:[a-f0-9]{8,32})$/;
export const validBackground = (v) => typeof v === 'string' && BG_RE.test(v) && (!v.startsWith('preset:') || !!BG_PRESETS[v.slice(7)]);
export const defaultBackground = (f) => (/str[øo]mstad/i.test(`${f.name ?? ''} ${f.address ?? ''}`) ? 'preset:stromstad' : 'color');
/** {background, backgroundUrl, backgroundJpgUrl} for en bolig. */
export function backgroundOf(f) {
  const bg = f.background && validBackground(f.background) ? f.background : defaultBackground(f);
  if (bg.startsWith('preset:')) { const p = BG_PRESETS[bg.slice(7)]; return { background: bg, backgroundUrl: p.url, backgroundJpgUrl: p.jpg, backgroundDefault: !f.background }; }
  if (bg.startsWith('upload:')) return { background: bg, backgroundUrl: `/finans/api/folders/${f.id}/bg?v=${bg.slice(7)}`, backgroundJpgUrl: `/finans/api/folders/${f.id}/bg?v=${bg.slice(7)}`, backgroundDefault: false };
  return { background: 'color', backgroundUrl: null, backgroundJpgUrl: null, backgroundDefault: !f.background };
}
