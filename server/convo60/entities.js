// Prompt 60 (prompt 49 del 3, D3SRV) – entitetsregisteret: ETT felles register over personer, steder, butikker, abonnementer og
// faste hendelser med aliaser. Brukes av minnet (planleggerens fakta), kalendersøket (søketermer via faktaene), været («hytta»,
// «hjemme», «jobben» → faktisk sted) og finans (butikk-aliaser → butikknavnet).
//
// Ingen dobbel sannhet:
//   - egne entiteter = radene i glimt_memory («Glimt husker»), additiv migrering: kolonnen etype (person|place|store|subscription|event)
//     + aliases (fra prompt 47). Personer fra «Glimt husker» (Nina = frisør) ER entitetene – samme rader som /api/glimt/memory.
//   - avledede entiteter leses fra kildene sine hver gang: Familie → Steder (family_zone), Subscription OS (fh_subscriptions),
//     Vær (kv wx_places) og profilens hjemsted. Bare egne aliaser til dem lagres (kv «entities60_alias», {ref: [alias]}).
// Personvern: alt er lokalt og per bruker; registeret sendes bare til lokal modell (planleggeren) som resten av minnet.
import { db, kv } from '../db.js';
import { ensureMemory47, TYPE_SYNONYMS47 } from '../glimt45/memory47.js';
import { addMemory, MEMORY_TYPES } from '../glimt-memory.js';
import { niceCase, normName } from '../../public/js/quick-time.js';
import { hasWord47 } from '../glimt45/words47.js';

const q = (sql) => db.prepare(sql);
export const ETYPES60 = ['person', 'place', 'store', 'subscription', 'event'];
export const ELABELS60 = { person: 'Personer', place: 'Steder', store: 'Butikker', subscription: 'Abonnementer', event: 'Faste hendelser' };
/** Faste ord som peker på et sted (Familie-stedets type eller navn, ellers profilens hjemsted for «hjemme»). */
export const BUILTIN60 = { hjemme: 'place', jobben: 'place', skolen: 'place', hytta: 'place' };
const BUILTIN_WORDS = { hjem: ['hjemme', 'hjem', 'huset'], jobb: ['jobben', 'jobb', 'kontoret'], skole: ['skolen', 'skole'], hytte: ['hytta', 'hytte', 'hytten'] };
const SOURCE_LABEL = { memory: 'Glimt husker', family: 'Familie → Steder', subscriptions: 'Subscription OS', weather: 'Vær', profile: 'Profil' };
const OVERLAY = 'entities60_alias';
const parseJson = (s, d) => { try { const v = JSON.parse(s); return v ?? d; } catch { return d; } };
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

let migrated = false;
export function ensureEntities60() {
  if (migrated) return;
  ensureMemory47();
  try {
    const cols = q('PRAGMA table_info(glimt_memory)').all().map((c) => c.name);
    if (cols.length && !cols.includes('etype')) db.exec('ALTER TABLE glimt_memory ADD COLUMN etype TEXT');
    migrated = cols.length > 0;
  } catch (e) { console.warn('[convo60] entitetsmigrering:', e.message); }
}

const overlayOf = (user) => { try { const o = kv.get(user, OVERLAY, {}); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
const saveOverlay = (user, o) => kv.set(user, OVERLAY, o);

/* ---------------- Liste ---------------- */

function memoryEntities(user) {
  ensureEntities60();
  let rows = [];
  try { rows = q('SELECT * FROM glimt_memory WHERE user_id=? ORDER BY id').all(user); } catch { return []; }
  return rows.map((r) => {
    const own = parseJson(r.aliases, null);
    const type = ETYPES60.includes(r.etype) ? r.etype : 'person';
    const aliases = Array.isArray(own) && own.length ? own.map(String) : r.kind === 'alias' ? TYPE_SYNONYMS47[r.type] ?? [r.type].filter(Boolean) : [];
    const name = r.etype && r.title ? r.title : niceCase(r.match);
    return { id: `m${r.id}`, type, name, value: r.kind === 'alias' ? (r.type ?? null) : (r.note ?? null), aliases: [...new Set(aliases)], source: 'memory', sourceLabel: SOURCE_LABEL.memory,
      editable: { name: true, value: true, aliases: true, delete: true }, place: null, builtin: [], updatedAt: r.created ?? null, _kind: r.kind };
  });
}
function familyEntities(user) {
  let rows = [];
  try { rows = q('SELECT * FROM family_zone WHERE created_by=? OR shared=1 ORDER BY id').all(user); } catch { return []; }
  return rows.map((z) => {
    const pt = String(z.place_type ?? '').toLowerCase();
    const nm = normName(z.name);
    const kind = pt === 'hjem' || /^hjem/.test(nm) ? 'hjem' : pt === 'jobb' || /^(jobb|kontor)/.test(nm) ? 'jobb' : pt === 'skole' || /skole/.test(nm) ? 'skole' : /^hytt/.test(nm) ? 'hytte' : null;
    return { id: `zone:${z.id}`, type: 'place', name: z.name, value: null, aliases: [], source: 'family', sourceLabel: SOURCE_LABEL.family, editable: { name: false, value: false, aliases: true, delete: false },
      place: Number.isFinite(z.lat) && Number.isFinite(z.lon) ? { name: z.name, lat: z.lat, lon: z.lon } : null, builtin: kind ? BUILTIN_WORDS[kind] : [], updatedAt: z.created ?? null };
  });
}
function subscriptionEntities(user) {
  let rows = [];
  try { rows = q('SELECT id, name, plan, created FROM fh_subscriptions WHERE user_id=? AND active=1 ORDER BY id').all(user); } catch { return []; }
  return rows.map((s) => ({ id: `sub:${s.id}`, type: 'subscription', name: s.name, value: s.plan || null, aliases: [], source: 'subscriptions', sourceLabel: SOURCE_LABEL.subscriptions,
    editable: { name: false, value: false, aliases: true, delete: false }, place: null, builtin: [], updatedAt: s.created ?? null }));
}
function weatherEntities(user) {
  let list = null;
  try { list = kv.get(user, 'wx_places', null); } catch { /* */ }
  if (!Array.isArray(list)) return [];
  return list.filter((p) => p?.name).map((p, i) => ({ id: `wx:${p.id ?? i}`, type: 'place', name: p.name, value: p.region || null, aliases: [], source: 'weather', sourceLabel: SOURCE_LABEL.weather,
    editable: { name: false, value: false, aliases: true, delete: false }, place: Number.isFinite(p.lat) && Number.isFinite(p.lon) ? { name: p.name, lat: p.lat, lon: p.lon } : null, builtin: [], updatedAt: null }));
}
function profileEntity(user, zones) {
  if (zones.some((z) => z.builtin.includes('hjemme'))) return [];
  let city = 'Oslo', place = null;
  try { const l = kv.get(user, 'wx_places', null); if (Array.isArray(l) && l[0]?.name) { city = String(l[0].name).slice(0, 60); if (Number.isFinite(l[0].lat)) place = { name: city, lat: l[0].lat, lon: l[0].lon }; } } catch { /* */ }
  return [{ id: 'home', type: 'place', name: 'Hjemme', value: city, aliases: [], source: 'profile', sourceLabel: SOURCE_LABEL.profile, editable: { name: false, value: false, aliases: true, delete: false }, place, builtin: BUILTIN_WORDS.hjem, updatedAt: null }];
}

/** Alle entiteter for brukeren (egne + avledede, med egne aliaser lagt på). Sortert type → navn. */
export function listEntities60(user, { type = null } = {}) {
  const zones = familyEntities(user);
  const ov = overlayOf(user);
  const all = [...memoryEntities(user), ...zones, ...subscriptionEntities(user), ...weatherEntities(user), ...profileEntity(user, zones)]
    .map((e) => (e.source !== 'memory' && Array.isArray(ov[e.id]) ? { ...e, aliases: [...new Set([...e.aliases, ...ov[e.id]])] } : e));
  const order = (t) => ETYPES60.indexOf(t);
  return all.filter((e) => !type || e.type === type).sort((a, b) => order(a.type) - order(b.type) || a.name.localeCompare(b.name, 'nb'));
}
export const publicEntity60 = ({ _kind, ...e }) => e;
export const getEntity60 = (user, id) => listEntities60(user).find((e) => e.id === String(id)) ?? null;

/* ---------------- Oppslag ---------------- */

/** Hva betyr ordet? → {item, via:'name'|'alias'|'builtin'} | null. type begrenser (f.eks. 'place'). */
export function resolveEntity60(user, word, { type = null, list = null } = {}) {
  const w = normName(clean(word, 80)).replace(/^(?:på|i|til|fra|ved)\s+/, '');
  if (w.length < 2) return null;
  const all = (list ?? listEntities60(user)).filter((e) => !type || e.type === type);
  const byName = all.find((e) => normName(e.name) === w);
  if (byName) return { item: byName, via: 'name' };
  const byAlias = all.find((e) => e.aliases.some((a) => normName(a) === w));
  if (byAlias) return { item: byAlias, via: 'alias' };
  const byBuiltin = all.find((e) => e.builtin.some((a) => normName(a) === w));
  if (byBuiltin) return { item: byBuiltin, via: 'builtin' };
  return null;
}
/** Entitetene som nevnes i en tekst (hele ord). Personer fra minnet hoppes over (de kommer allerede via recallFacts47). → [{word, item, via}] */
export function entitiesIn60(user, text, { skipMemoryPersons = true } = {}) {
  const t = String(text ?? '');
  if (!t.trim()) return [];
  const out = [];
  for (const e of listEntities60(user)) {
    if (skipMemoryPersons && e.source === 'memory' && e.type === 'person') continue;
    const cand = [['name', e.name], ...e.aliases.map((a) => ['alias', a]), ...e.builtin.map((a) => ['builtin', a])];
    const hit = cand.find(([, w]) => w && String(w).length >= 3 && hasWord47(t, w, { suffix: false }));
    if (hit) out.push({ word: hit[1], item: e, via: hit[0] });
  }
  return out.slice(0, 8);
}
/** Entitetstreff → fakta i formen recallFacts47 gir (planleggerens «Memory facts» og kalendersøkets termer). */
export function factsOfEntities60(hits) {
  return hits.map(({ word, item, via }) => ({ id: item.id, kind: 'alias', subject: item.name, object: item.value ?? item.place?.name ?? item.type, aliases: [...new Set([...item.aliases, ...item.builtin])].slice(0, 6),
    why: `entitetsregisteret: «${word}» (${via === 'builtin' ? 'fast ord' : via === 'alias' ? 'alias' : 'navn'}, ${item.sourceLabel})`, score: 0.8, etype: item.type }));
}
/** Et sted slik værverktøyet kan bruke det. → {place, placeAt?} | null */
export function weatherPlaceOf60(item) {
  if (!item || item.type !== 'place') return null;
  if (item.place) return { place: item.source === 'profile' ? (item.value ?? item.place.name) : item.name, placeAt: { lat: item.place.lat, lon: item.place.lon } };
  if (item.value) return { place: String(item.value).split(',')[0].trim() || item.value };
  return null;
}

/* ---------------- Redigering ---------------- */

const aliasesIn = (v) => {
  if (v === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(v)) return { error: 'aliases må være en liste med tekster' };
  const a = [...new Set(v.map((x) => clean(x, 61)).filter(Boolean))];
  if (a.length > 20) return { error: 'Maks 20 aliaser' };
  if (a.some((x) => x.length < 2 || x.length > 60)) return { error: 'Hvert alias må være 2–60 tegn' };
  return { ok: true, value: a };
};
/** POST: {type, name, value?, aliases?} → {item, created} | {error} */
export function createEntity60(user, b) {
  ensureEntities60();
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'Forventet {type, name, value?, aliases?}' };
  if (!ETYPES60.includes(b.type)) return { error: `Ukjent type (${ETYPES60.join(', ')})` };
  const name = clean(b.name, 81);
  if (name.length < 2 || name.length > 80) return { error: 'Navnet må være 2–80 tegn' };
  const al = aliasesIn(b.aliases ?? []);
  if (al.error) return al;
  const value = b.value == null ? null : clean(b.value, 300) || null;
  // Person med en kjent type (frisør, lege …) = samme alias-rad som «Glimt husker» lager. Alt annet = fakta-rad med etype.
  const asAlias = b.type === 'person' && value && MEMORY_TYPES.includes(normName(value));
  const old = q('SELECT * FROM glimt_memory WHERE user_id=?').all(user).find((r) => normName(r.match) === normName(name) && (ETYPES60.includes(r.etype) ? r.etype : 'person') === b.type);
  const r = old ? { item: { id: old.id }, created: false } : addMemory(user, asAlias ? { kind: 'alias', match: name, type: normName(value) } : { kind: 'fact', match: name, note: value ?? '' });
  if (r.error) return r;
  const id = r.item.id;
  if (old) q('UPDATE glimt_memory SET note=? WHERE id=? AND user_id=? AND kind=\'fact\'').run(value, id, user);
  q('UPDATE glimt_memory SET etype=?, title=?, aliases=? WHERE id=? AND user_id=?').run(b.type, b.type === 'person' && asAlias ? (old?.title ?? null) : name, al.value.length ? JSON.stringify(al.value) : (old?.aliases ?? null), id, user);
  if (b.type === 'person' && asAlias && !old?.title) q('UPDATE glimt_memory SET title=? WHERE id=? AND user_id=?').run(`${niceCase(normName(value))} · ${name}`, id, user);
  return { item: getEntity60(user, `m${id}`), created: !old };
}
const DERIVED_ERR = { family: 'Stedet redigeres i Familie → Steder (bare aliaser kan endres her)', subscriptions: 'Abonnementet redigeres i Subscription OS (bare aliaser kan endres her)', weather: 'Værstedet redigeres i Vær (bare aliaser kan endres her)', profile: 'Hjemstedet følger profilen og Vær (bare aliaser kan endres her)' };
/** PATCH: {name?, value?, aliases?, type?} → {item} | {error, status} */
export function patchEntity60(user, id, b) {
  ensureEntities60();
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'Forventet {name?, value?, aliases?, type?}', status: 400 };
  const e = getEntity60(user, id);
  if (!e) return { error: 'Fant ikke entiteten', status: 404 };
  const al = aliasesIn(b.aliases);
  if (al.error) return { error: al.error, status: 400 };
  if (e.source !== 'memory') {
    if (b.name !== undefined || b.value !== undefined || b.type !== undefined) return { error: DERIVED_ERR[e.source] ?? 'Bare aliaser kan endres her', status: 400 };
    if (al.value !== undefined) { const ov = overlayOf(user); if (al.value.length) ov[e.id] = al.value; else delete ov[e.id]; saveOverlay(user, ov); }
    return { item: getEntity60(user, e.id) };
  }
  const rid = Number(e.id.slice(1));
  const row = q('SELECT * FROM glimt_memory WHERE id=? AND user_id=?').get(rid, user);
  if (b.type !== undefined && !ETYPES60.includes(b.type)) return { error: `Ukjent type (${ETYPES60.join(', ')})`, status: 400 };
  if (b.name !== undefined) {
    const name = clean(b.name, 81);
    if (name.length < 2 || name.length > 80) return { error: 'Navnet må være 2–80 tegn', status: 400 };
    q('UPDATE glimt_memory SET match=?, title=CASE WHEN etype IS NOT NULL AND kind=\'fact\' THEN ? ELSE title END WHERE id=? AND user_id=?').run(normName(name), name, rid, user);
  }
  if (b.value !== undefined) {
    const value = b.value == null ? null : clean(b.value, 300) || null;
    if (row.kind === 'alias') {
      if (!value || !MEMORY_TYPES.includes(normName(value))) return { error: `For personer fra «Glimt husker» må verdien være en av: ${MEMORY_TYPES.join(', ')}`, status: 400 };
      q('UPDATE glimt_memory SET type=? WHERE id=? AND user_id=?').run(normName(value), rid, user);
    } else q('UPDATE glimt_memory SET note=? WHERE id=? AND user_id=?').run(value, rid, user);
  }
  if (b.type !== undefined) q('UPDATE glimt_memory SET etype=?, title=CASE WHEN kind=\'fact\' AND title IS NULL THEN ? ELSE title END WHERE id=? AND user_id=?').run(b.type, niceCase(row.match), rid, user);
  if (al.value !== undefined) q('UPDATE glimt_memory SET aliases=? WHERE id=? AND user_id=?').run(al.value.length ? JSON.stringify(al.value) : null, rid, user);
  return { item: getEntity60(user, e.id) };
}
/** DELETE → {ok, removed?} | {error, status} */
export function deleteEntity60(user, id) {
  const e = getEntity60(user, id);
  if (!e) return { error: 'Fant ikke entiteten', status: 404 };
  if (e.source !== 'memory') { const ov = overlayOf(user); const had = !!ov[e.id]; delete ov[e.id]; saveOverlay(user, ov); return { ok: true, removed: had ? 'aliases' : 'none' }; }
  q('DELETE FROM glimt_memory WHERE id=? AND user_id=?').run(Number(e.id.slice(1)), user);
  return { ok: true };
}
