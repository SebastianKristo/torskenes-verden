// Prompt 63 (prompt 49 del 5, D5SRV): motstrid-deteksjon og brukerens valg (godkjenn / avvis / rediger / behold A / behold B / begge).
// Motstrid (bare spørsmål – ingenting endres før brukeren velger):
//   value  – samme subjekt og predikat, ulikt objekt («Nina er frisør» / «Nina er tannlege»; bare «rolle»-fakta, ikke fritekst)
//   alias  – samme egne alias på to ulike, eller et alias som er et annet navn i minnet (typesynonymene «frisør», «klipp» telles ikke)
//   entity – mot entitetsregisteret: navnet er et sted/en butikk/et abonnement fra en annen kilde (Familie, Vær …), og faktaet
//            sier noe annet («hytta» = Familie-stedet Sjusjøen, forslaget sier «hytta er på Toten»)
import { db } from '../db.js';
import { saveFact47, TYPE_SYNONYMS47 } from '../glimt45/memory47.js';
import { deleteMemory, getMemory } from '../glimt-memory.js';
import { niceCase, normName, aliasTitle } from '../../public/js/quick-time.js';
import {
  memRows63, roleOf63, isRole63, sentenceOf63, classify63, keyOf63, pendingRow63, pendingRows63, updatePending63, conflictRow63, conflictByKey63, insertConflict63,
  finishConflict63, SOURCE_LABEL63, J63,
} from './store.js';

const q = (sql) => db.prepare(sql);
const clean = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');

/* ---------------- Sidene i en motstrid ---------------- */

const sideOfMemory = (m) => ({ label: sentenceOf63({ subject: m.match, object: m.object, kind: m.kind, type: m.type }), ref: { type: 'memory', id: m.id }, subject: m.subject, object: m.object, type: m.type ?? null, sourceLabel: SOURCE_LABEL63.memory });
const sideOfPending = (p) => ({ label: sentenceOf63(p), ref: { type: 'pending', id: p.id }, subject: niceCase(p.subject), object: p.object, type: p.type ?? null, sourceLabel: SOURCE_LABEL63[p.source] ?? p.source });
const sideOfEntity = (e) => ({ label: `${e.name}${e.value ? ` = ${e.value}` : ''}`, ref: { type: 'entity', id: e.id }, subject: e.name, object: e.value ?? e.place?.name ?? e.type, sourceLabel: e.sourceLabel ?? 'Entitetsregisteret' });
// Nøkkelen er innholdet (ikke rad-id-ene), så samme spørsmål aldri stilles to ganger – heller ikke etter «begge» (to rader) eller
// når et avvist forslag kommer tilbake som en ny rad.
const sideKey = (s) => (s.ref?.type === 'entity' ? `e:${s.ref.id}` : `${normName(s.subject)}=${roleOf63(s.object, s.type ?? null)}`);
const keyOf = (kind, a, b, extra = '') => `${kind}|${[sideKey(a), sideKey(b)].sort().join('|')}${extra ? `|${normName(extra)}` : ''}`;

/** Lager motstriden hvis den ikke er spurt om før (samme nøkkel, uansett status). → raden | null */
function ask(user, kind, a, b, question, now, extra = '') {
  const key = keyOf(kind, a, b, extra);
  if (conflictByKey63(user, key)) return null;
  return insertConflict63(user, { kind, key, a: extra ? { ...a, alias: extra } : a, b: extra ? { ...b, alias: extra } : b, question }, now);
}

/** Egennavn i en tekst («på Toten» → ['toten']). */
const properNames = (s) => [...String(s ?? '').matchAll(/(?<![\p{L}])(\p{Lu}[\p{Ll}'’-]{2,})/gu)].map((m) => normName(m[1]));

let entities = null;
async function registry() {
  if (!entities) entities = await import('../convo60/entities.js');
  return entities;
}
/** Er faktaet om et sted/en butikk fra entitetsregisteret (ikke fra minnet), og sier noe annet enn registeret? → entiteten | null */
async function entityClash(user, subject, object) {
  let E;
  try { E = await registry(); } catch { return null; }
  let hit = null;
  try { hit = E.resolveEntity60(user, subject); } catch { return null; }
  const e = hit?.item;
  if (!e || e.source === 'memory') return null;
  const names = properNames(object);
  if (!names.length) return null;
  const own = new Set([e.name, e.value, e.place?.name, ...(e.aliases ?? [])].filter(Boolean).flatMap((x) => [normName(x), ...properNames(x), ...normName(x).split(/[\s,]+/)]));
  return names.some((n) => !own.has(n)) ? e : null;
}

/** Sjekker et forslag mot minnet og registeret. Lager (og kobler) motstrid. → konflikt-id | null */
export async function checkPending63(user, p, now = Date.now()) {
  const mem = memRows63(user);
  const s = normName(p.subject);
  for (const m of mem.filter((x) => normName(x.match) === s)) {
    if (!isRole63(m.object, m.type) || !isRole63(p.object, p.type)) continue;
    if (roleOf63(m.object, m.type) === roleOf63(p.object, p.type)) continue;
    const c = ask(user, 'value', sideOfMemory(m), sideOfPending(p), `Glimt har to ting om ${niceCase(p.subject)}. Hvilken stemmer?`, now);
    if (c) { updatePending63(user, p.id, { conflict_id: c.id }, now); return c.id; }
  }
  const e = await entityClash(user, p.subject, p.object);
  if (e) {
    const c = ask(user, 'entity', sideOfEntity(e), sideOfPending(p), `«${niceCase(p.subject)}» er ${e.name} i ${e.sourceLabel ?? 'entitetsregisteret'}. Hvilken stemmer?`, now);
    if (c) { updatePending63(user, p.id, { conflict_id: c.id }, now); return c.id; }
  }
  for (const a of J63(p.aliases, [])) {
    const other = mem.find((m) => normName(m.match) !== s && (normName(m.match) === normName(a) || m.ownAliases.some((x) => normName(x) === normName(a))));
    if (!other) continue;
    const c = ask(user, 'alias', sideOfPending(p), sideOfMemory(other), `Aliaset «${a}» passer både på ${niceCase(p.subject)} og ${other.subject}. Hvem gjelder det?`, now, a);
    if (c) { updatePending63(user, p.id, { conflict_id: c.id }, now); return c.id; }
  }
  return null;
}

/** Motstrid inne i minnet (mellom lagrede fakta) og mot registeret. → antall nye */
export async function scanMemory63(user, now = Date.now()) {
  const mem = memRows63(user);
  let n = 0;
  const by = new Map();
  for (const m of mem) { const k = normName(m.match); if (!by.has(k)) by.set(k, []); by.get(k).push(m); }
  for (const list of by.values()) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (!isRole63(a.object, a.type) || !isRole63(b.object, b.type) || roleOf63(a.object, a.type) === roleOf63(b.object, b.type)) continue;
      if (ask(user, 'value', sideOfMemory(a), sideOfMemory(b), `Glimt har to ting om ${a.subject}. Hvilken stemmer?`, now)) n++;
    }
  }
  const synonyms = new Set(Object.values(TYPE_SYNONYMS47).flat().map(normName));
  for (const a of mem) for (const al of a.ownAliases) {
    if (synonyms.has(normName(al))) continue;
    for (const b of mem) {
      if (b.id === a.id || normName(b.match) === normName(a.match)) continue;
      const clash = normName(b.match) === normName(al) || (b.ownAliases.some((x) => normName(x) === normName(al)) && a.id < b.id);
      if (clash && ask(user, 'alias', sideOfMemory(a), sideOfMemory(b), `Aliaset «${al}» passer både på ${a.subject} og ${b.subject}. Hvem gjelder det?`, now, al)) n++;
    }
  }
  for (const m of mem.filter((x) => x.kind === 'fact')) {
    const e = await entityClash(user, m.match, m.object);
    if (e && ask(user, 'entity', sideOfEntity(e), sideOfMemory(m), `«${m.subject}» er ${e.name} i ${e.sourceLabel ?? 'entitetsregisteret'}. Hvilken stemmer?`, now)) n++;
  }
  return n;
}

/* ---------------- Godkjenn / avvis / rediger ---------------- */

/** Felt fra body ({subject?, object?, aliases?}). → {set, error} */
export function editOf63(p, b) {
  const set = {};
  if (b?.subject !== undefined) { const s = clean(b.subject, 80); if (s.length < 2) return { error: 'subject må være 2–80 tegn' }; set.subject = s; }
  if (b?.object !== undefined) { const o = clean(b.object, 300); if (!o) return { error: 'object kan ikke være tomt' }; set.object = o; }
  if (b?.aliases !== undefined) {
    if (!Array.isArray(b.aliases) || b.aliases.length > 8 || b.aliases.some((x) => typeof x !== 'string')) return { error: 'aliases må være en liste med maks 8 tekster' };
    set.aliases = JSON.stringify([...new Set(b.aliases.map((x) => clean(x, 40)).filter((x) => x.length >= 2))]);
  }
  if (set.subject !== undefined || set.object !== undefined) {
    const c = classify63(set.object ?? p.object);
    set.kind = c.kind; set.type = c.type;
    set.key = keyOf63(set.subject ?? p.subject, set.object ?? p.object, c.type);
  }
  if (Object.keys(set).length) set.edited = 1;
  return { set };
}

/** Lagrer i minnet. both = egen rad selv om navnet finnes fra før (brukeren sa «begge stemmer»). → minneraden (API-form fra glimt-memory) */
function saveToMemory(user, p, { both = false } = {}) {
  let id;
  if (both && q('SELECT COUNT(*) FROM glimt_memory WHERE user_id=? AND match=?').pluck().get(user, normName(p.subject))) {
    const r = q('INSERT INTO glimt_memory(user_id, kind, match, type, title, note, created) VALUES(?,?,?,?,?,?,?)').run(user, p.kind, normName(p.subject), p.type ?? null,
      p.kind === 'alias' ? aliasTitle({ type: p.type, match: normName(p.subject) }, niceCase(p.subject)) : null, p.kind === 'fact' ? p.object : null, Date.now());
    id = Number(r.lastInsertRowid);
    try { q('UPDATE glimt_memory SET predicate=?, source=?, aliases=? WHERE id=?').run('er', 'mem63', p.kind === 'alias' ? JSON.stringify(TYPE_SYNONYMS47[p.type] ?? [p.type]) : null, id); } catch { /* */ }
  } else {
    const r = saveFact47(user, { subject: niceCase(p.subject), object: p.object, source: 'mem63' });
    if (r.error) throw Object.assign(new Error(r.error), { status: 400 });
    id = r.item.id;
  }
  const own = J63(p.aliases, []);
  if (own.length) {
    const m = memRows63(user).find((x) => x.id === id);
    try { q('UPDATE glimt_memory SET aliases=? WHERE id=? AND user_id=?').run(JSON.stringify([...new Set([...(m?.aliases ?? []), ...own])]), id, user); } catch { /* */ }
  }
  return getMemory(user, id);
}

/** Godkjenn (ev. med redigering i samme trykk). → {item, memory} | {error, status, conflictId?} */
export async function approve63(user, id, body = null, { now = Date.now(), force = false, both = false } = {}) {
  let p = pendingRow63(user, id);
  if (!p) return { error: 'Fant ikke forslaget', status: 404 };
  if (p.status !== 'pending') return { error: 'Forslaget er allerede avgjort', status: 409 };
  if (body && Object.keys(body).length) {
    const e = editOf63(p, body);
    if (e.error) return { error: e.error, status: 400 };
    if (Object.keys(e.set).length) {
      p = updatePending63(user, id, { ...e.set, conflict_id: null }, now);
      const { mem63 } = await import('./settings.js');
      if (mem63(user).conflicts) await checkPending63(user, p, now);
      p = pendingRow63(user, id);
    }
  }
  if (!force && p.conflict_id && conflictRow63(user, p.conflict_id)?.status === 'open') return { error: 'Forslaget motsier noe Glimt allerede husker – velg under «Motstrid» først', status: 409, conflictId: p.conflict_id };
  const memory = saveToMemory(user, p, { both });
  const item = updatePending63(user, id, { status: 'approved', memory_id: memory?.id ?? null, decided_at: now }, now);
  return { item, memory };
}
export function reject63(user, id, now = Date.now()) {
  const p = pendingRow63(user, id);
  if (!p) return { error: 'Fant ikke forslaget', status: 404 };
  if (p.status !== 'pending') return { error: 'Forslaget er allerede avgjort', status: 409 };
  return { item: updatePending63(user, id, { status: 'rejected', decided_at: now }, now) };
}
export async function edit63(user, id, body, now = Date.now()) {
  const p = pendingRow63(user, id);
  if (!p) return { error: 'Fant ikke forslaget', status: 404 };
  if (p.status !== 'pending') return { error: 'Forslaget er allerede avgjort', status: 409 };
  const e = editOf63(p, body ?? {});
  if (e.error) return { error: e.error, status: 400 };
  if (!Object.keys(e.set).length) return { error: 'Forventet {subject?, object?, aliases?}', status: 400 };
  // Den gamle motstriden gjaldt den gamle teksten: lukkes (som «avgjort ved redigering») og sjekkes på nytt.
  if (p.conflict_id && conflictRow63(user, p.conflict_id)?.status === 'open') finishConflict63(user, p.conflict_id, 'edited', now);
  let item = updatePending63(user, id, { ...e.set, conflict_id: null }, now);
  const { mem63 } = await import('./settings.js');
  if (mem63(user).conflicts) { await checkPending63(user, item, now); item = pendingRow63(user, id); }
  return { item };
}

/* ---------------- Velg i en motstrid ---------------- */

export const CHOICES63 = ['keep_a', 'keep_b', 'both'];
function removeAlias(user, memId, alias) {
  const m = memRows63(user).find((x) => x.id === memId);
  if (!m) return;
  const next = m.aliases.filter((x) => normName(x) !== normName(alias));
  q('UPDATE glimt_memory SET aliases=? WHERE id=? AND user_id=?').run(JSON.stringify(next), memId, user);
}
/** → {item} | {error, status} */
export async function resolve63(user, id, choice, now = Date.now()) {
  const c = conflictRow63(user, id);
  if (!c) return { error: 'Fant ikke motstriden', status: 404 };
  if (!CHOICES63.includes(choice)) return { error: `choice må være ${CHOICES63.join(', ')}`, status: 400 };
  if (c.status !== 'open') return { error: 'Motstriden er allerede avgjort', status: 409 };
  const a = J63(c.a, {}), b = J63(c.b, {});
  const pend = (side) => (side.ref?.type === 'pending' ? pendingRow63(user, side.ref.id) : null);
  const isOpen = (p) => p && p.status === 'pending';
  // Avgjør først (så godkjenning ikke stoppes av sin egen motstrid).
  if (!finishConflict63(user, id, choice, now)) return { error: 'Motstriden er allerede avgjort', status: 409 };
  try {
    if (c.kind === 'alias') {
      const al = a.alias ?? b.alias;
      const pa = pend(a);
      if (choice === 'keep_a' && b.ref.type === 'memory') removeAlias(user, b.ref.id, al);
      if (choice === 'keep_b') {
        if (a.ref.type === 'memory') removeAlias(user, a.ref.id, al);
        if (isOpen(pa)) updatePending63(user, pa.id, { aliases: JSON.stringify(J63(pa.aliases, []).filter((x) => normName(x) !== normName(al))) }, now);
      }
      if (isOpen(pa)) updatePending63(user, pa.id, { conflict_id: null }, now);
    } else {
      // value / entity: A = det som finnes (minne eller register), B = forslag eller et annet minne.
      const pb = pend(b);
      if (choice === 'keep_a') {
        if (isOpen(pb)) reject63(user, pb.id, now);
        else if (b.ref.type === 'memory') deleteMemory(user, b.ref.id);
      } else if (choice === 'keep_b') {
        if (a.ref.type === 'memory') deleteMemory(user, a.ref.id);
        if (isOpen(pb)) await approve63(user, pb.id, null, { now, force: true });
      } else if (isOpen(pb)) await approve63(user, pb.id, null, { now, force: true, both: true });
    }
  } catch (e) { console.warn('[mem63] valg:', String(e?.message ?? e).slice(0, 200)); }
  return { item: conflictRow63(user, id) };
}

/** Åpne forslag som peker på en motstrid som er borte/avgjort uten dem: frigjøres. */
export function tidy63(user) {
  for (const p of pendingRows63(user, 'pending')) if (p.conflict_id && conflictRow63(user, p.conflict_id)?.status !== 'open') updatePending63(user, p.id, { conflict_id: null });
}
