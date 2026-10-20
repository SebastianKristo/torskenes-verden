// Prompt 42 (SERVER42): Boliger på web (2a forside + 1b «Kontobok») – det fasiten Boliger Web.dc.html trenger, og import rett til Boliger.
// claude-code-boliger-web-kontobok.md, -forside-2a.md, -sok-scope.md, claude-code-import-til-boliger.md.
// Budsjett og regninger slettes ikke (data), de vises bare ikke. Alt under /finans/api (økt eller token), samme tilgang som /folders.
//
// GET    /boliger/oversikt?year=                 → {year, sumYear, count, todo:[{type:'review', count, homeId?}|{type:'missing_receipt', …}], homes:[home]}
// GET    /homes/:id/years                         → {years:[{year, total, count, label}], first, current}  (årsboksene, eldst til venstre)
// GET    /homes/:id/expenses?year=&month=&category=&project=&q= → {items:[expense], sum, count, period:{year, month, label}}
// GET    /homes/:id/expenses/:eid                 → kvitteringspanelet: {…expense, logo, lines, aiShort, aiLong, receipt:{…, fileUrl, thumbUrl, isPdf}, chips, projects}
// POST   /homes/:id/expenses/:eid/reanalyze       → «✦ Analyser på nytt med Glimt» (bakgrunnsjobb via /receipts/:rid/reanalyze) → 202 {jobId, …}
// GET    /homes/:id/review                        → {title:'Glimt har lest 2 kvitteringer', items:[expense + chips + missingAmount]}
// GET    /homes/:id/categories?year=&month=       → {period, kpi, cards:[…alle kategoriene, brukte først], text}
// GET    /homes/:id/categories/:cid?range=month|year|all&year=&month= → {category, items, sum, count, label}
// POST   /homes/:id/categories {name, color?}     → egen kategori; DELETE /homes/:id/categories/:cid (utgiftene flyttes til «Annet»)
// POST   /homes/:id/categories/glimt {text}       → Glimt velger eller lager kategori → {category, created, toast}
// GET    /homes/:id/projects?year=                → {projects:[kort], count, total, text:'2 prosjekter · 1 289 kr samlet'}
// POST   /homes/:id/projects {name, status?, budget?, color?} · PATCH/DELETE /homes/:id/projects/:pid (sletting kobler fra, sletter ikke utgifter)
// GET    /homes/:id/projects/:pid                 → {project, items, suggestions:[8 siste ukoblede]}
// POST   /homes/:id/projects/:pid/items {entryIds?, txIds?, receiptIds?} → {linked, entryIds, undo, project}
// DELETE /homes/:id/projects/:pid/items/:eid      → kobler fra
// POST   /homes/:id/projects/:pid/glimt {q}       → «✦ Spør Glimt»: {terms, items:[kandidat + checked:true], total, text} (kobler aldri selv)
// GET    /homes/:id/search?q= · /boliger/search?q= → {text, cards, hits, searched, homeName} (søk avgrenset til bolig)
// GET/PUT /import/home-rules · POST /import/home-rules/run {days} · POST /import?home=<id>&commit=1 (mellomvare)
import { Hono } from 'hono';
import { db, me, settings } from './db.js';
import { catTree, catPair, catById, entryCat, assignCategory, linkLegacy, aiCat, aiNewAllowed } from './boliger.js';
import { matchMerchant, hasFile } from '../logos/match.js';
import { domainFor } from './enrich.js';
import { fold42, stem42, synonymsOf42, parsePeriod42 } from './search42.js';
import { kv, OWNER } from '../db.js';

const q = (sql) => db.prepare(sql);
const MON = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => iso(new Date());
const dLabel = (s) => (s ? `${+s.slice(8, 10)}. ${MON[+s.slice(5, 7) - 1]}` : '');
const krN = (v) => Math.round(Math.abs(v)).toLocaleString('nb-NO').replace(/\s/g, ' ');
const kr = (v) => `${krN(v)} kr`;
const str = (v, n = 120) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const ore = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : null; };
const bad = (c, msg, code = 400) => c.json({ error: msg }, code);

/* ---------------- Skjema (additivt) ---------------- */

const addCol = (t, col, def) => { if (!q(`PRAGMA table_info(${t})`).all().some((x) => x.name === col)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${col} ${def}`); };
addCol('fh_folder_projects', 'status', "TEXT NOT NULL DEFAULT 'Pågår'");   // Planlagt | Pågår | Ferdig
addCol('fh_folder_projects', 'color', 'TEXT');
addCol('fh_folder_projects', 'budget_set', 'INTEGER NOT NULL DEFAULT 1');  // 0 = uten budsjett (prompt 42: valgfritt)
addCol('fh_bolig_categories', 'created_by', 'TEXT');                      // bruker-id for egne kategorier, 'glimt' for Glimt
db.exec(`CREATE TABLE IF NOT EXISTS import_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, account_id INTEGER, home_id INTEGER NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'account', merchants TEXT NOT NULL DEFAULT '[]', mode TEXT NOT NULL DEFAULT 'review', enabled INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS import_rules_u ON import_rules(user_id);`);

// Kategorier = hva som ble kjøpt (prompt 42). Legges til i tillegg til de gamle (ingenting slettes).
export const WHAT_CATS42 = [['Blomster', '#E89BD0'], ['Møbler', '#B79CFF'], ['Mat og drikke', '#C9E265'], ['Maling', '#FFB08A'], ['Verktøy', '#7AA7FF'], ['Byggevarer', '#C9B27A'],
  ['Lys og elektrisk', '#F2C14E'], ['Rengjøring', '#7FD1B9'], ['Interiør', '#F7A8D8'], ['Hage', '#5FD3A8'], ['Strøm', '#F2C14E'], ['Avgifter', '#B79CFF'], ['Annet', '#6E6E78']];
if (!kv.get(OWNER, 'fh_bolig_cat_v42', false)) {
  const ins = q('INSERT INTO fh_bolig_categories(name,color,parent_id,created_by_ai,sort,created) VALUES(?,?,NULL,0,?,?)');
  db.transaction(() => {
    let sort = (q('SELECT ifnull(max(sort),0) FROM fh_bolig_categories WHERE parent_id IS NULL').pluck().get() ?? 0) + 1;
    for (const [n, col] of WHAT_CATS42) if (!q('SELECT 1 FROM fh_bolig_categories WHERE parent_id IS NULL AND lower(name)=lower(?)').get(n)) ins.run(n, col, sort++, Date.now());
  })();
  kv.set(OWNER, 'fh_bolig_cat_v42', true);
}
const findTop = (name) => q('SELECT * FROM fh_bolig_categories WHERE parent_id IS NULL AND lower(name)=lower(?)').get(name);
const AI_COLORS = ['#4FC3E8', '#8FD3FF', '#C9E265', '#FF6B8B', '#9DBDFF', '#E6E6AE', '#F7A8D8', '#7FD1B9', '#FFC27A'];
function createCat(name, { by = null, ai = false, color = null } = {}) {
  const n = str(name, 40).replace(/^./, (x) => x.toUpperCase());
  const ex = findTop(n);
  if (ex) return { cat: ex, created: false };
  const col = color || AI_COLORS[q('SELECT count(*) FROM fh_bolig_categories WHERE parent_id IS NULL').pluck().get() % AI_COLORS.length];
  const cat = q('INSERT INTO fh_bolig_categories(name,color,parent_id,created_by_ai,sort,created,created_by) VALUES(?,?,NULL,?,(SELECT ifnull(max(sort),0)+1 FROM fh_bolig_categories WHERE parent_id IS NULL),?,?) RETURNING *')
    .get(n, col, ai ? 1 : 0, Date.now(), ai ? 'glimt' : by);
  return { cat, created: true };
}
// «Hva ble kjøpt» fra butikk/tekst (lokalt). [regex, kategori]
const WHAT_RULES = [
  [/blomst|plante|bukett|tulipan|rose\b|stauder|mester grønn|plantasjen/i, 'Blomster'], [/sofa|stol\b|bord\b|seng\b|møbel|hagemøbler|ikea|bohus|skeidar|jysk/i, 'Møbler'],
  [/rema|kiwi|meny|coop|extra|joker|bunnpris|spar\b|ica\b|mat\b|drikke|dagligvar/i, 'Mat og drikke'], [/maling|beis|jotun|flügger|pensel|grunning|sparkel/i, 'Maling'],
  [/verktøy|drill|skrutrekker|sag\b|hammer|biltema|jula|jernia|clas ohlson/i, 'Verktøy'], [/trelast|byggevare|maxbo|byggmakker|montér|obs bygg|xl-bygg|plank|gips|skruer/i, 'Byggevarer'],
  [/lyspære|lampe|lys\b|skjøteledning|kabel|elektr|stikkontakt/i, 'Lys og elektrisk'], [/vask|rengjør|oppvask|klut|såpe|zalo|omo/i, 'Rengjøring'],
  [/pute|teppe|gardin|vase|interiør|kid interiør|lene bjerre|pynt/i, 'Interiør'], [/jord\b|gjødsel|plen|hage|gress|hekk|bark\b/i, 'Hage'],
  [/fjordkraft|tibber|strøm|hafslund|elvia|nettleie|kraft|energi/i, 'Strøm'], [/kommun|renovasjon|eiendomsskatt|feiing|avgift|vann og avløp/i, 'Avgifter'],
];
// Ord som gir en ny, konkret kategori når ingen eksisterende passer (Glimt lokalt). [regex, navn]
const NEW_CATS = [[/basseng|pool\b|klor|ph[- ]?(minus|pluss)|bassengduk|bassengpumpe/i, 'Basseng'], [/\bved\b|pellets|brensel|tennbrikett/i, 'Ved og brensel'], [/grill|gassflaske|kull\b/i, 'Grill'],
  [/båt|motorbåt|påhengsmotor|fortøyning|brygge/i, 'Båt og brygge'], [/alarm|verisure|sector alarm/i, 'Sikkerhet'], [/varmepumpe|fyringsolje|peis/i, 'Oppvarming']];
/** Lokal kategorisering: eksisterende «hva ble kjøpt»-kategori, ellers en ny konkret kategori når teksten tydelig handler om noe nytt. */
export function guessCategory42(text, { allowNew = true } = {}) {
  const s = String(text ?? '');
  for (const [re, name] of NEW_CATS) if (re.test(s)) { const ex = findTop(name); if (ex) return { cat: ex, created: false }; if (allowNew) return { ...createCat(name, { ai: true }), glimt: true }; }
  for (const [re, name] of WHAT_RULES) if (re.test(s)) { const c = findTop(name); if (c) return { cat: c, created: false }; }
  return { cat: findTop('Annet') ?? createCat('Annet').cat, created: false };
}
/** Glimt (AI med eksisterende liste, ellers lokalt) velger eller lager kategori for en tekst. */
export async function glimtCategory42(text, { useAi = process.env.NODE_ENV !== 'test' } = {}) {
  if (NEW_CATS.some(([re]) => re.test(String(text ?? '')))) return guessCategory42(text, { allowNew: aiNewAllowed() });
  const local = guessCategory42(text, { allowNew: false });
  if (local.cat && local.cat.name !== 'Annet') return local;
  if (useAi) {
    try {
      const r = await Promise.race([aiCat(text, { allowNew: aiNewAllowed() }), new Promise((_, rej) => setTimeout(() => rej(new Error('tid')), 8000))]);
      const top = catPair(r.id).top;
      if (top && r.created?.length) q("UPDATE fh_bolig_categories SET created_by='glimt', created_by_ai=1 WHERE id=?").run(top.id);
      if (top) return { cat: catById(top.id), created: !!r.created?.length, glimt: true };
    } catch { /* lokalt under */ }
  }
  return guessCategory42(text, { allowNew: aiNewAllowed() });
}

/* ---------------- Tilgang ---------------- */

/** «Send fra e-post»: boligens adresse (pluss-adresse på kvitteringskontoen, f.eks. kvitteringer+stromstad@domene). */
export function mailAddress42(f) {
  const slug = fold42(f.name).replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `bolig-${f.id}`;
  let user = '';
  try { user = String(settings().imapUser ?? ''); } catch { /* */ }
  const m = user.match(/^([^@+]+)@(.+)$/);
  return m ? `${m[1]}+${slug}@${m[2]}` : `${slug}@kvitteringer`;
}
const ROLES = { owner: 'Eier', editor: 'Kan se og legge inn', viewer: 'Kan bare se' };
/** → {f, m} eller {err:[melding, status]}. need: 'view' | 'edit'. */
export function homeAccess42(u, id, need = 'view', access = null) {
  const f = q('SELECT * FROM fh_folders WHERE id=?').get(+id);
  const m = f ? q('SELECT * FROM fh_folder_members WHERE folder_id=? AND user_id=?').get(f.id, u) : null;
  if (!f || !m) return { err: ['Fant ikke boligen', 404] };
  if (need === 'edit' && m.role === 'viewer') return { err: ['Du har lesetilgang. Be en eier om redigeringstilgang.', 403] };
  if (need === 'edit' && access && !access.session && !access.scopes?.has?.('finance:write')) return { err: ['Tokenet mangler tilgangen finance:write', 403] };
  return { f, m };
}
export const homesOf42 = (u) => q('SELECT f.*, m.role FROM fh_folders f JOIN fh_folder_members m ON m.folder_id=f.id AND m.user_id=? ORDER BY f.id').all(u);

/* ---------------- Utgifter ---------------- */

const LOGO = (name) => {
  let m = null; try { m = matchMerchant(name); } catch { /* */ }
  if (m?.id && hasFile(m.id)) return { id: m.id, url: `/finans/api/logos/file/${m.id}`, name: m.navn, color: m.farge ?? null };
  const d = m?.domene || domainFor(name);
  return { id: m?.id ?? null, url: d ? `/finans/api/logo/${d}` : null, name: m?.navn ?? null, color: m?.farge ?? null, letter: String(name ?? '?').trim().slice(0, 1).toUpperCase() };
};
const rc = (id) => (id ? q('SELECT id, file, thumb, mime, name, status, merchant, total, date, extraction, ai_short, ai_long, user_id FROM fh_receipts WHERE id=?').get(id) : null);
const linesOf = (r) => { try { return (JSON.parse(r?.extraction ?? 'null')?.lines ?? []).filter((l) => l?.description).map((l) => ({ name: l.description, amount: l.amount != null ? +l.amount : null, discount: +l.amount < 0 })); } catch { return []; } };
const memberName = (fid, uid) => q('SELECT name FROM fh_folder_members WHERE folder_id=? AND user_id=?').pluck().get(fid, uid);
function expenseOut(e, f, { full = false } = {}) {
  const r = rc(e.receipt_id);
  const cat = entryCat(e);
  const proj = e.project_id ? q('SELECT id, name FROM fh_folder_projects WHERE id=? AND folder_id=?').get(e.project_id, f.id) : null;
  const tx = e.tx_id ? q('SELECT ai_short, ai_long, merchant, description FROM fh_transactions WHERE id=?').get(e.tx_id) : null;
  const merchant = String(e.description ?? '').split(' · ')[0];
  const out = { id: e.id, homeId: f.id, homeName: f.name, date: e.date, dateLabel: dLabel(e.date), merchant, description: e.description, what: String(e.description ?? '').split(' · ').slice(1).join(' · ') || null,
    amount: e.amount / 100, amountLabel: `−${(e.amount / 100).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, '\u00a0')}\u00a0kr`, paidBy: e.paid_by, ...cat, project: proj?.name ?? null, projectId: proj?.id ?? null,
    status: e.status === 'review' ? 'review' : 'ok', txId: e.tx_id ?? null, receiptId: e.receipt_id ?? null, hasReceipt: !!r?.file, receiptLabel: r?.file ? 'Vis ›' : 'Mangler',
    thumbUrl: r?.file ? `/finans/api/folders/${f.id}/receipts/${r.id}/thumb` : null, fileUrl: r?.file ? `/finans/api/folders/${f.id}/receipts/${r.id}/file` : null,
    missingAmount: !e.amount, glimtCategory: !!catPair(e.category_id).top?.created_by_ai };
  if (!full) return out;
  return { ...out, logo: LOGO(merchant), lines: linesOf(r), aiShort: r?.ai_short ?? tx?.ai_short ?? null, aiLong: r?.ai_long ?? tx?.ai_long ?? null, aiTitle: 'Glimt leste kvitteringen',
    receipt: r ? { id: r.id, name: r.name ?? null, mime: r.mime ?? null, isPdf: r.mime === 'application/pdf', status: r.status, fileUrl: out.fileUrl, thumbUrl: out.thumbUrl, originalLabel: 'Se originalen ⤢',
      card: { title: 'Vis original kvittering', sub: r.name ? r.name : `Kvittering fra ${dLabel(r.date ?? e.date)} · ${merchant}` }, reanalyze: { label: 'Analyser på nytt med Glimt', sub: 'Leser originalen igjen · butikk, beløp, varelinjer og kategori', busyLabel: 'Glimt leser kvitteringen …' } } : null,
    chips: chipsFor(e), projects: q('SELECT id, name FROM fh_folder_projects WHERE folder_id=? ORDER BY id').all(f.id), homes: homesOf42(me()).map((h) => ({ id: h.id, name: h.name })) };
}
/** Kategori-chips på kvitteringskortet: Glimts forslag (valgt) + 3 alternativer (nest beste + mest brukte). */
function chipsFor(e) {
  const cur = catPair(e.category_id).top;
  const guess = guessCategory42(e.description, { allowNew: false }).cat;
  const used = q('SELECT c.id, c.name, c.color, count(*) n FROM fh_folder_entries x JOIN fh_bolig_categories c ON c.id=x.category_id WHERE c.parent_id IS NULL GROUP BY c.id ORDER BY n DESC LIMIT 6').all();
  const list = [cur, guess, ...used].filter(Boolean);
  const seen = new Set(), out = [];
  for (const c of list) { if (seen.has(c.id)) continue; seen.add(c.id); out.push({ id: c.id, name: c.name, color: c.color, selected: c.id === (cur?.id ?? guess?.id), ai: !!c.created_by_ai }); if (out.length >= 4) break; }
  return out;
}
const yearOf = (y) => (/^\d{4}$/.test(String(y ?? '')) ? +y : new Date().getFullYear());
function periodOf(qs) {
  const y = yearOf(qs.year);
  if (/^\d{4}-\d{2}$/.test(qs.month ?? '')) { const [yy, mm] = qs.month.split('-').map(Number); return { from: `${qs.month}-01`, to: iso(new Date(yy, mm, 1, 12)), year: yy, month: qs.month, label: `${MONTHS[mm - 1]} ${yy}` }; }
  if (qs.range === 'all') return { from: '0000-01-01', to: '9999-12-31', year: null, month: null, label: 'alt' };
  return { from: `${y}-01-01`, to: `${y + 1}-01-01`, year: y, month: null, label: String(y) };
}
const entriesIn = (fid, P) => q('SELECT * FROM fh_folder_entries WHERE folder_id=? AND date>=? AND date<? ORDER BY date DESC, id DESC').all(fid, P.from, P.to);

/* ---------------- Oversikt og år ---------------- */

export function overview42(u, year = new Date().getFullYear()) {
  linkLegacy();
  const ys = `${year}-01-01`, ye = `${year + 1}-01-01`, t7 = iso(new Date(Date.now() - 7 * 86400_000));
  const homes = homesOf42(u).map((f) => {
    const rows = q('SELECT * FROM fh_folder_entries WHERE folder_id=? AND date>=? AND date<?').all(f.id, ys, ye);
    const review = q("SELECT count(*) FROM fh_folder_entries WHERE folder_id=? AND status='review'").pluck().get(f.id);
    const missing = q("SELECT count(*) FROM fh_folder_entries e WHERE e.folder_id=? AND e.receipt_id IS NULL AND e.tx_id IS NULL AND e.date<? AND e.date>=?").pluck().get(f.id, t7, ys);
    const members = q('SELECT name, user_id FROM fh_folder_members WHERE folder_id=? ORDER BY id').all(f.id).filter((m) => m.user_id !== u).map((m) => m.name);
    const bg = f.background && /^upload:/.test(f.background) ? `/finans/api/folders/${f.id}/bg?v=${f.background.slice(7)}` : /str[øo]mstad/i.test(`${f.name} ${f.address}`) ? '/assets/boliger/stromstad.webp' : null;
    return { id: f.id, name: f.name, type: f.type, address: f.address, color: f.color ?? '#2b5d8a', image: bg, letter: f.name.slice(0, 1).toUpperCase(), role: f.role, roleName: ROLES[f.role] ?? f.role,
      spentYear: rows.reduce((s, e) => s + e.amount, 0) / 100, count: rows.length, receipts: { missing, review, text: review ? `${review} venter på gjennomgang` : missing ? `${missing} ${missing === 1 ? 'kvittering mangler' : 'kvitteringer mangler'}` : '✓ Alt er i orden' },
      categories: (() => { const m = new Map(); for (const e of rows) { const t = catPair(e.category_id).top; const k = t?.name ?? e.category ?? 'Annet'; const x = m.get(k) ?? { name: k, color: t?.color ?? '#6E6E78', sum: 0 }; x.sum += e.amount / 100; m.set(k, x); } return [...m.values()].sort((a, b) => b.sum - a.sum).slice(0, 4); })(),
      lastPurchase: (() => { const e = q('SELECT * FROM fh_folder_entries WHERE folder_id=? ORDER BY date DESC, id DESC LIMIT 1').get(f.id); return e ? { id: e.id, text: e.description, date: e.date, dateLabel: dLabel(e.date), amount: e.amount / 100 } : null; })(),
      mailAddress: mailAddress42(f),
      sharedWith: members, sharedText: members.length ? `Delt med ${members.length > 1 ? `${members.slice(0, -1).join(', ')} og ${members.at(-1)}` : members[0]}` : null, openLabel: `Åpne ${f.name}${homesOf42(u).filter((x) => x.name === f.name).length > 1 ? ` ${String(f.type).toLowerCase()}` : ''}` };
  });
  const reviewN = homes.reduce((s, h) => s + h.receipts.review, 0);
  const todo = [];
  if (reviewN) todo.push({ type: 'review', count: reviewN, text: `${reviewN} ${reviewN === 1 ? 'kvittering er' : 'kvitteringer er'} lest av Glimt og venter på at noen sjekker dem`, action: 'Se på dem' });
  for (const h of homes) if (h.receipts.missing && todo.length < 4) todo.push({ type: 'missing_receipt', homeId: h.id, count: h.receipts.missing, text: `${h.receipts.missing} ${h.receipts.missing === 1 ? 'utgift' : 'utgifter'} i ${h.name} mangler kvittering`, action: 'Legg ved' });
  const sumYear = homes.reduce((s, h) => s + h.spentYear, 0);
  return { year, sumYear, count: homes.length, text: `${homes.length} ${homes.length === 1 ? 'bolig' : 'boliger'} · ${kr(sumYear)} brukt hittil i år`, todo, homes, singleHomeId: homes.length === 1 ? homes[0].id : null };
}
export function years42(f) {
  const y0 = new Date().getFullYear();
  const rows = q("SELECT substr(date,1,4) y, sum(amount) s, count(*) n FROM fh_folder_entries WHERE folder_id=? GROUP BY y").all(f.id);
  const first = Math.min(y0 - 4, ...rows.map((r) => +r.y).filter(Boolean));
  const by = new Map(rows.map((r) => [+r.y, r]));
  const years = [];
  for (let y = first; y <= y0; y++) years.push({ year: y, total: (by.get(y)?.s ?? 0) / 100, count: by.get(y)?.n ?? 0, label: y === y0 ? 'Hittil i år' : null });
  return { years, first, current: y0, firstWithData: rows.length ? Math.min(...rows.map((r) => +r.y)) : null };
}

/* ---------------- Kategorier ---------------- */

function categories42(f, qs) {
  linkLegacy();
  const P = periodOf(qs);
  const isMonth = !!P.month;
  const prevP = isMonth ? (() => { const d = new Date(`${P.from}T12:00:00`); d.setMonth(d.getMonth() - 1); const m = iso(d).slice(0, 7); return periodOf({ month: m }); })() : periodOf({ year: P.year - 1 });
  const cur = entriesIn(f.id, P), prev = entriesIn(f.id, prevP);
  const top = (e) => catPair(e.category_id).top ?? findTop(e.category ?? 'Annet') ?? findTop('Annet');
  const sumBy = (rows) => { const m = new Map(); for (const e of rows) { const t = top(e); if (!t) continue; const x = m.get(t.id) ?? { sum: 0, count: 0, last: null }; x.sum += e.amount / 100; x.count++; if (!x.last || e.date > x.last.date) x.last = e; m.set(t.id, x); } return m; };
  const a = sumBy(cur), b = sumBy(prev);
  const total = cur.reduce((s, e) => s + e.amount, 0) / 100;
  const allEver = sumBy(q('SELECT * FROM fh_folder_entries WHERE folder_id=?').all(f.id));
  const spark = (cid) => {
    const n = isMonth ? 6 : 12, out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(`${(P.month ?? `${P.year}-12`)}-01T12:00:00`); d.setMonth(d.getMonth() - i);
      const m = iso(d).slice(0, 7), e = iso(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12));
      out.push(Math.round(q('SELECT ifnull(sum(amount),0) FROM fh_folder_entries WHERE folder_id=? AND date>=? AND date<? AND category_id IN (SELECT id FROM fh_bolig_categories WHERE id=? OR parent_id=?)').pluck().get(f.id, `${m}-01`, e, cid, cid) / 100));
    }
    return out;
  };
  const tops = catTree();
  const cards = tops.map((t) => {
    const x = a.get(t.id), y = b.get(t.id), ever = allEver.get(t.id);
    const sum = x?.sum ?? 0, before = y?.sum ?? 0;
    const change = !x ? null : !y ? 'new' : Math.round(((sum - before) / before) * 100);
    const lastE = x?.last ?? ever?.last ?? null;
    return { id: t.id, name: t.name, color: t.color, ai: t.ai, mine: !!q('SELECT created_by FROM fh_bolig_categories WHERE id=?').pluck().get(t.id), count: x?.count ?? 0, sum: Math.round(sum * 100) / 100, pct: total ? Math.round((sum / total) * 100) : 0,
      change: change === 'new' ? null : change, isNew: change === 'new', changeText: change === 'new' ? 'Ny' : change == null ? null : `${change > 0 ? '▲' : '▼'} ${Math.abs(change)} %`,
      spark: spark(t.id), last: lastE ? { merchant: String(lastE.description).split(' · ')[0], date: lastE.date, text: `Sist: ${String(lastE.description).split(' · ')[0]} · ${dLabel(lastE.date)}` } : null,
      lastText: lastE ? `Sist: ${String(lastE.description).split(' · ')[0]} · ${dLabel(lastE.date)}` : 'Ikke brukt ennå', sub: `${x?.count ?? 0} kjøp · ${total ? Math.round((sum / total) * 100) : 0} % av totalen` };
  }).sort((p, r) => (r.sum - p.sum) || p.name.localeCompare(r.name, 'nb'));
  const used = cards.filter((x) => x.count);
  const largest = used[0] ?? null;
  const prevTotal = prev.reduce((s, e) => s + e.amount, 0) / 100;
  const noReceipt = cur.filter((e) => !e.receipt_id).length;
  return { period: { ...P, prevLabel: prevP.label }, kpi: { spent: total, prevSpent: prevTotal, change: prevTotal ? Math.round(((total - prevTotal) / prevTotal) * 100) : null,
    largest: largest ? { id: largest.id, name: largest.name, sum: largest.sum, pct: largest.pct } : null, used: used.length, count: cur.length, noReceipt },
    cards, text: `${used.length} kategorier brukt i ${P.label}`, newBox: { title: 'Ny kategori', button: 'Legg til kategori' } };
}

/* ---------------- Prosjekter ---------------- */

const PSTATUS = ['Planlagt', 'Pågår', 'Ferdig'];
const PCOLORS = ['#2b5d8a', '#2f6b4a', '#b23a2a', '#8a5a12', '#5b2d90', '#3d7f8a'];
function projectOut(p, f, { year = null, items = false } = {}) {
  const w = year ? ' AND date>=? AND date<?' : '';
  const a = year ? [p.id, f.id, `${year}-01-01`, `${year + 1}-01-01`] : [p.id, f.id];
  const rows = q(`SELECT * FROM fh_folder_entries WHERE project_id=? AND folder_id=?${w} ORDER BY date DESC, id DESC`).all(...a);
  const sum = rows.reduce((s, e) => s + e.amount, 0) / 100;
  const budget = p.budget_set === 0 || !p.budget ? null : p.budget / 100;
  const out = { id: p.id, name: p.name, status: PSTATUS.includes(p.status) ? p.status : 'Pågår', color: p.color ?? PCOLORS[p.id % PCOLORS.length], letter: p.name.slice(0, 1).toUpperCase(), sum, count: rows.length,
    budget, pct: budget ? Math.round((sum / budget) * 100) : null, sub: `${rows.length} kjøp${rows[0] ? ` · sist ${dLabel(rows[0].date)}` : ''}`, recent: rows.slice(0, 3).map((e) => ({ id: e.id, text: e.description, amount: e.amount / 100 })),
    openLabel: 'Åpne prosjektet ›', vendor: p.vendor ?? null };
  if (items) out.items = rows.map((e) => expenseOut(e, f));
  return out;
}
const projectsOf = (f, year) => q('SELECT * FROM fh_folder_projects WHERE folder_id=? ORDER BY id').all(f.id).map((p) => projectOut(p, f, { year }));

/* ---------------- Glimt i prosjekter og søk i bolig ---------------- */

// Beslektede ord (basseng → pool, klor, pH, bassengduk, bassengpumpe …).
const RELATED = { basseng: ['pool', 'klor', 'ph', 'bassengduk', 'bassengpumpe', 'sandfilter', 'pumpe', 'pool & spa', 'spa'], maling: ['beis', 'jotun', 'flügger', 'pensel', 'pensler', 'grunning', 'malerrull'],
  terrasse: ['terrassebord', 'beis', 'impregnert', 'trelast'], brygge: ['fortøyning', 'flytebrygge', 'båt'], hage: ['blomster', 'jord', 'gjødsel', 'plen', 'plantasjen', 'mester grønn'], ved: ['pellets', 'brensel', 'vedsekk'] };
const QSTOP = new Set('legg til alle kjøp og kvitteringer kvittering transaksjoner transaksjon relatert relaterte i det de prosjektet prosjekt finn fra med kategori alt vi kjøpte om til som på for hva har brukt'.split(' '));
/** Tolker beskjeden lokalt → {terms, merchant, category, period} */
export function projectQuery42(text) {
  const t = fold42(text);
  const out = { terms: [], merchant: null, category: null, period: parsePeriod42(text) };
  const cm = t.match(/kategori(?:en)?\s+([\p{L} ]{2,30}?)(?:$|[.,!?]| i | fra )/u); if (cm) out.category = cm[1].trim();
  const mm = text.match(/\b(?:fra|hos)\s+([A-ZÆØÅ][\p{L}&.-]+(?:\s+[A-ZÆØÅ][\p{L}&.-]+)?)/u); if (mm) out.merchant = mm[1];
  const base = t.replace(/kategori(?:en)?\s+[\p{L} ]+/u, ' ').split(/[^\p{L}\p{N}&-]+/u).filter((w) => w.length >= 3 && !QSTOP.has(w) && !(out.merchant && fold42(out.merchant).split(' ').includes(w))
    && !/^(sommer|høst|vinter|våren|sommeren|høsten|januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember|år)$/.test(w));
  const terms = new Set();
  for (const w of base) { terms.add(w); for (const r of RELATED[w] ?? RELATED[stem42(w)] ?? []) terms.add(r); for (const s of synonymsOf42(w)) if (s.length >= 3) terms.add(s); }
  out.terms = [...terms];
  return out;
}
function entryText(e) {
  const r = rc(e.receipt_id);
  const tx = e.tx_id ? q('SELECT description, merchant, note, ai_short FROM fh_transactions WHERE id=?').get(e.tx_id) : null;
  return fold42([e.description, entryCat(e).category, entryCat(e).subcategory, r?.merchant, r?.ai_short, r?.ai_long, linesOf(r).map((l) => l.name).join(' '), tx?.description, tx?.note, tx?.ai_short].filter(Boolean).join(' '));
}
const hit = (txt, term) => { const t = fold42(term); return t.length <= 3 ? new RegExp(`(^|[^\\p{L}])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'u').test(txt) : txt.includes(t) || txt.includes(stem42(t)); };
/** Utgifter i boligen som passer beskjeden. */
export function findRelated42(f, text, { exclude = null } = {}) {
  const pq = projectQuery42(text);
  let rows = q('SELECT * FROM fh_folder_entries WHERE folder_id=? ORDER BY date DESC, id DESC').all(f.id);
  if (exclude) rows = rows.filter((e) => e.project_id !== exclude);
  if (pq.period) rows = rows.filter((e) => e.date >= pq.period.from && e.date < pq.period.to);
  const items = rows.filter((e) => {
    const txt = entryText(e);
    if (pq.merchant && !txt.includes(fold42(pq.merchant))) return false;
    if (pq.category && !fold42(entryCat(e).category).includes(fold42(pq.category)) && !fold42(entryCat(e).subcategory ?? '').includes(fold42(pq.category))) return false;
    if (!pq.terms.length) return !!(pq.merchant || pq.category || pq.period);
    return pq.terms.some((w) => hit(txt, w));
  });
  return { pq, items };
}
/** Søk i én bolig (eller alle brukerens boliger). Samme svarform som Glimt-søket. */
export function homeSearch42(u, text, scope = {}, p = null) {
  const homes = scope?.home_id ? [homeAccess42(u, scope.home_id).f].filter(Boolean) : homesOf42(u);
  const t0 = performance.now();
  let searched = 0;
  const cards = [];
  for (const f of homes) {
    const rows = q('SELECT * FROM fh_folder_entries WHERE folder_id=? ORDER BY date DESC, id DESC').all(f.id);
    searched += rows.length;
    const pq = projectQuery42(text);
    const per = p?.period ?? pq.period;
    for (const e of rows) {
      if (per && !(e.date >= per.from && e.date < per.to)) continue;
      const txt = entryText(e);
      if (pq.merchant && !txt.includes(fold42(pq.merchant))) continue;
      const terms = pq.terms;
      if (terms.length && !terms.some((w) => hit(txt, w))) continue;
      if (!terms.length && !pq.merchant && !per) continue;
      const x = expenseOut(e, f);
      cards.push({ kind: 'expense', id: e.id, entryId: e.id, homeId: f.id, homeName: f.name, date: e.date, dateLabel: x.dateLabel, merchant: x.merchant, name: x.merchant, description: e.description, category: x.category, amount: -x.amount, total: x.amount });
    }
  }
  const sum = cards.reduce((s, c) => s + c.total, 0);
  const homeName = scope?.home_id ? homes[0]?.name ?? null : null;
  const ms = performance.now() - t0;
  return { intent: 'boliger', text: cards.length ? `${cards.length} ${cards.length === 1 ? 'treff' : 'treff'} ${homeName ? `i ${homeName}` : 'i boligene'} · ${kr(sum)}` : `Fant ingenting om «${text}» ${homeName ? `i ${homeName}` : 'i boligene'}.`,
    cards, hits: cards.length, sum, searched, homeName, scope: { module: 'boliger', home_id: scope?.home_id ?? null }, summary: `${cards.length} treff${homeName ? ` i ${homeName}` : ''} · ${kr(sum)} · ${(ms / 1000).toFixed(2).replace('.', ',')} s`,
    resetLabel: 'Nullstill', title: `Søk: «${text}»` };
}

/* ---------------- Import rett til Boliger ---------------- */

const accName = (id) => (id ? q('SELECT name, bank FROM fh_accounts WHERE id=?').get(id) : null);
function ruleOut(r) {
  const a = accName(r.account_id), h = q('SELECT name FROM fh_folders WHERE id=?').get(r.home_id);
  const merchants = JSON.parse(r.merchants || '[]');
  return { id: r.id, accountId: r.account_id, homeId: r.home_id, matchType: r.match_type === 'merchants' ? 'merchants' : 'account', merchants, mode: r.mode === 'direct' ? 'direct' : 'review', enabled: !!r.enabled,
    text: `${a ? `${a.name}${a.bank ? ` · ${a.bank}` : ''}` : 'Alle kontoer'} → ${h?.name ?? 'ukjent bolig'}`,
    sub: `${r.match_type === 'merchants' ? `Bare ${merchants.join(', ')}` : 'Alle transaksjoner fra kontoen'} · ${r.mode === 'direct' ? 'legges rett inn' : 'til gjennomgang i boligen'}` };
}
export const homeRules42 = (u) => q('SELECT * FROM import_rules WHERE user_id=? ORDER BY id').all(u).map(ruleOut);
function cleanRule(u, x) {
  const home = homeAccess42(u, x.homeId ?? x.home_id, 'edit');
  if (home.err) throw Object.assign(new Error('Ukjent bolig, eller du har ikke redigeringstilgang'), { status: 400 });
  const acc = x.accountId ?? x.account_id ?? null;
  if (acc != null && !q('SELECT 1 FROM fh_accounts WHERE id=? AND user_id=?').get(+acc, u)) throw Object.assign(new Error('Ukjent konto'), { status: 400 });
  const merchants = (Array.isArray(x.merchants) ? x.merchants : String(x.merchants ?? '').split(',')).map((m) => str(m, 40)).filter(Boolean).slice(0, 30);
  const type = x.matchType === 'merchants' || x.match_type === 'merchants' || (merchants.length && x.matchType !== 'account') ? 'merchants' : 'account';
  if (type === 'merchants' && !merchants.length) throw Object.assign(new Error('Skriv minst én butikk'), { status: 400 });
  return { account_id: acc != null ? +acc : null, home_id: home.f.id, match_type: type, merchants: JSON.stringify(type === 'merchants' ? merchants : []), mode: x.mode === 'direct' ? 'direct' : 'review', enabled: x.enabled === false ? 0 : 1 };
}
export function saveHomeRules42(u, list) {
  const rows = (Array.isArray(list) ? list : []).slice(0, 50).map((x) => cleanRule(u, x));
  db.transaction(() => { q('DELETE FROM import_rules WHERE user_id=?').run(u); for (const r of rows) q('INSERT INTO import_rules(user_id, account_id, home_id, match_type, merchants, mode, enabled, created) VALUES(?,?,?,?,?,?,?,?)').run(u, r.account_id, r.home_id, r.match_type, r.merchants, r.mode, r.enabled, Date.now()); })();
  return homeRules42(u);
}
export function addHomeRule42(u, x) { const r = cleanRule(u, x); q('INSERT INTO import_rules(user_id, account_id, home_id, match_type, merchants, mode, enabled, created) VALUES(?,?,?,?,?,?,?,?)').run(u, r.account_id, r.home_id, r.match_type, r.merchants, r.mode, r.enabled, Date.now()); return homeRules42(u); }
/** Den mest spesifikke regelen for en transaksjon (butikk-regel før konto-regel). */
export function ruleFor42(u, t, rules = q('SELECT * FROM import_rules WHERE user_id=? AND enabled=1').all(u)) {
  const name = fold42(`${t.merchant ?? ''} ${t.description ?? ''}`);
  const ok = rules.filter((r) => r.account_id == null || r.account_id === t.account_id);
  const byMerchant = ok.filter((r) => r.match_type === 'merchants' && JSON.parse(r.merchants || '[]').some((m) => name.includes(fold42(m))));
  if (byMerchant.length) return byMerchant.sort((a, b) => (b.account_id != null) - (a.account_id != null))[0];
  return ok.find((r) => r.match_type === 'account' && r.account_id != null) ?? null;
}
/** Oppretter utgift i boligen for transaksjonen (ingen dobbelttelling: transaksjonen beholdes i Finans og kobles med tx_id). */
export function sendToHome42(u, t, homeId, mode = 'review') {
  if (t.amount >= 0) return null;
  if (q('SELECT 1 FROM fh_folder_entries WHERE tx_id=?').get(t.id)) return null;
  const who = memberName(homeId, u) ?? 'Meg';
  const e = q("INSERT INTO fh_folder_entries(folder_id,tx_id,description,date,amount,paid_by,category,status,created) VALUES(?,?,?,?,?,?,?,?,?) RETURNING id")
    .get(homeId, t.id, t.merchant || t.description, t.date, Math.abs(t.amount), who, null, mode === 'direct' ? 'ok' : 'review', Date.now());
  const g = guessCategory42(`${t.merchant ?? ''} ${t.description ?? ''}`, { allowNew: false });
  assignCategory(e.id, `${t.merchant ?? ''} ${t.description}`, g.cat?.id ?? null, { ai: false });
  return e.id;
}
const logImport = (u, text) => { try { const l = kv.get(u, 'import42_log', []) ?? []; l.unshift({ at: new Date().toISOString(), text }); kv.set(u, 'import42_log', l.slice(0, 50)); } catch { /* */ } };
export const importLog42 = (u) => kv.get(u, 'import42_log', []) ?? [];
/** Kjør reglene på transaksjonene (nye fra import/PSD2, eller de siste N dagene). → {sent, byHome:{navn: n}, text} */
export function applyHomeRules42(u, txIds = null, { days = null, forceHome = null, mode = null } = {}) {
  const rules = q('SELECT * FROM import_rules WHERE user_id=? AND enabled=1').all(u);
  let txs;
  if (txIds) txs = txIds.length ? q(`SELECT * FROM fh_transactions WHERE user_id=? AND id IN (${txIds.map(() => '?').join(',')})`).all(u, ...txIds) : [];
  else txs = q('SELECT * FROM fh_transactions WHERE user_id=? AND date>=?').all(u, iso(new Date(Date.now() - (days ?? 90) * 86400_000)));
  const by = {};
  let sent = 0;
  for (const t of txs) {
    const r = forceHome ? { home_id: forceHome, mode: mode ?? 'review' } : ruleFor42(u, t, rules);
    if (!r) continue;
    if (sendToHome42(u, t, r.home_id, r.mode)) { sent++; const n = q('SELECT name FROM fh_folders WHERE id=?').pluck().get(r.home_id); by[n] = (by[n] ?? 0) + 1; }
  }
  const text = Object.entries(by).map(([n, k]) => `${k} ${k === 1 ? 'transaksjon' : 'transaksjoner'} sendt til ${n}`).join(' · ');
  if (sent) logImport(u, text);
  return { sent, byHome: by, text: text || 'Ingen transaksjoner passet reglene' };
}

/* ---------------- Ruter ---------------- */

/** Monteres av finans42.js. auth(scope) gir mellomvaren som setter c.get('user') og c.get('access'). */
export function mountHomes42(api, auth) {
  const R = auth('finance:read'), W = auth('finance:write');
  const H = (need = 'view') => async (c, next) => {
    const r = homeAccess42(c.get('user'), c.req.param('id'), need, c.get('access'));
    if (r.err) return bad(c, ...r.err);
    c.set('home', r.f); c.set('member', r.m);
    await next();
  };
  api.get('/boliger/oversikt', R, (c) => c.json(overview42(c.get('user'), yearOf(c.req.query('year')))));
  api.get('/boliger/search', R, (c) => c.json(homeSearch42(c.get('user'), str(c.req.query('q'), 200), {})));
  for (const base of ['/homes/:id{[0-9]+}', '/folders/:id{[0-9]+}']) {
    api.get(`${base}/years`, R, H(), (c) => c.json(years42(c.get('home'))));
    api.get(`${base}/expenses`, R, H(), (c) => {
      const f = c.get('home'), qs = c.req.query(), P = periodOf(qs);
      let rows = entriesIn(f.id, P);
      if (qs.category) rows = rows.filter((e) => { const p = catPair(e.category_id); return String(p.top?.id) === String(qs.category) || String(p.sub?.id) === String(qs.category); });
      if (qs.project) rows = rows.filter((e) => String(e.project_id) === String(qs.project));
      if (qs.q) { const t = fold42(qs.q); rows = rows.filter((e) => entryText(e).includes(t)); }
      const items = rows.map((e) => expenseOut(e, f));
      const sum = items.reduce((s, x) => s + x.amount, 0);
      return c.json({ items, sum, count: items.length, period: { year: P.year, month: P.month, label: P.label }, sumLabel: `Sum ${P.label}`, empty: items.length ? null : `Ingen utgifter i ${P.label}.` });
    });
    api.get(`${base}/expenses/:eid{[0-9]+}`, R, H(), (c) => {
      const f = c.get('home'), e = q('SELECT * FROM fh_folder_entries WHERE id=? AND folder_id=?').get(+c.req.param('eid'), f.id);
      return e ? c.json(expenseOut(e, f, { full: true })) : bad(c, 'Fant ikke utgiften', 404);
    });
    const reanalyze = async (c) => {
      const f = c.get('home'), e = q('SELECT * FROM fh_folder_entries WHERE id=? AND folder_id=?').get(+c.req.param('eid'), f.id);
      if (!e) return bad(c, 'Fant ikke utgiften', 404);
      const r = rc(e.receipt_id);
      if (!r?.file) return bad(c, 'Utgiften har ingen original kvittering å lese. Legg ved kvitteringen først.', 409);
      if (r.user_id !== c.get('user')) return bad(c, 'Bare den som lastet opp kvitteringen kan la Glimt lese den på nytt.', 403);
      const { default: finansApi } = await import('./routes.js');
      const res = await finansApi.request(`/receipts/${encodeURIComponent(r.id)}/reanalyze`, { method: 'POST', headers: { cookie: c.req.header('cookie') ?? '', authorization: c.req.header('authorization') ?? '', 'content-type': 'application/json' },
        body: JSON.stringify({ async: true, apply: true }) }, c.env);
      const j = await res.json().catch(() => ({}));
      return c.json({ ...j, entryId: e.id, label: 'Glimt leser kvitteringen …', keepsManual: true }, res.status);
    };
    api.post(`${base}/expenses/:eid{[0-9]+}/reanalyze`, W, H('edit'), reanalyze);
    api.post(`${base}/entries/:eid{[0-9]+}/reanalyze`, W, H('edit'), reanalyze);
    // Kvitteringspanelet under /entries (FinansHub web): GET = panelet; POST (fil) = legg ved kvittering på utgiftens transaksjon.
    api.get(`${base}/entries/:eid{[0-9]+}/receipt`, R, H(), (c) => {
      const f = c.get('home'), e = q('SELECT * FROM fh_folder_entries WHERE id=? AND folder_id=?').get(+c.req.param('eid'), f.id);
      return e ? c.json(expenseOut(e, f, { full: true })) : bad(c, 'Fant ikke utgiften', 404);
    });
    api.post(`${base}/entries/:eid{[0-9]+}/receipt`, W, H('edit'), async (c) => {
      const f = c.get('home'), e = q('SELECT * FROM fh_folder_entries WHERE id=? AND folder_id=?').get(+c.req.param('eid'), f.id);
      if (!e) return bad(c, 'Fant ikke utgiften', 404);
      if (!e.tx_id || !q('SELECT 1 FROM fh_transactions WHERE id=? AND user_id=?').get(e.tx_id, c.get('user'))) return bad(c, 'Utgiften er ikke koblet til en av dine transaksjoner. Last opp kvitteringen med «+ Legg til utgift».', 409);
      const { default: finansApi } = await import('./routes.js');
      const res = await finansApi.request(`/transactions/${e.tx_id}/receipt`, { method: 'POST', headers: { cookie: c.req.header('cookie') ?? '', authorization: c.req.header('authorization') ?? '', 'content-type': c.req.header('content-type') ?? '' }, body: await c.req.arrayBuffer() }, c.env);
      const j = await res.json().catch(() => ({}));
      if (res.ok && j?.id) q('UPDATE fh_folder_entries SET receipt_id=COALESCE(receipt_id, ?) WHERE id=?').run(j.id, e.id);
      return c.json({ ...j, entryId: e.id }, res.status);
    });
    api.get(`${base}/review`, R, H(), (c) => {
      const f = c.get('home');
      const items = q("SELECT * FROM fh_folder_entries WHERE folder_id=? AND status='review' ORDER BY date DESC, id DESC").all(f.id).map((e) => expenseOut(e, f, { full: true }));
      const n = items.length;
      return c.json({ title: n ? `✦ Glimt har lest ${n} ${n === 1 ? 'kvittering' : 'kvitteringer'}` : null, sub: 'Sjekk butikk, beløp og kategori, og godkjenn.', approveAll: n > 1 ? 'Godkjenn alle' : null, items, count: n });
    });
    api.post(`${base}/review/approve`, W, H('edit'), async (c) => {
      const f = c.get('home'), b = await c.req.json().catch(() => ({}));
      const ids = Array.isArray(b.ids) ? b.ids.map(Number) : q("SELECT id FROM fh_folder_entries WHERE folder_id=? AND status='review' AND amount>0").pluck().all(f.id);
      let n = 0; for (const id of ids) n += q("UPDATE fh_folder_entries SET status='ok' WHERE id=? AND folder_id=? AND amount>0").run(id, f.id).changes;
      return c.json({ approved: n });
    });
    api.get(`${base}/categories`, R, H(), (c) => c.json(categories42(c.get('home'), c.req.query())));
    api.get(`${base}/categories/:cid{[0-9]+}`, R, H(), (c) => {
      const f = c.get('home'), cat = catById(+c.req.param('cid'));
      if (!cat || cat.parent_id) return bad(c, 'Fant ikke kategorien', 404);
      const qs = c.req.query(), P = periodOf(qs.range === 'year' ? { year: qs.year } : qs.range === 'all' ? { range: 'all' } : { month: qs.month ?? today().slice(0, 7) });
      const items = entriesIn(f.id, P).filter((e) => catPair(e.category_id).top?.id === cat.id).map((e) => expenseOut(e, f));
      const sum = items.reduce((s, x) => s + x.amount, 0);
      return c.json({ category: { id: cat.id, name: cat.name, color: cat.color, ai: !!cat.created_by_ai, mine: !!cat.created_by, deletable: !!cat.created_by || !!cat.created_by_ai }, items, sum, count: items.length,
        label: `${items.length} kjøp i ${P.label} · ${f.name}`, addLabel: `+ Legg til utgift i ${cat.name}`, range: qs.range ?? 'month' });
    });
    api.post(`${base}/categories`, W, H('edit'), async (c) => {
      const b = await c.req.json().catch(() => ({}));
      const name = str(b.name, 40);
      if (!name) return bad(c, 'Skriv et navn på kategorien');
      if (findTop(name)) return bad(c, `«${name}» finnes allerede`, 409);
      const { cat } = createCat(name, { by: c.get('user'), color: /^#[0-9a-f]{6}$/i.test(b.color ?? '') ? b.color : null });
      return c.json({ category: { id: cat.id, name: cat.name, color: cat.color, ai: false, mine: true } }, 201);
    });
    api.delete(`${base}/categories/:cid{[0-9]+}`, W, H('edit'), (c) => {
      const cat = catById(+c.req.param('cid'));
      if (!cat || cat.parent_id) return bad(c, 'Fant ikke kategorien', 404);
      if (!cat.created_by && !cat.created_by_ai && !c.get('access')?.admin) return bad(c, 'Bare egne kategorier og kategorier Glimt har laget kan slettes her', 403);
      if (cat.name === 'Annet') return bad(c, '«Annet» kan ikke slettes', 409);
      const other = findTop('Annet') ?? createCat('Annet').cat;
      db.transaction(() => {
        const ids = [cat.id, ...q('SELECT id FROM fh_bolig_categories WHERE parent_id=?').pluck().all(cat.id)];
        for (const id of ids) q('UPDATE fh_folder_entries SET category_id=?, category=? WHERE category_id=?').run(other.id, other.name, id);
        q('DELETE FROM fh_bolig_categories WHERE id=?').run(cat.id);
      })();
      return c.json({ ok: true, movedTo: other.name });
    });
    api.post(`${base}/categories/glimt`, W, H('edit'), async (c) => {
      const b = await c.req.json().catch(() => ({}));
      const text = str(b.text, 2000);
      if (!text) return bad(c, 'Mangler tekst');
      const r = await glimtCategory42(text);
      if (b.entryId) { const e = q('SELECT * FROM fh_folder_entries WHERE id=? AND folder_id=?').get(+b.entryId, c.get('home').id); if (e && !e.cat_manual) assignCategory(e.id, e.description, r.cat.id, { ai: false }); }
      return c.json({ category: { id: r.cat.id, name: r.cat.name, color: r.cat.color, ai: !!r.cat.created_by_ai }, created: !!r.created, toast: r.created ? `Glimt laget kategorien «${r.cat.name}»` : null });
    });
    api.get(`${base}/projects`, R, H(), (c) => {
      const f = c.get('home'), year = c.req.query('year') ? yearOf(c.req.query('year')) : null;
      const projects = projectsOf(f, year), total = projects.reduce((s, p) => s + p.sum, 0);
      return c.json({ projects, count: projects.length, total, text: `${projects.length} ${projects.length === 1 ? 'prosjekt' : 'prosjekter'} · ${kr(total)} samlet`, newTile: { title: '+ Nytt prosjekt', sub: 'Samle kjøp og regninger som hører til samme ting' } });
    });
    api.post(`${base}/projects`, W, H('edit'), async (c) => {
      const f = c.get('home'), b = await c.req.json().catch(() => ({}));
      if (!str(b.name)) return bad(c, 'Prosjektet trenger et navn');
      const budget = b.budget != null && b.budget !== '' ? ore(b.budget) : null;
      const p = q('INSERT INTO fh_folder_projects(folder_id,name,vendor,budget,category,created,status,color,budget_set) VALUES(?,?,?,?,?,?,?,?,?) RETURNING *')
        .get(f.id, str(b.name, 80), str(b.vendor, 80), budget ? Math.abs(budget) : 0, 'Annet', Date.now(), PSTATUS.includes(b.status) ? b.status : 'Pågår', /^#[0-9a-f]{6}$/i.test(b.color ?? '') ? b.color : null, budget ? 1 : 0);
      return c.json({ project: projectOut(p, f, { items: true }) }, 201);
    });
    api.get(`${base}/projects/:pid{[0-9]+}`, R, H(), (c) => {
      const f = c.get('home'), p = q('SELECT * FROM fh_folder_projects WHERE id=? AND folder_id=?').get(+c.req.param('pid'), f.id);
      if (!p) return bad(c, 'Fant ikke prosjektet', 404);
      const suggestions = q('SELECT * FROM fh_folder_entries WHERE folder_id=? AND (project_id IS NULL OR project_id NOT IN (SELECT id FROM fh_folder_projects)) ORDER BY date DESC, id DESC LIMIT 8').all(f.id).map((e) => expenseOut(e, f));
      return c.json({ project: projectOut(p, f, { items: true }), suggestions, glimt: { placeholder: `Spør Glimt om ${p.name} …`, examples: [`Legg til alle kjøp relatert til ${p.name.toLowerCase()}`, 'Finn kvitteringer fra Biltema', 'Legg til alt med kategori Vedlikehold'] } });
    });
    api.patch(`${base}/projects/:pid{[0-9]+}`, W, H('edit'), async (c) => {
      const f = c.get('home'), p = q('SELECT * FROM fh_folder_projects WHERE id=? AND folder_id=?').get(+c.req.param('pid'), f.id);
      if (!p) return bad(c, 'Fant ikke prosjektet', 404);
      const b = await c.req.json().catch(() => ({}));
      const budget = b.budget === null || b.budget === '' ? 0 : b.budget !== undefined ? Math.abs(ore(b.budget) ?? 0) : p.budget;
      q('UPDATE fh_folder_projects SET name=?, status=?, color=?, budget=?, budget_set=? WHERE id=?').run(str(b.name, 80) || p.name, PSTATUS.includes(b.status) ? b.status : p.status, /^#[0-9a-f]{6}$/i.test(b.color ?? '') ? b.color : p.color,
        budget, b.budget !== undefined ? (budget ? 1 : 0) : p.budget_set, p.id);
      return c.json({ project: projectOut(q('SELECT * FROM fh_folder_projects WHERE id=?').get(p.id), f, { items: true }) });
    });
    api.delete(`${base}/projects/:pid{[0-9]+}`, W, H('edit'), (c) => {
      const f = c.get('home'), pid = +c.req.param('pid');
      if (!q('SELECT 1 FROM fh_folder_projects WHERE id=? AND folder_id=?').get(pid, f.id)) return bad(c, 'Fant ikke prosjektet', 404);
      const n = q('UPDATE fh_folder_entries SET project_id=NULL WHERE project_id=? AND folder_id=?').run(pid, f.id).changes;
      q('DELETE FROM fh_folder_projects WHERE id=? AND folder_id=?').run(pid, f.id);
      return c.json({ ok: true, unlinked: n });
    });
    api.post(`${base}/projects/:pid{[0-9]+}/items`, W, H('edit'), async (c) => {
      const f = c.get('home'), p = q('SELECT * FROM fh_folder_projects WHERE id=? AND folder_id=?').get(+c.req.param('pid'), f.id);
      if (!p) return bad(c, 'Fant ikke prosjektet', 404);
      const b = await c.req.json().catch(() => ({}));
      const ids = new Set((Array.isArray(b.entryIds) ? b.entryIds : Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Boolean));
      for (const t of Array.isArray(b.txIds) ? b.txIds : []) {
        let eid = q('SELECT id FROM fh_folder_entries WHERE folder_id=? AND tx_id=?').pluck().get(f.id, +t);
        if (!eid) { const tx = q('SELECT * FROM fh_transactions WHERE id=? AND user_id=?').get(+t, c.get('user')); if (tx) eid = sendToHome42(c.get('user'), tx, f.id, 'direct'); }
        if (eid) ids.add(eid);
      }
      for (const r of Array.isArray(b.receiptIds) ? b.receiptIds : []) { const eid = q('SELECT id FROM fh_folder_entries WHERE folder_id=? AND receipt_id=?').pluck().get(f.id, String(r)); if (eid) ids.add(eid); }
      const before = [];
      let n = 0;
      for (const id of ids) { const e = q('SELECT id, project_id FROM fh_folder_entries WHERE id=? AND folder_id=?').get(id, f.id); if (!e) continue; before.push({ id: e.id, projectId: e.project_id ?? null }); n += q('UPDATE fh_folder_entries SET project_id=? WHERE id=?').run(p.id, e.id).changes; }
      return c.json({ linked: n, entryIds: before.map((x) => x.id), undo: { before }, toast: `${n} ${n === 1 ? 'kjøp' : 'kjøp'} lagt til i ${p.name}`, project: projectOut(p, f, { items: true }) });
    });
    api.post(`${base}/projects/:pid{[0-9]+}/items/undo`, W, H('edit'), async (c) => {
      const f = c.get('home'), b = await c.req.json().catch(() => ({}));
      let n = 0; for (const x of Array.isArray(b.before) ? b.before : []) n += q('UPDATE fh_folder_entries SET project_id=? WHERE id=? AND folder_id=?').run(x.projectId ?? null, +x.id, f.id).changes;
      return c.json({ restored: n });
    });
    api.delete(`${base}/projects/:pid{[0-9]+}/items/:eid{[0-9]+}`, W, H('edit'), (c) => {
      const f = c.get('home');
      const n = q('UPDATE fh_folder_entries SET project_id=NULL WHERE id=? AND folder_id=? AND project_id=?').run(+c.req.param('eid'), f.id, +c.req.param('pid')).changes;
      return n ? c.json({ ok: true }) : bad(c, 'Utgiften ligger ikke i prosjektet', 404);
    });
    const glimtProject = async (c) => {
      const f = c.get('home'), p = q('SELECT * FROM fh_folder_projects WHERE id=? AND folder_id=?').get(+c.req.param('pid'), f.id);
      if (!p) return bad(c, 'Fant ikke prosjektet', 404);
      const b = await c.req.json().catch(() => ({}));
      const text = str(b.q ?? b.text, 300);
      if (!text) return bad(c, 'Skriv hva Glimt skal finne');
      const t0 = performance.now();
      const { pq, items } = findRelated42(f, text, { exclude: p.id });
      const list = items.map((e) => ({ ...expenseOut(e, f), checked: true }));
      const total = list.reduce((s, x) => s + x.amount, 0);
      const about = pq.terms[0] ?? pq.merchant ?? pq.category ?? text;
      return c.json({ q: text, terms: pq.terms, merchant: pq.merchant, category: pq.category, period: pq.period, items: list, total, count: list.length, engine: 'lokalt', ms: Math.round(performance.now() - t0),
        text: list.length ? `Glimt fant ${list.length} ${list.length === 1 ? 'kjøp' : 'kjøp'} om «${about}» · til sammen ${kr(total)}` : `Glimt fant ingen kjøp om «${about}» i ${f.name}.`,
        action: list.length ? { label: `Legg til ${list.length} valgte i ${p.name}`, method: 'POST', url: `/finans/api/homes/${f.id}/projects/${p.id}/items`, body: { entryIds: list.map((x) => x.id) } } : null, confirm: true, candidates: list });
    };
    api.post(`${base}/projects/:pid{[0-9]+}/glimt`, W, H('edit'), glimtProject);
    api.post(`${base}/projects/:pid{[0-9]+}/candidates`, W, H('edit'), glimtProject); // FinansHub web
    api.get(`${base}/search`, R, H(), (c) => c.json(homeSearch42(c.get('user'), str(c.req.query('q'), 200), { home_id: c.get('home').id })));
  }
  /* Import rett til Boliger */
  api.get('/import/home-rules', R, (c) => {
    const u = c.get('user');
    return c.json({ rules: homeRules42(u), accounts: q('SELECT id, name, bank, type, last4 FROM fh_accounts WHERE user_id=? ORDER BY sort, id').all(u), homes: homesOf42(u).filter((h) => h.role !== 'viewer').map((h) => ({ id: h.id, name: h.name })),
      modes: [{ id: 'review', label: 'Til gjennomgang (Glimt foreslår kategori)' }, { id: 'direct', label: 'Legg rett inn' }], log: importLog42(u).slice(0, 10) });
  });
  api.put('/import/home-rules', W, async (c) => {
    const b = await c.req.json().catch(() => ({}));
    try { return c.json({ rules: saveHomeRules42(c.get('user'), b.rules ?? b), offer90: { label: 'Importer også de siste 90 dagene?', url: '/finans/api/import/home-rules/run', body: { days: 90 } } }); }
    catch (e) { return bad(c, e.message, e.status ?? 400); }
  });
  api.post('/import/home-rules', W, async (c) => { try { return c.json({ rules: addHomeRule42(c.get('user'), await c.req.json().catch(() => ({}))) }, 201); } catch (e) { return bad(c, e.message, e.status ?? 400); } });
  api.delete('/import/home-rules/:rid{[0-9]+}', W, (c) => { q('DELETE FROM import_rules WHERE id=? AND user_id=?').run(+c.req.param('rid'), c.get('user')); return c.json({ rules: homeRules42(c.get('user')) }); });
  for (const p of ['/import/home-rules/run', '/import/home-rules/backfill']) api.post(p, W, async (c) => { const b = await c.req.json().catch(() => ({})); return c.json(applyHomeRules42(c.get('user'), null, { days: Math.min(366, Math.max(1, +b.days || 90)) })); });
  // Fil-import: «Importer fil til en bolig» (?home=<id>) og importreglene på alt som importeres (commit=1).
  for (const path of ['/import', '/import/xlsx']) {
    api.post(path, W, async (c, next) => {
      const home = c.req.query('home');
      if (home) { const r = homeAccess42(c.get('user'), home, 'edit', c.get('access')); if (r.err) return bad(c, ...r.err); }
      await next();
      if (c.req.query('commit') !== '1' || !c.res || c.res.status !== 200) return;
      try {
        const j = await c.res.clone().json();
        const u = c.get('user');
        const ext = (j.rows ?? []).map((r) => r.external_id).filter(Boolean);
        if (!u || !ext.length) return;
        const ids = q(`SELECT id FROM fh_transactions WHERE user_id=? AND external_id IN (${ext.map(() => '?').join(',')})`).pluck().all(u, ...ext);
        const r = home ? applyHomeRules42(u, ids, { forceHome: +home, mode: 'review' }) : applyHomeRules42(u, ids);
        c.res = c.json({ ...j, home: r.sent ? r : home ? r : undefined, homeText: r.sent ? r.text : undefined });
      } catch { /* importen står */ }
    });
  }
}
