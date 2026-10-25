// Prompt 60 (prompt 49 del 3, D3SRV) – samtaletilstand per samtale (per bruker, per samtale-id/kanal).
//   Chat-samtale (conversationKind 'chat', 12 t uten aktivitet) · Glimt-søket på Hjem (kortlevd, 'search', 30 min).
//   Uten conversationId: innebygd samtale per bruker og modul («~home», 30 min), så appene får det samme.
// Tilstanden: siste intent, siste verktøyargumenter, siste entiteter (hendelse, person, sted, tidsrom, abonnement), ventende valg
// (choices) og de siste turene (historikk for akkurat denne samtalen). Lagres bare lokalt (tabell glimt60_convo), aldri i sky.
// Planleggeren får en kort tekst (stateText60) i den dynamiske delen av prompten; koden fyller inn manglende argumenter (fill60).
import { randomBytes } from 'node:crypto';
import { db } from '../db.js';

db.exec(`CREATE TABLE IF NOT EXISTS glimt60_convo (user_id TEXT NOT NULL, conv_id TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (user_id, conv_id));
CREATE INDEX IF NOT EXISTS glimt60_convo_upd ON glimt60_convo(updated);`);
const q = (sql) => db.prepare(sql);
export const TTL60 = { search: 30 * 60_000, chat: 12 * 3600_000 };
export const CONV_RE60 = /^[A-Za-z0-9_.:-]{1,80}$/;
const TURNS = 6;
try { q('DELETE FROM glimt60_convo WHERE updated < ?').run(Date.now() - 7 * 86400_000); } catch { /* */ }

/** Samtalen for en forespørsel. → {id, kind, implicit} */
export function convOf60({ conversationId = null, conversationKind = null, module = 'home' } = {}) {
  const kind = conversationKind === 'chat' || conversationKind === 'search' ? conversationKind : module === 'chat' ? 'chat' : 'search';
  if (conversationId && CONV_RE60.test(String(conversationId))) return { id: String(conversationId), kind, implicit: false };
  return { id: `~${module}`, kind: 'search', implicit: true };
}
const empty = () => ({ intent: null, tools: [], entities: {}, choices: null, turns: [] });
/** → {state, updatedAt, expiresAt} | null (utløpt = slettet) */
export function loadState60(user, conv) {
  if (!conv) return null;
  let row = null;
  try { row = q('SELECT * FROM glimt60_convo WHERE user_id=? AND conv_id=?').get(user, conv.id); } catch { return null; }
  if (!row) return null;
  const ttl = TTL60[row.kind] ?? TTL60.search;
  if (Date.now() - row.updated > ttl) { try { q('DELETE FROM glimt60_convo WHERE user_id=? AND conv_id=?').run(user, conv.id); } catch { /* */ } return null; }
  let st; try { st = { ...empty(), ...JSON.parse(row.state) }; } catch { return null; }
  return { state: st, kind: row.kind, updatedAt: row.updated, expiresAt: row.updated + ttl };
}
export function saveState60(user, conv, state) {
  try { q('INSERT OR REPLACE INTO glimt60_convo(user_id, conv_id, kind, state, updated) VALUES(?,?,?,?,?)').run(user, conv.id, conv.kind, JSON.stringify(state).slice(0, 60_000), Date.now()); } catch (e) { console.warn('[convo60] lagring:', e.message); }
}
export function clearState60(user, id) { try { return q('DELETE FROM glimt60_convo WHERE user_id=? AND conv_id=?').run(user, String(id)).changes > 0; } catch { return false; } }
export const historyOf60 = (st) => (st?.turns ?? []).slice(-TURNS);

/* ---------------- Fra et svar til tilstanden ---------------- */

const slimArgs = (a) => { const o = {}; for (const [k, v] of Object.entries(a ?? {})) { if (k.startsWith('_') || k === 'prev' || k === 'event' || k === 'corrections') continue; const s = JSON.stringify(v); if (s && s.length <= 300) o[k] = v; } return o; };
const evOf = (e) => (e && e.id ? { id: String(e.id), title: String(e.title ?? '').slice(0, 80), date: e.date ?? null, time: e.time ?? e.start ?? null } : null);

/** Oppdaterer tilstanden etter en tur. out = motorens svar. → ny tilstand */
export function afterTurn60(st0, { text, out, facts = [] }) {
  const st = { ...empty(), ...(st0 ?? {}), entities: { ...(st0?.entities ?? {}) } };
  const acts = (out?.actions ?? []).filter((a) => a.status === 'done' || a.status === 'needs_confirm' || a.status === 'proposed');
  if (acts.length) {
    st.intent = out.intent ?? st.intent;
    st.tools = acts.slice(0, 4).map((a) => ({ tool: a.tool, args: slimArgs(a.args) }));
  }
  const E = st.entities;
  for (const a of acts) {
    const r = a.result ?? {};
    if (a.tool === 'weather.get' && a.status === 'done') {
      E.place = a.args?.place ?? r.place ?? E.place ?? null;
      E.placeAt = a.args?.placeAt ?? null;
      if (a.args?.when && typeof a.args.when === 'object') { E.when = { ...a.args.when }; delete E.when.tz; delete E.when.span; }
      E.whenAt = Date.now();
    }
    if (/^calendar\.(create|update)$/.test(a.tool) && a.status === 'done') { const e = evOf(r.event ? { ...r.event, id: r.event.id ?? r.eventId } : null); if (e) { E.event = e; E.eventId = e.id; } }
    if (/^calendar\.(search|next|list)$/.test(a.tool) && a.status === 'done') {
      const evs = (out.results ?? []).filter((x) => x.kind === 'event');
      if (evs.length === 1 || (a.tool !== 'calendar.list' && evs.length)) { const e = evOf(evs[0]); if (e) { E.event = e; E.eventId = e.id; } }
      E.events = evs.slice(0, 5).map(evOf).filter(Boolean);
    }
    if (a.tool === 'finance.subscriptions' && a.status === 'done' && r.ranked?.length) {
      E.subscription = { id: r.ranked[0].id, name: r.ranked[0].name };
      E.subscriptions = r.ranked.slice(0, 5).map((x) => ({ id: x.id, name: x.name }));
    }
    if (a.tool === 'subscriptions.trial' && r.subscription?.id) E.subscription = { id: r.subscription.id, name: r.subscription.name };
    if (a.tool === 'subscriptions.cancel' && a.args?.id) E.subscription = { id: a.args.id, name: a.args.name };
    if (a.tool === 'memory.save' && a.args?.subject) E.person = String(a.args.subject).slice(0, 60);
  }
  const person = facts.find((f) => f.kind === 'alias' || f.etype === 'person');
  if (person) E.person = person.subject;
  st.entities = E;
  st.turns = [...(st.turns ?? []), { u: String(text ?? '').slice(0, 300), a: String(out?.reply ?? '').replace(/\*\*/g, '').slice(0, 300) }].slice(-TURNS);
  return st;
}

/* ---------------- Til planleggeren (kort, engelsk, dynamisk del) ---------------- */

const whenLabel = (w) => (w ? w.label ?? (w.from === w.to ? w.from : `${w.from}–${w.to}`) : null);
export function stateText60(st) {
  if (!st) return '';
  const parts = [];
  if (st.tools?.length) parts.push(`Previous turn: intent ${st.intent ?? '?'}; ${st.tools.map((t) => `${t.tool}(${Object.entries(t.args ?? {}).filter(([, v]) => v != null && v !== '' && typeof v !== 'object').slice(0, 5).map(([k, v]) => `${k}=${String(v).slice(0, 40)}`).join(', ')})`).join('; ')}.`);
  const E = st.entities ?? {};
  if (E.place || E.when) parts.push(`Last weather: place ${E.place ?? 'own place'}, time ${whenLabel(E.when) ?? '?'}.`);
  if (E.event) parts.push(`Last event: «${E.event.title}» ${E.event.date ?? ''}${E.event.time ? ` ${E.event.time}` : ''}.`);
  if (E.subscription) parts.push(`Last subscription: ${E.subscription.name}.`);
  if (E.person) parts.push(`Last person: ${E.person}.`);
  if (st.choices?.items?.length) parts.push(`Glimt asked: «${st.choices.question}» options: ${st.choices.items.map((x, i) => `${i + 1}) ${x.label}`).join(' ')}.`);
  if (!parts.length) return '';
  return `${parts.join(' ')}\nIf the message continues this (e.g. "og i Bergen?", "flytt den til 11", "si opp det"), set refers_to_previous true and give only what the message changes.`;
}

/* ---------------- Oppfølging: fyll inn manglende argumenter ---------------- */

const PRON = /^(?:den|det|dem|denne|dette|avtalen|timen|hendelsen|møtet|abonnementet|tjenesten|den\s+avtalen|den\s+timen)$/i;
/** Ligner meldingen en oppfølging av forrige tur (uten at planleggeren sa det)? */
export function looksFollowUp60(text) {
  const t = String(text ?? '').trim().toLowerCase();
  if (t.length > 80) return false;
  return /^(?:og|men|enn|hva\s+med|samme|også|så)\b/.test(t) || /(?<![a-zæøå])(?:den|det|dem)(?![a-zæøå])/.test(t) && /^(?:flytt|endre|slett|fjern|avlys|utsett|si\s+opp|avslutt|stopp|kanseller|når|hvor)\b/.test(t);
}
/**
 * Fyller inn fra tilstanden der planen mangler noe. Bare det som mangler – meldingen vinner alltid. Koden setter `_state60`
 * (stoler ikke på modellens egne `_`-felt). → {calls, filled:{place?, when?, event?, subscription?}}
 */
export function fill60(calls, st, text, { timesInText = () => false, placesInText = () => [] } = {}) {
  const E = st?.entities ?? {};
  const filled = {};
  const out = (calls ?? []).map((c0) => {
    const args = Object.fromEntries(Object.entries(c0.args ?? {}).filter(([k]) => !k.startsWith('_') || k === '_req'));
    const c = { ...c0, args };
    if (c.tool === 'weather.get') {
      const s = {};
      if (E.when && !timesInText(text)) { s.when = E.when; filled.when = whenLabel(E.when); }
      if (E.place && !placesInText(text).length && !String(args.place ?? args.location ?? '').trim()) { s.place = E.place; filled.place = E.place; if (E.placeAt) s.placeAt = E.placeAt; }
      // Oppfølgingen sa et nytt sted («og i Bergen?»): det lokale delspørsmålet (_req) har «i dag» som standard – tiden fra forrige tur gjelder.
      if (s.when && args._req) args._req = { ...args._req, when: s.when };
      if (s.place && args._req && !args._req.place) args._req = { ...args._req, place: s.place };
      if (Object.keys(s).length) c.args._state60 = s;
    }
    if ((c.tool === 'calendar.update' || c.tool === 'calendar.delete') && E.event?.id && !args.target_id) {
      const tg = String(args.target ?? '').trim();
      const et = E.event.title.toLowerCase(), tl = tg.toLowerCase().replace(/^(?:den|det)\s+/, '');
      if (!tg || PRON.test(tg) || et.includes(tl) || (et.length >= 3 && tl.includes(et)) || (tl.length >= 4 && et.startsWith(tl.slice(0, Math.max(4, tl.length - 2))))) { c.args.target_id = E.event.id; filled.event = E.event.title; }
    }
    if (c.tool === 'subscriptions.cancel' && E.subscription?.id && !args.subscription_id) {
      const sv = String(args.service ?? '').trim();
      if (!sv || PRON.test(sv)) { c.args.subscription_id = E.subscription.id; c.args._state60 = { subscription: E.subscription }; filled.subscription = E.subscription.name; }
    }
    return c;
  });
  return { calls: out, filled };
}

/* ---------------- Valg (choices) ---------------- */

export const newSetId60 = () => `ch${randomBytes(5).toString('hex')}`;
const ORD = [[/^(?:1|en|én|første|nr\.?\s*1|nummer\s+1)$/, 0], [/^(?:2|to|andre|nr\.?\s*2|nummer\s+2)$/, 1], [/^(?:3|tre|tredje|nr\.?\s*3)$/, 2], [/^(?:4|fire|fjerde|nr\.?\s*4)$/, 3], [/^(?:5|fem|femte|nr\.?\s*5)$/, 4]];
const STOPW = new Set(['den', 'det', 'jeg', 'mener', 'mente', 'vil', 'ha', 'ja', 'nei', 'takk', 'første', 'andre', 'siste', 'med', 'hos', 'på', 'kl', 'til', 'fre', 'lør', 'søn', 'man', 'tir', 'ons', 'tor', 'okt', 'nov', 'des']);
const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9æøå\s]+/g, ' ').replace(/\s+/g, ' ').trim();
/**
 * Hvilket valg svaret gjelder. choice = {setId, id} fra knappen (sikkert), ellers skrevet tekst: lik tekst/etikett, ordenstall
 * («den første», «nr 2», «siste») eller et ord som bare står i én etikett («middagen»). → {item, via} | null
 */
export function matchChoice60(ch, text, choice = null) {
  if (!ch?.items?.length) return null;
  if (choice && typeof choice === 'object') {
    if (choice.setId === ch.setId) { const it = ch.items.find((x) => String(x.id) === String(choice.id)); if (it) return { item: it, via: 'button' }; }
    return null;
  }
  const t = fold(text);
  if (!t || t.length > 80) return null;
  const same = ch.items.find((x) => fold(x.text) === t || fold(x.label) === t);
  if (same) return { item: same, via: 'label' };
  const core = t.replace(/^(?:jeg\s+)?(?:mener|mente|vil\s+ha|velg|ta)\s+/, '').replace(/^(?:den|det|nummer|nr)\s+/, '').replace(/\s+(?:da|takk|en|ene|valget|alternativet)$/, '').trim();
  if (/^(?:siste|sistnevnte)$/.test(core)) return { item: ch.items[ch.items.length - 1], via: 'ordinal' };
  for (const [re, i] of ORD) if (re.test(core) && ch.items[i]) return { item: ch.items[i], via: 'ordinal' };
  const words = t.split(' ').filter((w) => w.length >= 4 && !STOPW.has(w));
  if (words.length && words.length <= 4) {
    const stem = (w) => w.replace(/(?:en|et|a|ene|er)$/, '');
    const hits = ch.items.filter((x) => { const lw = fold(x.label).split(' '); return words.some((w) => lw.some((l) => l.length >= 3 && (l === w || stem(l) === stem(w) || (stem(w).length >= 4 && l.startsWith(stem(w)))))); });
    if (hits.length === 1) return { item: hits[0], via: 'label' };
  }
  return null;
}
